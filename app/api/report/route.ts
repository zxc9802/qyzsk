import { NextRequest } from "next/server";
import type { ReportGenerationRequest } from "@/lib/report";
import { appSessionErrorResponse, assertAppSession } from "@/lib/server/app-session";
import { buildConversationReport } from "@/lib/server/report-builder";

export const runtime = "nodejs";

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidReportRequest(body: unknown): body is ReportGenerationRequest {
  return Boolean(
    body &&
      typeof body === "object" &&
      "conversationId" in body &&
      typeof body.conversationId === "string" &&
      "conversationTitle" in body &&
      typeof body.conversationTitle === "string" &&
      "messages" in body &&
      Array.isArray(body.messages) &&
      "roleId" in body &&
      typeof body.roleId === "string" &&
      "roleName" in body &&
      typeof body.roleName === "string" &&
      "modelId" in body &&
      typeof body.modelId === "string" &&
      "answerMode" in body &&
      (body.answerMode === "deep" || body.answerMode === "simple")
  );
}

export async function POST(req: NextRequest) {
  try {
    try {
      await assertAppSession(req);
    } catch (error) {
      return appSessionErrorResponse(error, req);
    }

    const body = await req.json();

    if (!isValidReportRequest(body)) {
      return createJsonResponse({ error: "报告生成请求缺少必要字段。" }, 400);
    }

    const report = await buildConversationReport(body);
    return createJsonResponse({ report }, 200);
  } catch (error) {
    console.error("Report API error:", error);
    return createJsonResponse({ error: "生成报告失败，请稍后重试。" }, 500);
  }
}
