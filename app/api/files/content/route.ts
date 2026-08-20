import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { Readable } from "stream";
import { appSessionErrorResponse, assertAppUserSession } from "@/lib/server/app-session";
import { tryGetCosRedirectUrl } from "@/lib/server/cos";
import { getFileRecord } from "@/lib/server/file-store";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolvePosterPath(storagePath: string): Promise<string | null> {
  const frameDir = path.join(path.dirname(storagePath), "derived", "frames");
  try {
    const frames = (await fs.readdir(frameDir))
      .filter((name) => name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg"))
      .sort();
    return frames[0] ? path.join(frameDir, frames[0]) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  let userId = "";
  try {
    ({ userId } = await assertAppUserSession(req));
  } catch (error) {
    return appSessionErrorResponse(error, req);
  }

  const search = new URL(req.url).searchParams;
  const conversationId = search.get("conversationId")?.trim() || "";
  const fileId = search.get("fileId")?.trim() || "";
  const variant = search.get("variant")?.trim() || "";

  if (!conversationId || !fileId) {
    return json({ error: "Missing conversationId or fileId" }, 400);
  }

  const record = await getFileRecord(userId, conversationId, fileId);
  if (!record) {
    return json({ error: "文件不存在。" }, 404);
  }

  const remoteUrl = await tryGetCosRedirectUrl(variant === "poster" ? record.posterRemoteKey : record.remoteKey);
  if (remoteUrl) {
    return Response.redirect(remoteUrl, 302);
  }

  const filePath = variant === "poster" ? await resolvePosterPath(record.storagePath) : record.storagePath;
  if (!filePath) {
    return json({ error: "文件不存在。" }, 404);
  }

  try {
    const fileStat = await fs.stat(filePath);
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      headers: {
        "Content-Type": variant === "poster" ? "image/jpeg" : record.mimeType || "application/octet-stream",
        "Content-Length": String(fileStat.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return json({ error: "文件不存在。" }, 404);
  }
}
