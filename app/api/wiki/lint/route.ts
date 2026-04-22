import { NextRequest } from "next/server";
import { assertWikiAdminAccess, wikiAdminAuthErrorResponse } from "@/lib/server/wiki-admin-auth";
import { listPublishedPages } from "@/lib/server/wiki-store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await assertWikiAdminAccess(req);
  } catch (error) {
    return wikiAdminAuthErrorResponse(error, req);
  }

  try {
    const pages = await listPublishedPages();
    const pageIdSet = new Set(pages.map((page) => page.id));
    const brokenLinks: string[] = [];
    const isolatedPages: string[] = [];
    const stalePages: string[] = [];
    const oneWayRelations: string[] = [];
    const referencedBy = new Map<string, string[]>();

    pages.forEach((page) => referencedBy.set(page.id, []));

    for (const page of pages) {
      for (const relatedPage of page.relatedPages) {
        if (!pageIdSet.has(relatedPage)) {
          brokenLinks.push(`${page.id} -> ${relatedPage}`);
          continue;
        }

        referencedBy.set(relatedPage, [...(referencedBy.get(relatedPage) || []), page.id]);
      }

      const updatedAt = new Date(page.updatedAt || page.createdAt || Date.now()).getTime();
      if (Date.now() - updatedAt > 1000 * 60 * 60 * 24 * 120) {
        stalePages.push(page.id);
      }
    }

    for (const page of pages) {
      for (const relation of page.relations) {
        const target = pages.find((candidate) => candidate.id === relation.targetId);
        if (!target) continue;

        const hasReverseRelation = target.relations.some((candidate) => candidate.targetId === page.id);
        if (!hasReverseRelation) {
          oneWayRelations.push(`${page.id} -[${relation.type}]-> ${relation.targetId}`);
        }
      }
    }

    for (const page of pages) {
      const inbound = referencedBy.get(page.id) || [];
      if (inbound.length === 0 && page.relatedPages.length === 0) {
        isolatedPages.push(page.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          publishedPages: pages.length,
          brokenLinkCount: brokenLinks.length,
          isolatedPageCount: isolatedPages.length,
          stalePageCount: stalePages.length,
          oneWayRelationCount: oneWayRelations.length,
        },
        brokenLinks,
        isolatedPages,
        stalePages,
        oneWayRelations,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Wiki lint error:", error);
    return new Response(JSON.stringify({ error: "执行 Wiki 巡检失败。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
