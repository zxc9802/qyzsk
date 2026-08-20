import { after } from "next/server";
import { NextRequest } from "next/server";
import { appSessionErrorResponse, assertAppUserSession } from "@/lib/server/app-session";
import { createProcessingWikiSource, describeQueuedIngest, runWikiIngestJob } from "@/lib/server/wiki-ingest-job";

export const runtime = "nodejs";
export const maxDuration = 300;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readIngestInput(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    const buffers = await Promise.all(
      files.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    );
    return {
      title: String(formData.get("title") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      modelId: String(formData.get("modelId") || "").trim() || undefined,
      files: buffers,
    };
  }

  const body = await req.json();
  return {
    title: typeof body.title === "string" ? body.title.trim() : "",
    content: typeof body.content === "string" ? body.content.trim() : "",
    modelId: typeof body.modelId === "string" ? body.modelId.trim() : undefined,
    files: [] as Array<{ fileName: string; mimeType: string; size: number; buffer: Buffer }>,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await assertAppUserSession(req);
    const isAdmin = user?.role === "admin";
    const input = await readIngestInput(req);

    if (!input.content && input.files.length === 0) {
      return json({ error: "请填写资料内容，或上传文档、图片、视频。" }, 400);
    }

    const source = await createProcessingWikiSource({
      title: input.title,
      content: input.content,
      submittedBy: user || undefined,
      files: input.files,
    });

    after(async () => {
      try {
        await runWikiIngestJob({
          sourceId: source.id,
          title: source.title,
          content: input.content,
          modelId: input.modelId,
          submittedBy: user || undefined,
          files: input.files,
          autoApprove: isAdmin,
        });
      } catch (error) {
        console.error("Wiki ingest background job failed:", source.id, error);
      }
    });

    return json({
      source,
      processing: true,
      autoApproved: isAdmin,
      message: describeQueuedIngest(source, isAdmin),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AppSessionUnauthorizedError") {
      return appSessionErrorResponse(error, req);
    }
    console.error("Wiki ingest error:", error);
    const message = error instanceof Error && error.message ? error.message : "提交知识失败。";
    return json({ error: message }, 500);
  }
}
