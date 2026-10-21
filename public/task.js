const $ = (selector) => document.querySelector(selector);
const taskId = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() || "");
const riskLabel = { high: "高危", mid: "中危", low: "低危" };
const statusLabel = {
  pending: "待处理",
  done: "已处理",
  false_positive: "误报",
  ignored: "忽略",
};

const state = {
  task: null,
  risk: "all",
  status: "all",
  query: "",
  saving: new Set(),
};

bindEvents();
boot();

async function boot() {
  try {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
      headers: { accept: "application/json" },
    });
    const data = await readJson(response);

    if (response.status === 401) {
      renderFatal("这个工具需要访问口令", "请回到首页输入口令，再从历史任务打开这个链接。");
      return;
    }
    if (response.status === 410) {
      renderFatal("这个任务链接已过期", data.hint || "任务只保留 7 天，请重新上传资料生成结果。");
      return;
    }
    if (!response.ok) {
      renderFatal("打不开这个任务", data.error || `加载失败（HTTP ${response.status}）`);
      return;
    }

    state.task = data;
    renderAll();
  } catch (error) {
    renderFatal("网络连接失败", error.message);
  }
}

function bindEvents() {
  $("#riskFilters").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-risk]");
    if (!chip) return;
    setActiveChip("#riskFilters", chip);
    state.risk = chip.dataset.risk;
    renderFindings();
  });

  $("#statusFilters").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-status]");
    if (!chip) return;
    setActiveChip("#statusFilters", chip);
    state.status = chip.dataset.status;
    renderFindings();
  });

  $("#searchBox").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderFindings();
  });

  $("#findings").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = button.closest(".finding");
    if (!card) return;
    const finding = state.task?.findings?.find((item) => item.id === card.dataset.id);
    if (!finding) return;

    if (button.dataset.action === "evidence") {
      openEvidence(finding);
      return;
    }
    if (state.saving.has(finding.id)) return;

    state.saving.add(finding.id);
    card.classList.add("saving");
    const previous = finding.status || "pending";
    finding.status = button.dataset.action;
    renderStats();
    renderFindings();

    try {
      const response = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}/findings/${encodeURIComponent(finding.id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ status: finding.status }),
        },
      );
      if (!response.ok) {
        const data = await readJson(response);
        throw new Error(data.error || `保存失败（HTTP ${response.status}）`);
      }
    } catch (error) {
      finding.status = previous;
      showToast(`状态保存失败：${error.message}`);
    } finally {
      state.saving.delete(finding.id);
      renderStats();
      renderFindings();
    }
  });

  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (event) => {
    if (event.target === $("#modal")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

function renderAll() {
  const task = state.task;
  document.title = `${task.title || "校对结果"} · 问题清单 · 一致`;
  $("#taskTitle").textContent = task.title || "未命名任务";

  const documentNames = (task.docs || []).map((doc) => doc.name).join(" · ");
  const factSummary = task.stats?.facts ? `强制事实卡 ${task.stats.facts} 张` : "";
  const expiry = task.expiresAt ? `链接 ${formatDate(task.expiresAt)} 失效` : "";
  $("#taskMeta").textContent = [task.course, documentNames, factSummary, expiry]
    .filter(Boolean)
    .join("　|　");

  const exportButton = $("#exportBtn");
  exportButton.href = `/api/tasks/${encodeURIComponent(taskId)}/export`;
  exportButton.removeAttribute("aria-disabled");

  renderStats();
  renderParseErrors();
  renderFindings();
}

function renderStats() {
  const task = state.task;
  const findings = task.findings || [];
  const stats = task.stats || {};
  const pending = findings.filter((finding) => (finding.status || "pending") === "pending").length;
  const done = findings.filter((finding) => finding.status === "done").length;
  const high = findings.filter((finding) => finding.risk === "high").length;
  const mid = findings.filter((finding) => finding.risk === "mid").length;
  const low = findings.filter((finding) => finding.risk === "low").length;

  $("#stats").innerHTML = `
    <div class="stat high"><span class="stat-icon">!</span><span><strong>${high}</strong><small>高危 · 必须确认</small></span></div>
    <div class="stat mid"><span class="stat-icon">!</span><span><strong>${mid}</strong><small>中危 · 建议核对</small></span></div>
    <div class="stat pending"><span class="stat-icon">·</span><span><strong>${pending}</strong><small>待处理</small></span></div>
    <div class="stat done"><span class="stat-icon">✓</span><span><strong>${done}</strong><small>已处理</small></span></div>`;

  $("#navFindings").textContent = String(findings.length);
  $("#navAnchors").textContent = String(stats.anchors || 0);
  const lowCount = $("#riskLowCount");
  if (lowCount) lowCount.textContent = String(low);
}

function renderParseErrors() {
  const errors = state.task.parseErrors || [];
  const box = $("#parseWarn");
  if (!errors.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <div class="pw-title">⚠ ${errors.length} 份文件没能读取，当前结果不包含它们</div>
    <ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>
    <p>扫描件 PDF 需先做 OCR；老版 .ppt / .doc 请另存为新格式后重新上传。</p>`;
}

function filteredFindings() {
  const findings = state.task.findings || [];
  return findings.filter((finding) => {
    if (state.risk !== "all" && finding.risk !== state.risk) return false;
    const status = finding.status || "pending";
    if (state.status !== "all" && status !== state.status) return false;
    if (!state.query) return true;
    const haystack = [
      finding.anchorName,
      finding.type,
      finding.detail,
      finding.suggestion,
      finding.a.docName,
      finding.a.locator,
      finding.a.text,
      finding.b.docName,
      finding.b.locator,
      finding.b.text,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.query);
  });
}

function renderFindings() {
  if (!state.task) return;
  const findings = filteredFindings();
  const box = $("#findings");
  const empty = $("#empty");

  if (!findings.length) {
    box.innerHTML = "";
    empty.hidden = false;
    const total = state.task.findings?.length || 0;
    if (total === 0) {
      const stats = state.task.stats || {};
      empty.innerHTML = `
        <span class="empty-mark">✓</span>
        <h2>这一轮没有发现明显冲突</h2>
        <p>已检查 ${stats.segments || 0} 个语义段、建立 ${stats.anchors || 0} 个内容小点。</p>
        <div class="boundary">
          当前规则覆盖：数值与单位、推荐/禁忌、适用范围、表述方向。
          图片标注、穴位定位、复杂逻辑推理和扫描件 OCR 仍需人工复核。
        </div>`;
    } else {
      empty.innerHTML = `
        <span class="empty-mark">⌕</span>
        <h2>当前筛选下没有条目</h2>
        <p>试试切换到“全部”或清空搜索关键词。</p>`;
    }
    return;
  }

  empty.hidden = true;
  box.innerHTML = findings.map(renderFindingCard).join("");
}

function renderFindingCard(finding) {
  const status = finding.status || "pending";
  return `
    <article class="finding risk-${escapeHtml(finding.risk)} st-${escapeHtml(status)}" data-id="${escapeHtml(finding.id)}">
      <div class="finding-top">
        <span class="badge ${escapeHtml(finding.risk)}">${escapeHtml(riskLabel[finding.risk] || finding.risk)}</span>
        <span class="anchor">${escapeHtml(finding.anchorName)}</span>
        <span class="type">${escapeHtml(finding.type)}</span>
        <span class="spacer"></span>
        <span class="status-pill">${escapeHtml(statusLabel[status] || status)}</span>
      </div>
      <div class="finding-body">
        <div class="pair">
          <div class="side side-a">
            ${renderSource(finding.a, "物料 A")}
            ${renderEvidenceCrop(finding.a, "物料 A")}
            <div class="txt">${highlight(finding.a.text, finding.highlightA)}</div>
          </div>
          <div class="vs">VS</div>
          <div class="side side-b">
            ${renderSource(finding.b, "物料 B")}
            ${renderEvidenceCrop(finding.b, "物料 B")}
            <div class="txt">${highlight(finding.b.text, finding.highlightB)}</div>
          </div>
        </div>
        <div class="detail"><strong>为什么冲突</strong>${escapeHtml(finding.detail || "两份物料的同一口径不一致。")}</div>
        ${finding.suggestion ? `<div class="suggest"><strong>建议</strong>${escapeHtml(finding.suggestion)}</div>` : ""}
      </div>
      <div class="finding-foot">
        ${statusButton("pending", "待处理", status)}
        ${statusButton("done", "确认是真的", status)}
        ${statusButton("false_positive", "误报", status)}
        ${statusButton("ignored", "忽略", status)}
        <button class="btn-sm evidence" type="button" data-action="evidence">展开看证据</button>
      </div>
    </article>`;
}

function statusButton(action, label, current) {
  const selected = action === current ? " on" : "";
  return `<button class="btn-sm${selected}" type="button" data-action="${action}">${label}</button>`;
}

function sideLabel(side) {
  return `${side.docName} · ${sourceTypeLabel(side)} · ${side.locator}`;
}

function sourceTypeLabel(side) {
  return {
    pptx: "PPTX",
    docx: "Word",
    pdf: "PDF",
    text: "文本",
    image: "图片 OCR",
    audio: "音频转写",
    video: "视频转写",
  }[side.srcType] || side.srcType;
}

function renderSource(side, label) {
  const locator = side.locator === sourceTypeLabel(side) ? "" : side.locator;
  return `
    <div class="source-block">
      <div class="source-heading">
        <span class="side-tag">${escapeHtml(label)}</span>
        <span class="source-type">${escapeHtml(sourceTypeLabel(side))}</span>
      </div>
      <strong class="source-file" title="${escapeHtml(side.docName)}">${escapeHtml(side.docName)}</strong>
      ${locator ? `<span class="source-loc">${escapeHtml(locator)}</span>` : ""}
    </div>`;
}

function renderEvidenceCrop(side, label) {
  if (!side.imageCrop) return "";
  return `
    <figure class="source-crop">
      <img src="${escapeHtml(side.imageCrop)}" alt="${escapeHtml(`${label} OCR 原图局部`)}" loading="lazy">
      <figcaption>OCR 原图定位 · ${escapeHtml(side.docName)}</figcaption>
    </figure>`;
}

function highlight(text, keyword) {
  const plain = String(text ?? "");
  if (!keyword) return escapeHtml(plain);
  const index = plain.indexOf(keyword);
  if (index < 0) return escapeHtml(plain);
  return `${escapeHtml(plain.slice(0, index))}<mark>${escapeHtml(keyword)}</mark>${escapeHtml(
    plain.slice(index + keyword.length),
  )}`;
}

function openEvidence(finding) {
  const related = (state.task.findings || []).filter(
    (item) => item.anchorId === finding.anchorId && item.id !== finding.id,
  );
  $("#modalBody").innerHTML = `
    <h3 id="modalTitle">${escapeHtml(finding.anchorName)}</h3>
    <p class="modal-meta">${escapeHtml(riskLabel[finding.risk] || finding.risk)} · ${escapeHtml(
      finding.type,
    )} · 条目 ${escapeHtml(finding.id)}</p>

    <section class="ev-sec">
      <h4>物料 A 的原文</h4>
      ${renderSource(finding.a, "物料 A")}
      ${renderEvidenceCrop(finding.a, "物料 A")}
      <blockquote>${highlight(finding.a.text, finding.highlightA)}</blockquote>
    </section>
    <section class="ev-sec">
      <h4>物料 B 的原文</h4>
      ${renderSource(finding.b, "物料 B")}
      ${renderEvidenceCrop(finding.b, "物料 B")}
      <blockquote>${highlight(finding.b.text, finding.highlightB)}</blockquote>
    </section>
    ${renderFactCards(finding)}
    <section class="ev-sec">
      <h4>差异说明</h4>
      <p>${escapeHtml(finding.detail || "")}</p>
      ${finding.suggestion ? `<p class="ev-suggest">${escapeHtml(finding.suggestion)}</p>` : ""}
    </section>
    ${
      related.length
        ? `<section class="ev-sec"><h4>同一小点下的其他条目（${related.length}）</h4>
            <ul class="related-list">${related
              .map(
                (item) =>
                  `<li>${escapeHtml(riskLabel[item.risk] || item.risk)} · ${escapeHtml(
                    item.type,
                  )} · ${escapeHtml(item.a.locator)} ↔ ${escapeHtml(item.b.locator)}</li>`,
              )
              .join("")}</ul></section>`
        : ""
    }
    <section class="ev-sec boundary">
      <h4>判断边界</h4>
      <p>本条由文本规则依据上面两段原文生成。图片标注、穴位定位和图片中的隐含信息不在自动判断范围内，仍需人工核对。</p>
    </section>`;
  $("#modal").hidden = false;
  document.body.classList.add("modal-open");
  $("#modalClose").focus();
}

function renderFactCards(finding) {
  if (!finding.factA && !finding.factB) return "";
  return `
    <section class="ev-sec fact-section">
      <h4>结构化事实卡 · 强制字段</h4>
      <div class="fact-compare">
        ${renderFactCard("物料 A", finding.factA)}
        ${renderFactCard("物料 B", finding.factB)}
      </div>
    </section>`;
}

function renderFactCard(label, fact) {
  if (!fact) return '<article class="fact-card fact-missing">事实字段不完整，未参与判定</article>';
  return `
    <article class="fact-card">
      <div class="fact-card-head">
        <strong>${escapeHtml(label)}</strong>
        <span class="${fact.requiredFieldsComplete ? "fact-ok" : "fact-bad"}">${
          fact.requiredFieldsComplete ? "字段完整" : "字段缺失"
        }</span>
      </div>
      <dl>
        ${factRow("对象", fact.subject)}
        ${factRow("属性", fact.attribute)}
        ${factRow("关系", fact.relation)}
        ${factRow("数值", [fact.value?.raw, fact.unit].filter(Boolean).join(" · "))}
        ${factRow("时间类型", fact.timeTypeLabel)}
        ${factRow("适用人群", fact.population)}
        ${factRow("前置条件", fact.condition)}
        ${factRow("执行顺序", fact.sequence)}
        ${factRow("倾向", polarityLabel(fact.polarity))}
        ${factRow("来源", `${fact.source?.docName || ""} · ${fact.source?.locator || ""}`)}
      </dl>
    </article>`;
}

function factRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "未说明")}</dd></div>`;
}

function polarityLabel(value) {
  return { positive: "肯定", negative: "否定", neutral: "中性" }[value] || value || "未说明";
}

function closeModal() {
  $("#modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function renderFatal(title, message) {
  $("#app").innerHTML = `
    <section class="fatal">
      <span class="fatal-code">ERROR</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <a class="btn primary" href="/">回到首页</a>
    </section>`;
}

function setActiveChip(group, chip) {
  for (const item of $(group).querySelectorAll(".chip")) item.classList.remove("active");
  chip.classList.add("active");
}

function showToast(message) {
  let toast = $("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

async function readJson(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return {};
  return response.json().catch(() => ({}));
}

function formatDate(timestamp) {
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
