import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withUsageUser, usageFetch, drainUsageOutbox } from "./openlux-reporting";
import { generateResponsesText } from "./openai-responses";
import { requestUploadEmbedding } from "./upload-embeddings";
import { parseTokenUsage } from "./openlux-usage-values";

test("OpenLux actual calls are attributed, durable, deduplicated, and other providers excluded", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kb-usage-test-"));
  const env = { DATABASE_URL: "", MAIN_APP_URL: "https://main.test", USAGE_MONITOR_URL: "", USAGE_MONITOR_INTERNAL_SECRET: "test-only-shared-secret-at-least-32", USAGE_MONITOR_OUTBOX_DIR: dir };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(async () => { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } await rm(dir, { recursive: true, force: true }); });
  const reports: Record<string, unknown>[] = [];
  let reportFails = true;
  let upstreamStatus = 200;
  let upstreamResponse: Record<string, unknown> = { usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 50, image_tokens: 10 }, output_tokens_details: { reasoning_tokens: 5 } }, output_text: "private reply" };
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("https://main.test")) {
      assert.equal(new Headers(init?.headers).get("x-usage-tool"), "kb-chat");
      reports.push(JSON.parse(String(init?.body)));
      return Response.json({ success: !reportFails }, { status: reportFails ? 503 : 200 });
    }
    return Response.json(upstreamResponse, { status: upstreamStatus });
  });
  const init = { method: "POST", body: JSON.stringify({ model: "gpt-6-astra", input: "private prompt", key: "private api key" }) };
  await usageFetch("https://api.openlux.ai/v1/responses", init);
  await withUsageUser("employee-a", () => usageFetch("https://yunwu.ai/v1/responses", init));
  assert.equal((await readdir(dir)).length, 0);
  const response = await withUsageUser("employee-a", () => usageFetch("https://api.openlux.ai/v1/responses", init));
  assert.equal((await response.json()).output_text, "private reply");
  const queued = await readdir(dir);
  assert.ok(queued.length > 0);
  for (const file of queued) assert.ok(!(await readFile(path.join(dir, file), "utf8")).includes("private"));
  reportFails = false;
  await drainUsageOutbox();
  assert.equal((await readdir(dir)).length, 0);
  const event = reports.find(r => r.status === "completed")!;
  assert.equal(event.userId, "employee-a");
  assert.equal(event.provider, "api.openlux.ai");
  assert.equal(event.model, "gpt-6-astra");
  assert.equal(event.totalTokens, 120);
  assert.equal(event.imageInputTokens, 10);
  assert.equal(event.cachedInputTokens, 50);
  assert.equal(event.reasoningTokens, 5);
  assert.equal(new Set(reports.map(r => r.requestId)).size, 1, "delivery retries retain call identity");
  reports.length = 0;
  upstreamResponse = {} as typeof upstreamResponse;
  await withUsageUser("employee-b", () => usageFetch("https://api.openlux.ai/v1/images/generations", { method: "POST", body: JSON.stringify({ model: "gpt-image-2-c" }) }));
  assert.equal(reports.at(-1)?.userId, "employee-b");
  assert.equal(reports.at(-1)?.inputTokens, null);
  assert.equal(reports.at(-1)?.tokenBasis, "missing");
  for (const [status, payload, expected] of [
    [202, { status: "in_progress" }, "pending"],
    [200, { status: "incomplete" }, "interrupted"],
    [200, { response: { status: "failed" } }, "failed"],
  ] as const) {
    upstreamStatus = status;
    upstreamResponse = payload;
    await withUsageUser("employee-a", () => usageFetch("https://api.openlux.ai/v1/responses", init));
    assert.equal(reports.at(-1)?.status, expected);
  }
});

test("native Gemini retains image details and missing cache/reasoning buckets", () => {
  const parsed = parseTokenUsage({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: 40 }, { modality: "IMAGE", tokenCount: 60 }] } });
  assert.equal(parsed.imageInputTokens, 60);
  assert.equal(parsed.cachedInputTokens, null);
  assert.equal(parsed.reasoningTokens, null);
  assert.equal(parsed.outputTokens, 10);
});

test("stream parsing captures split Anthropic caches and interruption without persisting content", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kb-stream-test-"));
  const env = { DATABASE_URL: "", MAIN_APP_URL: "https://main.test", USAGE_MONITOR_INTERNAL_SECRET: "test-only-shared-secret-at-least-32", USAGE_MONITOR_OUTBOX_DIR: dir };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(async () => { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } await rm(dir, { recursive: true, force: true }); });
  const reports: Record<string, unknown>[] = [];
  let complete = true;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("https://main.test")) { reports.push(JSON.parse(String(init?.body))); return Response.json({ success: true }); }
    return new Response('data: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_read_input_tokens":20,"cache_creation_input_tokens":10}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":5}}\n\n' + (complete ? 'data: {"type":"message_stop"}\n\n' : ''), { headers: { "content-type": "text/event-stream" } });
  });
  const call = async () => { const r = await withUsageUser("employee", () => usageFetch("https://api.openlux.ai/v1/messages", { method: "POST", body: '{"model":"claude-opus-4-7","stream":true}' })); await r.text(); };
  await call();
  assert.equal(reports.at(-1)?.inputTokens, 130);
  assert.equal(reports.at(-1)?.totalTokens, 135);
  assert.equal(reports.at(-1)?.status, "completed");
  complete = false;
  await call();
  assert.equal(reports.at(-1)?.status, "interrupted");
});

test("real text and embedding adapters retain separate concurrent employee identities and explicit zero usage", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kb-adapter-test-"));
  const env = { DATABASE_URL: "", MAIN_APP_URL: "https://main.test", USAGE_MONITOR_INTERNAL_SECRET: "test-only-shared-secret-at-least-32", USAGE_MONITOR_OUTBOX_DIR: dir, UPLOAD_EMBEDDING_API_KEY: "test-only-key", UPLOAD_EMBEDDING_URL: "https://api.openlux.ai/v1beta/models/gemini-embedding-2-preview:generateContent" };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(async () => { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } await rm(dir, { recursive: true, force: true }); });
  const reports: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("https://main.test")) { reports.push(JSON.parse(String(init?.body))); return Response.json({ success: true }); }
    if (String(input).includes("embedding")) return Response.json({ embedding: { values: [1, 2, 3] }, usageMetadata: { promptTokenCount: 12, totalTokenCount: 12 } });
    return Response.json({ output_text: "answer", usage: { input_tokens: 0, output_tokens: 0 } });
  });
  const [textResult, vector] = await Promise.all([
    withUsageUser("text-owner", () => generateResponsesText({ baseUrl: "https://api.openlux.ai/v1", apiKey: "test-key", model: "gpt-6-astra", instructions: "test", input: "test" })),
    withUsageUser("file-owner", () => requestUploadEmbedding([{ text: "test file" }])),
  ]);
  await drainUsageOutbox();
  assert.equal(textResult.text, "answer");
  assert.deepEqual(vector, [1, 2, 3]);
  const textEvent = reports.find(r => r.userId === "text-owner" && r.status === "completed")!;
  const fileEvent = reports.find(r => r.userId === "file-owner" && r.status === "completed")!;
  assert.equal(textEvent.model, "gpt-6-astra");
  assert.equal(textEvent.inputTokens, 0);
  assert.equal(textEvent.outputTokens, 0);
  assert.equal(textEvent.tokenBasis, "reported");
  assert.equal(fileEvent.model, "gemini-embedding-2-preview");
  assert.equal(fileEvent.inputTokens, 12);
  assert.equal(fileEvent.outputTokens, 0);
  assert.equal(fileEvent.totalTokens, 12);
  assert.notEqual(textEvent.requestId, fileEvent.requestId);
});

test("PostgreSQL retains undelivered metadata and clears only acknowledged revisions", { skip: !process.env.KB_USAGE_TEST_DATABASE_URL }, async t => {
  const url = new URL(process.env.KB_USAGE_TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.includes("test"));
  const env = { DATABASE_URL: url.href, MAIN_APP_URL: "https://main.test", USAGE_MONITOR_INTERNAL_SECRET: "test-only-shared-secret-at-least-32" };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  const { withDbClient } = await import("./db");
  const owner = `kb-test-${Date.now()}`;
  t.after(async () => {
    await withDbClient(client => client.query("DELETE FROM kb_chat_usage_outbox WHERE payload->>'userId'=$1", [owner]));
    await globalThis.__kbChatDbPool?.end();
    globalThis.__kbChatDbPool = undefined;
    globalThis.__kbChatSchemaReady = undefined;
    for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });
  let acknowledged = false;
  const reports: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("https://main.test")) { reports.push(JSON.parse(String(init?.body))); return Response.json({ success: acknowledged }, { status: acknowledged ? 200 : 503 }); }
    return Response.json({ data: [{ url: "not-persisted" }] });
  });
  await withUsageUser(owner, () => usageFetch("https://api.openlux.ai/v1/images/generations", { method: "POST", body: '{"model":"gpt-image-2-c"}' }));
  const queued = await withDbClient(client => client.query("SELECT payload FROM kb_chat_usage_outbox WHERE payload->>'userId'=$1", [owner]));
  assert.equal(queued.rows.length, 2);
  assert.ok(!JSON.stringify(queued.rows).includes("not-persisted"));
  acknowledged = true;
  await drainUsageOutbox();
  const remaining = await withDbClient(client => client.query("SELECT id FROM kb_chat_usage_outbox WHERE payload->>'userId'=$1", [owner]));
  assert.equal(remaining.rows.length, 0);
  assert.equal(new Set(reports.map(r => r.requestId)).size, 1);
});
