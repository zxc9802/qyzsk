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
