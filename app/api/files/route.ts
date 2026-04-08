import { after, NextRequest } from "next/server";
import {
  createPendingFileRecord,
  deleteConversationFile,
  deleteConversationFiles,
  listConversationFiles,
  setConversationFileActive,
  toClientConversationFile,
} from "@/lib/server/file-store";
import {
  FILE_LIMITS,
  formatBytes,
  inferUploadKind,
} from "@/lib/server/file-processing";
import {
  cancelConversationProcessing,
  cancelFileProcessing,
  enqueueFileProcessingJobs,
} from "@/lib/server/processing-queue";
import { appSessionErrorResponse, assertAppSession } from "@/lib/server/app-session";

export const runtime = "nodejs";
export const maxDuration = 300;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getConversationId(request: NextRequest): string {
  return new URL(request.url).searchParams.get("conversationId")?.trim() || "";
}

function getFileId(request: NextRequest): string {
  return new URL(request.url).searchParams.get("fileId")?.trim() || "";
}

function normalizeMimeType(file: File): string {
  if (file.type) return file.type;

  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export async function GET(req: NextRequest) {
  try {
    await assertAppSession(req);
  } catch (error) {
    return appSessionErrorResponse(error, req);
  }

  const conversationId = getConversationId(req);
  if (!conversationId) {
    return json({ error: "Missing conversationId" }, 400);
  }

  const files = await listConversationFiles(conversationId);
  return json({ files: files.map(toClientConversationFile) });
}

export async function POST(req: NextRequest) {
  try {
    await assertAppSession(req);
  } catch (error) {
    return appSessionErrorResponse(error, req);
  }

  const formData = await req.formData();
  const conversationId = String(formData.get("conversationId") || "").trim();

  if (!conversationId) {
    return json({ error: "Missing conversationId" }, 400);
  }

  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0) {
    return json({ error: "No files uploaded" }, 400);
  }

  for (const file of files) {
    const mimeType = normalizeMimeType(file);
    const kind = inferUploadKind(file.name, mimeType);

    if (!kind) {
      return json({
        error: `暂不支持 ${file.name} 这个文件类型。当前 MVP 仅支持 PDF / Word / MP4 / PNG / JPG。`,
      }, 400);
    }

    if (file.size > FILE_LIMITS[kind]) {
      return json({
        error: `${file.name} 太大了。当前 ${kind === "video" ? "视频" : kind === "image" ? "图片" : "文档"} 上限是 ${formatBytes(FILE_LIMITS[kind])}。`,
      }, 400);
    }
  }

  const pendingFileIds: string[] = [];

  for (const file of files) {
    const mimeType = normalizeMimeType(file);
    const kind = inferUploadKind(file.name, mimeType);
    if (!kind) continue;

    const buffer = Buffer.from(await file.arrayBuffer());
    const pendingRecord = await createPendingFileRecord({
      conversationId,
      fileName: file.name,
      mimeType,
      size: file.size,
      kind,
      buffer,
    });
    pendingFileIds.push(pendingRecord.id);
  }

  const pendingFiles = await listConversationFiles(conversationId);

  after(async () => {
    await enqueueFileProcessingJobs(conversationId, pendingFileIds);
  });

  return json({ files: pendingFiles.map(toClientConversationFile) });
}

export async function PATCH(req: NextRequest) {
  try {
    await assertAppSession(req);
  } catch (error) {
    return appSessionErrorResponse(error, req);
  }

  const { conversationId, fileId, active } = await req.json();

  if (!conversationId || !fileId || typeof active !== "boolean") {
    return json({ error: "Missing conversationId, fileId, or active" }, 400);
  }

  const files = await setConversationFileActive(conversationId, fileId, active);
  return json({ files: files.map(toClientConversationFile) });
}

export async function DELETE(req: NextRequest) {
  try {
    await assertAppSession(req);
  } catch (error) {
    return appSessionErrorResponse(error, req);
  }

  const conversationId = getConversationId(req);
  if (!conversationId) {
    return json({ error: "Missing conversationId" }, 400);
  }

  const fileId = getFileId(req);
  if (fileId) {
    cancelFileProcessing(fileId);
    await deleteConversationFile(conversationId, fileId);
    const files = await listConversationFiles(conversationId);
    return json({ files: files.map(toClientConversationFile) });
  }

  cancelConversationProcessing(conversationId);
  await deleteConversationFiles(conversationId);
  return json({ ok: true });
}
