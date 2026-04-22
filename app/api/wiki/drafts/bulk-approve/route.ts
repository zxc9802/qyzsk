import { NextRequest } from "next/server";
import { assertWikiAdminAccess, wikiAdminAuthErrorResponse } from "@/lib/server/wiki-admin-auth";
import { applyWikiDraftAction } from "@/lib/server/wiki-review";

export const runtime = "nodejs";

type BulkApproveItem = {
  draftId?: string;
  title?: string;
  category?: string;
  summary?: string;
  roles?: string[];
  sourceIds?: string[];
  relatedPages?: string[];
  relations?: unknown;
  content?: string;
  notes?: string;
};

export async function POST(req: NextRequest) {
  try {
    await assertWikiAdminAccess(req);
  } catch (error) {
    return wikiAdminAuthErrorResponse(error, req);
  }

  try {
    const body = await req.json();
    const drafts = Array.isArray(body.drafts) ? (body.drafts as BulkApproveItem[]) : [];

    if (drafts.length === 0) {
      return new Response(JSON.stringify({ error: "没有可批量通过的草稿。" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const approvedDrafts = [];
    for (const item of drafts) {
      if (!item.draftId) {
        return new Response(JSON.stringify({ error: "批量通过请求缺少 draftId。" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const approvedDraft = await applyWikiDraftAction(item.draftId, "approve", item);
      approvedDrafts.push(approvedDraft);
    }

    return new Response(
      JSON.stringify({
        approvedCount: approvedDrafts.length,
        drafts: approvedDrafts,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Wiki 草稿不存在。") {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.error("Wiki bulk approve error:", error);
    return new Response(JSON.stringify({ error: "批量通过 Wiki 草稿失败。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
