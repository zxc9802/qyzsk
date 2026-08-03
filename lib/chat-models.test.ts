import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_MODELS, getChatModelOption } from "@/lib/chat-models";

test("primary chat model is displayed and routed as Claude Opus 4.6", () => {
  const primary = getChatModelOption("gemini-3.1-pro-preview");

  assert.equal(primary.label, "claude-opus-4-6");
  assert.equal(primary.shortLabel, "claude-opus-4-6");
  assert.equal(primary.provider, "yunwu_claude_messages");
  assert.equal(primary.apiModel, "claude-opus-4-6");
  assert.equal(primary.apiModelEnvName, "YUNWU_CLAUDE_CHAT_MODEL");
  assert.equal(primary.apiKeyEnvName, "YUNWU_CLAUDE_CHAT_API_KEY");
});

test("GPT selection routes to GPT-5.6 Luna while retaining its display label", () => {
  const gpt = getChatModelOption("yunwu-gpt-5.4");

  assert.equal(gpt.label, "GPT-5.5");
  assert.equal(gpt.shortLabel, "GPT-5.5");
  assert.equal(gpt.description, "走 Yunwu 的 GPT-5.5");
  assert.equal(gpt.apiModel, "gpt-5.6-luna");
});

test("other chat model labels stay unchanged", () => {
  assert.deepEqual(
    CHAT_MODELS.slice(1, 2).map((model) => [model.id, model.label]),
    [
      ["yunwu-gemini-3-flash-preview", "Gemini 快速"],
    ]
  );
});

test("Gemini quick routes to the configured Yunwu Gemini chat model", () => {
  const quick = getChatModelOption("yunwu-gemini-3-flash-preview");

  assert.equal(quick.label, "Gemini 快速");
  assert.equal(quick.provider, "yunwu");
  assert.equal(quick.apiModel, "gemini-3.5-flash");
  assert.equal(quick.apiModelEnvName, "YUNWU_GEMINI_CHAT_MODEL");
  assert.equal(quick.apiKeyEnvName, "YUNWU_GEMINI_API_KEY");
});
