import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "@/lib/types";
import {
  buildLightCompressionMemory,
  createConversationContextKey,
  evaluateCompressionPlan,
  getCompressionRetryDelayMs,
  isLikelyContextOverflowError,
  type ContextBudgetConfig,
} from "@/lib/server/conversation-context";

function createMessage(role: Message["role"], content: string, index: number): Message {
  return {
    id: `${role}-${index}`,
    role,
    content,
    timestamp: index,
  };
}

function createConversation(userTurnCount: number, charsPerTurn: number): Message[] {
  const messages: Message[] = [];

  for (let index = 0; index < userTurnCount; index += 1) {
    const userContent = `用户问题 ${index + 1}：${"问".repeat(charsPerTurn)}`;
    const assistantContent = `助手回答 ${index + 1}：${"答".repeat(charsPerTurn)}`;
    messages.push(createMessage("user", userContent, index * 2));
    messages.push(createMessage("assistant", assistantContent, index * 2 + 1));
  }

  return messages;
}

const BASE_BUDGET: ContextBudgetConfig = {
  modelId: "test-model",
  maxContextChars: 10_000,
  reservedChars: 2_000,
  conversationBudgetChars: 4_000,
  emergencyThresholdRatio: 0.92,
  recentWindowMessageCount: 8,
};

test("evaluateCompressionPlan keeps none before the eleventh user turn", () => {
  const plan = evaluateCompressionPlan({
    messages: createConversation(10, 30),
    budgetConfig: BASE_BUDGET,
  });

  assert.equal(plan.userTurnCount, 10);
  assert.equal(plan.desiredTier, "none");
});

test("evaluateCompressionPlan chooses light after the eleventh user turn below micro threshold", () => {
  const plan = evaluateCompressionPlan({
    messages: createConversation(11, 25),
    budgetConfig: {
      ...BASE_BUDGET,
      conversationBudgetChars: 6_000,
    },
  });

  assert.equal(plan.desiredTier, "light");
  assert.equal(plan.compressibleMessages.length, 14);
  assert.equal(plan.recentMessages.length, 8);
});

test("evaluateCompressionPlan chooses micro once raw usage reaches thirty percent", () => {
  const plan = evaluateCompressionPlan({
    messages: createConversation(11, 70),
    budgetConfig: BASE_BUDGET,
  });

  assert.equal(plan.desiredTier, "micro");
  assert.ok(plan.rawUsageRatio >= 0.3);
});

test("evaluateCompressionPlan chooses full once raw usage reaches seventy percent", () => {
  const plan = evaluateCompressionPlan({
    messages: createConversation(11, 180),
    budgetConfig: BASE_BUDGET,
  });

  assert.equal(plan.desiredTier, "full");
  assert.ok(plan.rawUsageRatio >= 0.7);
});

test("buildLightCompressionMemory keeps diagnoses, sources, and open issues", () => {
  const messages: Message[] = [
    {
      ...createMessage("user", "我们最近在看一款洗地机，想知道还有没有必要继续做。", 1),
    },
    {
      ...createMessage("assistant", "先别急着定结论，需要把价格带、竞争强度和达人素材准备情况一起看。", 2),
      questionDiagnosis: {
        categoryId: "product-check",
        categoryLabel: "产品判断",
        mode: "clarify",
        completenessScore: 55,
        missingSlots: ["价格带", "渠道"],
        summary: "当前信息不足，需要先补充价格带和渠道信息。",
      },
      sourceHits: [
        {
          id: "file-1",
          type: "file",
          title: "洗地机复盘.pdf",
          category: "资料",
        },
      ],
    },
    createMessage("user", "我目前只知道竞品在 999 到 1499 之间，但达人素材还不够。", 3),
    createMessage("assistant", "那现在最大的缺口不是定价，而是素材供给和验证节奏。", 4),
  ];

  const memory = buildLightCompressionMemory(messages);

  assert.match(memory, /产品判断/u);
  assert.match(memory, /洗地机复盘\.pdf/u);
  assert.match(memory, /达人素材/u);
});

test("getCompressionRetryDelayMs follows exponential backoff for five retries", () => {
  assert.equal(getCompressionRetryDelayMs(1), 1_000);
  assert.equal(getCompressionRetryDelayMs(2), 2_000);
  assert.equal(getCompressionRetryDelayMs(3), 4_000);
  assert.equal(getCompressionRetryDelayMs(4), 8_000);
  assert.equal(getCompressionRetryDelayMs(5), 16_000);
});

test("isLikelyContextOverflowError recognizes common upstream overflow messages", () => {
  assert.equal(isLikelyContextOverflowError("maximum context length exceeded"), true);
  assert.equal(isLikelyContextOverflowError("prompt is too long for this model"), true);
  assert.equal(isLikelyContextOverflowError("insufficient_quota"), false);
});

test("createConversationContextKey scopes keys by user and conversation", () => {
  assert.equal(createConversationContextKey("u1", "c1"), "u1::c1");
});
