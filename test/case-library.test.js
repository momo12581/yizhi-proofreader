import assert from "node:assert/strict";
import test from "node:test";
import { CASE_LIBRARY } from "../src/case-library.js";

test("后台案例库包含方向与作业错误且案例 ID 唯一", () => {
  const ids = CASE_LIBRARY.cases.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("acupoint-direction-missing"));
  assert.ok(ids.includes("acupoint-direction-conflict"));
  assert.ok(ids.includes("quiz-answer-vs-lesson-conflict"));
  assert.ok(ids.includes("recurring-quiz-version-error"));
  assert.ok(
    CASE_LIBRARY.cases.every(
      (item) =>
        item.abstractPattern &&
        item.risk &&
        item.requiredFields.length > 0 &&
        item.suggestion,
    ),
  );
});
