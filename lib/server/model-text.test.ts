import assert from "node:assert/strict";
import test from "node:test";

test("GPT-6 and GPT-5.6 send distinct models through the same OpenLux endpoint and key", async () => {
  const previousBase = process.env.OPENLUX_API_BASE_URL;
  const previousKey = process.env.OPENLUX_API_KEY;
  const originalFetch = globalThis.fetch;
  const calls: { url: string; authorization: string | null; model: string }[] = [];
  process.env.OPENLUX_API_BASE_URL = "https://openlux.test/v1";
  process.env.OPENLUX_API_KEY = "shared-test-key";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), authorization: new Headers(init?.headers).get("Authorization"), model: body.model });
    return Response.json({ output_text: "test answer" });
  };
  try {
    const { generateModelText } = await import("@/lib/server/model-text");
    for (const modelId of ["yunwu-gpt-5.4", "yunwu-gpt-5.6", "yunwu-gpt-6"]) {
      assert.equal(await generateModelText({ modelId, systemPrompt: "test", userPrompt: "hello" }), "test answer");
    }
    assert.deepEqual(calls.map(call => call.model), ["gpt-5.5", "gpt-5.6-luna", "gpt-6-astra"]);
    for (const call of calls) {
      assert.equal(call.url, "https://openlux.test/v1/responses");
      assert.equal(call.authorization, "Bearer shared-test-key");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBase === undefined) delete process.env.OPENLUX_API_BASE_URL;
    else process.env.OPENLUX_API_BASE_URL = previousBase;
    if (previousKey === undefined) delete process.env.OPENLUX_API_KEY;
    else process.env.OPENLUX_API_KEY = previousKey;
  }
});
