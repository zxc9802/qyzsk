import assert from "node:assert/strict";
import test from "node:test";
import { generateResponsesText } from "@/lib/server/openai-responses";

test("generateResponsesText calls the OpenLux Responses endpoint and extracts text", async () => {
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};

  const result = await generateResponsesText({
    baseUrl: "https://api.openlux.ai",
    apiKey: "test-key",
    model: "gpt-5.6-luna",
    instructions: "system",
    input: [{ role: "user", content: "question" }],
    maxOutputTokens: 512,
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({
        model: "gpt-5.6-luna",
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
        output: [{ content: [{ type: "output_text", text: "OK" }] }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(capturedUrl, "https://api.openlux.ai/v1/responses");
  assert.equal(capturedBody.model, "gpt-5.6-luna");
  assert.equal(capturedBody.instructions, "system");
  assert.equal(capturedBody.max_output_tokens, 512);
  assert.deepEqual(capturedBody.input, [{ role: "user", content: "question" }]);
  assert.equal(result.text, "OK");
  assert.equal(result.payload.model, "gpt-5.6-luna");
});
