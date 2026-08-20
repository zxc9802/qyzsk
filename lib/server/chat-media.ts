import type { ChatMediaItem } from "@/lib/types";
import type { ConversationFileRecord } from "@/lib/server/file-store";
import type { WikiMediaAsset } from "@/lib/wiki-types";
import { normalizeWikiMediaAssets } from "@/lib/wiki-types";

const MAX_CHAT_MEDIA_ITEMS = 6;

export function buildWikiMediaUrl(mediaId: string, variant?: "poster") {
  const search = variant ? `?variant=${variant}` : "";
  return `/api/wiki/media/${encodeURIComponent(mediaId)}${search}`;
}

export function buildConversationFileUrl(conversationId: string, fileId: string, variant?: "poster") {
  const params = new URLSearchParams({
    conversationId,
    fileId,
  });
  if (variant) params.set("variant", variant);
  return `/api/files/content?${params.toString()}`;
}

export function toWikiChatMediaItems(media: WikiMediaAsset[] | undefined): ChatMediaItem[] {
  return normalizeWikiMediaAssets(media)
    .filter((item): item is WikiMediaAsset & { kind: "image" | "video" } => item.kind === "image" || item.kind === "video")
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      mimeType: item.mimeType,
      url: buildWikiMediaUrl(item.id),
      ...(item.kind === "video" ? { posterUrl: buildWikiMediaUrl(item.id, "poster") } : {}),
      ...(item.summary ? { caption: item.summary.slice(0, 160) } : {}),
      source: "wiki" as const,
    }));
}

export function toConversationChatMediaItem(file: ConversationFileRecord): ChatMediaItem | null {
  if (file.kind !== "image" && file.kind !== "video") return null;

  return {
    id: file.id,
    kind: file.kind,
    name: file.name,
    mimeType: file.mimeType,
    url: buildConversationFileUrl(file.conversationId, file.id),
    ...(file.kind === "video"
      ? { posterUrl: buildConversationFileUrl(file.conversationId, file.id, "poster") }
      : {}),
    caption: (file.excerpt || file.summary || "").slice(0, 160) || undefined,
    source: "file",
  };
}

export function mergeChatMediaItems(groups: Array<ChatMediaItem[] | undefined>): ChatMediaItem[] {
  const merged: ChatMediaItem[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const item of group || []) {
      const key = `${item.source}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= MAX_CHAT_MEDIA_ITEMS) return merged;
    }
  }

  return merged;
}

export function sanitizeChatMediaItem(value: unknown): ChatMediaItem | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ChatMediaItem>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const mimeType = typeof candidate.mimeType === "string" ? candidate.mimeType.trim() : "";
  const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
  if (!id || !name || !url) return null;
  if (candidate.kind !== "image" && candidate.kind !== "video") return null;
  if (candidate.source !== "wiki" && candidate.source !== "file") return null;
  if (!url.startsWith("/api/wiki/media/") && !url.startsWith("/api/files/content?")) return null;

  const item: ChatMediaItem = {
    id,
    kind: candidate.kind,
    name,
    mimeType: mimeType || (candidate.kind === "video" ? "video/mp4" : "image/jpeg"),
    url,
    source: candidate.source,
  };

  if (typeof candidate.posterUrl === "string" && candidate.posterUrl.startsWith("/api/")) {
    item.posterUrl = candidate.posterUrl;
  }
  if (typeof candidate.caption === "string" && candidate.caption.trim()) {
    item.caption = candidate.caption.trim().slice(0, 160);
  }

  return item;
}
