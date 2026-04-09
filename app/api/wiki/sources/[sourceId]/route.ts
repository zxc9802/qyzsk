import { NextRequest } from "next/server";
import { assertWikiAdminAccess, wikiAdminAuthErrorResponse } from "@/lib/server/wiki-admin-auth";
import { readWikiSourceRecord, updateWikiSourceRecord } from "@/lib/server/wiki-store";
import type { WikiSourceStatus } from "@/lib/wiki-types";

type SourceUpdatePayload = {
  title?: string;
  content?: string;
  status?: unknown;
};

function isWikiSourceStatus(value: unknown): value is WikiSourceStatus {
  return value === "drafted" || value === "approved" || value === "rejected";
}

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ sourceId: string }> }
) {
  try {
    await assertWikiAdminAccess(req);
  } catch (error) {
    return wikiAdminAuthErrorResponse(error, req);
  }

  try {
    const { sourceId } = await context.params;
    const body = (await req.json()) as SourceUpdatePayload;
    const existingSource = await readWikiSourceRecord(sourceId);

    if (!existingSource) {
      return new Response(JSON.stringify({ error: "KB 资料不存在。" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const updatedSource = await updateWikiSourceRecord(sourceId, (current) => ({
      ...current,
      title: typeof body.title === "string" ? body.title.trim() || current.title : current.title,
      content: typeof body.content === "string" ? body.content.trim() || current.content : current.content,
      status: isWikiSourceStatus(body.status) ? body.status : current.status,
    }));

    return new Response(JSON.stringify({ source: updatedSource }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Wiki source update error:", error);
    return new Response(JSON.stringify({ error: "更新 KB 资料失败。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
