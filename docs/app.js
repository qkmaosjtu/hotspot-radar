const DATA_URL = "./data/daily-hotspots.json";
const RAW_DATA_URL = "./data/raw-hotlists.json";

const PLATFORM_META = {
  douyin: {name: "抖音", color: "#fe2c55"},
  weibo: {name: "微博", color: "#ffb21a"},
  zhihu: {name: "知乎", color: "#2388ff"},
  xiaohongshu: {name: "小红书", color: "#ff6483"},
  baidu: {name: "百度", color: "#7468ff"},
  bilibili: {name: "B站", color: "#00a9c8"},
};

const URGENCY_META = {
  now: {label: "立即跟进", color: "#fe2c55"},
  today: {label: "今日发布", color: "#ffb21a"},
  evergreen: {label: "可做常青", color: "#24b47e"},
};

const MOMENTUM_LABELS = {
  rising: "正在上升",
  peak: "高位爆发",
  steady: "稳定讨论",
  cooling: "热度回落",
};

const state = {
  data: null,
  rawData: null,
  selectedCategory: "全部",
  selectedRawPlatform: "all",
  rawLimit: 12,
  toastTimer: null,
};

const elements = {
  updatedAt: document.querySelector("#updatedAt"),
  reportDate: document.querySelector("#reportDate"),
  globalStatusDot: document.querySelector("#globalStatusDot"),
  refreshButton: document.querySelector("#refreshButton"),
  sourceList: document.querySelector("#sourceList"),
  rawPlatformTabs: document.querySelector("#rawPlatformTabs"),
  rawSearch: document.querySelector("#rawSearch"),
  rawHotlist: document.querySelector("#rawHotlist"),
  rawVisibleCount: document.querySelector("#rawVisibleCount"),
  rawResultMeta: document.querySelector("#rawResultMeta"),
  rawLoadMore: document.querySelector("#rawLoadMore"),
  topicSearch: document.querySelector("#topicSearch"),
  platformFilter: document.querySelector("#platformFilter"),
  urgencyFilter: document.querySelector("#urgencyFilter"),
  sortFilter: document.querySelector("#sortFilter"),
  categoryFilters: document.querySelector("#categoryFilters"),
  topicList: document.querySelector("#topicList"),
  visibleCount: document.querySelector("#visibleCount"),
  emptyState: document.querySelector("#emptyState"),
  topicDialog: document.querySelector("#topicDialog"),
  dialogEyebrow: document.querySelector("#dialogEyebrow"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogBody: document.querySelector("#dialogBody"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  footerMeta: document.querySelector("#footerMeta"),
  toast: document.querySelector("#toast"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function formatDate(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    ...options,
  }).format(date);
}

function relativeUpdateTime(value) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "--";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return formatDate(value, {month: "2-digit", day: "2-digit"});
}

function showToast(message, type = "info") {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", type === "error");
  elements.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 3200);
}

function validateData(payload) {
  if (!payload || payload.schemaVersion !== 1) {
    throw new Error("热点数据 schemaVersion 不受支持");
  }
  if (!Array.isArray(payload.topics) || !Array.isArray(payload.sourceStatus)) {
    throw new Error("热点数据缺少 topics 或 sourceStatus");
  }
  if (!payload.trendHistory?.times || !payload.trendHistory?.series) {
    throw new Error("热点数据缺少 trendHistory");
  }
}

function validateRawData(payload) {
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.platforms)) {
    throw new Error("平台原榜数据格式不受支持");
  }
  payload.platforms.forEach((platform) => {
    if (!Array.isArray(platform.items) || platform.collectedCount !== platform.items.length) {
      throw new Error(`${platform.name || platform.id} 原榜条目数不一致`);
    }
  });
}

async function loadData({announce = false} = {}) {
  elements.refreshButton.classList.add("is-loading");
  elements.globalStatusDot.className = "status-dot";
  try {
    const url = new URL(DATA_URL, window.location.href);
    url.searchParams.set("_", Date.now());
    const rawUrl = new URL(RAW_DATA_URL, window.location.href);
    rawUrl.searchParams.set("_", Date.now());
    const [response, rawResponse] = await Promise.all([
      fetch(url, {cache: "no-store"}),
      fetch(rawUrl, {cache: "no-store"}),
    ]);
    if (!response.ok) throw new Error(`读取每日精选失败：HTTP ${response.status}`);
    if (!rawResponse.ok) throw new Error(`读取平台原榜失败：HTTP ${rawResponse.status}`);
    const [payload, rawPayload] = await Promise.all([response.json(), rawResponse.json()]);
    validateData(payload);
    validateRawData(rawPayload);
    state.data = payload;
    state.rawData = rawPayload;
    renderAll();
    elements.globalStatusDot.classList.add("is-ready");
    if (announce) showToast("已重新读取今日热点数据");
    if (payload.dataMode === "demo") {
      showToast("当前为前端示例数据，等待本地 Codex 定时任务接管");
    }
  } catch (error) {
    elements.globalStatusDot.classList.add("is-error");
    renderLoadError(error);
    showToast(error.message || "读取每日数据失败", "error");
  } finally {
    elements.refreshButton.classList.remove("is-loading");
  }
}

function renderLoadError(error) {
  elements.updatedAt.textContent = "数据不可用";
  elements.topicList.innerHTML = `
    <div class="empty-state">
      <strong>无法读取每日热点数据</strong>
      <span>${escapeHtml(error.message || "请确认 data/daily-hotspots.json 存在。")}</span>
    </div>
  `;
}

function renderAll() {
  renderHeader();
  renderRawHotlist();
  renderSources();
  renderCategories();
  renderTopics();
}

function renderHeader() {
  const {schemaVersion, dataMode} = state.data;
  const snapshotTime = state.rawData?.generatedAt || state.data.generatedAt;
  const snapshotDate = state.rawData?.date || state.data.date;
  elements.updatedAt.textContent = formatDate(snapshotTime, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  elements.reportDate.textContent = formatDate(snapshotDate, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  elements.footerMeta.textContent = `SCHEMA V${schemaVersion} · ${
    dataMode === "demo" ? "DEMO DATA" : "LOCAL CODEX PIPELINE"
  }`;
}

function renderSources() {
  const sources = state.rawData?.platforms || state.data.sourceStatus;
  elements.sourceList.innerHTML = sources
    .map((source) => {
      const meta = PLATFORM_META[source.id] || {name: source.name, color: "#92959f"};
      const statusText =
        source.status === "fresh"
          ? source.sourceKind === "official"
            ? "官方"
            : "正常"
          : source.status === "partial"
            ? "部分"
            : source.status === "stale"
              ? "陈旧"
              : "异常";
      const itemCount = source.collectedCount ?? source.items ?? 0;
      return `
        <div class="source-row" style="--source-color:${meta.color}">
          <i class="source-mark"></i>
          <div class="source-name">
            <strong>${escapeHtml(meta.name)}</strong>
            <span>${escapeHtml(itemCount)} 条</span>
          </div>
          <span class="source-update">${statusText} · ${escapeHtml(
            relativeUpdateTime(source.collectedAt || source.updatedAt),
          )}</span>
        </div>
      `;
    })
    .join("");
}

function formatHotValue(item) {
  const value = Number(item.hotValue);
  if (Number.isFinite(value) && value > 0) {
    if (value >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
    if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万`;
    return new Intl.NumberFormat("zh-CN").format(value);
  }
  return item.hotLabel || "热榜";
}

function formatRawSubtitle(item) {
  const category = String(item.category || "").trim();
  if (category && !/^\d+$/.test(category)) return category;
  if (item.author) return item.author;
  if (item.sourceStatus !== "fresh") return "部分数据";
  return "实时热榜";
}

function renderRawPlatformTabs() {
  const platforms = state.rawData?.platforms || [];
  const tabs = [
    {
      id: "all",
      name: "全部",
      count: state.rawData?.summary?.totalItems || 0,
      color: "var(--text)",
    },
    ...platforms.map((platform) => ({
      id: platform.id,
      name: platform.name,
      count: platform.collectedCount,
      color: PLATFORM_META[platform.id]?.color || "var(--text-3)",
    })),
  ];
  elements.rawPlatformTabs.innerHTML = tabs
    .map(
      (tab) => `
        <button
          class="platform-tab ${state.selectedRawPlatform === tab.id ? "is-active" : ""}"
          type="button"
          data-raw-platform="${escapeHtml(tab.id)}"
          style="--platform-color:${tab.color}"
        >
          <span>${escapeHtml(tab.name)}</span>
          <small>${escapeHtml(tab.count)}</small>
        </button>
      `,
    )
    .join("");
}

function rawItems() {
  return (state.rawData?.platforms || []).flatMap((platform) =>
    platform.items.map((item) => ({
      ...item,
      platformId: platform.id,
      platformName: platform.name,
      sourceStatus: platform.status,
    })),
  );
}

function getFilteredRawItems() {
  const query = elements.rawSearch.value.trim().toLowerCase();
  const platformOrder = new Map(
    (state.rawData?.platforms || []).map((platform, index) => [platform.id, index]),
  );
  return rawItems()
    .filter(
      (item) =>
        state.selectedRawPlatform === "all" || item.platformId === state.selectedRawPlatform,
    )
    .filter((item) => {
      if (!query) return true;
      return `${item.title} ${item.category || ""} ${item.author || ""}`
        .toLowerCase()
        .includes(query);
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (platformOrder.get(a.platformId) || 0) - (platformOrder.get(b.platformId) || 0),
    );
}

function renderRawHotlist() {
  renderRawPlatformTabs();
  const filtered = getFilteredRawItems();
  const visible = filtered.slice(0, state.rawLimit);
  elements.rawVisibleCount.textContent = visible.length;
  elements.rawResultMeta.textContent = `共 ${filtered.length} 条匹配 · 原始排名不重排`;
  elements.rawLoadMore.hidden = visible.length >= filtered.length;

  if (!visible.length) {
    elements.rawHotlist.innerHTML = `
      <div class="raw-empty">
        <strong>没有匹配的原榜条目</strong>
        <span>尝试清除关键词或切换平台。</span>
      </div>
    `;
    return;
  }

  elements.rawHotlist.innerHTML = visible
    .map((item) => {
      const meta = PLATFORM_META[item.platformId] || {
        name: item.platformName,
        color: "#92959f",
      };
      const topRank = item.rank <= 3 ? "is-top" : "";
      return `
        <a
          class="raw-hot-row"
          href="${escapeHtml(item.url)}"
          target="_blank"
          rel="noreferrer"
          style="--platform-color:${meta.color}"
        >
          <span class="raw-rank ${topRank}">${String(item.rank).padStart(2, "0")}</span>
          <span class="raw-platform">
            <i></i>
            <span>${escapeHtml(meta.name)}</span>
          </span>
          <span class="raw-topic">
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(formatRawSubtitle(item))}</small>
          </span>
          <span class="raw-heat">${escapeHtml(formatHotValue(item))}</span>
          <svg><use href="#icon-arrow-up-right"></use></svg>
        </a>
      `;
    })
    .join("");
}

function renderCategories() {
  const categories = ["全部", ...new Set(state.data.topics.map((topic) => topic.category))];
  elements.categoryFilters.innerHTML = categories
    .map(
      (category) => `
        <button
          class="filter-chip ${category === state.selectedCategory ? "is-active" : ""}"
          type="button"
          data-category="${escapeHtml(category)}"
        >${escapeHtml(category)}</button>
      `,
    )
    .join("");
}

function getFilteredTopics() {
  const search = elements.topicSearch.value.trim().toLowerCase();
  const platform = elements.platformFilter.value;
  const urgency = elements.urgencyFilter.value;
  const sort = elements.sortFilter.value;

  const topics = state.data.topics.filter((topic) => {
    const searchText = [
      topic.title,
      topic.brief,
      topic.category,
      ...(topic.keywords || []),
      ...(topic.mathAngles || []),
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = !search || searchText.includes(search);
    const matchesPlatform =
      platform === "all" || topic.platforms.some((item) => item.id === platform);
    const matchesUrgency = urgency === "all" || topic.urgency === urgency;
    const matchesCategory =
      state.selectedCategory === "全部" || topic.category === state.selectedCategory;
    return matchesSearch && matchesPlatform && matchesUrgency && matchesCategory;
  });

  return topics.sort((a, b) => {
    const delta = Number(b[sort] || 0) - Number(a[sort] || 0);
    return delta || a.rank - b.rank;
  });
}

function renderTopics() {
  if (!state.data) return;
  const topics = getFilteredTopics();
  elements.visibleCount.textContent = topics.length;
  elements.emptyState.hidden = topics.length > 0;
  elements.topicList.hidden = topics.length === 0;
  elements.topicList.innerHTML = topics.map(renderTopicCard).join("");
}

function scoreBar(label, score, color) {
  const value = clamp(score, 0, 100);
  return `
    <div class="score-row">
      <span>${escapeHtml(label)}</span>
      <i class="score-track"><i style="--score-width:${value}%;--score-color:${color}"></i></i>
      <span>${value}</span>
    </div>
  `;
}

function renderTopicCard(topic) {
  const urgency = URGENCY_META[topic.urgency] || URGENCY_META.evergreen;
  const platforms = topic.platforms
    .slice(0, 5)
    .map((item) => {
      const meta = PLATFORM_META[item.id] || {name: item.id, color: "#92959f"};
      return `
        <span class="platform-badge" style="--platform-color:${meta.color}">
          <i></i>${escapeHtml(meta.name)} ${escapeHtml(item.rank)}
        </span>
      `;
    })
    .join("");

  return `
    <article class="topic-card" style="--urgency-color:${urgency.color}">
      <div class="topic-rank">${String(topic.rank).padStart(2, "0")}</div>
      <div class="topic-main">
        <div class="topic-meta">
          <span class="urgency-badge">${escapeHtml(urgency.label)}</span>
          <span>${escapeHtml(topic.category)}</span>
          <span>${escapeHtml(MOMENTUM_LABELS[topic.momentum] || topic.momentum)}</span>
          <span>${topic.crossPlatform} PLATFORM</span>
        </div>
        <div class="topic-title-row">
          <h3>${escapeHtml(topic.title)}</h3>
          <button type="button" data-action="detail" data-topic-id="${escapeHtml(topic.id)}" title="查看选题详情">
            <svg><use href="#icon-chevron"></use></svg>
            <span class="sr-only">查看${escapeHtml(topic.title)}详情</span>
          </button>
        </div>
        <p class="topic-brief">${escapeHtml(topic.brief)}</p>
        <div class="platform-row">${platforms}</div>
      </div>
      <div class="topic-score">
        <div class="priority-score">
          <span>PRIORITY</span>
          <strong>${escapeHtml(topic.priority)}</strong>
        </div>
        <div class="score-bars">
          ${scoreBar("热度", topic.heat, "#ffb21a")}
          ${scoreBar("深度", topic.mathFit, "#fe2c55")}
          ${scoreBar("画面", topic.visualFit, "#2388ff")}
        </div>
      </div>
    </article>
  `;
}

function openTopicDetail(topicId) {
  const topic = state.data.topics.find((item) => item.id === topicId);
  if (!topic) return;
  elements.dialogEyebrow.textContent = `${String(topic.rank).padStart(2, "0")} / ${topic.category}`;
  elements.dialogTitle.textContent = topic.title;

  const sources =
    topic.sources?.length > 0
      ? topic.sources
          .map(
            (source) => `
              <a class="detail-source" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">
                <span>${escapeHtml(source.name)} · ${escapeHtml(source.type)}</span>
                <svg><use href="#icon-arrow-up-right"></use></svg>
              </a>
            `,
          )
          .join("")
      : `<p>等待每日数据任务补充权威来源。</p>`;

  elements.dialogBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail-metric"><span>综合优先级</span><strong>${topic.priority}</strong></div>
      <div class="detail-metric"><span>跨平台信号</span><strong>${topic.crossPlatform}</strong></div>
      <div class="detail-metric"><span>事实状态</span><strong>${topic.factStatus === "verified" ? "已核验" : "待核验"}</strong></div>
    </div>
    <section class="detail-section">
      <h3>传播判断</h3>
      <p>${escapeHtml(topic.brief)}</p>
    </section>
    <section class="detail-section">
      <h3>开场钩子</h3>
      <ul>${topic.hooks.map((hook) => `<li>${escapeHtml(hook)}</li>`).join("")}</ul>
    </section>
    <section class="detail-section">
      <h3>可讲角度</h3>
      <ul>${topic.mathAngles.map((angle) => `<li>${escapeHtml(angle)}</li>`).join("")}</ul>
    </section>
    <section class="detail-section">
      <h3>建议结构</h3>
      <p><strong>${escapeHtml(topic.recommendedFormat.duration)}</strong> · ${escapeHtml(topic.recommendedFormat.structure)}</p>
    </section>
    <section class="detail-section">
      <h3>事实来源</h3>
      <div class="detail-source-list">${sources}</div>
    </section>
  `;
  elements.topicDialog.showModal();
}


function bindEvents() {
  elements.refreshButton.addEventListener("click", () => loadData({announce: true}));
  elements.rawSearch.addEventListener("input", () => {
    state.rawLimit = 12;
    renderRawHotlist();
  });
  elements.rawPlatformTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-raw-platform]");
    if (!button) return;
    state.selectedRawPlatform = button.dataset.rawPlatform;
    state.rawLimit = 12;
    renderRawHotlist();
  });
  elements.rawLoadMore.addEventListener("click", () => {
    state.rawLimit += 12;
    renderRawHotlist();
  });
  elements.topicSearch.addEventListener("input", renderTopics);
  elements.platformFilter.addEventListener("change", renderTopics);
  elements.urgencyFilter.addEventListener("change", renderTopics);
  elements.sortFilter.addEventListener("change", renderTopics);

  elements.categoryFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.selectedCategory = button.dataset.category;
    renderCategories();
    renderTopics();
  });

  elements.topicList.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="detail"]');
    if (!button) return;
    openTopicDetail(button.dataset.topicId);
  });

  elements.closeDialogButton.addEventListener("click", () => elements.topicDialog.close());

  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.jump}`)?.scrollIntoView({behavior: "smooth"});
      document
        .querySelectorAll("[data-jump]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });

  elements.topicDialog.addEventListener("click", (event) => {
    if (event.target === elements.topicDialog) elements.topicDialog.close();
  });
}

bindEvents();
loadData();
