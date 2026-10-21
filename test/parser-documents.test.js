import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { parseDocument } from "../src/parser.js";

test("解析 DOCX 段落文字", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>山药每日用量 15 克。</w:t></w:r></w:p><w:p><w:r><w:t>连续调理 7 天。</w:t></w:r></w:p></w:body></w:document>',
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const doc = await parseDocument({ originalname: "讲义.docx", buffer }, "D1");
  assert.equal(doc.name, "讲义.docx");
  assert.equal(doc.segments.length, 2);
  assert.match(doc.segments[0].text, /15 克/);
});

test("解析 PPTX 并保留页码定位", async () => {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    '<p:sld xmlns:a="a"><a:p><a:r><a:t>山药每日用量 15 克。</a:t></a:r></a:p></p:sld>',
  );
  zip.file(
    "ppt/slides/slide2.xml",
    '<p:sld xmlns:a="a"><a:p><a:r><a:t>连续调理 7 天。</a:t></a:r></a:p></p:sld>',
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const doc = await parseDocument({ originalname: "课件.pptx", buffer }, "D2");
  assert.deepEqual(
    doc.segments.map((segment) => segment.locator),
    ["第 1 页", "第 2 页"],
  );
});

test("解析 PDF 文字层", async () => {
  const doc = await parseDocument(
    { originalname: "handout.pdf", buffer: makeSimplePdf(["Dose 15 g.", "Use for 7 days."]) },
    "D3",
  );
  assert.equal(doc.segments[0].locator, "第 1 页");
  assert.match(doc.segments.map((segment) => segment.text).join(" "), /Dose 15 g/);
});

function makeSimplePdf(lines) {
  const content = [
    "BT",
    "/F1 14 Tf",
    "72 720 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? `(${line}) Tj` : `(${line}) Tj`,
      "0 -24 Td",
    ]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}
