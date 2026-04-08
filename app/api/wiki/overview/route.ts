import { assertWikiAdminAccess, wikiAdminAuthErrorResponse } from "@/lib/server/wiki-admin-auth";
import {
  getWikiStats,
  listPublishedPages,
  listWikiDrafts,
  listWikiSourceRecords,
} from "@/lib/server/wiki-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    await assertWikiAdminAccess();
  } catch (error) {
    return wikiAdminAuthErrorResponse(error instanceof Error ? error.message : "Wiki 管理权限校验失败。");
  }

  try {
    const [stats, drafts, sources, pages] = await Promise.all([
      getWikiStats(),
      listWikiDrafts(),
      listWikiSourceRecords(),
      listPublishedPages(),
    ]);

    return new Response(
      JSON.stringify({
        stats,
        drafts,
        sources,
        pages: pages
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 80)
          .map((page) => ({
            id: page.id,
            title: page.title,
            category: page.category,
            summary: page.summary,
            roles: page.roles,
            sourceIds: page.sourceIds,
            relatedPages: page.relatedPages,
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
