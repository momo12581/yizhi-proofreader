import assert from "node:assert/strict";
import test from "node:test";
import { compareDocuments, extractFactCards, extractQuantities } from "../src/compare.js";

function doc(id, name, lines) {
  return {
    did: id,
    name,
    srcType: "text",
    segments: lines.map((text, order) => ({
      id: `${id}-${order + 1}`,
      order,
      text,
      locator: "正文",
      docId: id,
      docName: name,
      srcType: "text",
    })),
  };
}

test("识别同一口径下的剂量和天数冲突", () => {
  const result = compareDocuments([
    doc("D1", "讲义.txt", [
      "山药每日建议用量为 15～30 克。",
      "本课程建议连续调理 7 天。",
      "脾虚人群应避免空腹饮用冷饮。",
    ]),
    doc("D2", "手册.txt", [
      "山药每日建议用量为 10～20 克。",
      "本课程建议连续调理 14 天。",
      "脾虚人群应避免空腹饮用冷饮。",
    ]),
  ]);

  assert.equal(result.stats.findings, 2);
  assert.equal(result.stats.high + result.stats.mid, 2);
  assert.ok(result.findings.some((finding) => finding.highlightA === "15～30克"));
  assert.ok(result.findings.some((finding) => finding.highlightA === "7天"));
  assert.ok(result.findings.every((finding) => finding.status === "pending"));
});

test("识别推荐与禁忌冲突", () => {
  const result = compareDocuments([
    doc("D1", "讲义.txt", ["脾胃虚寒的人可以每天喝冷饮。"]),
    doc("D2", "手册.txt", ["脾胃虚寒的人应避免每天喝冷饮。"]),
  ]);
  assert.ok(result.findings.some((finding) => finding.type === "推荐与禁忌冲突"));
});

test("识别操作方向相反", () => {
  const result = compareDocuments([
    doc("D1", "讲义.txt", ["建议饭前服用该方剂。"]),
    doc("D2", "手册.txt", ["建议饭后服用该方剂。"]),
  ]);
  assert.ok(result.findings.some((finding) => finding.type === "表述方向冲突"));
});

test("完全相同的说法不产生问题", () => {
  const result = compareDocuments([
    doc("D1", "讲义.txt", ["茯苓可以利水渗湿、健脾宁心。"]),
    doc("D2", "手册.txt", ["茯苓可以利水渗湿、健脾宁心。"]),
  ]);
  assert.equal(result.stats.findings, 0);
});

test("千克与克会换算到同一基准", () => {
  const [quantity] = extractQuantities("每日用量 1 千克");
  assert.equal(quantity.start, 1000);
  assert.equal(quantity.end, 1000);
});

test("日期和“第 N 天”不会被误当成剂量口径", () => {
  const quantities = extractQuantities("课程更新于 2026 年 10 月 21 日，第 1 天学习，连续 7 天。");
  assert.equal(quantities.length, 1);
  assert.equal(quantities[0].raw, "7天");
});

test("即使讲义和口语逐字稿句式差异很大，也按食材名匹配剂量", () => {
  const result = compareDocuments([
    doc("D1", "讲义.pdf", [
      "• 食材：小米50g 胡萝卜30g 铁棍山药",
      "50g 广陈皮6g 豌豆30g",
      "小米25-50克、胡萝卜30克、豌豆30",
      "克、铁棍山药25-50克、广陈皮8克",
      "陈皮需要煮 30 分钟。",
    ]),
    doc("D2", "逐字稿.txt", [
      "家里人一起吃，小米咱们就用 25 克到 50 克，25 克到 50 克啊。",
      "怎么也得放个 30 克，因为这个 30 克的胡萝卜啊。",
      "豌豆，豌豆咱们放 30 克。",
      "这个山药用多少呢？",
      "25 克到 50 克，也是根据你的食量。",
      "区别很大，广陈皮啊，咱们用 2 ~ 4 克就行了。",
      "陈皮煮 5 分钟到 10 分钟就足够了。",
    ]),
  ]);
  const conflict = result.findings.find((finding) => finding.anchorName === "陈皮 · 食材剂量");
  assert.ok(conflict);
  assert.equal(conflict.anchorName, "陈皮 · 食材剂量");
  assert.equal(conflict.highlightA, "8克");
  assert.equal(conflict.highlightB, "2~4克");
  assert.ok(!result.findings.some((finding) => finding.anchorName === "小米 · 食材剂量"));
  assert.ok(
    !result.findings.some(
      (finding) => finding.type === "食材剂量冲突" && finding.highlightA === "30分钟",
    ),
  );
});

test("后下时长冲突会携带完整结构化事实卡", () => {
  const result = compareDocuments([
    doc("D1", "讲义.pdf", ["陈皮后下煮 30 分钟。"]),
    doc("D2", "逐字稿.txt", ["陈皮要后下，煮 5 分钟到 10 分钟就够了。"]),
  ]);
  const conflict = result.findings.find((finding) => finding.type === "操作时间冲突");
  assert.ok(conflict);
  assert.equal(conflict.factA.timeType, "cooking_after_add");
  assert.equal(conflict.factA.subject, "陈皮");
  assert.equal(conflict.factA.population, "未限定");
  assert.equal(conflict.factA.requiredFieldsComplete, true);
  assert.ok(conflict.factA.source.locator);
});

test("同一脏腑的先天/后天表述会被判为概念冲突", () => {
  const result = compareDocuments([
    doc("D1", "讲义.pdf", ["脾胃先天之本，肾为先天之本。"]),
    doc("D2", "逐字稿.txt", ["肾是先天之本，脾是后天之本。"]),
  ]);
  const conflict = result.findings.find((finding) => finding.type === "中医概念冲突");
  assert.ok(conflict);
  assert.equal(conflict.anchorName, "脾 · 先天/后天");
  assert.equal(conflict.factA.attribute, "脏腑属性");
});

test("同一份材料内“全部同煮”和“陈皮后下”会触发顺序冲突", () => {
  const result = compareDocuments([
    doc("D1", "讲义.pdf", ["所有食材一起煮 20 分钟。", "陈皮后下煮 5 分钟。"]),
    doc("D2", "逐字稿.txt", ["所有食材洗净备用。"]),
  ]);
  const conflict = result.findings.find(
    (finding) => finding.type === "操作顺序冲突" && finding.a.docName === "讲义.pdf",
  );
  assert.ok(conflict);
  assert.equal(conflict.factA.sequence, "同煮");
  assert.equal(conflict.factB.sequence, "后下");
});

test("事实卡会标记缺失字段并阻止不完整事实参与比较", () => {
  const cards = extractFactCards(
    doc("D1", "讲义.pdf", ["陈皮后下煮 30 分钟，适合糖尿病或控糖人群。"]),
  );
  const timeCard = cards.find((card) => card.category === "time");
  assert.ok(timeCard);
  assert.equal(timeCard.population, "糖尿病、控糖");
  assert.equal(timeCard.condition, "未说明");
  assert.deepEqual(timeCard.missingFields, []);
});

test("同一食材的性味归经不一致会生成带来源的问题", () => {
  const result = compareDocuments([
    doc("D1", "讲义.pdf", ["小米性凉，味甘，归脾、胃经。"]),
    doc("D2", "逐字稿.txt", ["小米性温，味甘，归脾经。"]),
  ]);
  const nature = result.findings.find(
    (finding) => finding.type === "性味归经冲突" && finding.anchorName === "小米 · 四气",
  );
  assert.ok(nature);
  assert.equal(nature.highlightA, "凉");
  assert.equal(nature.highlightB, "温");
  assert.equal(nature.factA.attribute, "四气");
  assert.equal(nature.factA.source.docName, "讲义.pdf");
});

test("归经和五味的书写顺序不影响等价判断", () => {
  const result = compareDocuments([
    doc("D1", "讲义.pdf", ["陈皮味辛、苦，归脾、肺经。"]),
    doc("D2", "逐字稿.txt", ["陈皮味苦、辛，归肺、脾经。"]),
  ]);
  assert.ok(!result.findings.some((finding) => finding.type === "性味归经冲突"));
});

test("同课材料操作名称相似但不一致时列为低危结构问题", () => {
  const result = compareDocuments([
    doc("D1", "讲义.pdf", ["明早跟练脾胃升降操。"]),
    doc("D2", "逐字稿.txt", ["明早跟练疏肝升降操。"]),
  ]);
  const conflict = result.findings.find(
    (finding) => finding.type === "课程结构名称不一致",
  );
  assert.ok(conflict);
  assert.equal(conflict.risk, "low");
  assert.deepEqual(
    [conflict.highlightA, conflict.highlightB].sort(),
    ["脾胃升降操", "疏肝升降操"].sort(),
  );
});

test("同一份材料内同一操作的词序变化也会列为低危结构问题", () => {
  const result = compareDocuments([
    doc("D1", "讲义.pdf", ["第一段介绍脾胃升降操。", "第二段又写升降脾胃操。"]),
    doc("D2", "逐字稿.txt", ["今天只讲食材。"]),
  ]);
  const conflict = result.findings.find(
    (finding) =>
      finding.type === "课程结构名称不一致" &&
      finding.a.docName === "讲义.pdf" &&
      finding.b.docName === "讲义.pdf",
  );
  assert.ok(conflict);
  assert.equal(conflict.risk, "low");
});

test("不在固定词表里的操名也能识别结构差异", () => {
  const result = compareDocuments([
    doc("D1", "讲义.pdf", ["晨间跟练固本培元操。"]),
    doc("D2", "逐字稿.txt", ["晨间跟练固本养元操。"]),
  ]);
  const conflict = result.findings.find(
    (finding) => finding.type === "课程结构名称不一致",
  );
  assert.ok(conflict);
  assert.equal(conflict.highlightA, "固本培元操");
  assert.equal(conflict.highlightB, "固本养元操");
});

test("体验营天数不一致会归类为课程周期问题", () => {
  const result = compareDocuments([
    doc("D1", "宣传页.pdf", ["这是 6 天体验营。"]),
    doc("D2", "招募稿.txt", ["这是 5 天体验营。"]),
  ]);
  const conflict = result.findings.find((finding) => finding.type === "周期口径冲突");
  assert.ok(conflict);
  assert.equal(conflict.factA.timeType, "course_duration");
  assert.equal(conflict.factA.subject, "课程周期");
  assert.equal(conflict.risk, "high");
});

test("课件说明穴位方向但视频只说穴位时，标记方向缺失", () => {
  const result = compareDocuments([
    doc("D1", "视频逐字稿.txt", ["大家可以按摩一下五虎穴。"]),
    doc("D2", "课件.pdf", ["五虎穴从下到上依次按摩。"]),
  ]);
  const conflict = result.findings.find(
    (finding) => finding.type === "穴位操作方向未说明",
  );
  assert.ok(conflict);
  assert.equal(conflict.risk, "mid");
  const missingFact = [conflict.factA, conflict.factB].find(
    (fact) => fact.value.raw === "未说明",
  );
  assert.ok(missingFact);
  assert.equal(missingFact.requiredFieldsComplete, false);
  assert.deepEqual(missingFact.missingFields, ["direction"]);
});

test("两类材料的穴位操作方向相反时判为高危", () => {
  const result = compareDocuments([
    doc("D1", "视频逐字稿.txt", ["五虎穴从上到下依次按摩。"]),
    doc("D2", "课件.pdf", ["五虎穴从下到上依次按摩。"]),
  ]);
  const conflict = result.findings.find(
    (finding) => finding.type === "穴位操作方向冲突",
  );
  assert.ok(conflict);
  assert.equal(conflict.risk, "high");
});

test("作业答案解析与视频知识点冲突会关联题目和课程原文", () => {
  const result = compareDocuments([
    doc("D1", "视频逐字稿.txt", ["老师讲：合穴在肘膝附近，精气充盛，合入于脏腑。"]),
    doc("D2", "课后作业.pdf", ["第三题。正确答案：D。D. 合穴如涓涓细流。"]),
  ]);
  const conflict = result.findings.find(
    (finding) => finding.type === "作业答案与课程内容冲突",
  );
  assert.ok(conflict);
  assert.equal(conflict.risk, "high");
  assert.equal(conflict.anchorName, "合穴 · 作业答案");
  assert.ok(
    [conflict.factA.condition, conflict.factB.condition].includes("作业答案解析"),
  );
});
