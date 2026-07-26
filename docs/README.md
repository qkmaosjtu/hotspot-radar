# 热点雷达前端

这是一个无需构建步骤的 GitHub Pages 静态站点。

## 本地预览

在仓库根目录运行：

```bash
python3 -m http.server 4173 --directory docs
```

然后访问 `http://localhost:4173`。

## 每日数据入口

页面读取两个互相独立的数据层：

```text
docs/data/raw-hotlists.json
docs/data/daily-hotspots.json
```

`raw-hotlists.json` 是六个平台公开榜单的原始快照，采集阶段不得按任何
用户赛道删减条目。数据契约见 `docs/data/raw-hotlists.schema.json`。

`daily-hotspots.json` 是从原始快照派生出的“创作者编辑精选”，用于保留
通用内容策划工作流，数据契约见 `docs/data/schema.json`。

往日创作精选保存在：

```text
docs/data/archive/YYYY-MM-DD-daily-hotspots.json
docs/data/archive/index.json
```

`index.json` 只保存日期、文件名和选题数量；页面根据用户选择的日期按需读取
对应归档，不把全部历史数据塞进首屏请求。

本地 Codex 定时任务应当每天 `12:00 Asia/Shanghai` 先完整重写原榜快照，
再生成编辑精选，并完成以下工作：

1. 原榜层保存每个平台公开可获取的全部条目、原始排名、热度值和直达链接。
2. 采集受限时使用 `partial`、`stale` 或 `error`，禁止用精选条目冒充全榜。
3. 原榜快照写入 `docs/data/archive/YYYY-MM-DD-raw-hotlists.json`，保留可审计历史。
4. 用户赛道匹配发生在原榜数据保存之后，不能反向影响采集覆盖。
5. 为创作精选计算内容深度、视觉表现力、生活关联度和推荐优先级。
6. 热榜只用于发现需求；事实内容必须写入 `sources` 并标记 `factStatus`。
7. 两个文件都先写临时文件并通过 JSON 校验后再原子替换正式文件。
8. 精选正式文件通过校验后复制为当天的 `YYYY-MM-DD-daily-hotspots.json`，
   并更新 `archive/index.json`；索引按日期倒序排列，不得覆盖往日归档。

## 安全边界

公开站点不提供运行时模型调用，也不接收或保存任何模型密钥。每日创作精选由
本地 Codex 定时任务预先生成并写入静态 JSON，浏览器只负责读取和展示结果。

## 发布

`.github/workflows/pages.yml` 会把 `docs/` 作为 GitHub Pages artifact 发布。
仓库创建后，需要在 GitHub 的 **Settings → Pages → Source** 中选择
**GitHub Actions**。
