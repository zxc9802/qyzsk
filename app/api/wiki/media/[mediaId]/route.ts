import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { NextRequest } from "next/server";
import { Readable } from "stream";
import { appSessionErrorResponse, assertAppUserSession } from "@/lib/server/app-session";
import { readWikiMediaRecord } from "@/lib/server/wiki-media";

export const runtime = "nodejs";

function notFound() {
  return new Response(JSON.stringify({ error: "媒体不存在。" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ mediaId: string }> }
) {
  try {
    await assertAppUserSession(req);
  } catch (error) {
    return appSessionErrorResponse(error, req);
  }

  const { mediaId } = await context.params;
  const record = await readWikiMediaRecord(mediaId);
  if (!record) return notFound();

  const variant = new URL(req.url).searchParams.get("variant");
  const filePath = variant === "poster" ? record.posterPath : record.storagePath;
  if (!filePath) return notFound();

  try {
    const fileStat = await stat(filePath);
    const mimeType =
      variant === "poster"
        ? "image/jpeg"
        : record.mimeType || "application/octet-stream";

    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return notFound();
  }
}
