import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { compareDocuments } from "./src/compare.js";
import { CASE_LIBRARY } from "./src/case-library.js";
import {
  DocumentParseError,
  isImageFile,
  isMediaFile,
  isSupportedFile,
  normalizeFilename,
  parseDocument,
} from "./src/parser.js";
import { renderTaskPage, renderUploadPage } from "./src/views.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const accessCode = process.env.ACCESS_CODE ?? "";
const ttlDays = Math.max(1, Number(process.env.TASK_TTL_DAYS || 7));
const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
const sessionMs = 7 * 24 * 60 * 60 * 1000;
const maxDocumentBytes = 80 * 1024 * 1024;
const maxImageBytes = 20 * 1024 * 1024;
const maxMediaBytes = 300 * 1024 * 1024;
const maxFileBytes = maxMediaBytes;
const maxTotalBytes = 500 * 1024 * 1024;
const maxFiles = 8;
const uploadTempDir = path.join(os.tmpdir(), `yizhi-proofreader-${process.pid}`);
fs.mkdirSync(uploadTempDir, { recursive: true });

const sessions = new Map();
const tasks = new Map();
const jobs = new Map();
const unlockFailures = new Map();
let taskJobQueue = Promise.resolve();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
  );
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!req.path.startsWith("/assets/")) res.setHeader("Cache-Control", "no-store");
  next();
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadTempDir),
    filename: (_req, _file, callback) =>
      callback(null, `upload-${crypto.randomBytes(12).toString("hex")}`),
  }),
  limits: {
    fileSize: maxFileBytes,
    files: maxFiles,
    fields: 12,
  },
  fileFilter: (_req, file, callback) => {
    if (!isSupportedFile(file.originalname)) {
      const error = new Error(`不支持 ${normalizeFilename(file.originalname)} 的格式`);
      error.code = "UNSUPPORTED_FILE";
      callback(error);
      return;
    }
    callback(null, true);
  },
});

app.get("/", (_req, res) => {
  res.type("html").send(renderUploadPage());
});

app.get("/t/:id", (_req, res) => {
  res.type("html").send(renderTaskPage());
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "yizhi-proofreader",
    time: Date.now(),
  });
});

app.use("/assets", express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  fallthrough: false,
}));

app.get("/api/auth", (req, res) => {
  res.json({
    required: Boolean(accessCode),
    passed: !accessCode || isAuthenticated(req),
  });
});

app.post("/api/unlock", (req, res) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const recent = (unlockFailures.get(ip) || []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 8) {
    res.status(429).json({ error: "尝试次数过多，请 10 分钟后再试" });
    return;
  }

  const submitted = String(req.body?.code || "");
  if (accessCode && !safeEqual(submitted, accessCode)) {
    recent.push(now);
    unlockFailures.set(ip, recent);
    res.status(401).json({ error: "口令不正确" });
    return;
  }

  unlockFailures.delete(ip);
  const sessionId = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionId, { expiresAt: now + sessionMs });
  res.setHeader(
    "Set-Cookie",
    `yz_pass=${sessionId}; Path=/; Max-Age=${Math.floor(sessionMs / 1000)}; HttpOnly; SameSite=Lax${
      req.secure || process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  res.json({ ok: true });
});

app.use("/api", (req, res, next) => {
  if (!accessCode || isAuthenticated(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "这个工具需要访问口令" });
});

app.get("/api/tasks", (_req, res) => {
  purgeExpired();
  const list = [...tasks.values()]
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((task) => ({
      id: task.id,
      title: task.title,
      course: task.course,
      createdAt: task.createdAt,
      expiresAt: task.expiresAt,
      stats: task.stats,
    }));
  res.json(list);
});

app.get("/api/cases", (_req, res) => {
  res.json(CASE_LIBRARY);
});

app.post("/api/tasks", (req, res, next) => {
  upload.array("files", maxFiles)(req, res, async (uploadError) => {
    if (uploadError) {
      await cleanupUploadedFiles(req.files);
      next(uploadError);
      return;
    }

    const files = req.files || [];
    if (files.length < 2) {
      await cleanupUploadedFiles(files);
      res.status(400).json({ error: "至少需要上传两份物料才能比对" });
      return;
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > maxTotalBytes) {
      await cleanupUploadedFiles(files);
      res.status(413).json({ error: "文件总大小超过 500MB，请拆分后重试" });
      return;
    }
    const oversized = files.find((file) => file.size > maxBytesForFile(file.originalname));
    if (oversized) {
      await cleanupUploadedFiles(files);
      res.status(413).json({
        error: `${normalizeFilename(oversized.originalname)} 超过该类型的大小上限：${formatMegabytes(
          maxBytesForFile(oversized.originalname),
        )}`,
      });
      return;
    }

    const jobId = crypto.randomBytes(16).toString("hex");
    const job = {
      id: jobId,
      status: "queued",
      message: "文件已上传，等待解析",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files,
      title: cleanText(req.body?.title, 80) || "未命名校对任务",
      course: cleanText(req.body?.course, 120),
      url: "",
      stats: null,
      errors: [],
      error: "",
    };
    jobs.set(jobId, job);
    enqueueTaskJob(job);
    res.status(202).json({
      jobId,
      status: job.status,
      pollUrl: `/api/jobs/${jobId}`,
    });
  });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(410).json({ error: "任务不存在或已过期" });
    return;
  }
  res.json({
    id: job.id,
    status: job.status,
    message: job.message,
    url: job.url,
    stats: job.stats,
    errors: job.errors,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

app.get("/api/tasks/:id", (req, res) => {
  purgeExpired();
  const task = tasks.get(req.params.id);
  if (!task) {
    res.status(410).json({ error: "任务不存在或已过期", hint: `任务链接保留 ${ttlDays} 天` });
    return;
  }
  const { id, title, course, createdAt, expiresAt, docs, findings, stats, parseErrors } = task;
  res.json({ id, title, course, createdAt, expiresAt, docs, findings, stats, parseErrors });
});

app.post("/api/tasks/:id/findings/:fid", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    res.status(410).json({ error: "任务不存在或已过期" });
    return;
  }

  const status = String(req.body?.status || "");
  if (!["pending", "done", "false_positive", "ignored"].includes(status)) {
    res.status(400).json({ error: "无效的处理状态" });
    return;
  }

  const finding = task.findings.find((item) => item.id === req.params.fid);
  if (!finding) {
    res.status(404).json({ error: "问题条目不存在" });
    return;
  }
  finding.status = status;
  res.json({ ok: true, status });
});

app.get("/api/tasks/:id/export", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    res.status(410).type("text").send("任务不存在或已过期");
    return;
  }

  const header = [
    "序号",
    "风险",
    "类型",
    "内容小点",
    "处理状态",
    "物料A",
    "位置A",
    "原文A",
    "事实A_对象",
    "事实A_属性",
    "事实A_关系",
    "事实A_数值",
    "事实A_时间类型",
    "事实A_人群",
    "事实A_条件",
    "事实A_顺序",
    "事实A_倾向",
    "物料B",
    "位置B",
    "原文B",
    "事实B_对象",
    "事实B_属性",
    "事实B_关系",
    "事实B_数值",
    "事实B_时间类型",
    "事实B_人群",
    "事实B_条件",
    "事实B_顺序",
    "事实B_倾向",
    "差异说明",
    "处理建议",
  ];
  const rows = task.findings.map((finding, index) => [
    index + 1,
    riskLabel(finding.risk),
    finding.type,
    finding.anchorName,
    statusLabel(finding.status),
    finding.a.docName,
    finding.a.locator,
    finding.a.text,
    finding.factA?.subject,
    finding.factA?.attribute,
    finding.factA?.relation,
    finding.factA?.value?.raw,
    finding.factA?.timeTypeLabel,
    finding.factA?.population,
    finding.factA?.condition,
    finding.factA?.sequence,
    finding.factA?.polarity,
    finding.b.docName,
    finding.b.locator,
    finding.b.text,
    finding.factB?.subject,
    finding.factB?.attribute,
    finding.factB?.relation,
    finding.factB?.value?.raw,
    finding.factB?.timeTypeLabel,
    finding.factB?.population,
    finding.factB?.condition,
    finding.factB?.sequence,
    finding.factB?.polarity,
    finding.detail,
    finding.suggestion,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = `${safeFilename(task.title || "校对结果")}-问题清单.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(`\uFEFF${csv}`);
});

app.use((error, req, res, _next) => {
  if (error.code === "UNSUPPORTED_FILE") {
    res.status(415).json({ error: error.message });
    return;
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "单个文件超过 300MB 上限"
        : error.code === "LIMIT_FILE_COUNT"
          ? `一次最多上传 ${maxFiles} 份物料`
          : `上传失败：${error.message}`;
    res.status(413).json({ error: message });
    return;
  }

  if (error instanceof DocumentParseError) {
    res.status(422).json({ error: error.message });
    return;
  }

  const status = error.code === "ENOENT" ? 404 : 500;
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, error);
  res.status(status).json({
    error: status === 404 ? "资源不存在" : "服务处理失败，请稍后重试",
  });
});

const cleanupTimer = setInterval(() => {
  purgeExpired();
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
  for (const [ip, failures] of unlockFailures) {
    const active = failures.filter((time) => now - time < 10 * 60 * 1000);
    if (active.length) unlockFailures.set(ip, active);
    else unlockFailures.delete(ip);
  }
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > 60 * 60 * 1000) jobs.delete(id);
  }
}, 10 * 60 * 1000);
cleanupTimer.unref();

app.listen(port, () => {
  console.log(`一致 · 内容口径校对已启动：http://localhost:${port}`);
  console.log(`任务保留 ${ttlDays} 天；访问口令${accessCode ? "已启用" : "已关闭"}`);
});

function enqueueTaskJob(job) {
  taskJobQueue = taskJobQueue
    .then(() => processTaskJob(job))
    .catch(async (error) => {
      job.status = "failed";
      job.error = "服务处理失败，请稍后重试";
      job.message = job.error;
      job.updatedAt = Date.now();
      await cleanupUploadedFiles(job.files);
      console.error(`[${new Date().toISOString()}] 后台任务失败 ${job.id}`, error);
    });
}

async function processTaskJob(job) {
  job.status = "processing";
  job.message = `正在解析 ${job.files.length} 份物料`;
  job.updatedAt = Date.now();
  const docs = [];
  const errors = [];

  try {
    for (let index = 0; index < job.files.length; index += 1) {
      const file = job.files[index];
      const docId = `D${index + 1}`;
      const displayName = normalizeFilename(file.originalname);
      job.message = `正在处理 ${index + 1}/${job.files.length}：${displayName}`;
      job.updatedAt = Date.now();
      file.onProgress = (progress) => {
        job.message = `正在转写 ${displayName}：${Math.floor(progress.end)} / ${Math.floor(
          progress.duration,
        )} 秒`;
        job.updatedAt = Date.now();
      };
      try {
        const doc = await parseDocument(file, docId);
        doc.segments = doc.segments.map((segment, segmentIndex) => ({
          ...segment,
          order: segmentIndex,
          docId,
          docName: doc.name,
        }));
        docs.push(doc);
      } catch (error) {
        errors.push(`${displayName}：${humanizeParseError(error)}`);
      }
    }

    if (docs.length < 2) {
      job.status = "failed";
      job.error = "可读取的物料不足两份，无法进行跨文件比对";
      job.errors = errors;
      job.message = job.error;
      job.updatedAt = Date.now();
      return;
    }

    job.message = "正在建立事实卡并比对";
    job.updatedAt = Date.now();
    const comparison = compareDocuments(docs);
    const id = crypto.randomBytes(16).toString("hex");
    const createdAt = Date.now();
    const task = {
      id,
      title: job.title,
      course: job.course,
      createdAt,
      expiresAt: createdAt + ttlMs,
      docs: docs.map((doc) => ({
        docId: doc.did,
        name: doc.name,
        srcType: doc.srcType,
        blocks: doc.segments.length,
      })),
      findings: comparison.findings,
      stats: comparison.stats,
      parseErrors: errors,
    };
    tasks.set(id, task);
    purgeExpired();

    job.status = "completed";
    job.message = `检测完成：${comparison.stats.findings} 条问题`;
    job.url = `/t/${id}`;
    job.stats = comparison.stats;
    job.errors = errors;
    job.updatedAt = Date.now();
  } finally {
    await cleanupUploadedFiles(job.files);
  }
}

function isAuthenticated(req) {
  const sessionId = parseCookies(req.headers.cookie || "").yz_pass;
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

function parseCookies(header) {
  const output = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    try {
      output[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      output[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
  }
  return output;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function purgeExpired() {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (task.expiresAt <= now) tasks.delete(id);
  }
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function humanizeParseError(error) {
  return error instanceof DocumentParseError || error?.name === "MediaProcessingError"
    ? error.message
    : "读取失败，请检查文件是否损坏或加密";
}

function maxBytesForFile(filename) {
  if (isMediaFile(filename)) return maxMediaBytes;
  if (isImageFile(filename)) return maxImageBytes;
  return maxDocumentBytes;
}

function formatMegabytes(bytes) {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

async function cleanupUploadedFiles(files = []) {
  await Promise.all(
    files
      .map((file) => file.path)
      .filter(Boolean)
      .map((filePath) => fs.promises.unlink(filePath).catch(() => {})),
  );
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function safeFilename(value) {
  return String(value)
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, "-")
    .slice(0, 60) || "校对结果";
}

function riskLabel(value) {
  return { high: "高危", mid: "中危", low: "低危" }[value] || value;
}

function statusLabel(value) {
  return {
    pending: "待处理",
    done: "已处理",
    false_positive: "误报",
    ignored: "忽略",
  }[value] || value;
}
