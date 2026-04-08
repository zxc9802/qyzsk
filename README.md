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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
