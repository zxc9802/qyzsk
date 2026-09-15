import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Message } from "@/lib/types";
import { sanitizeAssistantOutput } from "@/lib/sanitize-assistant-output";
import { getConversationRecord } from "@/lib/server/chat-state-store";
import { isDatabaseConfigured, withDbClient } from "@/lib/server/db";
import { STORAGE_ROOT } from "@/lib/server/file-store";
import { ChatShareError, snapshotChatMedia, type SharedMediaSnapshot } from "@/lib/server/chat-share-media";

type ShareSnapshot = {
  createdAt: number;
  messages: Array<{ role: "user" | "assistant"; content: string; media: number[] }>;
  media: SharedMediaSnapshot[];
};
const SHARE_ROOT = path.join(STORAGE_ROOT, "shares");
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function createChatShare(userId: string, input: unknown): Promise<string> {
  const body = input as { conversationId?: unknown; messageIds?: unknown } | null;
  if (!body || typeof body.conversationId !== "string" || !body.conversationId.trim() || body.conversationId.length > 160
    || !Array.isArray(body.messageIds) || body.messageIds.length < 1 || body.messageIds.length > 200
    || body.messageIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 160)) {
    throw new ChatShareError("请选择 1 至 200 条消息后再分享。");
  }
  const selected = new Set<string>(body.messageIds);
  if (selected.size !== body.messageIds.length) throw new ChatShareError("所选消息重复，请重新选择。");
  const conversation = await getConversationRecord(userId, body.conversationId);
  if (!conversation) throw new ChatShareError("对话不存在或无权分享。", 404);
  const messages = conversation.messages.filter((message) => selected.has(message.id));
  if (messages.length !== selected.size) throw new ChatShareError("所选消息不存在，请刷新对话后重试。", 400);

  const snapshot: ShareSnapshot = { createdAt: Date.now(), messages: [], media: [] };
  let mediaBytes = 0;
  let textBytes = 0;
  const copiedMedia = new Map<string, number>();
  for (const message of messages) {
    const content = message.role === "assistant" ? sanitizeAssistantOutput(message.content) : message.content;
    textBytes += Buffer.byteLength(content, "utf8");
    if (textBytes > 1024 * 1024) throw new ChatShareError("所选文字超过 1 MB，请减少消息数量。", 413);
    const media: number[] = [];
    for (const item of message.role === "assistant" ? message.mediaItems || [] : []) {
      const key = `${item.source}:${item.id}`;
      let index = copiedMedia.get(key);
      if (index === undefined) {
        const copy = await snapshotChatMedia(userId, conversation.id, item);
        mediaBytes += Buffer.byteLength(copy.data, "base64");
        if (mediaBytes > 50 * 1024 * 1024) throw new ChatShareError("分享媒体合计超过 50 MB，请减少消息数量。", 413);
        index = snapshot.media.push(copy) - 1;
        copiedMedia.set(key, index);
      }
      media.push(index);
    }
    snapshot.messages.push({ role: message.role, content, media });
  }

  const token = randomBytes(32).toString("base64url");
  if (isDatabaseConfigured()) {
    await withDbClient(async (client) => {
      await client.query("INSERT INTO kb_chat_shares (token, snapshot_json, created_at_ms) VALUES ($1, $2::jsonb, $3)", [token, JSON.stringify(snapshot), snapshot.createdAt]);
    });
  } else {
    await fs.mkdir(SHARE_ROOT, { recursive: true });
    // Exclusive creation: snapshots are never updated or attached to mutable conversations.
    await fs.writeFile(path.join(SHARE_ROOT, `${token}.json`), JSON.stringify(snapshot), { encoding: "utf8", flag: "wx" });
  }
  return token;
}

async function readSnapshot(token: string): Promise<ShareSnapshot | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  if (isDatabaseConfigured()) {
    return withDbClient(async (client) => {
      const result = await client.query<{ snapshot_json: ShareSnapshot }>("SELECT snapshot_json FROM kb_chat_shares WHERE token = $1 LIMIT 1", [token]);
      return result.rows[0]?.snapshot_json || null;
    });
  }
  try {
    return JSON.parse(await fs.readFile(path.join(SHARE_ROOT, `${token}.json`), "utf8")) as ShareSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function getChatShare(token: string): Promise<{ createdAt: number; messages: Message[] } | null> {
  const snapshot = await readSnapshot(token);
  if (!snapshot) return null;
  return {
    createdAt: snapshot.createdAt,
    messages: snapshot.messages.map((message, index) => ({
      id: String(index), role: message.role, content: message.content, timestamp: 0,
      mediaItems: message.media.map((mediaIndex) => {
        const item = snapshot.media[mediaIndex];
        return {
          id: String(mediaIndex), source: "file", kind: item.kind, name: item.name,
          mimeType: item.mimeType, caption: item.caption,
          url: `/api/shares/${token}/media/${mediaIndex}`,
        };
      }),
    })),
  };
}

export async function getSharedMedia(token: string, index: string) {
  if (!/^(0|[1-9]\d{0,3})$/.test(index)) return null;
  const snapshot = await readSnapshot(token);
  const item = snapshot?.media[Number(index)];
  return item ? { buffer: Buffer.from(item.data, "base64"), mimeType: item.mimeType } : null;
}
