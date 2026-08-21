import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeChatMediaItems,
  sanitizeChatMediaItem,
  toWikiChatMediaItems,
} from "@/lib/server/chat-media";

test("toWikiChatMediaItems only returns images and videos for the chat box", () => {
  const items = toWikiChatMediaItems([
    { id: "doc-1", kind: "document", name: "复盘.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 12 },
    { id: "img-1", kind: "image", name: "后台.png", mimeType: "image/png", size: 20, summary: "店铺后台截图" },
    { id: "vid-1", kind: "video", name: "讲解.mp4", mimeType: "video/mp4", size: 40 },
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0]?.url, "/api/wiki/media/img-1");
  assert.equal(items[1]?.posterUrl, "/api/wiki/media/vid-1?variant=poster");
});

test("sanitizeChatMediaItem rejects external media URLs", () => {
  assert.equal(
    sanitizeChatMediaItem({
      id: "x",
      kind: "image",
      name: "evil.png",
      mimeType: "image/png",
      url: "https://evil.example/a.png",
      source: "wiki",
    }),
    null
  );

  const safe = sanitizeChatMediaItem({
    id: "img-1",
    kind: "image",
    name: "后台.png",
    mimeType: "image/png",
    url: "/api/wiki/media/img-1",
    source: "wiki",
  });
  assert.ok(safe);
  assert.equal(safe?.id, "img-1");
});

test("mergeChatMediaItems deduplicates by source and id", () => {
  const merged = mergeChatMediaItems([
    [
      {
        id: "img-1",
        kind: "image",
        name: "后台.png",
        mimeType: "image/png",
        url: "/api/wiki/media/img-1",
        source: "wiki",
      },
    ],
    [
      {
        id: "img-1",
        kind: "image",
        name: "后台.png",
        mimeType: "image/png",
        url: "/api/wiki/media/img-1",
        source: "wiki",
      },
      {
        id: "file-1",
        kind: "video",
        name: "讲解.mp4",
        mimeType: "video/mp4",
        url: "/api/files/content?conversationId=c1&fileId=file-1",
        source: "file",
      },
    ],
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.id, "file-1");
});
