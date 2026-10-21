const logoSvg = `
<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/>
  <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5z"/>
  <path d="M8.5 7.5h6"/>
</svg>`;

const navIcon = {
  tasks: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/></svg>',
  align: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  finding: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8 2.8 20h18.4z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="16.8" r=".9"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 4.5 6v6c0 4.4 3.2 7.5 7.5 8.8 4.3-1.3 7.5-4.4 7.5-8.8V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.2"/></svg>',
};

function sidebar(active) {
  return `
  <aside class="sidebar">
    <a class="sb-brand" href="/" aria-label="返回任务中心">
      <span class="sb-logo">${logoSvg}</span>
      <span class="sb-brand-txt"><strong>一致</strong><span>质量检测校对平台</span></span>
    </a>
    <nav class="sb-nav" aria-label="主导航">
      <a class="sb-item ${active === "tasks" ? "active" : ""}" href="/">${navIcon.tasks}任务中心</a>
      <a class="sb-item ${active === "upload" ? "active" : ""}" href="/">${navIcon.upload}上传资料</a>
      <a class="sb-item" href="${active === "task" ? "#" : "/#tasks"}">${navIcon.align}内容对齐<span class="sb-count" id="navAnchors">0</span></a>
      <a class="sb-item ${active === "task" ? "active" : ""}" href="${active === "task" ? "#" : "/#tasks"}">${navIcon.finding}问题清单<span class="sb-count" id="navFindings">0</span></a>
    </nav>
    <div class="sb-spacer"></div>
    <div class="sb-card">
      <div class="sb-card-h">${navIcon.shield}隐私保护</div>
      <p>文件只在服务内存中处理<br>任务 7 天后自动失效</p>
    </div>
    <div class="sb-user">
      <div class="sb-avatar">检</div>
      <div><strong>质量检测组</strong><span>校对员</span></div>
      <span class="dots">···</span>
    </div>
  </aside>`;
}

export function renderUploadPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>上传资料 · 一致</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  ${sidebar("upload")}
  <div class="shell">
    <header class="topbar">
      <div>
        <div class="crumb">质量检测 / 上传资料</div>
        <h1>上传资料</h1>
      </div>
      <div class="topbar-actions">
        <span class="live-dot" id="liveDot"><i></i><span id="liveText">正在连接</span></span>
        <button class="btn ghost" id="clearBtn" type="button">清空资料</button>
        <button class="btn" id="newBtn" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          新建任务
        </button>
      </div>
    </header>

    <main class="wrap">
      <div class="page-head">
        <div>
          <h2>新建检测任务</h2>
          <p>支持文档、图片 OCR、视频/音频本地转写；系统核对剂量、时间、顺序、性味归经、课程结构与周期口径。</p>
        </div>
        <div class="page-kicker"><span>01</span> 资料准备</div>
      </div>

      <section class="card" aria-labelledby="taskMaterialsHeading">
        <div class="card-head">
          <h3 id="taskMaterialsHeading">任务资料</h3>
          <span class="step">第 1 步，共 2 步</span>
        </div>
        <div class="card-body">
          <div class="form-row">
            <label>
              <span class="lbl">任务名称<em>*</em></span>
              <input id="title" type="text" maxlength="80" placeholder="如：健脾胃课程口径复核" autocomplete="off">
            </label>
            <label>
              <span class="lbl">课程</span>
              <input id="course" type="text" maxlength="60" placeholder="如：健脾胃和胃" autocomplete="off">
            </label>
            <label>
              <span class="lbl">章节</span>
              <input id="chapter" type="text" maxlength="60" placeholder="如：第 3 节" autocomplete="off">
            </label>
          </div>

          <div class="drop" id="drop" tabindex="0" role="button" aria-label="选择或拖拽上传文件">
            <input type="file" id="fileInput" multiple hidden accept=".pptx,.docx,.pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.mp4,.mov,.mkv,.webm,.avi,.m4v,.mp3,.m4a,.wav,.aac,.flac,.ogg,.opus">
            <div class="drop-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/></svg>
            </div>
            <p class="drop-title">点击或拖拽上传文件</p>
            <div class="drop-tags"><span>PPTX</span><span>Word</span><span>PDF</span><span>图片</span><span>视频</span><span>音频</span></div>
            <button type="button" class="btn primary" id="pickBtn">选择文件</button>
            <p class="drop-note">图片不超过 20MB；视频/音频不超过 300MB；一次最多 8 份</p>
          </div>

          <ul class="filelist" id="fileList" aria-live="polite"></ul>

          <div class="actions">
            <button class="btn primary run" id="runBtn" type="button" disabled>开始检测</button>
            <span class="status" id="runStatus" aria-live="polite"></span>
          </div>

          <div class="note">
            <strong>本期可处理：</strong>PPTX / DOCX / PDF / TXT / MD / CSV / 图片 / 视频 / 音频。
            图片使用本地 OCR；视频与音频使用本地 Whisper 转写，较长文件需要等待。
            扫描版 PDF 暂不自动 OCR；老版 .ppt / .doc 请另存为新格式。
            至少上传 <strong>2 份</strong>物料，系统才会进行跨文件比对。
          </div>
        </div>
      </section>

      <section class="card" id="tasks" aria-labelledby="historyHeading">
        <div class="card-head">
          <h3 id="historyHeading">历史任务</h3>
          <span class="hint" id="expireHint"></span>
        </div>
        <div class="card-body"><div id="taskList" class="tasklist"><div class="skeleton-row"></div><div class="skeleton-row"></div></div></div>
      </section>
    </main>
  </div>

  <div class="gate" id="gate" hidden>
    <form class="gate-box" id="gateForm">
      <div class="gate-logo">${logoSvg}</div>
      <h2>一致 · 内容口径校对</h2>
      <p>这是内部工具，请先输入访问口令。</p>
      <label class="sr-only" for="gateCode">访问口令</label>
      <input id="gateCode" type="password" placeholder="请输入访问口令" autocomplete="current-password">
      <button type="submit" class="btn primary" id="gateBtn">进入</button>
      <div class="gate-err" id="gateErr" role="alert"></div>
    </form>
  </div>

  <script src="/assets/upload.js" defer></script>
</body>
</html>`;
}

export function renderTaskPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>问题清单 · 一致</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  ${sidebar("task")}
  <div class="shell">
    <header class="topbar">
      <a class="back-btn" href="/" title="返回" aria-label="返回上传页">‹</a>
      <div class="title-block">
        <div class="crumb">质量检测 / 问题清单</div>
        <h1 id="taskTitle">加载中…</h1>
      </div>
      <div class="topbar-actions">
        <span class="live-dot task-meta"><i></i><span id="taskMeta"></span></span>
        <a class="btn ghost" id="exportBtn" href="#" aria-disabled="true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>
          导出 CSV
        </a>
        <a class="btn" href="/">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          新建任务
        </a>
      </div>
    </header>

    <main class="wrap" id="app">
      <section id="parseWarn" class="parsewarn" hidden></section>
      <section class="stats" id="stats" aria-label="检测统计">
        <div class="stat-skeleton"></div><div class="stat-skeleton"></div><div class="stat-skeleton"></div><div class="stat-skeleton"></div>
      </section>
      <section class="filters" aria-label="问题筛选">
        <div class="filter-group" id="riskFilters">
          <button class="chip active" data-risk="all">全部</button>
          <button class="chip" data-risk="high">高危</button>
          <button class="chip" data-risk="mid">中危</button>
          <button class="chip" data-risk="low">低危 <span class="chip-count" id="riskLowCount">0</span></button>
        </div>
        <div class="filter-group" id="statusFilters">
          <button class="chip active" data-status="all">所有状态</button>
          <button class="chip" data-status="pending">待处理</button>
          <button class="chip" data-status="done">已处理</button>
          <button class="chip" data-status="false_positive">误报</button>
          <button class="chip" data-status="ignored">忽略</button>
        </div>
        <label class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
          <input type="search" id="searchBox" placeholder="搜索关键词、物料或原文…">
        </label>
      </section>
      <section id="findings" class="findings" aria-live="polite"></section>
      <section id="empty" class="empty" hidden></section>
    </main>
  </div>

  <div class="modal" id="modal" hidden>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <button class="modal-close" id="modalClose" type="button" aria-label="关闭">×</button>
      <div id="modalBody"></div>
    </div>
  </div>

  <script src="/assets/task.js" defer></script>
</body>
</html>`;
}
