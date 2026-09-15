import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("sharing authenticates owners, preserves selected snapshots, and isolates public data", async (t) => {
  const previousCwd = process.cwd();
  const previousEnv = { ...process.env };
  const previousFetch = globalThis.fetch;
  const root = await mkdtemp(path.join(os.tmpdir(), "kb-chat-shares-"));
  process.chdir(root);
  delete process.env.DATABASE_URL;
  process.env.REQUIRE_MAIN_APP_SSO = "true";
  process.env.MAIN_APP_URL = "http://localhost:49999";
  process.env.KB_CHAT_SESSION_SECRET = "isolated-share-test-secret";

  try {
    const { saveUserChatState } = await import("@/lib/server/chat-state-store");
    const { createChatShare, getChatShare, getSharedMedia } = await import("@/lib/server/chat-share-store");
    const { POST } = await import("@/app/api/shares/route");
    const { buildSessionCookie, shouldBypassSso } = await import("@/lib/server/app-session");
    const conversation = {
      id: "c1", title: "UNSELECTED PRIVATE TITLE", createdAt: 1, updatedAt: 1,
      messages: [
        { id: "m1", role: "user", content: "UNSELECTED SECRET", timestamp: 1 },
        { id: "m2", role: "assistant", content: "## Selected answer\n**Safe** <script>alert(1)</script>", timestamp: 2,
          sourceHits: [{ id: "private", type: "wiki", title: "PRIVATE SOURCE", category: "private", excerpt: "PRIVATE EXCERPT" }],
          modelId: "PRIVATE MODEL", questionDiagnosis: { summary: "PRIVATE DIAGNOSIS" } },
        { id: "m3", role: "user", content: "Selected question", timestamp: 3 },
      ],
    };
    const save = (owner: string, conversations: unknown[], clientUpdatedAt: number) => saveUserChatState(owner, {
      conversations, activeId: "c1", settings: null, clientUpdatedAt,
    });
    await save("owner", [conversation], 10);
    await save("other", [{ ...conversation, messages: [{ id: "other1", role: "user", content: "Other private", timestamp: 1 }] }], 10);

    await t.test("selection uses stored order and excludes all internal metadata and unselected content", async () => {
      const token = await createChatShare("owner", { conversationId: "c1", messageIds: ["m3", "m2"] });
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      const snapshot = await getChatShare(token);
      assert.deepEqual(snapshot?.messages.map((message) => message.content), [conversation.messages[1].content, "Selected question"]);
      assert.doesNotMatch(JSON.stringify(snapshot), /UNSELECTED|PRIVATE|owner|sourceHits|modelId|conversationId/);
      conversation.messages[1].content = "EDITED LATER";
      await save("owner", [conversation], 20);
      await save("owner", [], 30);
      assert.deepEqual(await getChatShare(token), snapshot);
      assert.notEqual(await createChatShare("other", { conversationId: "c1", messageIds: ["other1"] }), token);
    });

    await save("owner", [conversation], 40);
    await t.test("rejects cross-user, missing, mixed, duplicate, empty and excessive selections", async () => {
      for (const [owner, body] of [
        ["stranger", { conversationId: "c1", messageIds: ["m2"] }],
        ["other", { conversationId: "c1", messageIds: ["m2"] }],
        ["owner", { conversationId: "c1", messageIds: ["m2", "other1"] }],
        ["owner", { conversationId: "c1", messageIds: ["m2", "m2"] }],
        ["owner", { conversationId: "c1", messageIds: [] }],
        ["owner", { conversationId: "c1", messageIds: Array.from({ length: 201 }, (_, i) => `m${i}`) }],
      ] as const) await assert.rejects(createChatShare(owner, body));
      for (const token of ["bad", "../state/owner/chat-state", "a".repeat(43)]) {
        assert.equal(await getChatShare(token), null);
        assert.equal(await getSharedMedia(token, "0"), null);
      }
    });

    await t.test("copies only selected owned media and never exposes private file endpoints", async () => {
      const { createPendingFileRecord } = await import("@/lib/server/file-store");
      const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=", "base64");
      const file = await createPendingFileRecord({ userId: "owner", conversationId: "c1", fileName: "example.png", mimeType: "image/png", size: bytes.length, kind: "image", buffer: bytes });
      const mediaConversation = { ...conversation, messages: [{ id: "image", role: "assistant", timestamp: 4, content: "Image answer", mediaItems: [{ id: file.id, source: "file", kind: "image", name: "example.png", mimeType: "image/png", url: `/api/files/content?conversationId=c1&fileId=${file.id}` }] }] };
      await save("owner", [mediaConversation], 50);
      const token = await createChatShare("owner", { conversationId: "c1", messageIds: ["image"] });
      const snapshot = await getChatShare(token);
      assert.match(snapshot!.messages[0].mediaItems![0].url, new RegExp(`^/api/shares/${token}/media/0$`));
      assert.doesNotMatch(JSON.stringify(snapshot), /api\/files|storagePath|remoteKey|base64|userId/);
      await writeFile(file.storagePath, "changed");
      assert.deepEqual((await getSharedMedia(token, "0"))?.buffer, bytes);
      assert.equal(await getSharedMedia(token, "1"), null);
      assert.equal(await getSharedMedia(token, "../0"), null);
      await save("other", [mediaConversation], 60);
      await assert.rejects(createChatShare("other", { conversationId: "c1", messageIds: ["image"] }));
      const raw = await readFile(path.join(root, ".kb-chat-data", "shares", `${token}.json`), "utf8");
      assert.doesNotMatch(raw, /storagePath|remoteKey|userId|PRIVATE/);
    });

    await t.test("creation requires a valid live SSO session and blocks cross-origin POSTs", async () => {
      globalThis.fetch = async (_input, init) => {
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-session");
        return Response.json({ data: { id: "owner", role: "admin" } });
      };
      await save("owner", [conversation], 70);
      const cookie = buildSessionCookie({ token: "test-session", user: { id: "owner" }, mainAppUrl: "http://localhost:49999" });
      const request = (cookieValue?: string, origin = "http://localhost:3000", body = JSON.stringify({ conversationId: "c1", messageIds: ["m2"], userId: "other" })) => new Request("http://localhost:3000/api/shares", {
        method: "POST", headers: { "content-type": "application/json", origin, ...(cookieValue ? { cookie: `${cookie.name}=${cookieValue}` } : {}) }, body,
      });
      assert.equal((await POST(request())).status, 401);
      assert.equal((await POST(request(`${cookie.value}tampered`))).status, 401);
      assert.equal((await POST(request(cookie.value, "https://attacker.invalid"))).status, 403);
      assert.equal((await POST(request(cookie.value, "http://localhost:3000", "{"))).status, 400);
      assert.equal((await POST(request(cookie.value, "http://localhost:3000", " ".repeat(40001)))).status, 413);
      const reverseProxyRequest = request(cookie.value, "https://kb.example.test");
      reverseProxyRequest.headers.set("host", "kb.example.test");
      assert.equal((await POST(reverseProxyRequest)).status, 201);
      const response = await POST(request(cookie.value));
      assert.equal(response.status, 201);
      assert.match((await response.json()).path, /^\/share\/[A-Za-z0-9_-]{43}$/);
      globalThis.fetch = async () => Response.json({ data: { id: "other" } });
      assert.equal((await POST(request(cookie.value))).status, 401);
      process.env.REQUIRE_MAIN_APP_SSO = "false";
      assert.equal((await POST(request())).status, 401);
    });

    await t.test("SSO bypass permits only public share pages and media", () => {
      assert.equal(shouldBypassSso(`/share/${"a".repeat(43)}`), true);
      assert.equal(shouldBypassSso(`/api/shares/${"a".repeat(43)}/media/0`), true);
      for (const pathname of ["/api/shares", "/api/state", "/api/files/content", "/api/wiki/media/private", "/share", "/share/x/other"]) assert.equal(shouldBypassSso(pathname), false);
    });
  } finally {
    process.chdir(previousCwd);
    globalThis.fetch = previousFetch;
    for (const key of ["DATABASE_URL", "REQUIRE_MAIN_APP_SSO", "MAIN_APP_URL", "KB_CHAT_SESSION_SECRET"]) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});
