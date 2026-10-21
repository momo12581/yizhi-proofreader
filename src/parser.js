import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import { ocrImage, transcribeMedia } from "./media.js";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "aac", "flac", "ogg", "opus"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "mkv", "webm", "avi", "m4v"]);
const SUPPORTED_EXTENSIONS = new Set([
  "pptx",
  "docx",
  "pdf",
  "txt",
  "md",
  "csv",
  ...IMAGE_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
]);
const MAX_SEGMENTS_PER_DOC = 5000;
const MAX_TEXT_CHARS = 8_000_000;

export class DocumentParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "DocumentParseError";
  }
}

export function extensionOf(filename) {
  return path.extname(String(filename || "")).slice(1).toLowerCase();
}

export function isSupportedFile(filename) {
  return SUPPORTED_EXTENSIONS.has(extensionOf(filename));
}

export function isImageFile(filename) {
  return IMAGE_EXTENSIONS.has(extensionOf(filename));
}

export function isMediaFile(filename) {
  const ext = extensionOf(filename);
  return AUDIO_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}

export async function parseDocument(file, docId) {
  const ext = extensionOf(file.originalname);
  const originalName = normalizeFilename(file.originalname);
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new DocumentParseError(`不支持 .${ext || "未知"} 格式`);
  }

  const buffer = file.buffer || (await fs.readFile(file.path));
  let pages;
  if (ext === "docx") {
    pages = await parseDocx(buffer);
  } else if (ext === "pptx") {
    pages = await parsePptx(buffer);
  } else if (ext === "pdf") {
    pages = await parsePdf(buffer);
  } else if (IMAGE_EXTENSIONS.has(ext)) {
    const ocr = await ocrImage(buffer);
    pages = [{ label: "图片 OCR", text: ocr.text, lines: ocr.lines }];
  } else if (AUDIO_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)) {
    let mediaPath = file.path;
    let temporaryPath = "";
    if (!mediaPath) {
      temporaryPath = path.join(
        os.tmpdir(),
        `yizhi-media-${crypto.randomBytes(8).toString("hex")}.${ext}`,
      );
      await fs.writeFile(temporaryPath, buffer);
      mediaPath = temporaryPath;
    }
    try {
      pages = await transcribeMedia(
        mediaPath,
        AUDIO_EXTENSIONS.has(ext) ? "音频转写" : "视频转写",
        file.onProgress,
      );
    } finally {
      await fs.unlink(temporaryPath).catch(() => {});
    }
  } else {
    pages = [{ label: "正文", text: decodeTextBuffer(buffer) }];
  }

  const normalizedSrcType =
    ext === "md" || ext === "csv" || ext === "txt"
      ? "text"
      : IMAGE_EXTENSIONS.has(ext)
        ? "image"
        : AUDIO_EXTENSIONS.has(ext)
          ? "audio"
          : VIDEO_EXTENSIONS.has(ext)
            ? "video"
            : ext;
  const segments = [];
  for (const page of pages) {
    const pageSeen = new Set();
    const lines = page.lines?.length
      ? page.lines
      : textToSegments(page.text, page.label).map((text) => ({ text }));
    for (const line of lines) {
      const lineSegments = textToSegments(line.text, page.label);
      for (const text of lineSegments) {
        if (pageSeen.has(text)) continue;
        pageSeen.add(text);
        segments.push({
          id: `${docId}-${segments.length + 1}`,
          text,
          locator: page.label,
          srcType: normalizedSrcType,
          ...(line.crop ? { imageCrop: line.crop, imageBox: line.bbox } : {}),
        });
        if (segments.length >= MAX_SEGMENTS_PER_DOC) break;
      }
      if (segments.length >= MAX_SEGMENTS_PER_DOC) break;
    }
    if (segments.length >= MAX_SEGMENTS_PER_DOC) break;
  }

  if (!segments.length) {
    throw new DocumentParseError(
      ext === "pdf"
        ? "PDF 中没有可读取的文字层；扫描件请先做 OCR，再上传文本版"
        : "文件可打开，但没有提取到可用文字",
    );
  }

  return {
    did: docId,
    name: originalName,
    srcType: normalizedSrcType,
    segments,
  };
}

export function normalizeFilename(value) {
  const name = String(value || "未命名文件").normalize("NFC");
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? name : decoded.normalize("NFC");
}

async function parseDocx(buffer) {
  const zip = await openZip(buffer, "DOCX");
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new DocumentParseError("DOCX 缺少正文文件，文件可能已损坏");

  const xml = await documentFile.async("string");
  const paragraphs = xml
    .split(/<\/w:(?:p|tr)>/gi)
    .map((part) => extractDrawingText(part, "w").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return [{ label: "正文", text: paragraphs.join("\n") }];
}

async function parsePptx(buffer) {
  const zip = await openZip(buffer, "PPTX");
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (!slideNames.length) {
    throw new DocumentParseError("PPTX 中没有找到幻灯片，文件可能已损坏");
  }

  const pages = [];
  for (const name of slideNames) {
    const xml = await zip.file(name).async("string");
    const paragraphs = xml
      .split(/<\/a:p>/gi)
      .map((part) => extractDrawingText(part, "a").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    pages.push({
      label: `第 ${slideNumber(name)} 页`,
      text: paragraphs.join("\n"),
    });
  }
  return pages;
}

async function parsePdf(buffer) {
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.pages.map((page) => ({
      label: `第 ${page.num} 页`,
      text: page.text || "",
    }));
  } catch (error) {
    const message = String(error?.message || error);
    if (/password/i.test(message)) {
      throw new DocumentParseError("PDF 已加密，请先移除密码后再上传");
    }
    throw new DocumentParseError(`PDF 解析失败：${message.slice(0, 120)}`);
  } finally {
    await parser?.destroy().catch(() => {});
  }
}

async function openZip(buffer, type) {
  try {
    return await JSZip.loadAsync(buffer);
  } catch {
    throw new DocumentParseError(`${type} 文件无法解压，可能损坏或被加密`);
  }
}

function slideNumber(name) {
  return Number(name.match(/slide(\d+)\.xml$/i)?.[1] || 0);
}

function extractDrawingText(xml, prefix) {
  const matches = [
    ...xml.matchAll(new RegExp(`<${prefix}:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${prefix}:t>`, "gi")),
  ];
  return matches.map((match) => decodeXml(match[1])).join("");
}

function decodeXml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function decodeTextBuffer(buffer) {
  if (buffer.length > MAX_TEXT_CHARS * 4) {
    throw new DocumentParseError("文本文件过大，请拆分后再上传");
  }

  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    try {
      return new TextDecoder("gb18030").decode(buffer);
    } catch {
      return buffer.toString("utf8").replace(/\uFFFD/g, "");
    }
  }
}

function textToSegments(rawText, label) {
  const normalized = String(rawText || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  const output = [];
  for (const paragraph of normalized.split(/\n+/)) {
    const line = paragraph.trim();
    if (!line) continue;

    const sentences = line
      .split(/(?<=[。！？!?；;])\s*/u)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 2);

    for (let sentence of sentences.length ? sentences : [line]) {
      if (sentence.length > 700) {
        const chunks = sentence.match(/[\s\S]{1,700}(?:[，,、]|$)/g) || [sentence.slice(0, 700)];
        output.push(...chunks.map((chunk) => chunk.trim()).filter(Boolean));
      } else {
        output.push(sentence);
      }
    }
  }

  return [...new Set(output)].slice(0, MAX_SEGMENTS_PER_DOC);
}

export const parserInternals = {
  decodeTextBuffer,
  textToSegments,
};
