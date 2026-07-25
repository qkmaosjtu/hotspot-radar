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

本地 Codex 定时任务应当每天 `12:00 Asia/Shanghai` 先完整重写原榜快照，
再生成编辑精选，并完成以下工作：

1. 原榜层保存每个平台公开可获取的全部条目、原始排名、热度值和直达链接。
2. 采集受限时使用 `partial`、`stale` 或 `error`，禁止用精选条目冒充全榜。
3. 原榜快照写入 `docs/data/archive/YYYY-MM-DD-raw-hotlists.json`，保留可审计历史。
4. 用户赛道匹配发生在原榜数据保存之后，不能反向影响采集覆盖。
5. 为创作精选计算内容深度、视觉表现力、生活关联度和推荐优先级。
6. 热榜只用于发现需求；事实内容必须写入 `sources` 并标记 `factStatus`。
7. 两个文件都先写临时文件并通过 JSON 校验后再原子替换正式文件。

## 模型问答

默认模式完全在浏览器本地运行，不需要 API Key。

模型增强模式支持：

- OpenRouter 免费模型路由：`openrouter/free`
- 自定义 OpenAI 兼容接口

GitHub Pages 无法安全保存共享密钥。当前实现采用 BYOK，密钥只保存在
`sessionStorage`，关闭标签页后自动清除。面向公众开放时，应将模型调用迁移到
Cloudflare Worker、Vercel Function 或其他具有速率限制的服务端代理。

## 发布

`.github/workflows/pages.yml` 会把 `docs/` 作为 GitHub Pages artifact 发布。
仓库创建后，需要在 GitHub 的 **Settings → Pages → Source** 中选择
**GitHub Actions**。
