import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import { createWorker } from "tesseract.js";
import chiSimData from "@tesseract.js-data/chi_sim";
import sharp from "sharp";

const run = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sampleRate = 16_000;
const chunkSeconds = 8 * 60;
const bytesPerSample = 2;
const bytesPerChunk = sampleRate * chunkSeconds * bytesPerSample;
const maxMediaSeconds = 2 * 60 * 60;
let ocrWorkerPromise;
let whisperPipelinePromise;

export class MediaProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = "MediaProcessingError";
  }
}

export async function ocrImage(buffer) {
  let image;
  try {
    image = await sharp(buffer, { failOn: "none" })
      .rotate()
      .grayscale()
      .normalize()
      .resize({ width: 2200, fit: "inside", withoutEnlargement: false })
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    throw new MediaProcessingError("图片无法读取，请改用 PNG/JPG 后重试");
  }

  const worker = await getOcrWorker();
  try {
    const result = await worker.recognize(image, {}, { blocks: true });
    const metadata = await sharp(image).metadata();
    const text = cleanOcrText(result.data.text);
    if (!text.trim()) {
      throw new MediaProcessingError("图片中没有识别到清晰文字，请提高清晰度或裁剪后重试");
    }
    const lines = [];
    for (const block of result.data.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          const lineText = cleanOcrText(line.text);
          if (!lineText) continue;
          lines.push({
            text: lineText,
            bbox: line.bbox,
            crop: await cropEvidence(
              image,
              line.bbox,
              metadata.width || 0,
              metadata.height || 0,
            ).catch(() => ""),
          });
        }
      }
    }
    return { text, lines };
  } catch (error) {
    if (error instanceof MediaProcessingError) throw error;
    throw new MediaProcessingError(`图片 OCR 失败：${String(error?.message || error).slice(0, 120)}`);
  }
}

export async function transcribeMedia(filePath, label, onProgress = () => {}) {
  await ensureFfmpeg();
  const duration = await probeDuration(filePath);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new MediaProcessingError("无法读取媒体时长，文件可能损坏或没有音频轨道");
  }
  if (duration > maxMediaSeconds) {
    throw new MediaProcessingError("媒体时长超过 2 小时，请先拆分后再上传");
  }

  const pcmPath = path.join(
    path.dirname(filePath),
    `audio-${crypto.randomBytes(8).toString("hex")}.s16le`,
  );
  try {
    await run(
      "ffmpeg.exe",
      [
        "-y",
        "-i",
        filePath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        pcmPath,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );

    const transcriber = await getWhisperPipeline();
    const chunks = [];
    const handle = await fs.open(pcmPath, "r");
    try {
      let index = 0;
      while (true) {
        const buffer = Buffer.allocUnsafe(bytesPerChunk);
        const { bytesRead } = await handle.read(buffer, 0, bytesPerChunk, index * bytesPerChunk);
        if (!bytesRead) break;
        const samples = new Int16Array(
          buffer.buffer,
          buffer.byteOffset,
          Math.floor(bytesRead / bytesPerSample),
        );
        const audio = new Float32Array(samples.length);
        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
          audio[sampleIndex] = samples[sampleIndex] / 32768;
        }

        const start = index * chunkSeconds;
        const end = Math.min(duration, start + bytesRead / (sampleRate * bytesPerSample));
        onProgress({ start, end, duration });
        const result = await transcriber(audio, {
          language: "zh",
          task: "transcribe",
          chunk_length_s: 30,
          stride_length_s: 5,
        });
        const text = normalizeTranscript(result?.text || "");
        if (text) chunks.push({ start, end, text });
        index += 1;
      }
    } finally {
      await handle.close();
    }

    if (!chunks.length) {
      throw new MediaProcessingError("没有识别到语音内容，请确认视频中存在清晰人声");
    }
    return chunks.map((chunk) => ({
      label: `${label} ${formatClock(chunk.start)}–${formatClock(chunk.end)}`,
      text: chunk.text,
    }));
  } finally {
    await fs.unlink(pcmPath).catch(() => {});
  }
}

export async function mediaDuration(filePath) {
  return probeDuration(filePath).catch(() => 0);
}

export async function closeMediaWorkers() {
  if (ocrWorkerPromise) {
    const worker = await ocrWorkerPromise.catch(() => null);
    await worker?.terminate?.().catch(() => {});
    ocrWorkerPromise = null;
  }
  if (whisperPipelinePromise) {
    const transcriber = await whisperPipelinePromise.catch(() => null);
    await transcriber?.dispose?.().catch(() => {});
    whisperPipelinePromise = null;
  }
}

async function cropEvidence(image, bbox, width, height) {
  if (!width || !height || !bbox) return "";
  const padding = 14;
  const left = Math.max(0, Math.floor(bbox.x0) - padding);
  const top = Math.max(0, Math.floor(bbox.y0) - padding);
  const right = Math.min(width, Math.ceil(bbox.x1) + padding);
  const bottom = Math.min(height, Math.ceil(bbox.y1) + padding);
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth < 2 || cropHeight < 2) return "";
  const buffer = await sharp(image)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize({ width: 900, withoutEnlargement: true })
    .jpeg({ quality: 84 })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("chi_sim", 1, {
      langPath: chiSimData.langPath,
      gzip: chiSimData.gzip,
      cachePath: path.join(projectRoot, ".ocr-cache"),
      logger: () => {},
    }).catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

async function getWhisperPipeline() {
  if (!whisperPipelinePromise) {
    const { env } = await import("@huggingface/transformers");
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = path.resolve(
      projectRoot,
      "node_modules",
      "sts-whisper-tiny",
      "models",
    );
    whisperPipelinePromise = pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-tiny",
      { local_files_only: true, dtype: "q8" },
    ).catch((error) => {
      whisperPipelinePromise = null;
      throw new MediaProcessingError(
        `本地 Whisper 模型加载失败：${String(error?.message || error).slice(0, 120)}`,
      );
    });
  }
  return whisperPipelinePromise;
}

async function probeDuration(filePath) {
  const { stdout } = await run(
    "ffprobe.exe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  return Number.parseFloat(stdout.trim());
}

async function ensureFfmpeg() {
  try {
    await run("ffmpeg.exe", ["-version"], { maxBuffer: 1024 * 1024 });
    await run("ffprobe.exe", ["-version"], { maxBuffer: 1024 * 1024 });
  } catch {
    throw new MediaProcessingError("服务器未安装 FFmpeg，暂时无法转写视频");
  }
}

function cleanOcrText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/(?<=[\p{Script=Han}\d])[ \t]+(?=[\p{Script=Han}\d])/gu, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?<=五虎)八/g, "穴")
    .replace(/(?<=\d)兄/g, "克")
    .replace(/厂陈皮/g, "广陈皮")
    .replace(/用量力(?=\d)/g, "用量为")
    .trim();
}

function normalizeTranscript(text) {
  return String(text || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
