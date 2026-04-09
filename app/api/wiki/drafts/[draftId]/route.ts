import { NextRequest } from "next/server";
import { assertWikiAdminAccess, wikiAdminAuthErrorResponse } from "@/lib/server/wiki-admin-auth";
import { applyWikiDraftAction, type WikiDraftAction } from "@/lib/server/wiki-review";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ draftId: string }> }
) {
  try {
    await assertWikiAdminAccess(req);
  } catch (error) {
    return wikiAdminAuthErrorResponse(error, req);
  }

  try {
    const { draftId } = await context.params;
    const body = await req.json();
    const action = body.action as WikiDraftAction;
    const nextDraft = await applyWikiDraftAction(draftId, action, body);

    return new Response(JSON.stringify({ draft: nextDraft }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Wiki 草稿不存在。") {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.error("Wiki draft update error:", error);
    return new Response(JSON.stringify({ error: "更新 Wiki 草稿失败。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
