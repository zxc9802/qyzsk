import assert from "node:assert/strict";
import test from "node:test";
import {
  extractStreamUsageFragment,
  mergeStreamUsage,
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
