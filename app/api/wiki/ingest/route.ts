import { NextRequest } from "next/server";
import { assertWikiAdminAccess, wikiAdminAuthErrorResponse } from "@/lib/server/wiki-admin-auth";
import { ingestWikiSource } from "@/lib/server/wiki-drafts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await assertWikiAdminAccess();
  } catch (error) {
    return wikiAdminAuthErrorResponse(error instanceof Error ? error.message : "Wiki 管理权限校验失败。");
  }

  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : undefined;

    if (!content) {
      return new Response(JSON.stringify({ error: "缺少资料内容。" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await ingestWikiSource({
      title: title || "未命名资料",
      content,
      modelId,
    });

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Wiki ingest error:", error);
    return new Response(JSON.stringify({ error: "生成 Wiki 草稿失败。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
