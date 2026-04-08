import { NextRequest } from "next/server";
import { appSessionErrorResponse, assertAppUserSession } from "@/lib/server/app-session";
import {
  listWikiDraftsBySubmitter,
  listWikiSourceRecordsBySubmitter,
} from "@/lib/server/wiki-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { userId, user } = await assertAppUserSession(req);
    const [drafts, sources] = await Promise.all([
      listWikiDraftsBySubmitter(userId),
      listWikiSourceRecordsBySubmitter(userId),
    ]);

    const sortedDrafts = drafts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return new Response(
      JSON.stringify({
        user,
        stats: {
          totalSubmissions: sortedDrafts.length,
          pendingCount: sortedDrafts.filter((draft) => draft.status === "draft").length,
          approvedCount: sortedDrafts.filter((draft) => draft.status === "approved").length,
          rejectedCount: sortedDrafts.filter((draft) => draft.status === "rejected").length,
          rawSourceCount: sources.length,
          lastUpdatedAt: sortedDrafts[0]?.updatedAt || null,
        },
        drafts: sortedDrafts,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AppSessionUnauthorizedError") {
      return appSessionErrorResponse(error, req);
    }

    console.error("Wiki publisher overview error:", error);
    return new Response(JSON.stringify({ error: "读取知识发布台数据失败。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
