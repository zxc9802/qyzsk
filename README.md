This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### GPT-6 模型配置

聊天模型列表中的 `GPT-6` 调用 OpenLux 的 `gpt-6-astra`，与 GPT-5.6 共用服务端配置：

```dotenv
OPENLUX_API_BASE_URL=https://api.openlux.ai
OPENLUX_API_KEY=填写现有GPT-5.6使用的Key
```

如果 GPT-5.6 已配置可用，无需新增环境变量，也无需修改默认模型。部署新版后，管理员可直接使用 GPT-6；普通员工需由管理员在主站后台的“起芽知识库机器人”模型权限中勾选 `GPT-6`，主站也需部署支持该权限的新版。GPT-6 沿用 GPT-5.6 的应用上下文压缩预算。

### OpenLux 用量上报

知识库使用已验证会话或服务端任务的主站用户 ID，将每次 OpenLux 模型请求的状态和实际 Token 上报至主站 `POST /api/sso/usage`。来源工具固定为 `kb-chat`，使用服务端 `x-usage-tool` 和 `x-usage-secret` 请求头鉴权。

知识库部署环境需配置：

```dotenv
MAIN_APP_URL=https://your-main-site.example.com
USAGE_MONITOR_INTERNAL_SECRET=replace-with-at-least-32-random-characters
```

主站部署环境的 `SSO_USAGE_SECRETS` JSON 中，增加 `"kb-chat"` 键，其值必须与知识库的 `USAGE_MONITOR_INTERNAL_SECRET` 完全一致，且至少 32 个字符；保留已有其它工具的键。密钥只放服务端环境变量，不使用 `NEXT_PUBLIC_*`。两端部署配置均生效后才能接收上报。

- `USAGE_MONITOR_URL` 留空时使用 `MAIN_APP_URL + /api/sso/usage`。若显式地址的路径以 `/api/internal/usage-events`（可带末尾 `/`）结尾，仅 OpenLux 上报自动改为 `/api/sso/usage`，保留原域名、路径前缀和查询参数。其它自定义 URL 保持原值，但必须支持上述 SSO 协议。
- 仅实际上游请求域名为 `api.openlux.ai` 时进入新上报；覆盖聊天回复、问题诊断、上下文压缩、报告、知识导入/发布、媒体解析、上传向量化及检索向量化。即使配置项名称是 `YUNWU_*` 或 `NEWAPI_*`，也按实际 URL 判断。云雾等实际域名保持原有行为。
- 上报不包含 API Key、提示词、回复正文、图片或金额。缺失 Token 为 `null`，真实零值为 `0`；输入包含缓存，输出包含推理，总量为输入加输出。Anthropic 输入的独立缓存桶只加一次。
- 每次实际上游请求独立 UUID；投递重试复用 UUID。调用开始为 `pending`，成功为 `completed`，网络失败或流中断分别为 `failed`/`interrupted`。上游未返回 Token 也记录调用，图片按次模型可由主站计价。缺少单价（例如 `gemini-embedding-2-preview`）显示待核算。
- 启用现有 `DATABASE_URL` 时自动创建 `kb_chat_usage_outbox` 表。否则队列写入 `.kb-chat-data/usage-outbox`，可设置 `USAGE_MONITOR_OUTBOX_DIR=/持久化目录/kb-usage`；文件目录必须位于持久卷、非公开目录，多实例共享存储。无持久磁盘的部署应配置数据库。
- 元数据先持久化，投递失败继续保留；后续模型调用会补报，每批最多 20 条、投递总时限约 8 秒。闲置时可在已加载部署环境变量的终端运行 `npm run usage:retry`，也可由现有调度器定期执行。主站必须返回 JSON `success: true` 才确认接收。
- 先部署支持 `pending` 的新版主站，再部署知识库。无需新增 API Key；上报共享密钥与 OpenLux API Key 不同。历史没有记录的调用无法凭空补算。进程被终止时的 `pending` 不自动视为成功；磁盘/数据库不可写会输出服务端日志，需要恢复存储。
- 本地调试身份及命令行全库重建没有已验证员工会话，不会冒用员工计费。网页上传、发布和检索的调用正常按操作员工上报。

### Wiki Admin

The app now supports a `Wiki 优先 / 仅 KB` knowledge mode toggle in chat and a dedicated admin review console at `/admin`.

To enable the admin APIs, add a `WIKI_ADMIN_TOKEN` value to your local `.env`:

```bash
WIKI_ADMIN_TOKEN=change-me
```

Then open `/admin`, paste the same token into the page, and you can:

- ingest candidate knowledge into draft
- edit / approve / reject wiki drafts
- run wiki lint checks for broken links, isolated pages, and stale pages

Published wiki pages are stored under `wiki/`. Drafts, raw sources, and index cache are stored under `.kb-chat-data/wiki/`.

### Knowledge Retrieval

The chat route now supports two knowledge strategies:

- `Wiki 优先`: prefer published wiki pages and backfill with KB entries
- `仅 KB`: skip wiki and use the existing KB retrieval path

The assistant UI also shows which `Wiki / KB / 资料` sources were used for each answer.

### Vector RAG

The project now includes an optional Phase 1 vector retrieval path for published Wiki pages and KB entries.

- current status: semantic retrieval is a fallback for `Wiki 优先` when keyword recall is weak
- recommended stack: `text-embedding-3-large` with `RAG_EMBEDDING_DIMENSIONS=1024`
- recommended vector store: Postgres with `pgvector`

Minimal setup:

```bash
DATABASE_URL=postgres://...
RAG_ENABLED=true
RAG_OPENAI_API_KEY=sk-...
RAG_EMBEDDING_MODEL=text-embedding-3-large
RAG_EMBEDDING_DIMENSIONS=1024
```

Then in your Postgres database run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Finally, build the initial Wiki and KB vector indexes:

```bash
npm run rag:reindex-wiki
npm run rag:reindex-kb
```

Notes:

- the current implementation indexes `published wiki pages` and KB `triggerQuestions`
- vector retrieval is intentionally a fallback, not a replacement for the current keyword/wiki flow
- if RAG is not configured, the app keeps using the existing retrieval logic

### Main Site SSO

This project can now be mounted as a protected bot behind your main website login flow, similar to the `seedance-main` project.

Add the following env vars before deploying:

```bash
MAIN_APP_URL=https://your-main-site.example.com
MAIN_APP_KB_CHAT_ENTRY_PATH=/bot/kb-chat
MAIN_APP_KB_CHAT_SSO_EXCHANGE_PATH=/api/kb-chat-sso/exchange
REQUIRE_MAIN_APP_SSO=true
KB_CHAT_SESSION_SECRET=replace-with-a-long-random-secret
```

Behavior:

- direct visits to this app will be redirected to `MAIN_APP_URL + MAIN_APP_KB_CHAT_ENTRY_PATH`
- after the main site authenticates the user, it should redirect back to this app with a `ticket` query param
- this app exchanges that `ticket` against `MAIN_APP_KB_CHAT_SSO_EXCHANGE_PATH`, writes its own signed session cookie, then redirects to the returned `redirectPath`
- if the session expires, API calls return `401` with `redirectUrl`, and the frontend sends the user back to the main site automatically

Expected exchange response from the main site:

```json
{
  "success": true,
  "data": {
    "token": "signed-or-random-session-token",
    "user": {
      "id": "u_123",
      "account": "demo",
      "email": "demo@example.com",
      "nickname": "Demo User"
    },
    "redirectPath": "/"
  }
}
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# 聊天记录分享

在对话中点击「分享聊天记录」，勾选用户或助手消息，也可全选、取消全选或取消。生成后可复制链接，接收者无需登录即可查看。

- 创建分享使用主站 SSO 会话并实时校验账号，只能选择当前账号已保存的对话消息。未启用 SSO 的本地调试身份不能创建公共链接。
- 链接使用 256 位随机令牌。只保存所选消息，保持原对话顺序；标题固定，不公开用户身份、原对话标题、知识库引用详情或诊断数据。
- 文字及所选图片、视频保存为独立快照，后续编辑或删除原对话不会改变分享内容。当前不提供撤销或自动过期。
- 单次最多 200 条消息、1 MB 文字、单个媒体 20 MB、媒体合计 50 MB；不支持的媒体格式会提示错误。
- 配置 `DATABASE_URL` 时自动创建 `kb_chat_shares` 表；否则保存到现有 `.kb-chat-data/shares` 目录。文件部署需持久化该目录，多实例部署需共用数据库。
- 公共页面为 `/share/<token>`，仅该页面及分享媒体接口绕过 SSO。页面禁止索引并禁用引用来源信息。

可选数据库集成测试：将 `KB_CHAT_SHARE_TEST_DATABASE_URL` 指向本机名称含 `test` 的 PostgreSQL 或 PGlite 测试数据库，再运行 `npm test -- lib/server/chat-share-store.postgres.test.ts`。该测试创建随机测试账号记录并按记录 ID 清理，不删除表；未设置该变量时默认跳过。
