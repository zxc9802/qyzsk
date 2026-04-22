import { NextRequest } from "next/server";
import { appSessionErrorResponse, assertAppUserSession } from "@/lib/server/app-session";
import { approveIngestedWikiSource, ingestWikiSource } from "@/lib/server/wiki-drafts";
import { readWikiSourceRecord } from "@/lib/server/wiki-store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { user } = await assertAppUserSession(req);
    const isAdmin = user?.role === "admin";
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
      submittedBy: user || undefined,
    });

    if (isAdmin) {
      const approvedDrafts = await approveIngestedWikiSource(result);
      const approvedSource = await readWikiSourceRecord(result.source.id);

      return new Response(
        JSON.stringify({
          ...result,
          source: approvedSource || {
            ...result.source,
            status: "approved",
          },
          draft: approvedDrafts[0] || result.draft,
          drafts: approvedDrafts,
          approvedDrafts,
          autoApproved: true,
          message: `管理员提交的知识已直接发布，共处理 ${approvedDrafts.length} 条页面提案。`,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        ...result,
        autoApproved: false,
        message: `已生成 ${result.drafts.length} 条待审核页面提案。`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AppSessionUnauthorizedError") {
      return appSessionErrorResponse(error, req);
    }
    console.error("Wiki ingest error:", error);
    return new Response(JSON.stringify({ error: "提交知识失败。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
