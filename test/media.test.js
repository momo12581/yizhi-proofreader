import assert from "node:assert/strict";
import test, { after } from "node:test";
import sharp from "sharp";
import { isImageFile, isMediaFile, parseDocument } from "../src/parser.js";
import { closeMediaWorkers } from "../src/media.js";

after(async () => {
  await closeMediaWorkers();
});

test("图片会经过本地 OCR 进入比对语义段", async () => {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="500">
      <rect width="100%" height="100%" fill="white"/>
      <text x="80" y="180" font-size="88" font-family="Microsoft YaHei" fill="#111">广陈皮用量为 8 克</text>
      <text x="80" y="340" font-size="72" font-family="Microsoft YaHei" fill="#111">五虎穴从下到上按摩</text>
    </svg>
  `);
  const png = await sharp(svg).png().toBuffer();
  const doc = await parseDocument({ originalname: "课件截图.png", buffer: png }, "D1");
  const text = doc.segments.map((segment) => segment.text).join("\n");
  assert.equal(doc.srcType, "image");
  assert.equal(doc.segments[0].srcType, "image");
  assert.match(text, /8/);
  assert.ok(doc.segments.length > 0);
  assert.ok(doc.segments.some((segment) => segment.imageCrop?.startsWith("data:image/jpeg;base64,")));
  assert.ok(doc.segments.some((segment) => segment.imageBox?.x1 > segment.imageBox?.x0));
});

test("图片和音视频扩展名会被识别为可上传媒体", () => {
  assert.equal(isImageFile("截图.png"), true);
  assert.equal(isMediaFile("课程.mp4"), true);
  assert.equal(isMediaFile("录音.m4a"), true);
  assert.equal(isMediaFile("讲义.pdf"), false);
});
