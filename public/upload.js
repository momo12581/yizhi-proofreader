const $ = (selector) => document.querySelector(selector);

const ALLOWED = new Set([
  "pptx",
  "docx",
  "pdf",
  "txt",
  "md",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "m4v",
  "mp3",
  "m4a",
  "wav",
  "aac",
  "flac",
  "ogg",
  "opus",
]);
const MAX_DOCUMENT_BYTES = 80 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA_BYTES = 300 * 1024 * 1024;
const NEED_CONVERT = {
  ppt: "老版 PPT（.ppt）请用 PowerPoint 另存为 .pptx 后再上传",
  doc: "老版 Word（.doc）请另存为 .docx 后再上传",
  xls: "Excel 表格本期不参与比对，可先导出成 PDF 或 TXT",
  xlsx: "Excel 表格本期不参与比对，可先导出成 PDF 或 TXT",
};

const state = {
  files: [],
  unlocked: false,
  submitting: false,
};

const drop = $("#drop");
const fileInput = $("#fileInput");
const fileList = $("#fileList");
const runBtn = $("#runBtn");
const runStatus = $("#runStatus");
const titleInput = $("#title");
let picking = false;

bindEvents();
guard();

function bindEvents() {
  $("#pickBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    pickFiles();
  });

  drop.addEventListener("click", (event) => {
    if (!event.target.closest("#pickBtn")) pickFiles();
  });
  drop.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pickFiles();
    }
  });

  fileInput.addEventListener("change", () => {
    picking = false;
    addFiles([...fileInput.files]);
    fileInput.value = "";
  });
  fileInput.addEventListener("cancel", () => {
    picking = false;
  });
  window.addEventListener("focus", () => {
    window.setTimeout(() => {
      picking = false;
    }, 500);
  });

  for (const name of ["dragenter", "dragover"]) {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add("over");
    });
  }
  for (const name of ["dragleave", "drop"]) {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.remove("over");
    });
  }
  drop.addEventListener("drop", (event) => addFiles([...(event.dataTransfer?.files || [])]));

  fileList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-index]");
    if (!button) return;
    state.files.splice(Number(button.dataset.index), 1);
    renderFiles();
  });

  titleInput.addEventListener("input", renderFiles);
  $("#clearBtn").addEventListener("click", () => clearForm());
  $("#newBtn").addEventListener("click", () => {
    clearForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
    titleInput.focus();
  });
  runBtn.addEventListener("click", submitTask);

  $("#gateForm").addEventListener("submit", unlock);
  $("#gateCode").addEventListener("input", () => {
    $("#gateErr").textContent = "";
  });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    clearForm({ force: true });
    setStatus("");
  });
}

function pickFiles() {
  if (picking) return;
  picking = true;
  fileInput.value = "";
  fileInput.click();
}

function addFiles(files) {
  const rejected = [];
  const convert = [];
  const tooBig = [];

  for (const file of files) {
    const extension = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED.has(extension)) {
      if (NEED_CONVERT[extension]) convert.push(`${file.name}：${NEED_CONVERT[extension]}`);
      else rejected.push(file.name);
      continue;
    }
    const limit = maxBytesForFile(file);
    if (file.size > limit) {
      tooBig.push(`${file.name}（${formatSize(file.size)}，上限 ${formatSize(limit)}）`);
      continue;
    }
    if (state.files.some((item) => item.name === file.name && item.size === file.size)) continue;
    state.files.push(file);
  }

  const messages = [];
  if (convert.length) messages.push(...convert);
  if (tooBig.length) messages.push(`文件超过类型上限：${tooBig.join("、")}`);
  if (rejected.length) messages.push(`已跳过不支持的格式：${rejected.join("、")}`);
  renderFiles(messages.join("\n"), messages.length > 0);
}

function renderFiles(message = "", isError = false) {
  fileList.replaceChildren(
    ...state.files.map((file, index) => {
      const row = document.createElement("li");
      const icon = document.createElement("span");
      icon.className = "file-type";
      icon.textContent = (file.name.split(".").pop() || "?").toUpperCase().slice(0, 4);

      const text = document.createElement("span");
      text.className = "file-copy";
      const name = document.createElement("strong");
      name.textContent = file.name;
      const size = document.createElement("small");
      size.textContent = formatSize(file.size);
      text.append(name, size);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "fdel";
      remove.dataset.index = String(index);
      remove.title = "移除";
      remove.setAttribute("aria-label", `移除 ${file.name}`);
      remove.textContent = "×";
      row.append(icon, text, remove);
      return row;
    }),
  );

  runBtn.disabled = !state.unlocked || state.submitting || state.files.length < 2 || !titleInput.value.trim();

  if (message) {
    setStatus(message, isError);
  } else if (state.files.length === 1) {
    setStatus("再上传一份物料才能开始比对。");
  } else if (state.files.length >= 2 && !titleInput.value.trim()) {
    setStatus(`已选择 ${state.files.length} 份物料，请填写任务名称。`);
  } else if (state.files.length >= 2) {
    setStatus(`已选择 ${state.files.length} 份物料，可以开始检测。`);
  } else {
    setStatus("");
  }
}

async function guard() {
  setServiceState("connecting");
  try {
    const response = await fetch("/api/auth", { headers: { accept: "application/json" } });
    const data = await response.json();
    if (data.passed) {
      state.unlocked = true;
      $("#gate").hidden = true;
      afterUnlock();
      return;
    }
    state.unlocked = false;
    $("#gate").hidden = false;
    $("#gateCode").focus();
    renderFiles();
    setServiceState("idle");
  } catch {
    setStatus("连不上校对服务，请确认服务已启动。", true);
    setServiceState("offline");
  }
}

async function unlock(event) {
  event.preventDefault();
  const code = $("#gateCode").value;
  const button = $("#gateBtn");
  const error = $("#gateErr");
  if (!code) {
    error.textContent = "请输入访问口令";
    return;
  }

  button.disabled = true;
  error.textContent = "";
  try {
    const response = await fetch("/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      error.textContent = data.error || "口令不正确";
      $("#gateCode").select();
      return;
    }
    state.unlocked = true;
    $("#gate").hidden = true;
    $("#gateCode").value = "";
    afterUnlock();
  } catch {
    error.textContent = "网络异常，请重试";
  } finally {
    button.disabled = false;
  }
}

function afterUnlock() {
  renderFiles();
  ping();
  loadTasks();
}

async function submitTask() {
  if (state.submitting) return;
  if (state.files.length < 2) {
    setStatus("至少需要两份物料才能比对。", true);
    return;
  }
  if (!titleInput.value.trim()) {
    setStatus("请填写任务名称。", true);
    titleInput.focus();
    return;
  }

  state.submitting = true;
  runBtn.disabled = true;
  const startedAt = Date.now();
  const tick = window.setInterval(() => {
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    setStatus(`正在解析并比对 ${state.files.length} 份物料… 已用 ${seconds}s`);
  }, 200);
  setStatus("正在上传文件…");

  try {
    const form = new FormData();
    form.append("title", titleInput.value.trim());
    form.append("course", [$("#course").value.trim(), $("#chapter").value.trim()].filter(Boolean).join(" "));
    for (const file of state.files) form.append("files", file, file.name);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2_700_000);
    let response;
    try {
      response = await fetch("/api/tasks", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const raw = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
      if (response.status === 502 || /no tunnel/i.test(raw)) {
        throw new Error(
          "在线测试通道已断开。这通常是临时公网隧道失效，不是文档处理失败。请刷新页面或重新获取最新测试链接；本机访问 http://localhost:3000 不受影响。",
        );
      }
      throw new Error(
        `服务没有返回有效结果（HTTP ${response.status}）。${raw ? `片段：${raw}` : ""}`,
      );
    }

    const data = await response.json();
    if (!response.ok) {
      const detail = data.errors?.length ? `\n${data.errors.join("\n")}` : "";
      throw new Error(`${data.error || `检测失败（${response.status}）`}${detail}`);
    }

    if (data.jobId) window.clearInterval(tick);
    const result = data.jobId ? await pollTaskJob(data.jobId, startedAt) : data;
    if (result.status === "failed") {
      const detail = result.errors?.length ? `\n${result.errors.join("\n")}` : "";
      throw new Error(`${result.error || "检测失败"}${detail}`);
    }

    let successMessage;
    if (result.errors?.length) {
      successMessage =
        `任务已生成，但有 ${result.errors.length} 份文件未参与比对：\n${result.errors.join("\n")}\n即将打开结果…`;
    } else {
      const stats = result.stats;
      successMessage =
        `检测完成：抽取 ${stats.facts || 0} 张强制事实卡，发现 ${stats.findings} 条问题（高危 ${
          stats.high
        } / 中危 ${stats.mid}${stats.low ? ` / 低危 ${stats.low}` : ""}），耗时 ${(
          (Date.now() - startedAt) /
          1000
        ).toFixed(1)}s。正在打开结果…`;
    }
    clearForm({ force: true });
    setStatus(successMessage, Boolean(result.errors?.length));
    window.setTimeout(() => {
      window.location.href = result.url;
    }, result.errors?.length ? 2400 : 700);
  } catch (error) {
    state.submitting = false;
    renderFiles("", false);
    const message =
      error.name === "AbortError"
        ? "等待超过 45 分钟，已主动中止。请拆分视频或缩短素材后重试。"
        : error.message === "Failed to fetch"
          ? "浏览器无法连接服务，通常是临时公网隧道已断开，也可能是本机网络中断。请刷新页面或使用最新测试链接；本机 http://localhost:3000 不受影响。"
          : `检测失败：${error.message}`;
    setStatus(
      message,
      true,
    );
  } finally {
    window.clearInterval(tick);
  }
}

async function pollTaskJob(jobId, startedAt) {
  const deadline = Date.now() + 45 * 60 * 1000;
  let transientFailures = 0;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if ([408, 429, 502, 503, 504].includes(response.status)) {
        transientFailures += 1;
        if (transientFailures > 8) throw new Error("在线测试通道持续不可用，请刷新页面或使用最新链接");
        setStatus(`在线测试通道暂时波动，正在自动重试（${transientFailures}/8）…`);
        await delay(1600 * transientFailures);
        continue;
      }
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || `读取任务状态失败（${response.status}）`);
      if (data.status === "failed" || data.status === "completed") return data;
      transientFailures = 0;
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      setStatus(`${data.message || "正在处理"}… 已用 ${seconds}s`);
      await delay(1200);
    } catch (error) {
      if (error.message === "Failed to fetch") {
        transientFailures += 1;
        if (transientFailures > 8) throw error;
        setStatus(`浏览器与服务器暂时断开，正在自动重试（${transientFailures}/8）…`);
        await delay(1600 * transientFailures);
        continue;
      }
      throw error;
    }
  }
  throw new Error("任务处理超过 45 分钟，请缩短视频或拆分材料后重试");
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function clearForm({ force = false } = {}) {
  if (state.submitting && !force) return;
  state.submitting = false;
  state.files = [];
  fileInput.value = "";
  titleInput.value = "";
  $("#course").value = "";
  $("#chapter").value = "";
  renderFiles();
}

async function ping() {
  try {
    const response = await fetch("/api/health", { headers: { accept: "application/json" } });
    setServiceState(response.ok ? "online" : "offline");
  } catch {
    setServiceState("offline");
  }
}

function setServiceState(status) {
  const dot = $("#liveDot");
  const text = $("#liveText");
  dot.classList.toggle("bad", status === "offline");
  dot.classList.toggle("idle", status === "idle" || status === "connecting");
  text.textContent =
    status === "online"
      ? "服务运行中"
      : status === "offline"
        ? "服务未响应"
        : status === "idle"
          ? "等待解锁"
          : "正在连接";
}

async function loadTasks() {
  try {
    const response = await fetch("/api/tasks", { headers: { accept: "application/json" } });
    if (response.status === 401) {
      state.unlocked = false;
      $("#gate").hidden = false;
      return;
    }
    const list = await response.json();
    renderTasks(Array.isArray(list) ? list : []);
  } catch {
    $("#taskList").innerHTML = '<div class="hint">读取历史任务失败</div>';
  }
}

function renderTasks(list) {
  const box = $("#taskList");
  if (!list.length) {
    box.innerHTML = '<div class="empty-mini">还没有任务。上传两份以上物料就能开始。</div>';
    $("#expireHint").textContent = "";
    $("#navFindings").textContent = "0";
    $("#navAnchors").textContent = "0";
    return;
  }

  const totalFindings = list.reduce((sum, task) => sum + (task.stats?.findings || 0), 0);
  const totalAnchors = list.reduce((sum, task) => sum + (task.stats?.anchors || 0), 0);
  $("#navFindings").textContent = String(totalFindings);
  $("#navAnchors").textContent = String(totalAnchors);
  $("#expireHint").textContent = "任务链接 7 天后自动失效";

  box.innerHTML = list
    .map((task) => {
      const stats = task.stats || {};
      return `
        <a class="taskrow" href="/t/${encodeURIComponent(task.id)}">
          <span class="task-index">${escapeHtml((task.title || "未命名").slice(0, 1))}</span>
          <span class="tmain">
            <span class="ttitle">${escapeHtml(task.title || "未命名任务")}</span>
            <span class="tmeta">${escapeHtml(task.course || "未填课程")} · ${formatTime(task.createdAt)} · ${stats.segments || 0} 个语义段</span>
          </span>
          <span class="tbadges">
            ${stats.high ? `<span class="badge high">高危 ${stats.high}</span>` : ""}
            ${stats.mid ? `<span class="badge mid">中危 ${stats.mid}</span>` : ""}
            ${stats.low ? `<span class="badge low">低危 ${stats.low}</span>` : ""}
            ${!stats.findings ? '<span class="badge zero">未发现冲突</span>' : ""}
            <span class="arrow">›</span>
          </span>
        </a>`;
    })
    .join("");
}

async function readJson(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return {};
  return response.json().catch(() => ({}));
}

function setStatus(message, isError = false) {
  runStatus.textContent = message;
  runStatus.classList.toggle("err", Boolean(isError));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function maxBytesForFile(file) {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (["mp4", "mov", "mkv", "webm", "avi", "m4v", "mp3", "m4a", "wav", "aac", "flac", "ogg", "opus"].includes(extension)) {
    return MAX_MEDIA_BYTES;
  }
  if (["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"].includes(extension)) {
    return MAX_IMAGE_BYTES;
  }
  return MAX_DOCUMENT_BYTES;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}
