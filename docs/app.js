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
  duration: "2–3分钟",
  recommendations: [],
  chatHistory: [],
  toastTimer: null,
  settings: {
    provider: sessionStorage.getItem("radar-provider") || "local",
    endpoint:
      sessionStorage.getItem("radar-endpoint") ||
      "https://openrouter.ai/api/v1/chat/completions",
    model: sessionStorage.getItem("radar-model") || "openrouter/free",
    apiKey: sessionStorage.getItem("radar-api-key") || "",
  },
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
  recommendForm: document.querySelector("#recommendForm"),
  laneInput: document.querySelector("#laneInput"),
  durationControl: document.querySelector("#durationControl"),
  goalSelect: document.querySelector("#goalSelect"),
  generateButton: document.querySelector("#generateButton"),
  assistantModeLabel: document.querySelector("#assistantModeLabel"),
  assistantModeNote: document.querySelector("#assistantModeNote"),
  recommendationList: document.querySelector("#recommendationList"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  chatLog: document.querySelector("#chatLog"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  providerSelect: document.querySelector("#providerSelect"),
  endpointField: document.querySelector("#endpointField"),
  endpointInput: document.querySelector("#endpointInput"),
  modelField: document.querySelector("#modelField"),
  modelInput: document.querySelector("#modelInput"),
  keyField: document.querySelector("#keyField"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
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
  renderAssistantMode();
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

function semanticBoost(topic, lane) {
  const normalized = lane.toLowerCase();
  const hints = [
    {terms: ["数学", "公式", "模型"], fields: ["mathFit"], weight: 9},
    {terms: ["生活", "普通人", "日常", "消费"], fields: ["lifeFit"], weight: 11},
    {terms: ["物理", "工程", "航天"], categories: ["生活物理", "航天工程", "天气气候"], weight: 12},
    {terms: ["科技", "ai", "人工智能"], categories: ["科技生活", "AI产业"], weight: 12},
    {terms: ["天气", "气候", "台风"], categories: ["天气气候"], weight: 15},
    {terms: ["财经", "投资", "消费"], categories: ["消费金融", "金融数学"], weight: 12},
    {terms: ["人物", "科学家", "历史"], categories: ["科学人物"], weight: 12},
  ];

  let boost = 0;
  const topicText = [topic.title, topic.category, ...(topic.keywords || [])]
    .join(" ")
    .toLowerCase();
  const laneTerms = normalized
    .split(/[\s，。、“”‘’；：,.;:/|]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  laneTerms.forEach((term) => {
    if (topicText.includes(term)) boost += 5;
  });

  hints.forEach((hint) => {
    if (!hint.terms.some((term) => normalized.includes(term))) return;
    if (hint.categories?.includes(topic.category)) boost += hint.weight;
    if (hint.fields?.includes("mathFit")) boost += (topic.mathFit / 100) * hint.weight;
    if (hint.fields?.includes("lifeFit")) boost += (topic.lifeFit / 100) * hint.weight;
  });

  return Math.min(boost, 28);
}

const LANE_HINTS = {
  美妆: ["美妆", "护肤", "口红", "妆", "脸", "发型", "穿搭", "美容"],
  母婴: ["母婴", "育儿", "亲子", "宝宝", "婴儿", "孩子", "家庭"],
  游戏: ["游戏", "电竞", "lpl", "blg", "手游", "端游", "恋与深空", "三角洲"],
  汽车: ["汽车", "新能源", "电车", "车型", "驾驶", "车主", "召回"],
  旅游: ["旅游", "旅行", "景区", "景点", "酒店", "航班", "避暑", "徒步"],
  美食: ["美食", "做饭", "食物", "咖啡", "馒头", "泡面", "餐厅", "奶香"],
  财经: ["财经", "投资", "股票", "黄金", "利率", "公司", "股价", "罚款"],
  科技: ["科技", "数码", "ai", "人工智能", "手机", "芯片", "机器人"],
  体育: ["体育", "足球", "篮球", "乒乓", "世界杯", "比赛", "运动员"],
  娱乐: ["娱乐", "明星", "影视", "综艺", "剧集", "演唱会", "电影"],
  教育: ["教育", "学习", "考试", "学校", "学生", "英语", "志愿"],
};

function laneTerms(lane) {
  const normalized = lane.toLowerCase();
  const directTerms = normalized
    .split(/[\s，。、“”‘’；：,.;:/|]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  Object.entries(LANE_HINTS).forEach(([label, hints]) => {
    if (normalized.includes(label.toLowerCase())) directTerms.push(...hints);
  });
  return [...new Set(directTerms)];
}

function normalizeHotTitle(title) {
  return String(title)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"'《》【】#\s，。！？、：；,.!?:;（）()]/g, "")
    .replace(/如何看待|如何评价|为什么|是真的吗|有哪些信息值得关注/g, "");
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

function rawLaneMatchCount(item, terms) {
  const text = `${item.title} ${item.category || ""} ${item.author || ""}`.toLowerCase();
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function rawLaneScore(item, terms) {
  const directMatch = rawLaneMatchCount(item, terms) * 24;
  const rankScore = Math.max(0, 101 - item.rank * 2);
  const freshnessPenalty = item.sourceStatus === "fresh" ? 0 : 4;
  return directMatch + rankScore - freshnessPenalty;
}

function getRawCandidates(lane, limit = 30) {
  const terms = laneTerms(lane);
  const ranked = rawItems()
    .map((item) => ({
      ...item,
      laneMatchCount: rawLaneMatchCount(item, terms),
      candidateScore: rawLaneScore(item, terms),
    }))
    .sort((a, b) => b.candidateScore - a.candidateScore || a.rank - b.rank);
  const matched = ranked.filter((item) => item.laneMatchCount > 0);
  const candidatePool = matched.length ? matched : ranked;
  const selected = [];
  for (const item of candidatePool) {
    const normalized = normalizeHotTitle(item.title);
    const duplicate = selected.some((existing) => {
      const other = normalizeHotTitle(existing.title);
      return normalized === other || (Math.min(normalized.length, other.length) >= 8 &&
        (normalized.includes(other) || other.includes(normalized)));
    });
    if (!duplicate) selected.push(item);
    if (selected.length === limit) break;
  }
  return selected;
}

function getLocalRecommendations(lane, duration, goal) {
  if (state.rawData?.platforms?.length) {
    return getRawCandidates(lane, 3).map((item) => ({
      topicId: `raw:${item.platformId}:${item.id}`,
      title: item.title,
      hook: `${item.platformName}原榜第${item.rank}：${item.title}`,
      angles: [item.platformName, item.category || "热点解读"].filter(Boolean),
      outline: "原榜信号 → 赛道关联 → 核心冲突 → 可执行内容结构",
      duration,
      score: Math.min(100, Math.round(item.candidateScore)),
      reason: `${item.platformName}原榜第${item.rank}，已从全量原榜中按“${lane}”检索；创作目标为${goal}。`,
    }));
  }
  const goalWeights = {
    破圈传播: {visual: 0.17, life: 0.12, math: 0.11},
    专业可信: {visual: 0.08, life: 0.06, math: 0.26},
    长期搜索: {visual: 0.1, life: 0.2, math: 0.14},
    快速追热点: {visual: 0.13, life: 0.07, math: 0.12},
  };
  const weights = goalWeights[goal] || goalWeights.破圈传播;

  return state.data.topics
    .map((topic) => {
      const urgencyBonus =
        goal === "快速追热点"
          ? topic.urgency === "now"
            ? 12
            : topic.urgency === "today"
              ? 6
              : 0
          : topic.urgency === "now"
            ? 4
            : 0;
      const score =
        topic.priority * 0.38 +
        topic.heat * 0.1 +
        topic.questionDensity * 0.08 +
        topic.visualFit * weights.visual +
        topic.lifeFit * weights.life +
        topic.mathFit * weights.math +
        semanticBoost(topic, lane) +
        urgencyBonus;

      return {
        topicId: topic.id,
        title: topic.title,
        hook: topic.hooks?.[0] || topic.title,
        mathAngles: topic.mathAngles?.slice(0, 2) || [],
        outline: topic.recommendedFormat?.structure || "",
        duration,
        score: Math.round(score),
        reason: buildLocalReason(topic, lane, goal),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function buildLocalReason(topic, lane, goal) {
  const signals = [];
  if (topic.crossPlatform >= 5) signals.push(`${topic.crossPlatform}个平台共振`);
  if (topic.visualFit >= 92) signals.push("视觉冲突强");
  if (topic.mathFit >= 92) signals.push("解释空间充足");
  if (topic.lifeFit >= 90) signals.push("普通人关联高");
  if (topic.urgency === "now") signals.push("热点窗口正在打开");
  const laneMatch = semanticBoost(topic, lane) >= 8 ? "与你的赛道描述匹配" : "可迁移到你的叙事方式";
  return `${laneMatch}；${signals.slice(0, 3).join("、") || "数据结构完整"}，适合以“${goal}”为目标制作。`;
}

function renderRecommendations(recommendations, modelName = "") {
  state.recommendations = recommendations;
  if (!recommendations.length) {
    elements.recommendationList.innerHTML = `
      <div class="assistant-placeholder">
        <strong>暂时没有足够匹配的结果</strong>
        <span>尝试扩大赛道描述，或切换为本地推荐模式。</span>
      </div>
    `;
    return;
  }

  elements.recommendationList.innerHTML = recommendations
    .map(
      (item, index) => `
        <article class="recommendation-item">
          <div class="recommendation-index">
            <span>OPTION ${String(index + 1).padStart(2, "0")}</span>
            <span>${escapeHtml(item.duration || state.duration)}${modelName ? ` · ${escapeHtml(modelName)}` : ""}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="recommendation-hook">${escapeHtml(item.hook)}</p>
          <p class="recommendation-reason">${escapeHtml(item.reason)}</p>
          <div class="topic-tags">
            ${(item.angles || item.mathAngles || [])
              .map((angle) => `<span>${escapeHtml(angle)}</span>`)
              .join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function compactTopic(topic) {
  return {
    id: topic.id,
    title: topic.title,
    brief: topic.brief,
    category: topic.category,
    urgency: topic.urgency,
    heat: topic.heat,
    crossPlatform: topic.crossPlatform,
    mathFit: topic.mathFit,
    visualFit: topic.visualFit,
    lifeFit: topic.lifeFit,
    questionDensity: topic.questionDensity,
    priority: topic.priority,
    platforms: topic.platforms.map(({id, rank, trend}) => ({id, rank, trend})),
    mathAngles: topic.mathAngles,
    hooks: topic.hooks,
    factStatus: topic.factStatus,
  };
}

function compactRawCandidate(item) {
  return {
    id: `raw:${item.platformId}:${item.id}`,
    title: item.title,
    platform: item.platformId,
    platformName: item.platformName,
    rank: item.rank,
    hotValue: item.hotValue,
    hotLabel: item.hotLabel,
    category: item.category,
    sourceStatus: item.sourceStatus,
    url: item.url,
  };
}

async function callModel(messages, {json = false} = {}) {
  const {provider, endpoint, model, apiKey} = state.settings;
  if (provider === "local") {
    throw new Error("当前使用本地推荐模式");
  }
  if (!endpoint || !model || !apiKey) {
    throw new Error("请先在模型设置中填写接口、模型和 API Key");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.href,
      "X-Title": "热点雷达",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: json ? 1600 : 900,
      messages,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `模型请求失败：HTTP ${response.status}`;
    throw new Error(message);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型没有返回可读取的内容");
  return {content, model: payload.model || model};
}

function parseJsonResponse(content) {
  const stripped = String(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("模型未返回有效 JSON");
  }
  return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
}

async function generateWithModel(lane, duration, goal) {
  const context = getRawCandidates(lane, 30).map(compactRawCandidate);
  const systemPrompt = [
    "你是一名短视频选题主编。",
    "你只能依据提供的今日平台原榜候选进行推荐，不得虚构榜单名次、热度或事实。",
    "选题必须优先匹配用户赛道，再考虑热点窗口、内容冲突、视觉表现和事实核验边界。",
    "除非用户赛道明确要求，不要强行加入数学、物理或数据模型。",
    "请返回严格 JSON，不要使用 Markdown。",
    '格式：{"recommendations":[{"topicId":"原始ID","title":"标题","hook":"前三秒钩子","reason":"推荐理由","angles":["角度1","角度2"],"outline":"分镜结构","duration":"时长"}]}',
    "只返回三个推荐。",
  ].join("\n");
  const userPrompt = [
    `用户赛道：${lane}`,
    `目标时长：${duration}`,
    `创作目标：${goal}`,
    `数据日期：${state.data.date}`,
    `今日热点数据：${JSON.stringify(context)}`,
  ].join("\n\n");

  const response = await callModel(
    [
      {role: "system", content: systemPrompt},
      {role: "user", content: userPrompt},
    ],
    {json: true},
  );
  const parsed = parseJsonResponse(response.content);
  if (!Array.isArray(parsed.recommendations)) {
    throw new Error("模型返回结果缺少 recommendations");
  }
  return {
    recommendations: parsed.recommendations.slice(0, 3),
    model: response.model,
  };
}

function setGenerating(isGenerating) {
  elements.generateButton.disabled = isGenerating;
  elements.generateButton.querySelector("span").textContent = isGenerating
    ? "正在分析今日数据…"
    : "生成今天适合更新的话题";
}

async function handleRecommendationSubmit(event) {
  event.preventDefault();
  if (!state.data) return;
  const lane = elements.laneInput.value.trim();
  if (!lane) return;
  const goal = elements.goalSelect.value;
  setGenerating(true);

  try {
    if (state.settings.provider === "local") {
      const recommendations = getLocalRecommendations(lane, state.duration, goal);
      renderRecommendations(recommendations);
      showToast("已根据今日数据完成本地推荐");
    } else {
      const result = await generateWithModel(lane, state.duration, goal);
      renderRecommendations(result.recommendations, result.model);
      showToast(`已由 ${result.model} 完成推荐`);
    }
  } catch (error) {
    const fallback = getLocalRecommendations(lane, state.duration, goal);
    renderRecommendations(fallback);
    showToast(`${error.message}，已自动使用本地推荐`, "error");
  } finally {
    setGenerating(false);
  }
}

function appendChat(role, content) {
  state.chatHistory.push({role, content});
  state.chatHistory = state.chatHistory.slice(-10);
  elements.chatLog.innerHTML = state.chatHistory
    .map(
      (message) =>
        `<div class="chat-message is-${message.role}">${escapeHtml(message.content)}</div>`,
    )
    .join("");
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function localChatAnswer(question) {
  const query = question.toLowerCase();
  let topic = null;
  const recommendedRawId = state.recommendations.find((item) => item.topicId?.startsWith("raw:"))
    ?.topicId;
  const rawTopic = recommendedRawId
    ? rawItems().find(
        (item) => `raw:${item.platformId}:${item.id}` === recommendedRawId,
      )
    : null;

  if (rawTopic) {
    if (query.includes("标题")) {
      return `建议标题：${rawTopic.title}\n开场可直接引用：${rawTopic.platformName}原榜第${rawTopic.rank}`;
    }
    if (query.includes("来源") || query.includes("排名")) {
      return `${rawTopic.platformName}原榜第${rawTopic.rank}：${rawTopic.title}\n来源：${rawTopic.url}`;
    }
    return `“${rawTopic.title}”位于${rawTopic.platformName}原榜第${rawTopic.rank}。它来自全量原榜检索，请围绕你的赛道“${
      elements.laneInput.value || "未指定"
    }”确定内容角度，并在发布前核验事件事实。`;
  }

  if (query.includes("第一") && state.recommendations[0]?.topicId) {
    topic = state.data.topics.find((item) => item.id === state.recommendations[0].topicId);
  }
  if (!topic) {
    topic = state.data.topics.find((item) => {
      const text = [item.title, ...(item.keywords || [])].join(" ").toLowerCase();
      return question
        .split(/[\s，。！？、,.;!?]+/)
        .filter((term) => term.length >= 2)
        .some((term) => text.includes(term.toLowerCase()));
    });
  }
  if (!topic && state.recommendations[0]?.topicId) {
    topic = state.data.topics.find((item) => item.id === state.recommendations[0].topicId);
  }
  topic ||= state.data.topics[0];

  if (query.includes("标题")) {
    return `建议标题：${topic.title}\n备选钩子：${topic.hooks?.[0] || topic.title}`;
  }
  if (query.includes("分镜") || query.includes("结构")) {
    return `建议结构：${topic.recommendedFormat.structure}\n目标时长：${topic.recommendedFormat.duration}`;
  }
  if (query.includes("公式") || query.includes("数学")) {
    return `这期可展开的数学主线：\n${topic.mathAngles.map((item) => `· ${item}`).join("\n")}`;
  }
  return `“${topic.title}”当前优先级为 ${topic.priority}，覆盖 ${topic.crossPlatform} 个平台，内容深度 ${topic.mathFit}，视觉表现力 ${topic.visualFit}。${buildLocalReason(
    topic,
    elements.laneInput.value || "知识科普",
    elements.goalSelect.value,
  )}`;
}

async function answerWithModel(question) {
  const context = getRawCandidates(elements.laneInput.value || question, 30).map(
    compactRawCandidate,
  );
  const recommendations = state.recommendations.slice(0, 3);
  const messages = [
    {
      role: "system",
      content:
        "你是短视频选题数据助手。只能依据提供的数据回答；数字必须来自数据；区分热点线索和已核验事实；回答简洁、可执行。",
    },
    {
      role: "user",
      content: `今日数据：${JSON.stringify(context)}\n当前推荐：${JSON.stringify(recommendations)}`,
    },
    ...state.chatHistory.slice(0, -2).slice(-6),
    {role: "user", content: question},
  ];
  return callModel(messages);
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const question = elements.chatInput.value.trim();
  if (!question || !state.data) return;
  elements.chatInput.value = "";
  appendChat("user", question);

  if (state.settings.provider === "local") {
    appendChat("assistant", localChatAnswer(question));
    return;
  }

  try {
    appendChat("assistant", "正在查询今日数据…");
    const loadingIndex = state.chatHistory.length - 1;
    const response = await answerWithModel(question);
    state.chatHistory[loadingIndex] = {role: "assistant", content: response.content};
    elements.chatLog.innerHTML = state.chatHistory
      .map(
        (message) =>
          `<div class="chat-message is-${message.role}">${escapeHtml(message.content)}</div>`,
      )
      .join("");
    elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
  } catch (error) {
    const fallback = localChatAnswer(question);
    state.chatHistory[state.chatHistory.length - 1] = {
      role: "assistant",
      content: `${fallback}\n\n模型连接失败，以上为本地数据回答。`,
    };
    elements.chatLog.innerHTML = state.chatHistory
      .map(
        (message) =>
          `<div class="chat-message is-${message.role}">${escapeHtml(message.content)}</div>`,
      )
      .join("");
    showToast(error.message, "error");
  }
}

function updateSettingsFields() {
  const provider = elements.providerSelect.value;
  const usesModel = provider !== "local";
  elements.endpointField.hidden = !usesModel;
  elements.modelField.hidden = !usesModel;
  elements.keyField.hidden = !usesModel;
  if (provider === "openrouter") {
    elements.endpointInput.value = "https://openrouter.ai/api/v1/chat/completions";
    if (!elements.modelInput.value) elements.modelInput.value = "openrouter/free";
  }
}

function openSettings() {
  elements.providerSelect.value = state.settings.provider;
  elements.endpointInput.value = state.settings.endpoint;
  elements.modelInput.value = state.settings.model;
  elements.apiKeyInput.value = state.settings.apiKey;
  updateSettingsFields();
  elements.settingsDialog.showModal();
}

function saveSettings(event) {
  event.preventDefault();
  const provider = elements.providerSelect.value;
  state.settings = {
    provider,
    endpoint:
      provider === "openrouter"
        ? "https://openrouter.ai/api/v1/chat/completions"
        : elements.endpointInput.value.trim(),
    model: elements.modelInput.value.trim() || "openrouter/free",
    apiKey: elements.apiKeyInput.value.trim(),
  };
  sessionStorage.setItem("radar-provider", state.settings.provider);
  sessionStorage.setItem("radar-endpoint", state.settings.endpoint);
  sessionStorage.setItem("radar-model", state.settings.model);
  if (state.settings.apiKey) {
    sessionStorage.setItem("radar-api-key", state.settings.apiKey);
  } else {
    sessionStorage.removeItem("radar-api-key");
  }
  renderAssistantMode();
  elements.settingsDialog.close();
  showToast(
    provider === "local"
      ? "已切换为本地推荐模式"
      : `已连接 ${state.settings.model}，密钥仅用于当前标签页`,
  );
}

function renderAssistantMode() {
  const {provider, model, apiKey} = state.settings;
  if (provider === "local") {
    elements.assistantModeLabel.textContent = "本地推荐模式";
    const itemCount = state.rawData?.summary?.totalItems || 0;
    elements.assistantModeNote.textContent = `无需密钥，检索今日 ${itemCount} 条原榜`;
    return;
  }
  elements.assistantModeLabel.textContent =
    provider === "openrouter" ? "OpenRouter 免费模型" : "自定义模型接口";
  elements.assistantModeNote.textContent = apiKey
    ? `${model} · 当前标签页有效`
    : `${model} · 尚未填写 Key`;
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
  elements.closeSettingsButton.addEventListener("click", () => elements.settingsDialog.close());
  elements.settingsButton.addEventListener("click", openSettings);
  elements.providerSelect.addEventListener("change", updateSettingsFields);
  elements.settingsForm.addEventListener("submit", saveSettings);
  elements.recommendForm.addEventListener("submit", handleRecommendationSubmit);
  elements.chatForm.addEventListener("submit", handleChatSubmit);

  elements.durationControl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-value]");
    if (!button) return;
    state.duration = button.dataset.value;
    elements.durationControl
      .querySelectorAll("[data-value]")
      .forEach((item) => item.classList.toggle("is-active", item === button));
  });

  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.jump}`)?.scrollIntoView({behavior: "smooth"});
      document
        .querySelectorAll("[data-jump]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });

  [elements.topicDialog, elements.settingsDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

}

bindEvents();
renderAssistantMode();
loadData();
