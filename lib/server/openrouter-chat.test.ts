import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { generateGpt55Text } from "@/lib/server/openrouter-chat";
import type { ProviderMessage } from "@/lib/server/claude-messages";

const envNames = ["OPENROUTER_API_KEY", "OPENROUTER_BASE_URL", "OPENLUX_API_KEY", "OPENLUX_API_BASE_URL"];
let originalEnv: Array<string | undefined>;
beforeEach(() => {
  originalEnv = envNames.map((name) => process.env[name]);
  process.env.OPENROUTER_API_KEY = "primary-test-key";
  process.env.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/";
  process.env.OPENLUX_API_KEY = "fallback-test-key";
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
  model: "deepseek/deepseek-v4.1-flash",
  choices: [{ message: { content: "Primary answer" } }],
  usage: { prompt_tokens: 10, completion_tokens: 3 },
};

test("a successful primary request preserves messages and usage without calling fallback", async () => {
  let calls = 0;
  const result = await generateGpt55Text({ messages, fetchImpl: async (url, init) => {
    calls += 1;
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer primary-test-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, primaryPayload.model);
    assert.deepEqual(body.messages, messages);
    assert.equal(body.stream, false);
    assert.equal(body.plugins, undefined);
    return Response.json(primaryPayload);
  } });
  assert.equal(calls, 1);
  assert.equal(result.text, "Primary answer");
  assert.equal(result.providerId, "openrouter");
  assert.deepEqual(result.payload.usage, primaryPayload.usage);
});

test("a successful third retry still returns DeepSeek without invoking Luna", async () => {
  let calls = 0;
  const result = await generateGpt55Text({ messages, fetchImpl: async (url) => {
    assert.match(String(url), /openrouter/);
    calls += 1;
    return calls === 4 ? Response.json(primaryPayload) : Response.json({ error: { message: "busy" } }, { status: 503 });
  } });
  assert.equal(calls, 4);
  assert.equal(result.providerId, "openrouter");
});

test("HTTP, network, invalid JSON and empty responses exhaust four attempts before Luna", async () => {
  const models: string[] = [];
  const result = await generateGpt55Text({ messages, maxTokens: 512, fetchImpl: async (url, init) => {
    const body = JSON.parse(String(init?.body));
    models.push(body.model);
    if (models.length === 1) return Response.json({ error: { message: "limited" } }, { status: 429 });
    if (models.length === 2) throw new TypeError("fetch failed");
    if (models.length === 3) return new Response("invalid JSON");
    if (models.length === 4) return Response.json({ choices: [{ message: { content: " " } }] });
    assert.equal(String(url), "https://api.openlux.ai/v1/responses");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fallback-test-key");
    assert.equal(body.instructions, "Use the supplied knowledge.");
    assert.equal(body.max_output_tokens, 512);
    assert.deepEqual(body.input, [
      { role: "assistant", content: "Previous answer" },
      { role: "user", content: [{ type: "input_text", text: "Question" }, { type: "input_image", image_url: "https://example.com/image.png" }] },
    ]);
    return Response.json({ model: "gpt-5.6-luna", output_text: "Fallback answer", usage: { input_tokens: 10, output_tokens: 2 } });
  } });
  assert.deepEqual(models, [...Array(4).fill(primaryPayload.model), "gpt-5.6-luna"]);
  assert.equal(result.text, "Fallback answer");
  assert.equal(result.providerId, "openlux");
  assert.equal(result.model, "gpt-5.6-luna");
});

test("web search preserves plugins and citations on the primary request", async () => {
  const result = await generateGpt55Text({ messages, webSearch: true, fetchImpl: async (_, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)).plugins, [{ id: "web" }]);
    return Response.json({ choices: [{ message: { content: "Search answer", annotations: [
      { type: "url_citation", url_citation: { url: "https://example.com/source", title: "Source" } },
    ] } }] });
  } });
  assert.equal(result.hits[0].url, "https://example.com/source");
});

test("web search is retained after timeout and provider errors fall back to Luna", async () => {
  let calls = 0;
  const result = await generateGpt55Text({ messages, webSearch: true, fetchImpl: async (_, init) => {
    calls += 1;
    if (calls === 1) throw new DOMException("Timed out", "TimeoutError");
    if (calls < 5) return Response.json({ error: { message: "upstream error in HTTP 200" } });
    assert.deepEqual(JSON.parse(String(init?.body)).tools, [{ type: "web_search_preview" }]);
    return Response.json({ output: [{ content: [{ text: "Luna search", annotations: [
      { type: "url_citation", url: "https://example.com/luna", title: "Luna source" },
    ] }] }] });
  } });
  assert.equal(calls, 5);
  assert.equal(result.hits[0].url, "https://example.com/luna");
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

test("failure of the fallback is surfaced after exactly four primary attempts", async () => {
  let calls = 0;
  await assert.rejects(generateGpt55Text({ messages, fetchImpl: async () => {
    calls += 1;
    return Response.json({ error: { message: calls === 5 ? "Luna unavailable" : "DeepSeek unavailable" } }, { status: 503 });
  } }), /Luna unavailable/);
  assert.equal(calls, 5);
});
