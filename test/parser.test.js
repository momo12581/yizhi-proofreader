import assert from "node:assert/strict";
import test from "node:test";
import { parserInternals } from "../src/parser.js";

test("文本按中英文句末标点切分为语义段", () => {
  const segments = parserInternals.textToSegments(
    "第一句。第二句！Is this long enough? 最后一句；",
    "正文",
  );
  assert.deepEqual(segments, ["第一句。", "第二句！", "Is this long enough?", "最后一句；"]);
});

test("UTF-8 文本可以正确解码", () => {
  const buffer = Buffer.from("山药每日用量 15 克。", "utf8");
  assert.equal(parserInternals.decodeTextBuffer(buffer), "山药每日用量 15 克。");
});
