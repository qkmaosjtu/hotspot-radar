# 热点雷达

聚合抖音、微博、知乎、小红书、百度和 B 站公开热点，为不同赛道的内容创作者
提供全量原榜浏览、数学巅峰赛编辑精选和每日 AI 选题建议。

## 在线访问

https://qkmaosjtu.github.io/hotspot-radar/

## 本地运行

```bash
python3 -m http.server 4173 --directory docs
```

浏览器打开 `http://localhost:4173/`。

## 数据结构

- `docs/data/raw-hotlists.json`：平台公开原榜快照，不按内容赛道过滤。
- `docs/data/daily-hotspots.json`：从全量原榜生成的数学巅峰赛编辑精选。
- `scripts/collect-hotlists.mjs`：每日公开榜单采集器。

GitHub Pages 由 `.github/workflows/pages.yml` 发布，静态网站入口位于 `docs/`。
