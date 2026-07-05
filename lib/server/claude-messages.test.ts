import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaudeMessagesPayload,
  extractClaudeStreamContent,
  readClaudeMessagesText,
} from "@/lib/server/claude-messages";

test("buildClaudeMessagesPayload moves system messages to top-level system", () => {
  const payload = buildClaudeMessagesPayload({
    model: "claude-opus-4-6",
    stream: true,
    maxTokens: 4096,
    temperature: 0.3,
    messages: [
      { role: "system", content: "系统规则" },
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好，有什么可以帮你？" },
    ],
  });

  assert.deepEqual(payload, {
    model: "claude-opus-4-6",
    stream: true,
    max_tokens: 4096,
    temperature: 0.3,
    system: "系统规则",
    messages: [
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好，有什么可以帮你？" },
    ],
  });
});

test("buildClaudeMessagesPayload converts data URL images", () => {
  const payload = buildClaudeMessagesPayload({
    model: "claude-opus-4-6",
    stream: false,
    maxTokens: 300,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "看这张图" },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
        ],
      },
    ],
  });

  assert.deepEqual(payload.messages, [
    {
      role: "user",
      content: [
        { type: "text", text: "看这张图" },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: "abc123",
          },
        },
      ],
    },
  ]);
});

test("extractClaudeStreamContent reads Claude text deltas", () => {
  assert.equal(
    extractClaudeStreamContent(
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "阶段性判断" },
      })
    ),
    "阶段性判断"
  );
  assert.equal(extractClaudeStreamContent(JSON.stringify({ type: "ping" })), null);
});

test("readClaudeMessagesText reads non-stream Claude content", () => {
  assert.equal(
    readClaudeMessagesText({
      content: [
        { type: "text", text: "第一段" },
        { type: "tool_use", name: "noop" },
        { type: "text", text: "第二段" },
      ],
    }),
    "第一段\n\n第二段"
  );
});
