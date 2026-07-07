import { NextRequest } from "next/server";
import { assertWikiAdminAccess, wikiAdminAuthErrorResponse } from "@/lib/server/wiki-admin-auth";
import {
  getWikiAdminStats,
  listAdminVisiblePublishedPages,
  listWikiDrafts,
  listWikiSourceRecords,
} from "@/lib/server/wiki-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await assertWikiAdminAccess(req);
  } catch (error) {
    return wikiAdminAuthErrorResponse(error, req);
  }

  try {
    const [stats, drafts, sources, pages] = await Promise.all([
      getWikiAdminStats(),
      listWikiDrafts(),
      listWikiSourceRecords(),
      listAdminVisiblePublishedPages(),
    ]);

    return new Response(
      JSON.stringify({
        stats,
        drafts,
        sources,
        pages: pages
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map((page) => ({
            id: page.id,
            title: page.title,
            category: page.category,
            summary: page.summary,
            roles: page.roles,
            sourceIds: page.sourceIds,
            relatedPages: page.relatedPages,
            relations: page.relations,
            createdAt: page.createdAt,
            updatedAt: page.updatedAt,
            version: page.version,
            content: page.content,
          })),
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Wiki overview error:", error);
    return new Response(JSON.stringify({ error: "读取 Wiki 管理数据失败。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
