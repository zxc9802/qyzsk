import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_WIKI_DRAFT_MODEL_ID,
  getChatModelOption,
} from "@/lib/chat-models";
import { isDatabaseConfigured, withDbClient } from "@/lib/server/db";
import { STORAGE_ROOT } from "@/lib/server/file-store";
import { generateModelText } from "@/lib/server/model-text";
import { getConversationRecord } from "@/lib/server/chat-state-store";
import type { Message } from "@/lib/types";

export type CompressionTier = "none" | "light" | "micro" | "full";
export type ConversationContextTaskStatus = "idle" | "queued" | "running" | "failed";

export interface CompressionAttemptState {
  retryCount: number;
  lastError?: string;
  nextRetryAtMs?: number;
  lastAttemptAtMs?: number;
}

export interface ContextBudgetConfig {
  modelId: string;
  maxContextChars: number;
  reservedChars: number;
  conversationBudgetChars: number;
  emergencyThresholdRatio: number;
  recentWindowMessageCount: number;
}

export interface ConversationContextState {
  conversationId: string;
  tier: CompressionTier;
  modelId: string;
  sourceFingerprint: string;
  sourceMessageCount: number;
  compressedMessageCount: number;
  recentWindowMessageCount: number;
  memoryText: string;
  estimatedBudgetChars: number;
  estimatedUsedChars: number;
  usageRatio: number;
  lastEvaluatedAtMs: number;
  taskStatus: ConversationContextTaskStatus;
  attempt: CompressionAttemptState;
  updatedAtMs: number;
}

export interface CompressionJobPayload {
  userId: string;
  conversationId: string;
  modelId: string;
  trigger: "state_save" | "retry" | "emergency";
  requestedAtMs: number;
  retryCount?: number;
  forceTier?: CompressionTier | "emergency";
}

export interface CompressionPlan {
  desiredTier: CompressionTier;
  userTurnCount: number;
  rawConversationChars: number;
  rawUsageRatio: number;
  compressibleMessages: Message[];
  recentMessages: Message[];
}

const CONTEXT_STATE_FILE_NAME = "context-state.json";
const COMPRESSION_PROMPT_MODEL_ID = DEFAULT_WIKI_DRAFT_MODEL_ID;
const CONTEXT_WINDOW_MESSAGE_COUNT = 8;
const MIN_USER_TURNS_FOR_COMPRESSION = 11;
const MICRO_COMPRESSION_RATIO = 0.3;
const FULL_COMPRESSION_RATIO = 0.7;
const DEFAULT_EMERGENCY_THRESHOLD_RATIO = 0.92;
const MAX_TRANSCRIPT_PROMPT_CHARS = 24_000;
const DEFAULT_CONTEXT_BUDGETS: Record<string, ContextBudgetConfig> = {
  "gemini-3.1-pro-preview": {
    modelId: "gemini-3.1-pro-preview",
    maxContextChars: 160_000,
    reservedChars: 26_000,
    conversationBudgetChars: 134_000,
    emergencyThresholdRatio: DEFAULT_EMERGENCY_THRESHOLD_RATIO,
    recentWindowMessageCount: CONTEXT_WINDOW_MESSAGE_COUNT,
  },
  "yunwu-gemini-3-flash-preview": {
    modelId: "yunwu-gemini-3-flash-preview",
    maxContextChars: 120_000,
    reservedChars: 22_000,
    conversationBudgetChars: 98_000,
    emergencyThresholdRatio: DEFAULT_EMERGENCY_THRESHOLD_RATIO,
    recentWindowMessageCount: CONTEXT_WINDOW_MESSAGE_COUNT,
  },
  "yunwu-gpt-5.4": {
    modelId: "yunwu-gpt-5.4",
    maxContextChars: 90_000,
    reservedChars: 24_000,
    conversationBudgetChars: 66_000,
    emergencyThresholdRatio: DEFAULT_EMERGENCY_THRESHOLD_RATIO,
    recentWindowMessageCount: CONTEXT_WINDOW_MESSAGE_COUNT,
  },
};
const COMPRESSION_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120) || "default";
}

function contextStatePath(userId: string, conversationId: string) {
  return path.join(
    STORAGE_ROOT,
    "users",
    sanitizeSegment(userId),
    "conversations",
    sanitizeSegment(conversationId),
    CONTEXT_STATE_FILE_NAME
  );
}

function trimText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function capJoinedLength(values: string[], maxLength: number) {
  const lines: string[] = [];
  let used = 0;

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const nextLength = used + normalized.length + (lines.length > 0 ? 1 : 0);
    if (nextLength > maxLength && lines.length > 0) break;
    lines.push(normalized);
    used = nextLength;
  }

  return lines;
}

function normalizeAttemptState(value: unknown): CompressionAttemptState {
  const candidate = value && typeof value === "object" ? value as Partial<CompressionAttemptState> : {};
  return {
    retryCount:
      typeof candidate.retryCount === "number" && Number.isFinite(candidate.retryCount)
        ? Math.max(0, Math.floor(candidate.retryCount))
        : 0,
    lastError: typeof candidate.lastError === "string" ? trimText(candidate.lastError, 600) : undefined,
    nextRetryAtMs:
      typeof candidate.nextRetryAtMs === "number" && Number.isFinite(candidate.nextRetryAtMs)
        ? Math.max(0, Math.floor(candidate.nextRetryAtMs))
        : undefined,
    lastAttemptAtMs:
      typeof candidate.lastAttemptAtMs === "number" && Number.isFinite(candidate.lastAttemptAtMs)
        ? Math.max(0, Math.floor(candidate.lastAttemptAtMs))
        : undefined,
  };
}

function createDefaultConversationContextState(conversationId: string, modelId: string = DEFAULT_CHAT_MODEL_ID): ConversationContextState {
  const now = Date.now();
  const budget = getContextBudgetConfig(modelId);

  return {
    conversationId,
    tier: "none",
    modelId: budget.modelId,
    sourceFingerprint: "",
    sourceMessageCount: 0,
    compressedMessageCount: 0,
    recentWindowMessageCount: budget.recentWindowMessageCount,
    memoryText: "",
    estimatedBudgetChars: budget.conversationBudgetChars,
    estimatedUsedChars: 0,
    usageRatio: 0,
    lastEvaluatedAtMs: 0,
    taskStatus: "idle",
    attempt: {
      retryCount: 0,
    },
    updatedAtMs: now,
  };
}

function normalizeContextState(conversationId: string, value: unknown): ConversationContextState {
  const candidate = value && typeof value === "object" ? value as Partial<ConversationContextState> : {};
  const fallback = createDefaultConversationContextState(
    typeof candidate.conversationId === "string" && candidate.conversationId.trim()
      ? candidate.conversationId
      : conversationId,
    typeof candidate.modelId === "string" && candidate.modelId.trim()
      ? candidate.modelId
      : DEFAULT_CHAT_MODEL_ID
  );
  const tier = candidate.tier === "light" || candidate.tier === "micro" || candidate.tier === "full"
    ? candidate.tier
    : "none";
  const taskStatus =
    candidate.taskStatus === "queued" || candidate.taskStatus === "running" || candidate.taskStatus === "failed"
      ? candidate.taskStatus
      : "idle";
  const sourceMessageCount =
    typeof candidate.sourceMessageCount === "number" && Number.isFinite(candidate.sourceMessageCount)
      ? Math.max(0, Math.floor(candidate.sourceMessageCount))
      : fallback.sourceMessageCount;
  const compressedMessageCount =
    typeof candidate.compressedMessageCount === "number" && Number.isFinite(candidate.compressedMessageCount)
      ? Math.max(0, Math.floor(candidate.compressedMessageCount))
      : fallback.compressedMessageCount;
  const recentWindowMessageCount =
    typeof candidate.recentWindowMessageCount === "number" && Number.isFinite(candidate.recentWindowMessageCount)
      ? Math.max(0, Math.floor(candidate.recentWindowMessageCount))
      : fallback.recentWindowMessageCount;

  return {
    conversationId: fallback.conversationId,
    tier,
    modelId: typeof candidate.modelId === "string" && candidate.modelId.trim() ? candidate.modelId.trim() : fallback.modelId,
    sourceFingerprint:
      typeof candidate.sourceFingerprint === "string" ? trimText(candidate.sourceFingerprint, 200) : fallback.sourceFingerprint,
    sourceMessageCount,
    compressedMessageCount: Math.min(compressedMessageCount, sourceMessageCount),
    recentWindowMessageCount,
    memoryText: typeof candidate.memoryText === "string" ? candidate.memoryText.trim() : fallback.memoryText,
    estimatedBudgetChars:
      typeof candidate.estimatedBudgetChars === "number" && Number.isFinite(candidate.estimatedBudgetChars)
        ? Math.max(0, Math.floor(candidate.estimatedBudgetChars))
        : fallback.estimatedBudgetChars,
    estimatedUsedChars:
      typeof candidate.estimatedUsedChars === "number" && Number.isFinite(candidate.estimatedUsedChars)
        ? Math.max(0, Math.floor(candidate.estimatedUsedChars))
        : fallback.estimatedUsedChars,
    usageRatio:
      typeof candidate.usageRatio === "number" && Number.isFinite(candidate.usageRatio)
        ? Math.max(0, candidate.usageRatio)
        : fallback.usageRatio,
    lastEvaluatedAtMs:
      typeof candidate.lastEvaluatedAtMs === "number" && Number.isFinite(candidate.lastEvaluatedAtMs)
        ? Math.max(0, Math.floor(candidate.lastEvaluatedAtMs))
        : fallback.lastEvaluatedAtMs,
    taskStatus,
    attempt: normalizeAttemptState(candidate.attempt),
    updatedAtMs:
      typeof candidate.updatedAtMs === "number" && Number.isFinite(candidate.updatedAtMs)
        ? Math.max(0, Math.floor(candidate.updatedAtMs))
        : fallback.updatedAtMs,
  };
}

async function readLocalContextState(userId: string, conversationId: string): Promise<ConversationContextState | null> {
  try {
    const raw = await fs.readFile(contextStatePath(userId, conversationId), "utf8");
    return normalizeContextState(conversationId, JSON.parse(raw));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return null;
    throw error;
  }
}

async function writeLocalContextState(userId: string, state: ConversationContextState) {
  const filePath = contextStatePath(userId, state.conversationId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function deleteLocalContextState(userId: string, conversationId: string) {
  await fs.rm(contextStatePath(userId, conversationId), { force: true });
}

function buildConversationLine(message: Message): string {
  const roleLabel = message.role === "user" ? "用户" : "助手";
  const diagnosis =
    message.role === "assistant" && message.questionDiagnosis
      ? `｜诊断=${message.questionDiagnosis.categoryLabel}/${message.questionDiagnosis.mode}/${message.questionDiagnosis.completenessScore}%`
      : "";
  const sourceNames = (message.sourceHits || [])
    .slice(0, 3)
    .map((item) => item.title)
    .filter(Boolean);
  const sources = sourceNames.length > 0 ? `｜来源=${sourceNames.join("、")}` : "";

  return `${roleLabel}${diagnosis}${sources}：${trimText(message.content, 240)}`;
}

function trimTranscript(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;

  const headBudget = Math.floor(maxChars * 0.5);
  const tailBudget = Math.floor(maxChars * 0.35);
  return `${value.slice(0, headBudget)}\n\n[中间较长对话已折叠]\n\n${value.slice(-tailBudget)}`;
}

function buildCompressionPrompt(messages: Message[], tier: "micro" | "full") {
  const transcript = trimTranscript(messages.map(buildConversationLine).join("\n"), MAX_TRANSCRIPT_PROMPT_CHARS);
  const common = [
    "你在为下轮问答生成后台会话记忆，不是直接回复用户。",
    "输出纯文本，不要写多余前言。",
    "保留具体事实、明确结论、未解决问题，不要空话。",
    "如果信息有不确定性，要明确写成“待确认”而不是假设为真。",
  ];

  if (tier === "micro") {
    return [
      ...common,
      "请严格按以下 5 段输出：",
      "【用户目标演进】",
      "【已确认事实】",
      "【关键判断】",
      "【已尝试方法】",
      "【未解决问题】",
      "",
      "对话记录：",
      transcript,
    ].join("\n");
  }

  return [
    ...common,
    "请整理成可长期复用的 durable summary，严格按以下 6 段输出：",
    "【会话主线】",
    "【用户长期目标】",
    "【已确认事实与约束】",
    "【关键判断与建议】",
    "【待确认风险】",
    "【后续继续回答时要承接的线索】",
    "",
    "对话记录：",
    transcript,
  ].join("\n");
}

async function generateCompressionMemory(messages: Message[], tier: "micro" | "full") {
  return generateModelText({
    modelId: COMPRESSION_PROMPT_MODEL_ID,
    systemPrompt: "你是系统后台的会话压缩器，只负责把历史对话浓缩成可继续追问的记忆。",
    userPrompt: buildCompressionPrompt(messages, tier),
    temperature: 0.1,
    maxTokens: tier === "full" ? 1_200 : 900,
  });
}

function buildUniqueBullets(messages: Message[], role: Message["role"], maxItems: number) {
  const seen = new Set<string>();
  const bullets: string[] = [];

  messages.forEach((message) => {
    if (message.role !== role) return;
    const snippet = trimText(message.content, 100);
    if (!snippet || seen.has(snippet)) return;
    seen.add(snippet);
    bullets.push(`- ${snippet}`);
  });

  return bullets.slice(0, maxItems);
}

export function buildLightCompressionMemory(messages: Message[]): string {
  const userNeeds = buildUniqueBullets(messages, "user", 6);
  const assistantFindings = buildUniqueBullets(messages, "assistant", 6);
  const diagnoses = capJoinedLength(
    messages
      .filter((message) => message.role === "assistant" && message.questionDiagnosis)
      .map((message) => {
        const diagnosis = message.questionDiagnosis!;
        const missing = diagnosis.missingSlots.length > 0 ? `；仍缺=${diagnosis.missingSlots.join("、")}` : "";
        return `- ${diagnosis.categoryLabel}｜${diagnosis.mode}｜完整度=${diagnosis.completenessScore}%｜${trimText(diagnosis.summary, 90)}${missing}`;
      }),
    420
  );
  const sources = capJoinedLength(
    Array.from(
      new Set(
        messages.flatMap((message) => [
          ...(message.sourceHits || []).map((item) => item.title),
          ...(message.kbHits || []).map((item) => item.title),
        ])
      )
    )
      .filter(Boolean)
      .slice(0, 6)
      .map((title) => `- ${trimText(title, 80)}`),
    260
  );
  const openIssues = capJoinedLength(
    messages
      .filter((message) => message.role === "user")
      .slice(-3)
      .map((message) => `- ${trimText(message.content, 110)}`),
    360
  );

  return [
    "以下是后台维护的轻量会话记忆，请把它当作更早对话的压缩版本。",
    userNeeds.length > 0 ? `【用户关心的问题】\n${userNeeds.join("\n")}` : "",
    assistantFindings.length > 0 ? `【已有判断】\n${assistantFindings.join("\n")}` : "",
    diagnoses.length > 0 ? `【诊断记录】\n${diagnoses.join("\n")}` : "",
    sources.length > 0 ? `【涉及资料/来源】\n${sources.join("\n")}` : "",
    openIssues.length > 0 ? `【仍待继续承接的问题】\n${openIssues.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function estimateSourceChars(message: Message) {
  const sourceText = [
    ...(message.kbHits || []).map((item) => `${item.title} ${item.category}`),
    ...(message.sourceHits || []).map((item) => `${item.title} ${item.detail || ""}`),
  ]
    .join(" ")
    .trim();

  return Math.min(320, sourceText.length);
}

function estimateMessageChars(message: Message) {
  const diagnosisChars = message.questionDiagnosis
    ? message.questionDiagnosis.summary.length
      + message.questionDiagnosis.categoryLabel.length
      + message.questionDiagnosis.missingSlots.join("").length
    : 0;

  return message.content.trim().length + diagnosisChars + estimateSourceChars(message) + 28;
}

function estimateMessagesChars(messages: Message[]) {
  return messages.reduce((total, message) => total + estimateMessageChars(message), 0);
}

function countUserTurns(messages: Message[]) {
  return messages.filter((message) => message.role === "user" && message.content.trim()).length;
}

function normalizeBudgetConfig(modelId?: string | null): ContextBudgetConfig {
  const resolvedModelId =
    modelId && DEFAULT_CONTEXT_BUDGETS[modelId]
      ? modelId
      : getChatModelOption(modelId || DEFAULT_CHAT_MODEL_ID).id;

  return DEFAULT_CONTEXT_BUDGETS[resolvedModelId] || DEFAULT_CONTEXT_BUDGETS[DEFAULT_CHAT_MODEL_ID];
}

export function getContextBudgetConfig(modelId?: string | null): ContextBudgetConfig {
  return normalizeBudgetConfig(modelId);
}

export function evaluateCompressionPlan(options: {
  messages: Message[];
  budgetConfig: ContextBudgetConfig;
  forceTier?: CompressionTier | "emergency";
}): CompressionPlan {
  const recentMessages = options.messages.slice(-options.budgetConfig.recentWindowMessageCount);
  const compressibleMessages =
    options.messages.length > options.budgetConfig.recentWindowMessageCount
      ? options.messages.slice(0, -options.budgetConfig.recentWindowMessageCount)
      : [];
  const userTurnCount = countUserTurns(options.messages);
  const rawConversationChars = estimateMessagesChars(options.messages);
  const rawUsageRatio =
    options.budgetConfig.conversationBudgetChars > 0
      ? rawConversationChars / options.budgetConfig.conversationBudgetChars
      : 0;

  let desiredTier: CompressionTier = "none";
  if (options.forceTier === "full" || options.forceTier === "emergency") {
    desiredTier = compressibleMessages.length > 0 ? "full" : "none";
  } else if (userTurnCount >= MIN_USER_TURNS_FOR_COMPRESSION && compressibleMessages.length > 0) {
    if (rawUsageRatio >= FULL_COMPRESSION_RATIO) {
      desiredTier = "full";
    } else if (rawUsageRatio >= MICRO_COMPRESSION_RATIO) {
      desiredTier = "micro";
    } else {
      desiredTier = "light";
    }
  }

  return {
    desiredTier,
    userTurnCount,
    rawConversationChars,
    rawUsageRatio,
    compressibleMessages,
    recentMessages,
  };
}

function createContextFingerprint(messages: Message[], modelId: string) {
  const payload = {
    modelId,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      questionDiagnosis: message.questionDiagnosis || null,
      kbHits: message.kbHits || [],
      sourceHits: message.sourceHits || [],
    })),
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function computeEffectiveUsage(memoryText: string, recentMessages: Message[], budgetConfig: ContextBudgetConfig) {
  const estimatedUsedChars = memoryText.trim().length + estimateMessagesChars(recentMessages);
  const usageRatio =
    budgetConfig.conversationBudgetChars > 0
      ? estimatedUsedChars / budgetConfig.conversationBudgetChars
      : 0;

  return {
    estimatedUsedChars,
    usageRatio,
  };
}

export function buildConversationMemoryContext(memoryText: string) {
  const normalized = memoryText.trim();
  if (!normalized) return "";

  return [
    "以下是系统后台维护的会话长期记忆，代表更早对话的压缩版本。",
    "请把它视为已经沉淀的上下文，避免重复追问或把已确认事实当成未知。",
    "",
    normalized,
  ].join("\n");
}

export function estimatePromptChars(options: {
  systemPrompt: string;
  diagnosisGuardrailContext?: string;
  selectedScopeContext?: string;
  knowledgeContext?: string;
  fileContext?: string;
  memoryText?: string;
  recentHistory: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
}) {
  return [
    options.systemPrompt,
    options.diagnosisGuardrailContext || "",
    options.selectedScopeContext || "",
    options.knowledgeContext || "",
    options.fileContext || "",
    options.memoryText || "",
    options.message,
    ...options.recentHistory.map((item) => item.content),
  ].join("\n").length;
}

export function shouldUseEmergencyCompression(estimatedPromptChars: number, budgetConfig: ContextBudgetConfig) {
  return estimatedPromptChars >= Math.floor(budgetConfig.maxContextChars * budgetConfig.emergencyThresholdRatio);
}

export function createConversationContextKey(userId: string, conversationId: string) {
  return `${userId}::${conversationId}`;
}

export function getCompressionRetryDelayMs(retryCount: number) {
  return COMPRESSION_RETRY_DELAYS_MS[Math.max(0, retryCount - 1)] ?? COMPRESSION_RETRY_DELAYS_MS.at(-1)!;
}

export function isLikelyContextOverflowError(message: string) {
  return /context length|maximum context|context window|too many tokens|max tokens|prompt is too long|prompt too long/i.test(message);
}

export function buildEmergencyHistoryWindow<T>(history: T[], maxItems = 4) {
  return history.slice(-maxItems);
}

export async function getConversationContextState(userId: string, conversationId: string): Promise<ConversationContextState | null> {
  if (!conversationId.trim()) return null;

  if (!isDatabaseConfigured()) {
    return readLocalContextState(userId, conversationId);
  }

  return withDbClient(async (client) => {
    const result = await client.query<{ state_json: unknown }>(
      `
        SELECT state_json
        FROM kb_chat_conversation_context_state
        WHERE user_id = $1 AND conversation_id = $2
        LIMIT 1
      `,
      [userId, conversationId]
    );

    const raw = result.rows[0]?.state_json;
    return raw ? normalizeContextState(conversationId, raw) : null;
  });
}

export async function saveConversationContextState(userId: string, state: ConversationContextState) {
  const normalized = normalizeContextState(state.conversationId, state);

  if (!isDatabaseConfigured()) {
    await writeLocalContextState(userId, normalized);
    return normalized;
  }

  await withDbClient(async (client) => {
    await client.query(
      `
        INSERT INTO kb_chat_conversation_context_state (
          user_id,
          conversation_id,
          state_json,
          updated_at_ms
        )
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (user_id, conversation_id)
        DO UPDATE SET
          state_json = EXCLUDED.state_json,
          updated_at_ms = EXCLUDED.updated_at_ms
      `,
      [userId, normalized.conversationId, JSON.stringify(normalized), normalized.updatedAtMs]
    );
  });

  return normalized;
}

export async function patchConversationContextState(
  userId: string,
  conversationId: string,
  patch: Partial<ConversationContextState>
) {
  const current = (await getConversationContextState(userId, conversationId))
    || createDefaultConversationContextState(conversationId, patch.modelId || DEFAULT_CHAT_MODEL_ID);
  const next = normalizeContextState(conversationId, {
    ...current,
    ...patch,
    attempt: patch.attempt ? { ...current.attempt, ...patch.attempt } : current.attempt,
    updatedAtMs: Date.now(),
  });

  await saveConversationContextState(userId, next);
  return next;
}

export async function deleteConversationContextState(userId: string, conversationId: string) {
  if (!conversationId.trim()) return;

  if (!isDatabaseConfigured()) {
    await deleteLocalContextState(userId, conversationId);
    return;
  }

  await withDbClient(async (client) => {
    await client.query(
      `
        DELETE FROM kb_chat_conversation_context_state
        WHERE user_id = $1 AND conversation_id = $2
      `,
      [userId, conversationId]
    );
  });
}

async function buildMemoryForTier(messages: Message[], tier: CompressionTier) {
  if (tier === "none") return "";
  if (tier === "light") return buildLightCompressionMemory(messages);
  return generateCompressionMemory(messages, tier);
}

export async function evaluateAndPersistConversationContext(options: {
  userId: string;
  conversationId: string;
  modelId?: string | null;
  forceTier?: CompressionTier | "emergency";
}): Promise<ConversationContextState> {
  const budgetConfig = getContextBudgetConfig(options.modelId);
  const conversation = await getConversationRecord(options.userId, options.conversationId);

  if (!conversation) {
    await deleteConversationContextState(options.userId, options.conversationId);
    return createDefaultConversationContextState(options.conversationId, budgetConfig.modelId);
  }

  const plan = evaluateCompressionPlan({
    messages: conversation.messages,
    budgetConfig,
    forceTier: options.forceTier,
  });
  const fingerprint = createContextFingerprint(conversation.messages, budgetConfig.modelId);
  const memoryText =
    plan.desiredTier === "none"
      ? ""
      : await buildMemoryForTier(plan.compressibleMessages, plan.desiredTier);
  const usage = computeEffectiveUsage(memoryText, plan.recentMessages, budgetConfig);
  const nextState: ConversationContextState = {
    conversationId: options.conversationId,
    tier: plan.desiredTier,
    modelId: budgetConfig.modelId,
    sourceFingerprint: fingerprint,
    sourceMessageCount: conversation.messages.length,
    compressedMessageCount: plan.compressibleMessages.length,
    recentWindowMessageCount: plan.recentMessages.length,
    memoryText,
    estimatedBudgetChars: budgetConfig.conversationBudgetChars,
    estimatedUsedChars: usage.estimatedUsedChars,
    usageRatio: usage.usageRatio,
    lastEvaluatedAtMs: Date.now(),
    taskStatus: "idle",
    attempt: {
      retryCount: 0,
    },
    updatedAtMs: Date.now(),
  };

  await saveConversationContextState(options.userId, nextState);
  return nextState;
}
