import { assertAppSession, getAppSessionUserId } from "@/lib/server/app-session";
import { createChatShare } from "@/lib/server/chat-share-store";
import { ChatShareError } from "@/lib/server/chat-share-media";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  let userId: string | null;
  try {
    userId = getAppSessionUserId(await assertAppSession(request));
    if (!userId) return json({ error: "请先从主官网登录后再分享。" }, 401);
  } catch {
    return json({ error: "登录已失效，请重新从主官网进入。" }, 401);
  }
  const origin = request.headers.get("origin");
  let sameOrigin = true;
  if (origin) {
    try {
      const source = new URL(origin);
      // Host retains the public domain behind the existing TLS reverse proxy.
      sameOrigin = ["http:", "https:"].includes(source.protocol) && source.host === (request.headers.get("host") || new URL(request.url).host);
    } catch { sameOrigin = false; }
  }
  if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "分享请求来源无效。" }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "请求格式无效。" }, 415);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "请求格式无效。" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 40000) return json({ error: "请求过大。" }, 413);
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: "请求格式无效。" }, 400); }
    const token = await createChatShare(userId, body);
    return json({ path: `/share/${token}` }, 201);
  } catch (error) {
    if (error instanceof ChatShareError) return json({ error: error.message }, error.status);
    console.error("Chat share creation failed");
    return json({ error: "生成分享链接失败，请稍后重试。" }, 500);
  }
}
