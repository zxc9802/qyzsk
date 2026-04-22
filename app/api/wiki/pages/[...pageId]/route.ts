import { NextRequest } from "next/server";
import { deriveRelatedPageIds, normalizeWikiRelations } from "@/lib/wiki-relations";
import { assertWikiAdminAccess, wikiAdminAuthErrorResponse } from "@/lib/server/wiki-admin-auth";
import { readPublishedPage, updatePublishedPage } from "@/lib/server/wiki-store";

type PageUpdatePayload = {
  title?: string;
  summary?: string;
  roles?: unknown;
  sourceIds?: unknown;
  relatedPages?: unknown;
  relations?: unknown;
  content?: string;
};

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : undefined;
}

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ pageId: string[] }> }
) {
  try {
    await assertWikiAdminAccess(req);
  } catch (error) {
    return wikiAdminAuthErrorResponse(error, req);
  }

  try {
    const { pageId } = await context.params;
    const resolvedPageId = Array.isArray(pageId) ? pageId.join("/") : "";
    const body = (await req.json()) as PageUpdatePayload;
    const existingPage = await readPublishedPage(resolvedPageId);

    if (!existingPage) {
      return new Response(JSON.stringify({ error: "Wiki 页面不存在。" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const normalizedRelations = normalizeWikiRelations(body.relations);
    const normalizedRelatedPages = normalizeStringList(body.relatedPages);

    const updatedPage = await updatePublishedPage(resolvedPageId, (current) => ({
      ...current,
      title: typeof body.title === "string" ? body.title.trim() || current.title : current.title,
      summary: typeof body.summary === "string" ? body.summary.trim() || current.summary : current.summary,
      roles: normalizeStringList(body.roles) || current.roles,
      sourceIds: normalizeStringList(body.sourceIds) || current.sourceIds,
      relations: normalizedRelations.length > 0 ? normalizedRelations : current.relations,
      relatedPages:
        normalizedRelations.length > 0
          ? deriveRelatedPageIds(normalizedRelations, normalizedRelatedPages || current.relatedPages)
          : normalizedRelatedPages || current.relatedPages,
      content: typeof body.content === "string" ? body.content.trim() || current.content : current.content,
    }));

    return new Response(JSON.stringify({ page: updatedPage }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Wiki page update error:", error);
    return new Response(JSON.stringify({ error: "更新 Wiki 页面失败。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
