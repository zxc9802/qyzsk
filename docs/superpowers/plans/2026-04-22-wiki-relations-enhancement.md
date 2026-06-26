# Wiki Relations Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typed wiki page relations that improve retrieval guidance, linting, and admin editing without breaking existing `relatedPages` behavior.

**Architecture:** Extend wiki page metadata with a `relations` field, keep `relatedPages` as a compatibility projection, and use the typed relations only as lightweight navigation metadata during retrieval. Update admin flows so editors can maintain the richer relation graph while keeping published markdown pages backward-compatible.

**Tech Stack:** Next.js App Router, TypeScript, Node.js test runner, markdown frontmatter-backed wiki storage

---

### Task 1: Relation model and storage compatibility

**Files:**
- Modify: `lib/wiki-types.ts`
- Modify: `lib/server/wiki-store.ts`
- Test: `lib/server/wiki-store.test.ts`

- [ ] Write a failing storage test for relation parsing and serialization.
- [ ] Run the storage test and verify it fails for missing relation support.
- [ ] Add `WikiRelation` types plus markdown read/write compatibility that derives `relatedPages` from `relations`.
- [ ] Re-run the storage test and confirm it passes.

### Task 2: Relation-aware retrieval behavior

**Files:**
- Modify: `lib/server/retrieval-orchestrator.ts`
- Modify: `lib/server/wiki-search.ts`
- Test: `lib/server/retrieval-orchestrator.test.ts`

- [ ] Write a failing retrieval test showing related page summaries are included without expanding multiple full page bodies.
- [ ] Run the retrieval test and verify it fails for missing relation-aware context.
- [ ] Implement relation-priority helpers and summary-only related context expansion.
- [ ] Re-run the retrieval test and confirm it passes.

### Task 3: Relation editing flows

**Files:**
- Modify: `components/admin/WikiAdminShared.tsx`
- Modify: `app/admin/published/page.tsx`
- Modify: `app/admin/drafts/page.tsx`
- Modify: `app/api/wiki/pages/[...pageId]/route.ts`
- Modify: `app/api/wiki/drafts/[draftId]/route.ts`
- Modify: `app/api/wiki/drafts/bulk-approve/route.ts`
- Modify: `app/api/wiki/overview/route.ts`

- [ ] Add relation editor state and request payload handling with backward-compatible parsing.
- [ ] Surface relation editing in draft and published wiki admin screens.
- [ ] Make overview payloads include the richer relation data.

### Task 4: Relation-aware drafting and linting

**Files:**
- Modify: `lib/server/wiki-drafts.ts`
- Modify: `lib/server/wiki-review.ts`
- Modify: `app/api/wiki/lint/route.ts`

- [ ] Extend draft generation and approval paths so relations survive ingest/review.
- [ ] Add lint checks for broken relation targets and one-way links.
- [ ] Keep existing `relatedPages` checks working through the compatibility projection.

### Task 5: Verification

**Files:**
- Test: `lib/server/wiki-store.test.ts`
- Test: `lib/server/retrieval-orchestrator.test.ts`

- [ ] Run the targeted relation tests.
- [ ] Run the broader wiki/server test suite if the targeted tests pass.
- [ ] Summarize the shipped behavior and any remaining follow-up work.
