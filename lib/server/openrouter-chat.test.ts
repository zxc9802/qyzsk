import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { generateGpt55Text } from "@/lib/server/openrouter-chat";
import type { ProviderMessage } from "@/lib/server/claude-messages";

const envNames = ["OPENROUTER_API_KEY", "OPENROUTER_BASE_URL", "OPENLUX_API_KEY", "OPENLUX_API_BASE_URL"];
let originalEnv: Array<string | undefined>;
beforeEach(() => {
  originalEnv = envNames.map((name) => process.env[name]);
  process.env.OPENROUTER_API_KEY = "fallback-test-key";
  process.env.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/";
  process.env.OPENLUX_API_KEY = "primary-test-key";
  process.env.OPENLUX_API_BASE_URL = "https://api.openlux.ai";
});
afterEach(() => {
  envNames.forEach((name, index) => {
    if (originalEnv[index] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[index];
  });
});

const messages: ProviderMessage[] = [
  { role: "system", content: "Use the supplied knowledge." },
  { role: "assistant", content: "Previous answer" },
  { role: "user", content: [{ type: "text", text: "Question" }, { type: "image_url", image_url: { url: "https://example.com/image.png" } }] },
];
const primaryPayload = {
  model: "gpt-5.6-luna",
  output_text: "Primary answer",
  usage: { input_tokens: 10, output_tokens: 3 },
};
const fallbackPayload = {
  model: "deepseek/deepseek-v4.1-flash",
  choices: [{ message: { content: "Fallback answer" } }],
  usage: { prompt_tokens: 10, completion_tokens: 2 },
};

test("a successful Luna request preserves instructions, history, images and usage without calling fallback", async () => {
  let calls = 0;
  const result = await generateGpt55Text({ messages, maxTokens: 512, fetchImpl: async (url, init) => {
    calls += 1;
    assert.equal(String(url), "https://api.openlux.ai/v1/responses");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer primary-test-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, primaryPayload.model);
    assert.equal(body.instructions, "Use the supplied knowledge.");
    assert.equal(body.max_output_tokens, 512);
    assert.deepEqual(body.input, [
      { role: "assistant", content: "Previous answer" },
      { role: "user", content: [{ type: "input_text", text: "Question" }, { type: "input_image", image_url: "https://example.com/image.png" }] },
    ]);
    assert.equal(body.stream, undefined);
    assert.equal(body.tools, undefined);
    return Response.json(primaryPayload);
  } });
  assert.equal(calls, 1);
  assert.equal(result.text, "Primary answer");
  assert.equal(result.model, primaryPayload.model);
  assert.equal(result.providerId, "openlux");
  assert.deepEqual(result.payload.usage, primaryPayload.usage);
});

test("a successful third retry still returns Luna without invoking DeepSeek", async () => {
  let calls = 0;
  const result = await generateGpt55Text({ messages, fetchImpl: async (url) => {
    assert.match(String(url), /openlux/);
    calls += 1;
    return calls === 4 ? Response.json(primaryPayload) : Response.json({ error: { message: "busy" } }, { status: 503 });
  } });
  assert.equal(calls, 4);
  assert.equal(result.providerId, "openlux");
});

test("HTTP, network, invalid JSON and empty responses exhaust four Luna attempts before DeepSeek", async () => {
  const models: string[] = [];
  const result = await generateGpt55Text({ messages, maxTokens: 512, fetchImpl: async (url, init) => {
    const body = JSON.parse(String(init?.body));
    models.push(body.model);
    if (models.length === 1) return Response.json({ error: { message: "limited" } }, { status: 429 });
    if (models.length === 2) throw new TypeError("fetch failed");
    if (models.length === 3) return new Response("invalid JSON");
    if (models.length === 4) return Response.json({ output_text: " " });
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fallback-test-key");
    assert.equal(body.max_tokens, 512);
    assert.deepEqual(body.messages, messages);
    assert.equal(body.stream, false);
    assert.equal(body.plugins, undefined);
    return Response.json(fallbackPayload);
  } });
  assert.deepEqual(models, [...Array(4).fill(primaryPayload.model), fallbackPayload.model]);
  assert.equal(result.text, "Fallback answer");
  assert.equal(result.providerId, "openrouter");
  assert.equal(result.model, fallbackPayload.model);
  assert.deepEqual(result.payload.usage, fallbackPayload.usage);
});

test("web search preserves tools and citations on the Luna request", async () => {
  const result = await generateGpt55Text({ messages, webSearch: true, fetchImpl: async (_, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)).tools, [{ type: "web_search_preview" }]);
    return Response.json({ output: [{ content: [{ text: "Search answer", annotations: [
      { type: "url_citation", url: "https://example.com/source", title: "Source" },
    ] }] }] });
  } });
  assert.equal(result.hits[0].url, "https://example.com/source");
});

test("web search is retained after timeout and provider errors fall back to DeepSeek", async () => {
  let calls = 0;
  const result = await generateGpt55Text({ messages, webSearch: true, fetchImpl: async (_, init) => {
    calls += 1;
    if (calls === 1) throw new DOMException("Timed out", "TimeoutError");
    if (calls < 5) return Response.json({ error: { message: "upstream error in HTTP 200" } });
    assert.deepEqual(JSON.parse(String(init?.body)).plugins, [{ id: "web" }]);
    return Response.json({ choices: [{ message: { content: "DeepSeek search", annotations: [
      { type: "url_citation", url_citation: { url: "https://example.com/deepseek", title: "DeepSeek source" } },
    ] } }] });
  } });
  assert.equal(calls, 5);
  assert.equal(result.hits[0].url, "https://example.com/deepseek");
});

test("a disconnected caller cancels retries and never invokes the fallback", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(generateGpt55Text({ messages, signal: controller.signal, fetchImpl: async () => {
    calls += 1;
    controller.abort();
    throw controller.signal.reason;
  } }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("failure of DeepSeek is surfaced after exactly four Luna attempts", async () => {
  let calls = 0;
  await assert.rejects(generateGpt55Text({ messages, fetchImpl: async () => {
    calls += 1;
    return Response.json({ error: { message: calls === 5 ? "DeepSeek unavailable" : "Luna unavailable" } }, { status: 503 });
  } }), /DeepSeek unavailable/);
  assert.equal(calls, 5);
});

function sseResponse(events: unknown[]) {
  return new Response(events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

test("Luna emits text before completion and retains final usage and web citations", async () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let sawFirst!: () => void;
  const firstContent = new Promise<void>((resolve) => { sawFirst = resolve; });
  const chunks: string[] = [];
  let completed = false;
  const resultPromise = generateGpt55Text({
    messages,
    webSearch: true,
    onContent(content) { chunks.push(content); sawFirst(); },
    fetchImpl: async (_, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.stream, true);
      assert.deepEqual(body.tools, [{ type: "web_search_preview" }]);
      return new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } }), {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  }).then((result) => { completed = true; return result; });
  controller.enqueue(encoder.encode(`: processing\n\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "你" })}\n\n`));
  await firstContent;
  assert.equal(completed, false);
  assert.deepEqual(chunks, ["你"]);
  const tail = [
    { type: "response.output_text.delta", delta: "好" },
    { type: "response.completed", response: { model: primaryPayload.model, usage: primaryPayload.usage,
      output: [{ content: [{ text: "你好", annotations: [{ type: "url_citation", url: "https://example.com/source", title: "Source" }] }] }],
    } },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  for (const byte of encoder.encode(tail)) controller.enqueue(Uint8Array.of(byte));
  controller.close();
  const result = await resultPromise;
  assert.equal(result.text, "你好");
  assert.deepEqual(chunks, ["你", "好"]);
  assert.deepEqual(result.payload.usage, primaryPayload.usage);
  assert.equal(result.hits[0].url, "https://example.com/source");
});

test("Luna SSE failures before visible text retry three times, then stream DeepSeek with usage and citations", async () => {
  const models: string[] = [];
  const chunks: string[] = [];
  const result = await generateGpt55Text({ messages, webSearch: true, onContent: (content) => chunks.push(content), fetchImpl: async (_, init) => {
    const body = JSON.parse(String(init?.body));
    models.push(body.model);
    assert.equal(body.stream, true);
    if (models.length < 5) return sseResponse([{ type: "response.failed", response: { error: { message: "busy" } } }]);
    assert.deepEqual(body.stream_options, { include_usage: true });
    assert.deepEqual(body.plugins, [{ id: "web" }]);
    return sseResponse([
      { choices: [{ delta: { content: "DeepSeek " } }] },
      { choices: [{ delta: { content: "answer", annotations: [{ type: "url_citation", url_citation: { url: "https://example.com/source", title: "Source" } }] } }] },
      { model: fallbackPayload.model, choices: [{ delta: {}, finish_reason: "stop" }] },
      { choices: [], usage: fallbackPayload.usage },
      "[DONE]",
    ]);
  } });
  assert.deepEqual(models, [...Array(4).fill(primaryPayload.model), fallbackPayload.model]);
  assert.deepEqual(chunks, ["DeepSeek ", "answer"]);
  assert.equal(result.providerId, "openrouter");
  assert.equal(result.text, "DeepSeek answer");
  assert.deepEqual(result.payload.usage, fallbackPayload.usage);
  assert.equal(result.hits[0].url, "https://example.com/source");
});

for (const failure of ["error-event", "truncated-stream"]) {
  test(`a ${failure} after visible text never retries or switches models`, async () => {
    let calls = 0;
    const chunks: string[] = [];
    await assert.rejects(generateGpt55Text({ messages, onContent: (content) => chunks.push(content), fetchImpl: async () => {
      calls += 1;
      return sseResponse([
        { type: "response.output_text.delta", delta: "Partial answer" },
        ...(failure === "error-event" ? [{ type: "response.failed", response: { error: { message: "disconnected" } } }] : []),
      ]);
    } }), /回答输出中断/);
    assert.equal(calls, 1);
    assert.deepEqual(chunks, ["Partial answer"]);
  });
}

test("reasoning-only streams and empty deltas can retry before the first answer token", async () => {
  let calls = 0;
  const chunks: string[] = [];
  const result = await generateGpt55Text({ messages, onContent: (content) => chunks.push(content), fetchImpl: async () => {
    calls += 1;
    return sseResponse([
      { type: "response.output_text.delta", delta: "" },
      { type: calls === 1 ? "response.reasoning_summary_text.delta" : "response.output_text.delta", delta: "Answer" },
      { type: "response.completed", response: { output: [] } },
    ]);
  } });
  assert.equal(calls, 2);
  assert.deepEqual(chunks, ["Answer"]);
  assert.equal(result.text, "Answer");
});
