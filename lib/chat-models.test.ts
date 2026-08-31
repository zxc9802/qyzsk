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

test("GPT-5.5 and GPT-5.6 share one provider while routing to distinct upstream models", () => {
  const gpt55 = getChatModelOption("yunwu-gpt-5.4");
  const gpt56 = getChatModelOption("yunwu-gpt-5.6");

  assert.equal(gpt55.label, "GPT-5.5");
  assert.equal(gpt55.shortLabel, "GPT-5.5");
  assert.equal(gpt55.description, "走 OpenLux 的 GPT-5.5");
  assert.equal(gpt55.apiModel, "gpt-5.5");
  assert.equal(gpt56.label, "GPT-5.6");
  assert.equal(gpt56.shortLabel, "GPT-5.6");
  assert.equal(gpt56.description, "走 OpenLux 的 GPT-5.6 Luna");
  assert.equal(gpt56.apiModel, "gpt-5.6-luna");
  assert.equal(gpt55.provider, "openlux");
  assert.equal(gpt56.provider, gpt55.provider);
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
