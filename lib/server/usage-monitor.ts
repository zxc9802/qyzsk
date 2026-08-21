import { randomUUID } from "node:crypto";

export type KbChatTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type KbChatUsageUser = {
  userId: string;
  account?: string;
  nickname?: string;
  groupName?: string;
  billingAudience?: "internal" | "external";
};

function readNonnegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function extractStreamUsageFragment(payload: unknown): Partial<KbChatTokenUsage> | null {
  const root = readRecord(payload);
  const message = readRecord(root?.message);
  const usage = readRecord(root?.usage) || readRecord(message?.usage);
  if (!usage) return null;

  const promptDetails = readRecord(usage.prompt_tokens_details) || readRecord(usage.input_tokens_details);
  const completionDetails = readRecord(usage.completion_tokens_details) || readRecord(usage.output_tokens_details);
  const inputTokens = readNonnegativeInteger(usage.prompt_tokens ?? usage.input_tokens);
  const cachedInputTokens = Math.min(
    inputTokens,
    readNonnegativeInteger(
      promptDetails?.cached_tokens
      ?? usage.cache_read_input_tokens
      ?? usage.cached_input_tokens,
    ),
  );
  const outputTokens = readNonnegativeInteger(usage.completion_tokens ?? usage.output_tokens);
  const reasoningTokens = Math.min(
    outputTokens,
    readNonnegativeInteger(completionDetails?.reasoning_tokens ?? usage.reasoning_tokens),
  );
  const totalTokens = readNonnegativeInteger(usage.total_tokens);

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) return null;
  return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens };
}

export function mergeStreamUsage(
  current: KbChatTokenUsage | null,
  fragment: Partial<KbChatTokenUsage> | null,
): KbChatTokenUsage | null {
  if (!fragment) return current;

  const inputTokens = Math.max(current?.inputTokens || 0, fragment.inputTokens || 0);
  const cachedInputTokens = Math.min(
    inputTokens,
    Math.max(current?.cachedInputTokens || 0, fragment.cachedInputTokens || 0),
  );
  const outputTokens = Math.max(current?.outputTokens || 0, fragment.outputTokens || 0);
  const reasoningTokens = Math.min(
    outputTokens,
    Math.max(current?.reasoningTokens || 0, fragment.reasoningTokens || 0),
  );
  const totalTokens = Math.max(
    current?.totalTokens || 0,
    fragment.totalTokens || 0,
    inputTokens + outputTokens,
  );

  return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens };
}

function resolveUsageMonitorUrl() {
  const explicitUrl = process.env.USAGE_MONITOR_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const mainAppUrl = process.env.MAIN_APP_URL?.trim().replace(/\/+$/, "");
  return mainAppUrl ? `${mainAppUrl}/api/internal/usage-events` : "";
}

export async function reportKbChatTextUsage(input: {
  user: KbChatUsageUser;
  model: string;
  providerId: string;
  usage: KbChatTokenUsage;
  groupMultiplier?: number;
}) {
  const endpoint = resolveUsageMonitorUrl();
  const secret = process.env.USAGE_MONITOR_INTERNAL_SECRET?.trim();
  if (!endpoint || !secret) return;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-usage-monitor-secret": secret,
      },
      body: JSON.stringify({
        userId: input.user.userId,
        userEmail: input.user.account,
        userNickname: input.user.nickname,
        userGroup: input.user.groupName,
        billingAudience: input.user.billingAudience === "internal" ? "internal" : "external",
        appId: "kb-chat",
        channel: "kb-chat-answer",
        providerId: input.providerId,
        model: input.model,
        requestId: randomUUID(),
        status: "succeeded",
        usage: input.usage,
        usageSource: "response",
        groupMultiplier: input.groupMultiplier || 1,
        usdCnyRate: Number(process.env.USAGE_MONITOR_USD_CNY_RATE) || 7.3,
      }),
    });

    if (!response.ok) {
      console.error("[usage-monitor] kb-chat usage report failed:", response.status);
    }
  } catch (error) {
    console.error("[usage-monitor] kb-chat usage report failed:", error);
  }
}
