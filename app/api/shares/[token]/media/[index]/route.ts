import { getSharedMedia } from "@/lib/server/chat-share-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string; index: string }> }) {
  const { token, index } = await context.params;
  const media = await getSharedMedia(token, index);
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (!media) return new Response("分享媒体不存在。", { status: 404, headers });
  return new Response(new Uint8Array(media.buffer), {
    headers: { ...headers, "Content-Type": media.mimeType, "Content-Length": String(media.buffer.length) },
  });
}
