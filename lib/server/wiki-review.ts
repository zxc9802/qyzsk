import type { WikiDraft, WikiSourceRecord } from "@/lib/wiki-types";
import { buildApprovedPageFromDraft } from "@/lib/server/wiki-drafts";
import {
  appendWikiLog,
  isWikiCategory,
  readPublishedPage,
  readWikiDraft,
  updateWikiDraft,
  updateWikiSourceRecord,
  writePublishedPage,
} from "@/lib/server/wiki-store";

export type WikiDraftAction = "approve" | "reject" | "save";

export type WikiDraftUpdatePayload = {
  title?: string;
  category?: unknown;
  summary?: string;
  roles?: unknown;
  relatedPages?: unknown;
  sourceIds?: unknown;
  content?: string;
  notes?: string;
};

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : undefined;
}

function applyDraftPatch(draft: WikiDraft, action: WikiDraftAction, body: WikiDraftUpdatePayload): WikiDraft {
  return {
    ...draft,
    title: typeof body.title === "string" ? body.title.trim() || draft.title : draft.title,
    category: isWikiCategory(body.category) ? body.category : draft.category,
    summary: typeof body.summary === "string" ? body.summary.trim() || draft.summary : draft.summary,
    roles: normalizeStringList(body.roles) || draft.roles,
    relatedPages: normalizeStringList(body.relatedPages) || draft.relatedPages,
    sourceIds: normalizeStringList(body.sourceIds) || draft.sourceIds,
    content: typeof body.content === "string" ? body.content.trim() || draft.content : draft.content,
    notes: typeof body.notes === "string" ? body.notes.trim() : draft.notes,
    status:
      action === "reject"
        ? "rejected"
        : action === "approve"
          ? "approved"
          : draft.status,
  };
}

async function markSourceStatus(sourceId: string, status: WikiSourceRecord["status"]) {
  await updateWikiSourceRecord(sourceId, (current) => ({
    ...current,
    status,
  }));
}

export async function applyWikiDraftAction(
  draftId: string,
  action: WikiDraftAction,
  body: WikiDraftUpdatePayload
) {
  const draft = await readWikiDraft(draftId);

  if (!draft) {
    throw new Error("Wiki 草稿不存在。");
  }

  const nextDraft = await updateWikiDraft(draftId, (current) => applyDraftPatch(current, action, body));

  if (action === "approve") {
    const basePage = buildApprovedPageFromDraft(nextDraft);
    const existingPage = await readPublishedPage(basePage.id);
    const page = existingPage
      ? {
          ...basePage,
          createdAt: existingPage.createdAt,
          version: existingPage.version + 1,
        }
      : basePage;
    await writePublishedPage(page);
    await markSourceStatus(nextDraft.sourceId, "approved");
    await appendWikiLog(`approve | ${page.id}\n- 来源草稿：${nextDraft.id}`);
  } else if (action === "reject") {
    await markSourceStatus(nextDraft.sourceId, "rejected");
    await appendWikiLog(`reject | ${nextDraft.id}\n- 标题：${nextDraft.title}`);
  }

  return nextDraft;
}
