const NEGATION_RE =
  /避免|不宜|不适合|不推荐|禁止|禁用|严禁|不能|不可|不要|不应|不得|忌用|忌服|慎用|少吃|少饮|切勿|勿/g;
const STRICT_NEGATION_RE = /禁止|禁用|严禁|不得|切勿|绝对不能|一定不能|不可/g;
const POSITIVE_RE = /推荐|建议|可以|可|宜|适合|适用|必须|需要|应当|应该|能够/g;
const ABSOLUTE_RE = /所有|全部|任何|人人|均适用|都适用|都适合|无禁忌|绝对|一定|百分之百|100%|万能/g;
const RESTRICTION_RE =
  /避免|不宜|不适合|不推荐|禁止|禁用|严禁|不能|不可|不要|不应|不得|忌用|忌服|慎用|仅限|只适用|部分|少数|特殊人群/g;

const UNIT_GROUPS = [
  { key: "g", label: "剂量", names: ["千克", "公斤", "kg", "克", "g"], scale: 1, family: "mass" },
  { key: "mg", label: "剂量", names: ["毫克", "mg"], scale: 0.001, family: "mass" },
  { key: "ml", label: "容量", names: ["毫升", "ml"], scale: 1, family: "volume" },
  { key: "l", label: "容量", names: ["升", "l"], scale: 1000, family: "volume" },
  { key: "day", label: "周期", names: ["天", "日"], scale: 1, family: "time" },
  { key: "week", label: "周期", names: ["周", "星期"], scale: 7, family: "time" },
  { key: "month", label: "周期", names: ["个月", "月"], scale: 30, family: "time" },
  { key: "year", label: "周期", names: ["年"], scale: 365, family: "time" },
  { key: "time", label: "次数", names: ["次"], scale: 1, family: "frequency" },
  { key: "minute", label: "时长", names: ["分钟", "分"], scale: 1, family: "duration" },
  { key: "hour", label: "时长", names: ["小时"], scale: 60, family: "duration" },
  { key: "percent", label: "比例", names: ["%", "％", "百分之"], scale: 1, family: "percent" },
  { key: "piece", label: "数量", names: ["片", "粒", "包", "袋", "支"], scale: 1, family: "count" },
];

const unitLookup = new Map();
const UNIT_FACTOR_OVERRIDES = new Map([
  ["千克", 1000],
  ["公斤", 1000],
  ["kg", 1000],
  ["升", 1000],
  ["l", 1000],
  ["星期", 7],
  ["个月", 30],
  ["月", 30],
  ["年", 365],
  ["小时", 60],
]);
for (const group of UNIT_GROUPS) {
  for (const name of group.names) {
    const normalizedName = name.toLowerCase();
    unitLookup.set(normalizedName, {
      group,
      factor: UNIT_FACTOR_OVERRIDES.get(normalizedName) ?? group.scale,
    });
  }
}

const NUMBER = String.raw`(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百]+)`;
const UNIT = [...unitLookup.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");
const QUANTITY_RE = new RegExp(
  `(${NUMBER})\\s*(?:[-~～—–至到]\\s*(${NUMBER}))?\\s*(${UNIT})`,
  "gi",
);
const REPEATED_UNIT_RANGE_RE = new RegExp(
  `(${NUMBER})\\s*(${UNIT})\\s*(?:[-~～—–至到])\\s*(${NUMBER})\\s*(${UNIT})`,
  "gi",
);

const OPPOSITES = [
  ["饭前", "饭后"],
  ["空腹", "餐后"],
  ["早上", "晚上"],
  ["早晨", "晚上"],
  ["冷饮", "热饮"],
  ["冷敷", "热敷"],
  ["增加", "减少"],
  ["升高", "降低"],
  ["加重", "减轻"],
  ["可用", "禁用"],
  ["安全", "有害"],
];

const INGREDIENT_ALIASES = new Map([
  ["铁棍山药", "山药"],
  ["怀山药", "山药"],
  ["广陈皮", "陈皮"],
  ["新会陈皮", "陈皮"],
  ["薏苡仁", "薏米"],
  ["赤小豆", "红豆"],
  ["大枣", "红枣"],
  ...commonIngredientAliases([
    "小米",
    "大米",
    "糯米",
    "黑米",
    "燕麦",
    "荞麦",
    "玉米",
    "薏米",
    "红豆",
    "绿豆",
    "黑豆",
    "黄豆",
    "白扁豆",
    "豌豆",
    "胡萝卜",
    "白萝卜",
    "山药",
    "茯苓",
    "芡实",
    "莲子",
    "百合",
    "枸杞",
    "红枣",
    "陈皮",
    "生姜",
    "干姜",
    "桂圆",
    "龙眼",
    "山楂",
    "麦芽",
    "神曲",
    "黄芪",
    "党参",
    "当归",
    "白术",
    "苍术",
    "甘草",
    "砂仁",
    "豆蔻",
    "白豆蔻",
    "肉桂",
    "菊花",
    "金银花",
    "蜂蜜",
    "冰糖",
    "红糖",
    "黑芝麻",
    "核桃",
    "桑葚",
    "银耳",
    "木耳",
    "香菇",
    "南瓜",
    "冬瓜",
    "菠菜",
    "芹菜",
    "莲藕",
    "番茄",
    "瘦肉",
    "鸡肉",
    "牛肉",
    "羊肉",
    "排骨",
    "猪肚",
    "鲫鱼",
    "鸡蛋",
    "牛奶",
    "豆浆",
  ]),
]);

const INGREDIENT_NAMES = [...INGREDIENT_ALIASES.keys()].sort(
  (left, right) => right.length - left.length,
);
const INGREDIENT_DOSE_FAMILIES = new Set(["mass", "volume", "count"]);

const GENERIC_ANCHOR_RE =
  /建议|推荐|本课程|课程|每日|每天|应该|应当|需要|必须|可以|能够|约为|大约|一般|通常|人群|以下|左右|的是|为|是|用|吃|服|喝/g;
const STOP_CHARS = new Set("的了和与及或在为是有可应需约一每本这那个种些其之将把被对从到按以为而但并且如则也都还更最中上下来去".split(""));

export function compareDocuments(docs) {
  const findings = [];
  const factCardsByDoc = new Map(docs.map((doc) => [doc.did, extractFactCards(doc)]));
  let candidatePairs = 0;
  let orphanSegments = 0;

  for (let i = 0; i < docs.length; i += 1) {
    for (let j = i + 1; j < docs.length; j += 1) {
      const result = comparePair(
        docs[i],
        docs[j],
        factCardsByDoc.get(docs[i].did),
        factCardsByDoc.get(docs[j].did),
      );
      findings.push(...result.findings);
      candidatePairs += result.candidatePairs;
      orphanSegments += result.orphanA + result.orphanB;
    }
  }
  for (const doc of docs) {
    const cards = factCardsByDoc.get(doc.did) || [];
    findings.push(...internalOrderConflicts(doc, cards));
    findings.push(...internalPropertyConflicts(cards));
    findings.push(...internalStructureConflicts(cards));
    findings.push(...internalDirectionConflicts(cards));
    findings.push(...internalConceptConflicts(cards));
  }

  const seen = new Set();
  const unique = [];
  for (const finding of findings) {
    const key = [finding.a.id, finding.b.id, finding.type, finding.highlightA, finding.highlightB].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }

  unique.sort((a, b) => {
    const rank = { high: 0, mid: 1, low: 2 };
    return rank[a.risk] - rank[b.risk] || a.orderA - b.orderA || a.orderB - b.orderB;
  });

  unique.forEach((finding, index) => {
    finding.id = `F${index + 1}`;
    finding.status = "pending";
  });

  const high = unique.filter((finding) => finding.risk === "high").length;
  const mid = unique.filter((finding) => finding.risk === "mid").length;
  const low = unique.filter((finding) => finding.risk === "low").length;
  const segments = docs.reduce((total, doc) => total + doc.segments.length, 0);
  const factCount = [...factCardsByDoc.values()].reduce((total, cards) => total + cards.length, 0);
  const anchors = new Set(unique.map((finding) => finding.anchorId)).size;

  return {
    findings: unique,
    stats: {
      segments,
      anchors,
      orphans: Math.max(0, Math.ceil(orphanSegments / 2)),
      candidatePairs,
      facts: factCount,
      findings: unique.length,
      high,
      mid,
      low,
    },
  };
}

function comparePair(docA, docB, factCardsA = [], factCardsB = []) {
  const pairs = candidateSegmentPairs(docA.segments, docB.segments);
  const findings = [];
  const matchedA = new Set();
  const matchedB = new Set();

  for (const { a, b, similarity } of pairs) {
    if (similarity >= 0.32) {
      matchedA.add(a.id);
      matchedB.add(b.id);
    }

    const shared = sharedFragment(a.text, b.text);
    const numeric = numericConflicts(a, b, shared, similarity);
    if (numeric.length) findings.push(...numeric);

    const opposite = oppositeConflict(a, b, shared, similarity);
    if (opposite) findings.push(opposite);

    const negation = negationConflict(a, b, shared);
    if (negation) findings.push(negation);

    const scope = scopeConflict(a, b, shared);
    if (scope) findings.push(scope);
  }

  const ingredientFindings = ingredientDoseConflicts(docA, docB, factCardsA, factCardsB);
  for (const finding of ingredientFindings) {
    const duplicateIndex = findings.findIndex(
      (item) =>
        item.a.id === finding.a.id &&
        item.b.id === finding.b.id &&
        item.type === "数值口径冲突" &&
        item.highlightA === finding.highlightA &&
        item.highlightB === finding.highlightB,
    );
    if (duplicateIndex >= 0) findings.splice(duplicateIndex, 1);
    findings.push(finding);
  }

  const timeFindings = timeFactConflicts(factCardsA, factCardsB);
  for (const finding of timeFindings) {
    const duplicateIndex = findings.findIndex(
      (item) =>
        item.a.id === finding.a.id &&
        item.b.id === finding.b.id &&
        item.type === "数值口径冲突" &&
        item.highlightA === finding.highlightA &&
        item.highlightB === finding.highlightB,
    );
    if (duplicateIndex >= 0) findings.splice(duplicateIndex, 1);
    findings.push(finding);
  }
  findings.push(...conceptFactConflicts(factCardsA, factCardsB));
  findings.push(...propertyFactConflicts(factCardsA, factCardsB));
  findings.push(...structureFactConflicts(factCardsA, factCardsB));
  findings.push(...directionFactConflicts(factCardsA, factCardsB, docA, docB));

  return {
    findings,
    candidatePairs: pairs.length,
    orphanA: docA.segments.length - matchedA.size,
    orphanB: docB.segments.length - matchedB.size,
  };
}

function ingredientDoseConflicts(docA, docB, factCardsA = [], factCardsB = []) {
  const factsA = extractIngredientDoseFacts(docA);
  const factsB = extractIngredientDoseFacts(docB);
  const output = [];

  for (const [ingredient, facts] of factsA) {
    const otherFacts = factsB.get(ingredient);
    if (!otherFacts?.length) continue;

    const byFamilyA = groupFactsByFamily(facts);
    const byFamilyB = groupFactsByFamily(otherFacts);
    for (const [family, leftFacts] of byFamilyA) {
      const rightFacts = byFamilyB.get(family);
      if (!rightFacts?.length) continue;

      let best = null;
      for (const left of leftFacts) {
        for (const right of rightFacts) {
          const type = compareDoseRanges(left.quantity, right.quantity);
          if (!type) continue;
          const score = (type === "disjoint" ? 2 : 1) + Math.abs(left.quantity.start - right.quantity.start) / 1000;
          if (!best || score > best.score) best = { left, right, type, score };
        }
      }
      if (!best) continue;

      const { left, right, type } = best;
      const anchorName = `${ingredient} · 食材剂量`;
      const disjoint = type === "disjoint";
      const cardA = findDoseCard(factCardsA, left);
      const cardB = findDoseCard(factCardsB, right);
      output.push({
        anchorId: anchorId(anchorName),
        anchorName,
        type: "食材剂量冲突",
        risk: disjoint ? "high" : "mid",
        orderA: left.segment.order,
        orderB: right.segment.order,
        a: publicSide(left.segment),
        b: publicSide(right.segment),
        highlightA: left.quantity.raw,
        highlightB: right.quantity.raw,
        factA: cardA ? factForFinding(cardA) : undefined,
        factB: cardB ? factForFinding(cardB) : undefined,
        detail: disjoint
          ? `物料 A 的「${ingredient}」标注为「${left.quantity.raw}」，物料 B 标注为「${right.quantity.raw}」，两个剂量范围没有交集。`
          : `物料 A 的「${ingredient}」标注为「${left.quantity.raw}」，物料 B 标注为「${right.quantity.raw}」，剂量范围不一致。`,
        suggestion: `核对「${ingredient}」的标准用量，确认是单一推荐值还是有效范围，再同步两份物料。`,
      });
    }
  }
  return output;
}

function findDoseCard(cards, fact) {
  return cards.find(
    (card) =>
      card.category === "dose" &&
      card.subject === fact.ingredient &&
      card.source.segmentId === fact.segment.id &&
      card.value.raw === fact.quantity.raw,
  );
}

export function extractIngredientDoseFacts(doc) {
  const facts = new Map();
  const segments = doc.segments || [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    for (const quantity of extractQuantities(segment.text)) {
      if (!INGREDIENT_DOSE_FAMILIES.has(quantity.group.family)) continue;
      const ingredient = findIngredientNearQuantity(segments, index, quantity);
      if (!ingredient) continue;
      const bucket = facts.get(ingredient) || [];
      bucket.push({ ingredient, segment, quantity });
      facts.set(ingredient, bucket);
    }
  }
  return facts;
}

const TIME_TYPE_LABELS = {
  cooking_total: "总烹饪时长",
  cooking_after_add: "后下时长",
  practice_duration: "单次练习时长",
  course_duration: "课程周期",
  usage_duration: "食用/调理周期",
};
const PROPERTY_PATTERNS = [
  {
    attribute: "四气",
    regex: /性(?:味)?\s*(微寒|微温|大热|大寒|寒|热|温|凉|平)/g,
  },
  {
    attribute: "五味",
    regex: /味\s*([甘苦辛酸咸淡涩](?:\s*[、，,和及]\s*[甘苦辛酸咸淡涩])*)/g,
  },
  {
    attribute: "归经",
    regex: /归\s*((?:心|肝|脾|肺|肾|胃|胆|大肠|小肠|膀胱|三焦|心包|经)[、，,和及与\s]*)+经?/g,
  },
];
const KNOWN_OPERATIONS =
  /脾胃升降操|升降脾胃操|疏肝升降操|健脾操|养胃操|揉腹操|拍打操|呼吸操|八段锦|五禽戏|太极拳/g;
const ACUPOINT_NAMES = [
  "五虎穴",
  "三眼穴",
  "三间穴",
  "阳溪穴",
  "合谷穴",
  "内关穴",
  "外关穴",
  "太冲穴",
  "涌泉穴",
  "中脘穴",
  "关元穴",
  "气海穴",
  "神阙穴",
  "天枢穴",
  "足三里",
  "委中穴",
  "尺泽穴",
  "曲池穴",
  "血海穴",
  "梁丘穴",
  "阴陵泉",
  "阳陵泉",
  "丰隆穴",
  "复溜穴",
  "太溪穴",
  "昆仑穴",
  "百会穴",
  "风池穴",
  "迎香穴",
  "四白穴",
  "太阳穴",
].sort((left, right) => right.length - left.length);
const DIRECTION_RE =
  /从上到下|从下到上|由上至下|由下至上|先左后右|先右后左|顺时针|逆时针|向外|向内/g;
const QUIZ_CONTEXT_RE = /第\s*[一二三四五六七八九十\d]+\s*[题问]|正确答案|答案\s*[：:]|[A-DＡ-Ｄ][.．、]/;
const CORE_ORGAN_RE = /(脾胃|脾|胃|肾|肝|心|肺)\s*(?:为|是|属于)?\s*(先天之本|后天之本)/g;
const POPULATION_RE =
  /糖尿病|控糖|血糖高|减肥|湿气重|脾虚|阴虚|阳虚|孕妇|孕期|儿童|小孩|老人|老年|经期|哺乳期/g;

export function extractFactCards(doc) {
  const cards = [];
  const segments = doc.segments || [];
  let counter = 0;

  const add = (card) => {
    counter += 1;
    const fact = {
      factId: `FC-${doc.did}-${counter}`,
      category: card.category,
      subject: card.subject || "",
      attribute: card.attribute || "",
      relation: card.relation || "",
      value: card.value || { raw: "" },
      unit: card.unit || "",
      timeType: card.timeType || "not_applicable",
      timeTypeLabel: TIME_TYPE_LABELS[card.timeType] || "不适用",
      population: card.population || "未限定",
      condition: card.condition || "未说明",
      sequence: card.sequence || "未说明",
      polarity: card.polarity || "neutral",
      evidence: card.evidence || "",
      source: {
        docId: doc.did,
        docName: doc.name,
        srcType: doc.srcType,
        locator: card.segment.locator,
        segmentId: card.segment.id,
        text: card.segment.text,
      },
      segment: card.segment,
    };
    const missingFields = validateFactCard(fact);
    fact.requiredFieldsComplete = missingFields.length === 0;
    fact.missingFields = missingFields;
    if (fact.requiredFieldsComplete) cards.push(fact);
  };

  for (const [ingredient, doseFacts] of extractIngredientDoseFacts(doc)) {
    for (const fact of doseFacts) {
      add({
        category: "dose",
        subject: ingredient,
        attribute: "食材剂量",
        relation: "建议用量",
        value: {
          raw: fact.quantity.raw,
          start: fact.quantity.start,
          end: fact.quantity.end,
        },
        unit: fact.quantity.unitRaw,
        population: detectPopulation(fact.segment.text),
        evidence: fact.quantity.raw,
        segment: fact.segment,
      });
    }
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    for (const quantity of extractQuantities(segment.text)) {
      if (!["time", "duration"].includes(quantity.group.family)) continue;
      const timeType = classifyTimeType(segment.text, quantity);
      if (!timeType) continue;
      add({
        category: "time",
        subject: findTimeSubject(segments, index, quantity, timeType),
        attribute: TIME_TYPE_LABELS[timeType],
        relation: "时间要求",
        value: {
          raw: quantity.raw,
          start: quantity.start,
          end: quantity.end,
        },
        unit: quantity.unitRaw,
        timeType,
        population: detectPopulation(segment.text),
        evidence: quantity.raw,
        segment,
      });
    }

    for (const match of segment.text.matchAll(CORE_ORGAN_RE)) {
      const organ = canonicalOrgan(match[1]);
      const relation = match[2];
      if (!organ || !relation) continue;
      add({
        category: "concept",
        subject: organ,
        attribute: "脏腑属性",
        relation,
        value: { raw: relation },
        evidence: match[0],
        polarity: "positive",
        segment,
      });
    }

    for (const pattern of PROPERTY_PATTERNS) {
      for (const match of segment.text.matchAll(pattern.regex)) {
        const ingredient = closestIngredientAt(segment.text, match.index);
        if (!ingredient) continue;
        const rawValue = normalizePropertyValue(pattern.attribute, match[1] || match[0]);
        add({
          category: "property",
          subject: ingredient,
          attribute: pattern.attribute,
          relation: "性味归经属性",
          value: { raw: rawValue },
          evidence: match[0],
          segment,
        });
      }
    }

    const operationNames = extractOperationNames(segment.text);
    for (const operation of operationNames) {
      add({
        category: "structure",
        subject: operation,
        attribute: "课程结构项",
        relation: "操作名称",
        value: { raw: operation },
        evidence: operation,
        segment,
      });
    }

    const countPattern =
      /([一二两三四五六七八九十\d]+)\s*(?:大)?\s*(法宝|阶段|步骤|动作|穴位)/g;
    for (const match of segment.text.matchAll(countPattern)) {
      const prefix = segment.text.slice(Math.max(0, match.index - 1), match.index);
      if (prefix === "第") continue;
      const count = parseNumber(match[1]);
      if (!Number.isFinite(count)) continue;
      add({
        category: "structure",
        subject: "课程结构",
        attribute: `${match[2]}数量`,
        relation: "结构数量",
        value: { raw: match[0], count },
        evidence: match[0],
        segment,
      });
    }

    for (const match of segment.text.matchAll(DIRECTION_RE)) {
      const acupoint = closestAcupointAt(segment.text, match.index);
      if (!acupoint) continue;
      add({
        category: "direction",
        subject: acupoint,
        attribute: "穴位操作方向",
        relation: "操作方向",
        value: { raw: match[0] },
        sequence: match[0],
        evidence: match[0],
        segment,
      });
    }

    if (/合穴/.test(segment.text)) {
      if (/精气充盛|合入于脏腑/.test(segment.text)) {
        add({
          category: "concept",
          subject: "合穴",
          attribute: "经气特点",
          relation: "精气充盛，合入于脏腑",
          value: { raw: "精气充盛，合入于脏腑" },
          condition: QUIZ_CONTEXT_RE.test(segment.text) ? "作业答案解析" : "课程讲解",
          evidence: segment.text.match(/精气充盛|合入于脏腑/)?.[0] || "合穴",
          polarity: "positive",
          segment,
        });
      }
      if (/涓涓细流/.test(segment.text) && QUIZ_CONTEXT_RE.test(segment.text)) {
        add({
          category: "concept",
          subject: "合穴",
          attribute: "经气特点",
          relation: "如涓涓细流",
          value: { raw: "如涓涓细流" },
          condition: "作业答案解析",
          evidence: "如涓涓细流",
          polarity: "positive",
          segment,
        });
      }
    }

    if (/后下|后放|最后放/.test(segment.text)) {
      const ingredient = closestIngredient(segment.text, null, true)?.canonical;
      if (ingredient) {
        const phrase = segment.text.match(/后下|后放|最后放/)?.[0] || "";
        add({
          category: "order",
          subject: ingredient,
          attribute: "下锅顺序",
          relation: "后放",
          value: { raw: phrase },
          sequence: "后下",
          evidence: phrase,
          segment,
        });
      }
    }

    if (/(?:所有|全部)食材[^。！？]{0,16}(?:一同|一起)(?:煮|炖|熬|煲)|(?:一同|一起)煮/.test(segment.text)) {
      const phrase = segment.text.match(/(?:一同|一起)煮/)?.[0] || "一同煮";
      add({
        category: "order",
        subject: "全部食材",
        attribute: "下锅顺序",
        relation: "同煮",
        value: { raw: phrase },
        sequence: "同煮",
        evidence: phrase,
        segment,
      });
    }
  }

  return cards;
}

function validateFactCard(fact) {
  const missing = [];
  for (const field of ["subject", "attribute", "relation", "evidence"]) {
    if (!String(fact[field] || "").trim()) missing.push(field);
  }
  if (!fact.source?.docName || !fact.source?.locator || !fact.source?.segmentId) {
    missing.push("source");
  }
  if (fact.category === "dose" || fact.category === "time") {
    if (!fact.value?.raw || !fact.unit) missing.push("value");
    if (!Number.isFinite(fact.value?.start) || !Number.isFinite(fact.value?.end)) {
      missing.push("numericRange");
    }
  }
  if (fact.category === "time" && !fact.timeType) missing.push("timeType");
  if (fact.category === "order" && !fact.sequence) missing.push("sequence");
  return [...new Set(missing)];
}

function detectPopulation(text) {
  const populations = [...new Set([...String(text || "").matchAll(POPULATION_RE)].map((match) => match[0]))];
  return populations.length ? populations.join("、") : "未限定";
}

function canonicalOrgan(value) {
  return {
    脾胃: "脾",
    脾: "脾",
    胃: "胃",
    肾: "肾",
    肝: "肝",
    心: "心",
    肺: "肺",
  }[value] || "";
}

function classifyTimeType(text, quantity) {
  if (quantity.group.family === "time") {
    if (/健康营|体验营|训练营|营期|课程/.test(text)) return "course_duration";
    if (/连续|坚持|吃|喝|服用|调理|疗程/.test(text)) return "usage_duration";
    return "";
  }
  if (/后下|后放|最后放/.test(text) && /煮|炖|熬|煎|煲/.test(text)) {
    return "cooking_after_add";
  }
  if (/煮|炖|蒸|煎|熬|焖|煲|成粥/.test(text)) return "cooking_total";
  if (/按|揉|搓|推|刮|练|操|运动|操作/.test(text)) return "practice_duration";
  return "";
}

function findTimeSubject(segments, index, quantity, timeType) {
  const segment = segments[index];
  if (timeType === "cooking_after_add" || timeType === "cooking_total") {
    const ingredient = findIngredientNearQuantity(segments, index, quantity);
    if (timeType === "cooking_after_add") return ingredient || "后下食材";
    return "烹饪流程";
  }
  if (timeType === "practice_duration") {
    if (/脾胃升降操/.test(segment.text)) return "脾胃升降操";
    if (/三眼穴/.test(segment.text)) return "三眼穴操作";
    if (/脾胃线|一线/.test(segment.text)) return "脾胃线操作";
    return "穴位/操作练习";
  }
  if (timeType === "course_duration") return "课程周期";
  if (timeType === "usage_duration") {
    if (/五色健脾粥/.test(segment.text)) return "五色健脾粥";
    return "食疗/调理方案";
  }
  return "";
}

function timeFactConflicts(factsA, factsB) {
  const output = [];
  const groupsA = groupFactCards(factsA, "time");
  const groupsB = groupFactCards(factsB, "time");
  for (const [key, leftFacts] of groupsA) {
    const rightFacts = groupsB.get(key);
    if (!rightFacts?.length) continue;
    const best = bestCardRange(leftFacts, rightFacts, compareDoseRanges);
    if (!best) continue;
    const { left, right, type } = best;
    const disjoint = type === "disjoint";
    const anchorName = `${left.subject} · ${left.timeTypeLabel}`;
    const findingType =
      left.timeType.startsWith("cooking") || left.timeType === "practice_duration"
        ? "操作时间冲突"
        : "周期口径冲突";
    output.push({
      anchorId: anchorId(anchorName),
      anchorName,
      type: findingType,
      risk: disjoint ? "high" : "mid",
      orderA: left.segment.order,
      orderB: right.segment.order,
      a: publicSide(left.segment),
      b: publicSide(right.segment),
      highlightA: left.value.raw,
      highlightB: right.value.raw,
      factA: factForFinding(left),
      factB: factForFinding(right),
      detail: `${left.timeTypeLabel}不一致：物料 A 为「${left.value.raw}」，物料 B 为「${right.value.raw}」。`,
      suggestion: `先确认该场景是课程周期、食用周期还是单次操作时长，再统一「${left.subject}」的时间口径。`,
    });
  }
  return output;
}

function conceptFactConflicts(factsA, factsB) {
  const groupsA = groupFactCards(factsA, "concept");
  const groupsB = groupFactCards(factsB, "concept");
  const output = [];
  for (const [subject, leftFacts] of groupsA) {
    const rightFacts = groupsB.get(subject);
    if (!rightFacts?.length) continue;
    const left = leftFacts.find((fact) =>
      rightFacts.some((other) => other.relation !== fact.relation),
    );
    if (!left) continue;
    const right = rightFacts.find((fact) => fact.relation !== left.relation);
    const isQuizConflict =
      left.condition === "作业答案解析" || right.condition === "作业答案解析";
    const quizFact = left.condition === "作业答案解析" ? left : right;
    const lessonFact = quizFact === left ? right : left;
    const anchorName = conceptFindingAnchor(left, right, isQuizConflict);
    output.push({
      anchorId: anchorId(anchorName),
      anchorName,
      type: isQuizConflict ? "作业答案与课程内容冲突" : "中医概念冲突",
      risk: "high",
      orderA: left.segment.order,
      orderB: right.segment.order,
      a: publicSide(left.segment),
      b: publicSide(right.segment),
      highlightA: left.relation,
      highlightB: right.relation,
      factA: factForFinding(left),
      factB: factForFinding(right),
      detail: isQuizConflict
        ? `作业答案解析写「${quizFact.relation}」，视频课程原文写「${lessonFact.relation}」，两者对「${subject}」的知识点描述不一致。`
        : `同一对象被写成不同属性：物料 A 将「${subject}」写作「${left.relation}」，物料 B 写作「${right.relation}」。`,
      suggestion: isQuizConflict
        ? "逐项核对题目、选项、答案和解析与视频讲课是否一致；确认后重新发布作业。"
        : "核对中医基础概念与课程统一口径，逐处修正，并通过最终讲稿统一。",
    });
  }
  return output;
}

function internalConceptConflicts(facts) {
  const groups = groupFactCards(facts, "concept");
  const output = [];
  for (const groupFacts of groups.values()) {
    const left = groupFacts.find((fact) =>
      groupFacts.some((other) => other !== fact && other.relation !== fact.relation),
    );
    if (!left) continue;
    const right = groupFacts.find(
      (fact) => fact !== left && fact.relation !== left.relation,
    );
    const isQuizConflict =
      left.condition === "作业答案解析" || right.condition === "作业答案解析";
    const anchorName = conceptFindingAnchor(left, right, isQuizConflict);
    output.push({
      anchorId: anchorId(anchorName),
      anchorName,
      type: isQuizConflict ? "作业答案与课程内容冲突" : "中医概念冲突",
      risk: "high",
      orderA: left.segment.order,
      orderB: right.segment.order,
      a: publicSide(left.segment),
      b: publicSide(right.segment),
      highlightA: left.relation,
      highlightB: right.relation,
      factA: factForFinding(left),
      factB: factForFinding(right),
      detail: isQuizConflict
        ? "同一份作业里的知识陈述与答案解析互相矛盾。"
        : `同一份材料把「${left.subject}」写成「${left.relation}」和「${right.relation}」两种属性。`,
      suggestion: isQuizConflict
        ? "重新核对题目、选项、答案和解析，确认后更新作业版本。"
        : "核对同一材料的核心概念表述，统一后再发布。",
    });
  }
  return output;
}

function conceptFindingAnchor(left, right, isQuizConflict) {
  if (isQuizConflict) return `${left.subject} · 作业答案`;
  const relations = [left.relation, right.relation];
  if (relations.includes("先天之本") && relations.includes("后天之本")) {
    return `${left.subject} · 先天/后天`;
  }
  return `${left.subject} · ${left.attribute}`;
}

function directionFactConflicts(factsA, factsB, docA, docB) {
  const directionsA = groupFactCards(factsA, "direction");
  const directionsB = groupFactCards(factsB, "direction");
  const mentionsA = acupointMentions(docA);
  const mentionsB = acupointMentions(docB);
  const subjects = new Set([
    ...directionsA.keys(),
    ...directionsB.keys(),
    ...mentionsA.keys(),
    ...mentionsB.keys(),
  ]);
  const output = [];

  for (const subject of subjects) {
    const leftFacts = directionsA.get(subject) || [];
    const rightFacts = directionsB.get(subject) || [];
    if (leftFacts.length && rightFacts.length) {
      const left = leftFacts.find((fact) =>
        rightFacts.some((other) => other.value.raw !== fact.value.raw),
      );
      if (!left) continue;
      const right = rightFacts.find((fact) => fact.value.raw !== left.value.raw);
      const anchorName = `${subject} · 操作方向`;
      output.push({
        anchorId: anchorId(anchorName),
        anchorName,
        type: "穴位操作方向冲突",
        risk: "high",
        orderA: left.segment.order,
        orderB: right.segment.order,
        a: publicSide(left.segment),
        b: publicSide(right.segment),
        highlightA: left.value.raw,
        highlightB: right.value.raw,
        factA: factForFinding(left),
        factB: factForFinding(right),
        detail: `「${subject}」的操作方向不一致：物料 A 为「${left.value.raw}」，物料 B 为「${right.value.raw}」。`,
        suggestion: "回到带教视频逐帧确认实际手法方向；无法确认时暂停发布自动演示，改为真人带练。",
      });
      continue;
    }

    if (leftFacts.length && mentionsB.has(subject)) {
      const missing = missingDirectionFact(docB, subject, mentionsB.get(subject));
      output.push(directionMissingFinding(leftFacts[0], missing));
    } else if (rightFacts.length && mentionsA.has(subject)) {
      const missing = missingDirectionFact(docA, subject, mentionsA.get(subject));
      output.push(directionMissingFinding(missing, rightFacts[0]));
    }
  }
  return output;
}

function internalDirectionConflicts(facts) {
  const groups = groupFactCards(facts, "direction");
  const output = [];
  for (const groupFacts of groups.values()) {
    const left = groupFacts.find((fact) =>
      groupFacts.some((other) => other !== fact && other.value.raw !== fact.value.raw),
    );
    if (!left) continue;
    const right = groupFacts.find(
      (fact) => fact !== left && fact.value.raw !== left.value.raw,
    );
    const anchorName = `${left.subject} · 操作方向`;
    output.push({
      anchorId: anchorId(anchorName),
      anchorName,
      type: "穴位操作方向冲突",
      risk: "high",
      orderA: left.segment.order,
      orderB: right.segment.order,
      a: publicSide(left.segment),
      b: publicSide(right.segment),
      highlightA: left.value.raw,
      highlightB: right.value.raw,
      factA: factForFinding(left),
      factB: factForFinding(right),
      detail: `同一份材料对「${left.subject}」给出了相反方向。`,
      suggestion: "统一实际操作方向，并补充图示或视频画面，避免只写文字。",
    });
  }
  return output;
}

function acupointMentions(doc) {
  const mentions = new Map();
  for (const segment of doc.segments || []) {
    for (const name of ACUPOINT_NAMES) {
      if (segment.text.includes(name) && !mentions.has(name)) mentions.set(name, segment);
    }
  }
  return mentions;
}

function missingDirectionFact(doc, subject, segment) {
  return {
    factId: `MISSING-DIRECTION-${doc.did}-${segment.id}`,
    category: "direction",
    subject,
    attribute: "穴位操作方向",
    relation: "未说明",
    value: { raw: "未说明" },
    unit: "",
    timeType: "not_applicable",
    timeTypeLabel: "不适用",
    population: "未限定",
    condition: "未说明",
    sequence: "未说明",
    polarity: "neutral",
    evidence: subject,
    source: {
      docId: doc.did,
      docName: doc.name,
      srcType: doc.srcType,
      locator: segment.locator,
      segmentId: segment.id,
      text: segment.text,
    },
    segment,
    requiredFieldsComplete: false,
    missingFields: ["direction"],
  };
}

function directionMissingFinding(left, right) {
  const missingIsA = left.value.raw === "未说明";
  const anchorName = `${left.subject} · 操作方向`;
  const completeValue = missingIsA ? right.value.raw : left.value.raw;
  return {
    anchorId: anchorId(anchorName),
    anchorName,
    type: "穴位操作方向未说明",
    risk: "mid",
    orderA: left.segment.order,
    orderB: right.segment.order,
    a: publicSide(left.segment),
    b: publicSide(right.segment),
    highlightA: left.value.raw,
    highlightB: right.value.raw,
    factA: factForFinding(left),
    factB: factForFinding(right),
    detail: `「${left.subject}」在一份材料中明确了「${completeValue}」，另一份材料只提到穴位名称，没有说明操作方向。`,
    suggestion: "把方向写进课件文字并配箭头/起止点图；若视频也未说明，补拍演示后再发布。",
  };
}

function propertyFactConflicts(factsA, factsB) {
  const groupsA = groupFactCards(factsA, "property");
  const groupsB = groupFactCards(factsB, "property");
  const output = [];
  for (const [key, leftFacts] of groupsA) {
    const rightFacts = groupsB.get(key);
    if (!rightFacts?.length) continue;
    const left = leftFacts.find((fact) =>
      rightFacts.some((other) => other.value.raw !== fact.value.raw),
    );
    if (!left) continue;
    const right = rightFacts.find((fact) => fact.value.raw !== left.value.raw);
    output.push(propertyConflictFinding(left, right));
  }
  return output;
}

function internalPropertyConflicts(facts) {
  const groups = groupFactCards(facts, "property");
  const output = [];
  for (const groupFacts of groups.values()) {
    const left = groupFacts.find((fact) =>
      groupFacts.some((other) => other !== fact && other.value.raw !== fact.value.raw),
    );
    if (!left) continue;
    const right = groupFacts.find(
      (fact) => fact !== left && fact.value.raw !== left.value.raw,
    );
    output.push(propertyConflictFinding(left, right));
  }
  return output;
}

function propertyConflictFinding(left, right) {
  const anchorName = `${left.subject} · ${left.attribute}`;
  return {
    anchorId: anchorId(anchorName),
    anchorName,
    type: "性味归经冲突",
    risk: left.attribute === "四气" ? "high" : "mid",
    orderA: left.segment.order,
    orderB: right.segment.order,
    a: publicSide(left.segment),
    b: publicSide(right.segment),
    highlightA: left.value.raw,
    highlightB: right.value.raw,
    factA: factForFinding(left),
    factB: factForFinding(right),
    detail: `「${left.subject}」的${left.attribute}不一致：物料 A 为「${left.value.raw}」，物料 B 为「${right.value.raw}」。`,
    suggestion: `统一「${left.subject}」的性味归经口径，并确认引用的是同一版中药学/食材资料。`,
  };
}

function structureFactConflicts(factsA, factsB) {
  const output = [];
  const namesA = uniqueStructureNames(factsA);
  const namesB = uniqueStructureNames(factsB);
  const seenPairs = new Set();

  for (const left of namesA) {
    for (const right of namesB) {
      if (left.subject === right.subject) continue;
      const pairKey = [left.subject, right.subject].sort().join("|");
      if (seenPairs.has(pairKey)) continue;
      const similarity = operationSimilarity(left.subject, right.subject);
      if (similarity < 0.48) continue;
      seenPairs.add(pairKey);
      output.push(structureNameFinding(left, right));
    }
  }

  const countsA = groupFactCards(factsA, "structure").get("课程结构") || [];
  const countsB = groupFactCards(factsB, "structure").get("课程结构") || [];
  for (const left of countsA) {
    const right = countsB.find(
      (fact) => fact.attribute === left.attribute && fact.value.count !== left.value.count,
    );
    if (right) output.push(structureCountFinding(left, right));
  }
  return output;
}

function internalStructureConflicts(facts) {
  const names = uniqueStructureNames(facts);
  const output = [];
  for (let leftIndex = 0; leftIndex < names.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < names.length; rightIndex += 1) {
      const left = names[leftIndex];
      const right = names[rightIndex];
      if (operationSimilarity(left.subject, right.subject) >= 0.48) {
        output.push(structureNameFinding(left, right));
      }
    }
  }

  const countGroups = new Map();
  for (const fact of facts.filter(
    (item) => item.category === "structure" && item.subject === "课程结构",
  )) {
    const bucket = countGroups.get(fact.attribute) || [];
    if (!bucket.some((item) => item.value.count === fact.value.count)) bucket.push(fact);
    countGroups.set(fact.attribute, bucket);
  }
  for (const group of countGroups.values()) {
    if (group.length > 1) output.push(structureCountFinding(group[0], group[1]));
  }
  return output;
}

function uniqueStructureNames(facts) {
  const names = new Map();
  for (const fact of facts.filter(
    (item) => item.category === "structure" && item.attribute === "课程结构项",
  )) {
    if (!names.has(fact.subject)) names.set(fact.subject, fact);
  }
  return [...names.values()];
}

function structureNameFinding(left, right) {
  const anchorName = "课程结构 · 操作名称";
  return {
    anchorId: anchorId(anchorName),
    anchorName,
    type: "课程结构名称不一致",
    risk: "low",
    orderA: left.segment.order,
    orderB: right.segment.order,
    a: publicSide(left.segment),
    b: publicSide(right.segment),
    highlightA: left.subject,
    highlightB: right.subject,
    factA: factForFinding(left),
    factB: factForFinding(right),
    detail: `同一节课的材料出现不同操作名称：「${left.subject}」与「${right.subject}」。若它们是同一动作，请统一命名；若是不同动作，请补充区分。`,
    suggestion: "核对课程大纲和最终讲稿，统一操作名、功法名和章节内结构名称。",
  };
}

function structureCountFinding(left, right) {
  const anchorName = `课程结构 · ${left.attribute}`;
  return {
    anchorId: anchorId(anchorName),
    anchorName,
    type: "课程结构数量不一致",
    risk: "low",
    orderA: left.segment.order,
    orderB: right.segment.order,
    a: publicSide(left.segment),
    b: publicSide(right.segment),
    highlightA: left.value.raw,
    highlightB: right.value.raw,
    factA: factForFinding(left),
    factB: factForFinding(right),
    detail: `${left.attribute}不一致：物料 A 为「${left.value.raw}」，物料 B 为「${right.value.raw}」。`,
    suggestion: "核对课程大纲，确认该数量是总数、分类数还是其中一部分。",
  };
}

function operationSimilarity(left, right) {
  const leftChars = new Set([...left.replace(/操$/, "")]);
  const rightChars = new Set([...right.replace(/操$/, "")]);
  const union = new Set([...leftChars, ...rightChars]);
  const overlap = [...leftChars].filter((char) => rightChars.has(char)).length;
  const charScore = union.size ? overlap / union.size : 0;
  const bigramScore = dice(bigrams(left), bigrams(right));
  const actionTokens = ["升降", "健脾", "养胃", "揉腹", "拍打", "呼吸", "疏肝"];
  const sharedAction = actionTokens.some(
    (token) => left.includes(token) && right.includes(token),
  );
  return Math.max(charScore, bigramScore, sharedAction ? 0.62 : 0);
}

function internalOrderConflicts(doc, factCards) {
  const orderFacts = factCards.filter((fact) => fact.category === "order");
  const generic = orderFacts.find(
    (fact) => fact.subject === "全部食材" && fact.sequence === "同煮",
  );
  if (!generic) return [];

  const specific = orderFacts.find(
    (fact) => fact.subject !== "全部食材" && fact.sequence === "后下",
  );
  if (!specific) return [];
  const anchorName = `${specific.subject} · 下锅顺序`;
  return [
    {
      anchorId: anchorId(anchorName),
      anchorName,
      type: "操作顺序冲突",
      risk: "high",
      orderA: generic.segment.order,
      orderB: specific.segment.order,
      a: publicSide(generic.segment),
      b: publicSide(specific.segment),
      highlightA: generic.value.raw,
      highlightB: specific.value.raw,
      factA: factForFinding(generic),
      factB: factForFinding(specific),
      detail: `同一份材料既写「全部食材一同煮」，又写「${specific.subject}后下」，下锅顺序不一致。`,
      suggestion: `把总流程明确改为“除${specific.subject}外一同煮，${specific.subject}最后下”，并同步所有材料。`,
    },
  ];
}

function groupFactCards(facts, category) {
  const output = new Map();
  for (const fact of facts) {
    if (fact.category !== category) continue;
    const key =
      category === "time"
        ? `${fact.timeType}|${fact.subject}|${fact.population}`
        : category === "property"
          ? `${fact.subject}|${fact.attribute}|${fact.population}`
          : fact.subject;
    const bucket = output.get(key) || [];
    bucket.push(fact);
    output.set(key, bucket);
  }
  return output;
}

function bestCardRange(leftFacts, rightFacts, compareRanges) {
  let best = null;
  for (const left of leftFacts) {
    for (const right of rightFacts) {
      const type = compareRanges(left.value, right.value);
      if (!type) continue;
      const score =
        (type === "disjoint" ? 2 : 1) +
        Math.abs(left.value.start - right.value.start) / 100;
      if (!best || score > best.score) best = { left, right, type, score };
    }
  }
  return best;
}

function factForFinding(fact) {
  return {
    factId: fact.factId,
    category: fact.category,
    subject: fact.subject,
    attribute: fact.attribute,
    relation: fact.relation,
    value: fact.value,
    unit: fact.unit,
    timeType: fact.timeType,
    timeTypeLabel: fact.timeTypeLabel,
    population: fact.population,
    condition: fact.condition,
    sequence: fact.sequence,
    polarity: fact.polarity,
    evidence: fact.evidence,
    source: fact.source,
    requiredFieldsComplete: fact.requiredFieldsComplete,
    missingFields: fact.missingFields,
  };
}

function findIngredientNearQuantity(segments, index, quantity) {
  const current = segments[index];
  if (current.text.slice(0, quantity.index).trim() === "" && index > 0) {
    const previousMatch = closestIngredient(segments[index - 1].text, null, true);
    if (previousMatch) return previousMatch.canonical;
  }

  const currentMatch = closestIngredient(current.text, quantity);
  if (currentMatch && currentMatch.distance <= 32) return currentMatch.canonical;

  for (let offset = 1; offset <= 2; offset += 1) {
    const previous = segments[index - offset];
    if (!previous) break;
    const match = closestIngredient(previous.text, null, true);
    if (match) return match.canonical;
  }

  return "";
}

function closestIngredient(text, quantity, preferLast = false) {
  let best = null;
  for (const alias of INGREDIENT_NAMES) {
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(alias, from);
      if (index < 0) break;
      const end = index + alias.length;
      let distance = 0;
      if (quantity) {
        const quantityStart = quantity.index;
        const quantityEnd = quantity.index + quantity.raw.length;
        if (end <= quantityStart) distance = quantityStart - end;
        else if (index >= quantityEnd) distance = index - quantityEnd;
        else distance = 0;
      } else if (preferLast) {
        distance = -end;
      }
      const candidate = {
        canonical: INGREDIENT_ALIASES.get(alias),
        distance,
        aliasLength: alias.length,
      };
      if (
        !best ||
        candidate.distance < best.distance ||
        (candidate.distance === best.distance && candidate.aliasLength > best.aliasLength)
      ) {
        best = candidate;
      }
      from = end;
    }
  }
  return best;
}

function closestIngredientAt(text, targetIndex) {
  let best = null;
  for (const alias of INGREDIENT_NAMES) {
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(alias, from);
      if (index < 0) break;
      const end = index + alias.length;
      const distance =
        end <= targetIndex
          ? targetIndex - end
          : index >= targetIndex
            ? index - targetIndex
            : 0;
      const candidate = { canonical: INGREDIENT_ALIASES.get(alias), distance, aliasLength: alias.length };
      if (
        !best ||
        candidate.distance < best.distance ||
        (candidate.distance === best.distance && candidate.aliasLength > best.aliasLength)
      ) {
        best = candidate;
      }
      from = end;
    }
  }
  return best?.canonical || "";
}

function closestAcupointAt(text, targetIndex) {
  let best = null;
  for (const name of ACUPOINT_NAMES) {
    const index = text.indexOf(name);
    if (index < 0) continue;
    const distance =
      index + name.length <= targetIndex
        ? targetIndex - (index + name.length)
        : index >= targetIndex
          ? index - targetIndex
          : 0;
    if (!best || distance < best.distance || (distance === best.distance && name.length > best.name.length)) {
      best = { name, distance };
    }
  }
  return best?.name || "";
}

function normalizePropertyValue(attribute, value) {
  const normalized = String(value || "")
    .replace(/\s+/g, "")
    .replace(/^归/, "")
    .replace(/经$/, "")
    .replace(/[，,和及与]/g, "、");
  if (attribute === "四气") return normalized;
  if (attribute === "五味") {
    return [...new Set([...normalized.matchAll(/[甘苦辛酸咸淡涩]/g)].map((match) => match[0]))]
      .sort()
      .join("、");
  }
  const meridians =
    normalized.match(/心包|三焦|大肠|小肠|膀胱|心|肝|脾|肺|肾|胃|胆/g) || [];
  return [...new Set(meridians)].sort().join("、") || normalized;
}

function extractOperationNames(text) {
  const names = new Set([...text.matchAll(KNOWN_OPERATIONS)].map((match) => match[0]));
  for (const match of text.matchAll(/[\p{Script=Han}]{2,12}操(?!作|练|场|控|心|办)/gu)) {
    let candidate = match[0];
    const fillers = [
      "再有一个",
      "还有一个",
      "有一个",
      "跟练",
      "练习",
      "学习",
      "学会",
      "一套",
      "这个",
      "那个",
      "早课",
      "晨间",
      "先做",
      "做完",
      "一个",
      "做",
      "练",
      "跟",
      "的",
    ];
    let lastIndex = -1;
    let lastLength = 0;
    for (const filler of fillers) {
      const index = candidate.lastIndexOf(filler);
      if (index >= 0 && index + filler.length > lastIndex + lastLength) {
        lastIndex = index;
        lastLength = filler.length;
      }
    }
    if (lastIndex >= 0) candidate = candidate.slice(lastIndex + lastLength);
    if (candidate.length >= 4 && candidate.endsWith("操")) names.add(candidate);
  }
  return names;
}

function groupFactsByFamily(facts) {
  const output = new Map();
  for (const fact of facts) {
    const key = `${fact.quantity.group.family}|${detectPopulation(fact.segment.text)}`;
    const bucket = output.get(key) || [];
    const duplicate = bucket.some(
      (item) =>
        Math.abs(item.quantity.start - fact.quantity.start) < 0.0001 &&
        Math.abs(item.quantity.end - fact.quantity.end) < 0.0001,
    );
    if (!duplicate) bucket.push(fact);
    output.set(key, bucket);
  }
  return output;
}

function compareDoseRanges(left, right) {
  const sameStart = Math.abs(left.start - right.start) < 0.0001;
  const sameEnd = Math.abs(left.end - right.end) < 0.0001;
  if (sameStart && sameEnd) return "";

  const disjoint = left.end < right.start || right.end < left.start;
  if (disjoint) return "disjoint";

  const leftContainsRight = left.start <= right.start && left.end >= right.end;
  const rightContainsLeft = right.start <= left.start && right.end >= left.end;
  if (leftContainsRight || rightContainsLeft) return "";
  return "partial";
}

function isExcludedRange(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function commonIngredientAliases(names) {
  return names.map((name) => [name, name]);
}

function candidateSegmentPairs(segmentsA, segmentsB) {
  const index = new Map();
  for (let indexB = 0; indexB < segmentsB.length; indexB += 1) {
    for (const token of tokenSet(segmentsB[indexB].text)) {
      const bucket = index.get(token) || [];
      bucket.push(indexB);
      index.set(token, bucket);
    }
  }

  const maxDf = Math.max(60, Math.floor(segmentsB.length * 0.14));
  const output = [];
  for (let indexA = 0; indexA < segmentsA.length; indexA += 1) {
    const a = segmentsA[indexA];
    const scoreByB = new Map();
    for (const token of tokenSet(a.text)) {
      const bucket = index.get(token);
      if (!bucket || bucket.length > maxDf) continue;
      for (const indexB of bucket) {
        scoreByB.set(indexB, (scoreByB.get(indexB) || 0) + 1);
      }
    }

    const shortlist = [...scoreByB.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 18);

    for (const [indexB] of shortlist) {
      const b = segmentsB[indexB];
      const similarity = textSimilarity(a.text, b.text);
      if (similarity < 0.22) continue;
      output.push({ a, b, similarity });
    }
  }
  return output;
}

function numericConflicts(a, b, shared, similarity) {
  if (similarity < 0.5) return [];
  const quantitiesA = extractQuantities(a.text);
  const quantitiesB = extractQuantities(b.text);
  if (!quantitiesA.length || !quantitiesB.length) return [];

  const output = [];
  const comparedFamilies = new Set();
  for (const qa of quantitiesA) {
    for (const qb of quantitiesB) {
      if (qa.group.family !== qb.group.family) continue;
      if (sameQuantity(qa, qb)) continue;
      if (comparedFamilies.has(qa.group.family)) continue;

      comparedFamilies.add(qa.group.family);
      const anchorName = buildAnchor(shared, qa.group.label);
      const risk = ["mass", "volume", "time", "frequency", "duration"].includes(qa.group.family)
        ? "high"
        : "mid";
      output.push({
        anchorId: anchorId(anchorName),
        anchorName,
        type: "数值口径冲突",
        risk,
        orderA: a.order,
        orderB: b.order,
        a: publicSide(a),
        b: publicSide(b),
        highlightA: qa.raw,
        highlightB: qb.raw,
        detail: `物料 A 写作「${qa.raw}」，物料 B 写作「${qb.raw}」，同一口径下的数值不一致。`,
        suggestion: "请核对课程标准或权威底稿，确认唯一数值口径后同步两份物料。",
      });
    }
  }
  return output;
}

function oppositeConflict(a, b, shared, similarity) {
  for (const [left, right] of OPPOSITES) {
    const aHasLeft = a.text.includes(left);
    const bHasRight = b.text.includes(right);
    const bHasLeft = b.text.includes(left);
    const aHasRight = a.text.includes(right);
    if (!((aHasLeft && bHasRight) || (aHasRight && bHasLeft))) continue;

    const normalizedA = normalizeCore(a.text).split(left).join("__方向__").split(right).join("__方向__");
    const normalizedB = normalizeCore(b.text).split(left).join("__方向__").split(right).join("__方向__");
    if (similarity < 0.42 && dice(bigrams(normalizedA), bigrams(normalizedB)) < 0.62) continue;

    const anchorName = buildAnchor(shared, "表述");
    return {
      anchorId: anchorId(anchorName),
      anchorName,
      type: "表述方向冲突",
      risk: "high",
      orderA: a.order,
      orderB: b.order,
      a: publicSide(a),
      b: publicSide(b),
      highlightA: aHasLeft ? left : right,
      highlightB: bHasRight ? right : left,
      detail: `物料 A 使用「${aHasLeft ? left : right}」，物料 B 使用「${bHasRight ? right : left}」，关键条件相反。`,
      suggestion: "确认适用场景和操作顺序，避免学员按相反口径执行。",
    };
  }
  return null;
}

function negationConflict(a, b, shared) {
  const negA = collectMatches(a.text, NEGATION_RE);
  const negB = collectMatches(b.text, NEGATION_RE);
  if (Boolean(negA.length) === Boolean(negB.length)) return null;

  const positiveSide = negA.length ? b : a;
  const positive = collectMatches(positiveSide.text, POSITIVE_RE);
  if (!positive.length) return null;

  const coreA = normalizeCore(a.text.replace(NEGATION_RE, "").replace(POSITIVE_RE, ""));
  const coreB = normalizeCore(b.text.replace(NEGATION_RE, "").replace(POSITIVE_RE, ""));
  if (dice(bigrams(coreA), bigrams(coreB)) < 0.72) return null;

  const negativeText = negA.length ? a.text : b.text;
  const strict = STRICT_NEGATION_RE.test(negativeText);
  const anchorName = buildAnchor(shared, "推荐口径");

  return {
    anchorId: anchorId(anchorName),
    anchorName,
    type: "推荐与禁忌冲突",
    risk: strict ? "high" : "mid",
    orderA: a.order,
    orderB: b.order,
    a: publicSide(a),
    b: publicSide(b),
    highlightA: negA[0] || positive[0],
    highlightB: negB[0] || positive[0],
    detail: "一份物料采用限制或否定表述，另一份对同一事项采用肯定或推荐表述。",
    suggestion: "核对目标人群、适用条件与禁忌边界，统一推荐或限制口径。",
  };
}

function scopeConflict(a, b, shared) {
  const absA = collectMatches(a.text, ABSOLUTE_RE);
  const absB = collectMatches(b.text, ABSOLUTE_RE);
  const restrictA = collectMatches(a.text, RESTRICTION_RE);
  const restrictB = collectMatches(b.text, RESTRICTION_RE);
  if (!((absA.length && restrictB.length) || (absB.length && restrictA.length))) return null;

  const normalizedA = normalizeCore(a.text.replace(ABSOLUTE_RE, "").replace(RESTRICTION_RE, ""));
  const normalizedB = normalizeCore(b.text.replace(ABSOLUTE_RE, "").replace(RESTRICTION_RE, ""));
  const similarity = dice(bigrams(normalizedA), bigrams(normalizedB));
  if (similarity < 0.42 || !shared) return null;

  const strongAbsolute = /无禁忌|绝对|百分之百|100%|万能/.test(
    `${absA.join("")}${absB.join("")}`,
  );
  const anchorName = buildAnchor(shared, "适用范围");
  return {
    anchorId: anchorId(anchorName),
    anchorName,
    type: "适用范围冲突",
    risk: strongAbsolute ? "high" : "mid",
    orderA: a.order,
    orderB: b.order,
    a: publicSide(a),
    b: publicSide(b),
    highlightA: absA[0] || restrictA[0] || "",
    highlightB: absB[0] || restrictB[0] || "",
    detail: "一份物料使用全量、绝对化适用表述，另一份同时给出了限制条件或禁忌范围。",
    suggestion: "补齐目标人群与例外情况，删除无法被其他物料支持的绝对化表述。",
  };
}

export function extractQuantities(text) {
  const source = normalizeWidth(String(text || ""));
  const output = [];
  const occupiedRanges = [];
  const dateRanges = [...source.matchAll(/\d{4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?/g)].map(
    (match) => [match.index, match.index + match[0].length],
  );

  for (const match of source.matchAll(REPEATED_UNIT_RANGE_RE)) {
    if (isExcludedRange(match.index, dateRanges)) continue;
    const leftUnit = unitLookup.get(match[2].toLowerCase());
    const rightUnit = unitLookup.get(match[4].toLowerCase());
    if (!leftUnit || !rightUnit || leftUnit.group.family !== rightUnit.group.family) continue;

    const left = parseNumber(match[1]) * leftUnit.factor;
    const right = parseNumber(match[3]) * rightUnit.factor;
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    output.push({
      raw: match[0].replace(/\s+/g, ""),
      start: Math.min(left, right),
      end: Math.max(left, right),
      unitRaw: match[2].toLowerCase(),
      group: leftUnit.group,
      index: match.index,
    });
    occupiedRanges.push([match.index, match.index + match[0].length]);
  }

  for (const match of source.matchAll(QUANTITY_RE)) {
    const prefix = source.slice(Math.max(0, match.index - 4), match.index);
    if (/第\s*$/.test(prefix)) continue;
    if (isExcludedRange(match.index, dateRanges)) continue;
    if (isExcludedRange(match.index, occupiedRanges)) continue;

    const unitRaw = match[3].toLowerCase();
    const unit = unitLookup.get(unitRaw);
    if (!unit) continue;

    const start = parseNumber(match[1]);
    const end = match[2] ? parseNumber(match[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    output.push({
      raw: match[0].replace(/\s+/g, ""),
      start: Math.min(start, end) * unit.factor,
      end: Math.max(start, end) * unit.factor,
      unitRaw,
      group: unit.group,
      index: match.index,
    });
  }
  return output;
}

function parseNumber(raw) {
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return chineseNumberToArabic(raw);
}

function chineseNumberToArabic(raw) {
  const digits = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  let total = 0;
  let current = 0;
  for (const char of raw) {
    if (Object.hasOwn(digits, char)) {
      current = digits[char];
    } else if (char === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else if (char === "百") {
      total += (current || 1) * 100;
      current = 0;
    }
  }
  return total + current;
}

function sameQuantity(a, b) {
  return Math.abs(a.start - b.start) < 0.0001 && Math.abs(a.end - b.end) < 0.0001;
}

function textSimilarity(a, b) {
  return dice(bigrams(normalizeCore(a)), bigrams(normalizeCore(b)));
}

function normalizeCore(value) {
  return normalizeWidth(String(value || ""))
    .toLowerCase()
    .replace(QUANTITY_RE, " ")
    .replace(NEGATION_RE, "")
    .replace(POSITIVE_RE, "")
    .replace(ABSOLUTE_RE, "")
    .replace(/[，。！？、；：,.!?;:()[\]{}<>《》“”"'`·|/\\_-]/g, "")
    .replace(/\s+/g, "");
}

function normalizeWidth(value) {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/．/g, ".")
    .replace(/％/g, "%")
    .replace(/～/g, "～");
}

function tokenSet(value) {
  return new Set(bigrams(normalizeCore(value)));
}

function bigrams(value) {
  const chars = [...value].filter((char) => !STOP_CHARS.has(char));
  if (chars.length <= 1) return chars;
  const output = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    output.push(chars[index] + chars[index + 1]);
  }
  return output;
}

function dice(left, right) {
  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;
  const counts = new Map();
  for (const token of left) counts.set(token, (counts.get(token) || 0) + 1);
  let overlap = 0;
  for (const token of right) {
    const count = counts.get(token) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(token, count - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length);
}

function sharedFragment(a, b) {
  const left = normalizeCore(a);
  const right = normalizeCore(b);
  if (!left || !right) return "";

  let best = "";
  for (let start = 0; start < left.length; start += 1) {
    const maxLength = Math.min(16, left.length - start);
    for (let length = maxLength; length >= 2; length -= 1) {
      if (length <= best.length) break;
      const candidate = left.slice(start, start + length);
      if (right.includes(candidate)) {
        best = candidate;
        break;
      }
    }
  }
  return best;
}

function buildAnchor(shared, fallback) {
  const cleaned = String(shared || "")
    .replace(GENERIC_ANCHOR_RE, "")
    .replace(/[0-9.%]/g, "")
    .slice(-10)
    .trim();
  return `${cleaned || "相关表述"} · ${fallback}`;
}

function anchorId(anchorName) {
  return anchorName
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}·_-]/gu, "")
    .slice(0, 80);
}

function collectMatches(text, regex) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return [...String(text || "").matchAll(new RegExp(regex.source, flags))].map((match) => match[0]);
}

function publicSide(segment) {
  return {
    id: segment.id,
    docId: segment.docId,
    docName: segment.docName,
    srcType: segment.srcType,
    locator: segment.locator,
    pageLabel: segment.locator,
    text: segment.text,
    ...(segment.imageCrop ? { imageCrop: segment.imageCrop, imageBox: segment.imageBox } : {}),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const compareInternals = {
  bigrams,
  dice,
  normalizeCore,
  sharedFragment,
  chineseNumberToArabic,
  internalStructureConflicts,
  operationSimilarity,
};
