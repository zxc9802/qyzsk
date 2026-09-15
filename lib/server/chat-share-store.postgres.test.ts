import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testDatabaseUrl = process.env.KB_CHAT_SHARE_TEST_DATABASE_URL;

test("PostgreSQL stores isolated, ordered and immutable public share snapshots", { skip: !testDatabaseUrl }, async () => {
  const target = new URL(testDatabaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Integration tests require a local database");
  assert.match(target.pathname, /test/i, "Integration tests require an explicitly named test database");
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = testDatabaseUrl;
  const { saveUserChatState, getUserChatState } = await import("@/lib/server/chat-state-store");
  const { createChatShare, getChatShare } = await import("@/lib/server/chat-share-store");
  const { withDbClient } = await import("@/lib/server/db");
  const runId = randomUUID();
  const owners = [`share-test-owner-${runId}`, `share-test-other-${runId}`];
  const conversationId = `share-test-conversation-${runId}`;
  const tokens: string[] = [];
  let timestamp = Date.now();
  const conversation = {
    id: conversationId, title: "PRIVATE UNSELECTED TITLE", createdAt: timestamp, updatedAt: timestamp,
    messages: [
      { id: "private", role: "user", content: "PRIVATE UNSELECTED CONTENT", timestamp },
      { id: "answer", role: "assistant", content: `Selected answer ${runId}`, timestamp: timestamp + 1,
        sourceHits: [{ id: "private-source", type: "wiki", title: "PRIVATE SOURCE", category: "private", excerpt: "PRIVATE EXCERPT" }] },
      { id: "question", role: "user", content: `Selected question ${runId}`, timestamp: timestamp + 2 },
    ],
  };
  const save = (owner: string, conversations: unknown[]) => saveUserChatState(owner, {
    conversations, activeId: conversationId, settings: null, clientUpdatedAt: ++timestamp,
  });

  try {
    await save(owners[0], [conversation]);
    await save(owners[1], [{ ...conversation, messages: [{ id: "other", role: "user", content: "Other owner's private data", timestamp }] }]);
    assert.equal((await getUserChatState(owners[0])).conversations.length, 1);
    assert.equal((await getUserChatState(owners[1])).conversations[0].messages[0].id, "other");
    await assert.rejects(createChatShare(owners[1], { conversationId, messageIds: ["answer"] }));
    await assert.rejects(createChatShare(`share-test-stranger-${runId}`, { conversationId, messageIds: ["answer"] }));
    await assert.rejects(createChatShare(owners[0], { conversationId, messageIds: ["answer", "other"] }));

    const token = await createChatShare(owners[0], { conversationId, messageIds: ["question", "answer"] });
    tokens.push(token);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const snapshot = await getChatShare(token); // Public read takes only the unguessable token.
    assert.deepEqual(snapshot?.messages.map((message) => message.content), [conversation.messages[1].content, conversation.messages[2].content]);
    assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE|sourceHits|conversationId|userId/);
    await withDbClient(async (client) => {
      const result = await client.query<{ snapshot_json: unknown }>("SELECT snapshot_json FROM kb_chat_shares WHERE token = $1", [token]);
      assert.equal(result.rowCount, 1, "The snapshot must exist in PostgreSQL, not the file fallback");
      assert.doesNotMatch(JSON.stringify(result.rows[0].snapshot_json), /PRIVATE|sourceHits|conversationId|userId/);
    });

    conversation.messages[1].content = "Edited after sharing";
    conversation.updatedAt = ++timestamp;
    await save(owners[0], [conversation]);
    assert.deepEqual(await getChatShare(token), snapshot);
    await save(owners[0], []);
    assert.equal((await getUserChatState(owners[0])).conversations.length, 0);
    assert.deepEqual(await getChatShare(token), snapshot);
    assert.equal(await getChatShare("missing"), null);
    assert.equal(await getChatShare("z".repeat(43)), null);
  } finally {
    try {
      await withDbClient(async (client) => {
        // All cleanup is scoped to this run's random IDs; shared test schemas stay intact.
        await client.query("DELETE FROM kb_chat_shares WHERE token = ANY($1::text[])", [tokens]);
        await client.query("DELETE FROM kb_chat_conversations WHERE user_id = ANY($1::text[])", [owners]);
        await client.query("DELETE FROM kb_chat_user_state WHERE user_id = ANY($1::text[])", [owners]);
        const remaining = await client.query<{ count: string }>("SELECT count(*) FROM kb_chat_conversations WHERE user_id = ANY($1::text[])", [owners]);
        assert.equal(Number(remaining.rows[0].count), 0);
      });
    } finally {
      await globalThis.__kbChatDbPool?.end();
      globalThis.__kbChatDbPool = undefined;
      globalThis.__kbChatSchemaReady = undefined;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
});
