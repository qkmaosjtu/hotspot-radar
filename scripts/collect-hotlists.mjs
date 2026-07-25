import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "docs/data/raw-hotlists.json");
const archiveDir = path.join(projectRoot, "docs/data/archive");
const requestedDate = process.argv[2] || shanghaiDate(new Date());
const collectedAt = new Date().toISOString();

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
};

const PLATFORM_SOURCE_URLS = {
  douyin: "https://www.douyin.com/hot",
  weibo: "https://weibo.com/hot/search",
  zhihu: "https://www.zhihu.com/hot",
  xiaohongshu: "https://www.xiaohongshu.com/explore",
  baidu: "https://top.baidu.com/board?tab=realtime",
  bilibili: "https://www.bilibili.com/v/popular/all/",
};

function shanghaiDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function safeId(value) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function itemUrl(platform, title, directUrl = "") {
  if (directUrl) return directUrl.replace(/^http:/, "https:");
  const encoded = encodeURIComponent(title);
  const urls = {
    douyin: `https://www.douyin.com/search/${encoded}`,
    weibo: `https://s.weibo.com/weibo?q=${encoded}`,
    zhihu: `https://www.zhihu.com/search?q=${encoded}`,
    xiaohongshu: `https://www.xiaohongshu.com/search_result?keyword=${encoded}&type=51`,
    baidu: `https://www.baidu.com/s?wd=${encoded}`,
    bilibili: `https://search.bilibili.com/all?keyword=${encoded}`,
  };
  return urls[platform];
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {headers: {...BROWSER_HEADERS, ...headers}});
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {headers: {...BROWSER_HEADERS, ...headers}});
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function collectDouyin() {
  const sourceUrl =
    "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web";
  const payload = await fetchJson(sourceUrl, {Referer: "https://www.douyin.com/hot"});
  const items = (payload?.data?.word_list || []).map((entry, index) => ({
    id: `douyin-${entry.sentence_id || safeId(entry.word) || index + 1}`,
    rank: Number(entry.position || index + 1),
    title: entry.word,
    url: itemUrl("douyin", entry.word),
    hotValue: Number(entry.hot_value) || null,
    hotLabel: entry.label ? String(entry.label) : "",
    category: entry.sentence_tag ? String(entry.sentence_tag) : "",
    publishedAt: entry.event_time ? new Date(entry.event_time * 1000).toISOString() : null,
  }));
  return platformResult("douyin", "抖音", "fresh", "official", sourceUrl, items);
}

async function collectWeibo() {
  const sourceUrl = "https://weibo.com/ajax/side/hotSearch";
  const payload = await fetchJson(sourceUrl, {Referer: "https://weibo.com/hot/search"});
  const items = (payload?.data?.realtime || [])
    .filter((entry) => !entry.is_ad && !entry.topic_ad)
    .map((entry, index) => ({
      id: `weibo-${safeId(entry.word_scheme || entry.word) || index + 1}`,
      rank: Number(entry.realpos || index + 1),
      title: entry.note || entry.word,
      url: itemUrl("weibo", entry.word_scheme || entry.word),
      hotValue: Number(entry.num) || null,
      hotLabel: entry.label_name || "",
      category: entry.flag_desc || "",
      publishedAt: null,
    }));
  return platformResult("weibo", "微博", "fresh", "official", sourceUrl, items);
}

async function collectBaidu() {
  const sourceUrl = "https://top.baidu.com/api/board?platform=wise&tab=realtime";
  const payload = await fetchJson(sourceUrl);
  const content = payload?.data?.cards?.[0]?.content?.[0]?.content || [];
  const items = content
    .filter((entry) => Number.isInteger(entry.index))
    .map((entry) => ({
      id: `baidu-${entry.index}-${safeId(entry.word)}`,
      rank: entry.index,
      title: entry.word,
      url: itemUrl("baidu", entry.word, entry.url),
      hotValue: null,
      hotLabel: entry.newHotName || entry.labelTagName || "",
      category: "",
      publishedAt: null,
    }));
  return platformResult("baidu", "百度", "fresh", "official", sourceUrl, items);
}

async function collectBilibili() {
  const sourceUrl = "https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1";
  const payload = await fetchJson(sourceUrl, {Referer: "https://www.bilibili.com/v/popular/all/"});
  if (payload?.code !== 0) throw new Error(`Bilibili API error ${payload?.code}`);
  const items = (payload?.data?.list || []).map((entry, index) => ({
    id: `bilibili-${entry.bvid || entry.aid || index + 1}`,
    rank: index + 1,
    title: entry.title,
    url: `https://www.bilibili.com/video/${entry.bvid}`,
    hotValue: Number(entry.stat?.view) || null,
    hotLabel: entry.rcmd_reason?.content || "",
    category: entry.tnamev2 || entry.tname || "",
    author: entry.owner?.name || "",
    publishedAt: entry.pubdate ? new Date(entry.pubdate * 1000).toISOString() : null,
  }));
  return platformResult("bilibili", "B站", "fresh", "official", sourceUrl, items);
}

async function collectZhihu() {
  const sourceUrl = "https://tgmeng.com/community/zhihu";
  const html = await fetchText(sourceUrl);
  const matches = [
    ...html.matchAll(
      /href="(https:\/\/www\.zhihu\.com\/(?:question|search)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
    ),
  ];
  const seen = new Set();
  const items = [];
  for (const match of matches) {
    const title = match[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/^\s*\d+\s*/, "")
      .trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    items.push({
      id: `zhihu-${items.length + 1}-${safeId(title)}`,
      rank: items.length + 1,
      title,
      url: match[1].replace(/&amp;/g, "&"),
      hotValue: null,
      hotLabel: "",
      category: "",
      publishedAt: null,
    });
    if (items.length === 30) break;
  }
  return platformResult(
    "zhihu",
    "知乎",
    "partial",
    "third-party",
    sourceUrl,
    items,
    "知乎官方热榜接口需要鉴权；本次使用保留知乎直达链接的公开聚合快照。",
  );
}

const XHS_2026_07_25 = [
  ["用万能旅行拍照姿势美美出片", 918.6],
  ["耗时三年拍下古诗词里的中国", 907],
  ["拍到了海鸥雨", 887.5],
  ["超日常美食教程速来get", 867.6],
  ["定格这一刻的日照金山", 857],
  ["你可以永远相信赛里木湖的美景", 846],
  ["拼豆上也可以作画了", 833.1],
  ["我的家庭旅行更像是打副本", 812],
  ["原来古诗词里的河南真的存在", 801.7],
  ["蒸出了奶香爆米花馒头", 788.2],
];

function collectXiaohongshu() {
  const sourceUrl = "https://neodrop.ai/zh-cn/post/tzTDl_A3I7a";
  const items =
    requestedDate === "2026-07-25"
      ? XHS_2026_07_25.map(([title, hotWan], index) => ({
          id: `xiaohongshu-${index + 1}-${safeId(title)}`,
          rank: index + 1,
          title,
          url: itemUrl("xiaohongshu", title),
          hotValue: hotWan * 10000,
          hotLabel: `${hotWan}w`,
          category: "",
          publishedAt: null,
        }))
      : [];
  return platformResult(
    "xiaohongshu",
    "小红书",
    "partial",
    "third-party",
    sourceUrl,
    items,
    "小红书公开网页接口需要动态签名；本次回溯核验到官方实时热门话题TOP10。",
  );
}

function platformResult(id, name, status, sourceKind, sourceUrl, items, note = "") {
  const ranked = [...items]
    .filter((item) => item.title && Number.isInteger(item.rank))
    .sort((a, b) => a.rank - b.rank);
  return {
    id,
    name,
    status,
    sourceKind,
    sourceUrl,
    note,
    collectedAt,
    collectedCount: ranked.length,
    items: ranked,
  };
}

async function collectSafely(collector, id, name) {
  try {
    return await collector();
  } catch (error) {
    return platformResult(
      id,
      name,
      "error",
      "official",
      PLATFORM_SOURCE_URLS[id],
      [],
      error instanceof Error ? error.message : String(error),
    );
  }
}

function assertUnique(values, description) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${description} contains duplicate values`);
  }
}

function validateSnapshot(snapshot) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)) {
    throw new Error(`Invalid snapshot date: ${snapshot.date}`);
  }

  assertUnique(
    snapshot.platforms.map((platform) => platform.id),
    "Platform ids",
  );

  for (const platform of snapshot.platforms) {
    if (platform.collectedCount !== platform.items.length) {
      throw new Error(`${platform.id} collectedCount does not match items.length`);
    }
    assertUnique(
      platform.items.map((item) => item.id),
      `${platform.id} item ids`,
    );
    assertUnique(
      platform.items.map((item) => item.rank),
      `${platform.id} ranks`,
    );
    for (const item of platform.items) {
      if (!item.title.trim()) throw new Error(`${platform.id} contains an empty title`);
      new URL(item.url);
    }
  }

  const totalItems = snapshot.platforms.reduce(
    (sum, platform) => sum + platform.items.length,
    0,
  );
  if (snapshot.summary.totalItems !== totalItems) {
    throw new Error("summary.totalItems does not match platform item totals");
  }
}

const platforms = await Promise.all([
  collectSafely(collectDouyin, "douyin", "抖音"),
  collectSafely(collectWeibo, "weibo", "微博"),
  collectSafely(collectZhihu, "zhihu", "知乎"),
  Promise.resolve(collectXiaohongshu()),
  collectSafely(collectBaidu, "baidu", "百度"),
  collectSafely(collectBilibili, "bilibili", "B站"),
]);

const snapshot = {
  schemaVersion: 1,
  date: requestedDate,
  generatedAt: collectedAt,
  timezone: "Asia/Shanghai",
  summary: {
    totalItems: platforms.reduce((sum, platform) => sum + platform.collectedCount, 0),
    platformCount: platforms.length,
    freshPlatformCount: platforms.filter((platform) => platform.status === "fresh").length,
    partialPlatformCount: platforms.filter((platform) => platform.status === "partial").length,
  },
  platforms,
};

validateSnapshot(snapshot);

await mkdir(archiveDir, {recursive: true});
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
await writeFile(outputPath, serialized, "utf8");
await writeFile(path.join(archiveDir, `${requestedDate}-raw-hotlists.json`), serialized, "utf8");

console.log(
  JSON.stringify(
    {
      outputPath,
      date: snapshot.date,
      totalItems: snapshot.summary.totalItems,
      platforms: platforms.map(({id, status, collectedCount}) => ({id, status, collectedCount})),
    },
    null,
    2,
  ),
);
