import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  extractStreamUsageFragment,
  mergeStreamUsage,
  reportKbChatTextUsage,
} from "./usage-monitor";

test("merges Claude input and output usage from separate stream events", () => {
  const started = mergeStreamUsage(null, extractStreamUsageFragment({
    type: "message_start",
    message: {
      usage: {
        input_tokens: 500,
        cache_read_input_tokens: 200,
        output_tokens: 1,
      },
    },
  }));
  const completed = mergeStreamUsage(started, extractStreamUsageFragment({
    type: "message_delta",
    usage: { output_tokens: 120 },
  }));

  assert.deepEqual(completed, {
    inputTokens: 500,
    cachedInputTokens: 200,
    outputTokens: 120,
    reasoningTokens: 0,
    totalTokens: 620,
  });
});

test("reads OpenAI-compatible final stream usage", () => {
  const usage = mergeStreamUsage(null, extractStreamUsageFragment({
    usage: {
      prompt_tokens: 212,
      completion_tokens: 1346,
      total_tokens: 1558,
      completion_tokens_details: { reasoning_tokens: 600 },
    },
  }));

  assert.equal(usage?.totalTokens, 1558);
  assert.equal(usage?.reasoningTokens, 600);
});

function configureReporter(t: TestContext) {
  const values = {
    MAIN_APP_URL: "https://main.test/",
    USAGE_MONITOR_URL: "",
    USAGE_MONITOR_INTERNAL_SECRET: "test-only-usage-secret-at-least-32-characters",
    OPENLUX_API_BASE_URL: "https://api.openlux.ai/v1",
    OPENLUX_API_KEY: "test-only-provider-key",
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
    return Response.json({ success: true, accepted: true });
  });
  return calls;
}

const reportInput = {
  user: { userId: "verified-main-user", account: "account", nickname: "nickname", groupName: "group" },
  providerId: "openlux",
  model: "gpt-6-astra",
  usage: { inputTokens: 1000, cachedInputTokens: 400, outputTokens: 300, reasoningTokens: 120, totalTokens: 1300 },
  groupMultiplier: 2,
};

test("OpenLux sends authenticated canonical usage with the actual model and no credentials in its body", async t => {
  const calls = configureReporter(t);
  for (const model of ["gpt-5.5", "gpt-5.6-luna", "gpt-6-astra"]) {
    await reportKbChatTextUsage({ ...reportInput, model });
  }
  assert.equal(calls.length, 3);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.url, "https://main.test/api/sso/usage");
    assert.equal(call.init.method, "POST");
    assert.deepEqual(Object.fromEntries(new Headers(call.init.headers)), {
      "content-type": "application/json",
      "x-usage-secret": process.env.USAGE_MONITOR_INTERNAL_SECRET,
      "x-usage-tool": "kb-chat",
    });
    assert.match(String(call.body.requestId), /^[0-9a-f-]{36}$/);
    assert.deepEqual(call.body, {
      userId: "verified-main-user",
      requestId: call.body.requestId,
      provider: "api.openlux.ai",
      model: ["gpt-5.5", "gpt-5.6-luna", "gpt-6-astra"][index],
      status: "completed",
      tokenBasis: "reported",
      ...reportInput.usage,
      cacheWriteTokens: 0,
    });
    assert.ok(!String(call.init.body).includes(process.env.OPENLUX_API_KEY!));
    assert.ok(!String(call.init.body).includes(process.env.USAGE_MONITOR_INTERNAL_SECRET!));
  }
  assert.equal(new Set(calls.map(call => call.body.requestId)).size, calls.length);
});

test("OpenLux upgrades an explicit legacy endpoint path and keeps its query", async t => {
  const calls = configureReporter(t);
  process.env.USAGE_MONITOR_URL = "https://monitor.test/base/api/internal/usage-events/?deployment=blue";
  await reportKbChatTextUsage(reportInput);
  assert.equal(calls[0].url, "https://monitor.test/base/api/sso/usage?deployment=blue");
});

test("OpenLux preserves an explicit custom reporting endpoint", async t => {
  const calls = configureReporter(t);
  process.env.USAGE_MONITOR_URL = "https://monitor.test/custom/usage?deployment=blue";
  await reportKbChatTextUsage(reportInput);
  assert.equal(calls[0].url, process.env.USAGE_MONITOR_URL);
  assert.equal(calls[0].body.tokenBasis, "reported");
});

test("OpenLux reports the configured upstream hostname even when it points to Yunwu", async t => {
  const calls = configureReporter(t);
  process.env.OPENLUX_API_BASE_URL = "https://yunwu.ai/v1";
  await reportKbChatTextUsage(reportInput);
  assert.equal(calls[0].body.provider, "yunwu.ai");
});

test("OpenLux uses its default hostname when its base URL is unset", async t => {
  const calls = configureReporter(t);
  delete process.env.OPENLUX_API_BASE_URL;
  await reportKbChatTextUsage(reportInput);
  assert.equal(calls[0].body.provider, "api.openlux.ai");
});

test("OpenLux totals count cached input and reasoning output only once", async t => {
  const calls = configureReporter(t);
  await reportKbChatTextUsage({ ...reportInput, usage: { ...reportInput.usage, totalTokens: 1820 } });
  assert.equal(calls[0].body.totalTokens, 1300);
  assert.equal(calls[0].body.cachedInputTokens, 400);
  assert.equal(calls[0].body.reasoningTokens, 120);
});

test("other providers retain legacy reporting, authentication and explicit endpoint behavior", async t => {
  const calls = configureReporter(t);
  for (const providerId of ["yunwu", "yunwu_claude_messages", "newapi"]) {
    await reportKbChatTextUsage({ ...reportInput, providerId });
  }
  process.env.USAGE_MONITOR_URL = "https://monitor.test/api/internal/usage-events";
  await reportKbChatTextUsage({ ...reportInput, providerId: "yunwu" });
  assert.equal(calls.length, 4);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.url, index === 3 ? process.env.USAGE_MONITOR_URL : "https://main.test/api/internal/usage-events");
    assert.deepEqual(Object.fromEntries(new Headers(call.init.headers)), {
      "content-type": "application/json",
      "x-usage-monitor-secret": process.env.USAGE_MONITOR_INTERNAL_SECRET,
    });
    assert.equal(call.body.status, "succeeded");
    assert.equal(call.body.providerId, ["yunwu", "yunwu_claude_messages", "newapi", "yunwu"][index]);
    assert.deepEqual(call.body.usage, reportInput.usage);
    assert.equal(call.body.groupMultiplier, 2);
  }
});

test("reporting stays disabled without its endpoint or shared secret", async t => {
  const calls = configureReporter(t);
  delete process.env.MAIN_APP_URL;
  await reportKbChatTextUsage(reportInput);
  process.env.MAIN_APP_URL = "https://main.test";
  delete process.env.USAGE_MONITOR_INTERNAL_SECRET;
  await reportKbChatTextUsage(reportInput);
  assert.equal(calls.length, 0);
});

test("OpenLux report failures remain non-fatal", async t => {
  configureReporter(t);
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => errors.push(args));
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: false }, { status: 401 }));
  await assert.doesNotReject(reportKbChatTextUsage(reportInput));
  t.mock.method(globalThis, "fetch", async () => { throw new Error("network unavailable"); });
  await assert.doesNotReject(reportKbChatTextUsage(reportInput));
  assert.equal(errors.length, 2);
});
