import { promises as fs } from "node:fs";
import type { ChatMediaItem } from "@/lib/types";
import { getFileRecord } from "@/lib/server/file-store";
import { getCosAccessUrl } from "@/lib/server/cos";
import { readWikiMediaRecord } from "@/lib/server/wiki-media";

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const SAFE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "video/mp4", "video/webm", "video/ogg"]);

export class ChatShareError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type SharedMediaSnapshot = {
  kind: "image" | "video";
  name: string;
  caption?: string;
  mimeType: string;
  data: string;
};

export async function snapshotChatMedia(userId: string, conversationId: string, item: ChatMediaItem): Promise<SharedMediaSnapshot> {
  // Resolve from server records, never fetch a URL supplied by a message/client.
  const record = item.source === "file"
    ? await getFileRecord(userId, conversationId, item.id)
    : await readWikiMediaRecord(item.id);
  if (!record || record.id !== item.id || ("userId" in record && (record.userId !== userId || record.conversationId !== conversationId))) {
    throw new ChatShareError("所选消息的媒体不存在或无权分享。", 400);
  }
  if ((record.kind !== "image" && record.kind !== "video") || !SAFE_MIME_TYPES.has(record.mimeType)) {
    throw new ChatShareError("所选消息包含暂不支持分享的媒体格式。");
  }
  const tooLarge = () => new ChatShareError("单个分享媒体不能超过 20 MB，请减少所选消息。", 413);
  if (record.size > MAX_MEDIA_BYTES) throw tooLarge();

  let buffer: Buffer;
  if (record.remoteKey) {
    const response = await fetch(await getCosAccessUrl(record.remoteKey), { signal: AbortSignal.timeout(30000), redirect: "error" });
    if (!response.ok || !response.body) throw new ChatShareError("读取分享媒体失败，请稍后重试。", 502);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_MEDIA_BYTES) throw tooLarge();
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    buffer = Buffer.concat(chunks);
  } else {
    if ((await fs.stat(record.storagePath)).size > MAX_MEDIA_BYTES) throw tooLarge();
    buffer = await fs.readFile(record.storagePath);
  }
  if (buffer.byteLength > MAX_MEDIA_BYTES) throw tooLarge();
  return {
    kind: record.kind,
    name: item.name,
    ...(item.caption ? { caption: item.caption } : {}),
    mimeType: record.mimeType,
    data: buffer.toString("base64"),
  };
}
