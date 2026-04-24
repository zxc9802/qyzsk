import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_ANSWER_MODE,
  isAnswerMode,
  type AnswerMode,
} from "@/lib/answer-modes";
import { type ChatStatePayload, type ChatStateSavePayload } from "@/lib/chat-state";
import {
  DEFAULT_CHAT_MODEL_ID,
  isChatModelId,
  type ChatModelId,
} from "@/lib/chat-models";
import {
  DEFAULT_KNOWLEDGE_MODE,
  isKnowledgeMode,
  type KnowledgeMode,
} from "@/lib/knowledge-mode";
import { DEFAULT_THEME_MODE, isThemeMode, type ThemeMode } from "@/lib/theme";
import type {
  Conversation,
  KnowledgeBaseHit,
  Message,
  QuestionDiagnosis,
  RetrievalSourceHit,
  UserSettings,
} from "@/lib/types";
import { isDatabaseConfigured, withDbClient } from "@/lib/server/db";
import { STORAGE_ROOT } from "@/lib/server/file-store";

const DEFAULT_CONVERSATION_TITLE = "新对话";
const LOCAL_DEV_USER_ID = "kb-chat-local-dev-user";
const LOCAL_STATE_ROOT = path.join(STORAGE_ROOT, "state");

type ConversationRow = {
  id: string;
  title: string;
  messages: unknown;
  created_at_ms: string | number;
  updated_at_ms: string | number;
};

type UserStateRow = {
  role: string | null;
  role_name: string | null;
  chat_model_id: string | null;
  answer_mode: string | null;
  knowledge_mode: string | null;
  theme_mode: string | null;
  web_search_enabled: boolean | null;
  active_conversation_id: string | null;
};

type NormalizedStateSave = ChatStateSavePayload & {
  conversations: Conversation[];
  activeId: string | null;
  settings: UserSettings | null;
};

type SaveStateResult = {
  state: ChatStatePayload;
  deletedConversationIds: string[];
};

type LocalStateRecord = {
  conversations: Conversation[];
  activeId: string | null;
  settings: UserSettings | null;
  updatedAtMs: number;
};

function normalizeTrimmedString(value: unknown, maxLength = 4000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeTimestamp(value: unknown, fallbackValue: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return fallbackValue;
}

function normalizeId(value: unknown) {
  return normalizeTrimmedString(value, 160);
}

function shouldUseLocalStateStore() {
  return !isDatabaseConfigured();
}

function sanitizeStorageSegment(value: string) {
  return normalizeId(value) || "default";
}

function localStatePath(userId: string) {
  return path.join(LOCAL_STATE_ROOT, sanitizeStorageSegment(userId), "chat-state.json");
}

async function ensureLocalStateDir(userId: string) {
  await fs.mkdir(path.dirname(localStatePath(userId)), { recursive: true });
}

async function writeLocalState(userId: string, state: LocalStateRecord) {
  const filePath = localStatePath(userId);
  await ensureLocalStateDir(userId);
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function sanitizeKnowledgeHit(value: unknown): KnowledgeBaseHit | null {
  if (!value || typeof value !== "object") return null;

  const id = normalizeId((value as KnowledgeBaseHit).id);
  const title = normalizeTrimmedString((value as KnowledgeBaseHit).title, 300);
  const category = normalizeTrimmedString((value as KnowledgeBaseHit).category, 120);

  if (!id || !title || !category) return null;

  return {
    id,
    title,
    category,
  };
}

function sanitizeSourceHit(value: unknown): RetrievalSourceHit | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as RetrievalSourceHit;
  const id = normalizeId(candidate.id);
  const title = normalizeTrimmedString(candidate.title, 300);
  const category = normalizeTrimmedString(candidate.category, 120);

  if (!id || !title || !category) return null;
  if (!["wiki", "knowledge_base", "file", "web"].includes(candidate.type)) return null;

  const hit: RetrievalSourceHit = {
    id,
    type: candidate.type,
    title,
    category,
  };

  const detail = normalizeTrimmedString(candidate.detail, 300);
  if (detail) hit.detail = detail;

  const excerpt = normalizeTrimmedString(candidate.excerpt, 2000);
  if (excerpt) hit.excerpt = excerpt;

  if (typeof candidate.score === "number" && Number.isFinite(candidate.score)) {
    hit.score = candidate.score;
  }

  const url = normalizeTrimmedString(candidate.url, 1600);
  if (url) hit.url = url;

  const siteName = normalizeTrimmedString(candidate.siteName, 200);
  if (siteName) hit.siteName = siteName;

  const publishedAt = normalizeTrimmedString(candidate.publishedAt, 120);
  if (publishedAt) hit.publishedAt = publishedAt;

  return hit;
}

function sanitizeDiagnosis(value: unknown): QuestionDiagnosis | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as QuestionDiagnosis;
  const categoryId = normalizeTrimmedString(candidate.categoryId, 120);
  const categoryLabel = normalizeTrimmedString(candidate.categoryLabel, 160);
  const summary = normalizeTrimmedString(candidate.summary, 1200);

  if (!categoryId || !categoryLabel || !summary) return undefined;
  if (candidate.mode !== "answer" && candidate.mode !== "clarify") return undefined;

  const diagnosis: QuestionDiagnosis = {
    categoryId,
    categoryLabel,
    mode: candidate.mode,
    completenessScore: Math.max(0, Math.min(100, normalizeTimestamp(candidate.completenessScore, 0))),
    missingSlots: Array.isArray(candidate.missingSlots)
      ? candidate.missingSlots.map((item) => normalizeTrimmedString(item, 120)).filter(Boolean)
      : [],
    summary,
  };

  if (candidate.clarificationStage === "choose_scope" || candidate.clarificationStage === "fill_slots") {
    diagnosis.clarificationStage = candidate.clarificationStage;
  }

  if (Array.isArray(candidate.scopeOptions)) {
    diagnosis.scopeOptions = candidate.scopeOptions
      .map((item) => normalizeTrimmedString(item, 120))
      .filter(Boolean)
      .slice(0, 12);
  }

  const selectedScope = normalizeTrimmedString(candidate.selectedScope, 120);
  if (selectedScope) diagnosis.selectedScope = selectedScope;

  if (Array.isArray(candidate.collectedSlots)) {
    diagnosis.collectedSlots = candidate.collectedSlots
      .map((item) => normalizeTrimmedString(item, 120))
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof candidate.ruleConfidence === "number" && Number.isFinite(candidate.ruleConfidence)) {
    diagnosis.ruleConfidence = candidate.ruleConfidence;
  }

  if (candidate.diagnosisSource === "rule" || candidate.diagnosisSource === "hybrid" || candidate.diagnosisSource === "model") {
    diagnosis.diagnosisSource = candidate.diagnosisSource;
  }

  return diagnosis;
}

function sanitizeMessage(value: unknown, fallbackTimestamp: number): Message | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Message;
  const id = normalizeId(candidate.id);
  const content = typeof candidate.content === "string" ? candidate.content : "";

  if (!id || !content || (candidate.role !== "user" && candidate.role !== "assistant")) {
    return null;
  }

  const message: Message = {
    id,
    role: candidate.role,
    content,
    timestamp: normalizeTimestamp(candidate.timestamp, fallbackTimestamp),
  };

  if (typeof candidate.modelId === "string" && candidate.modelId.trim()) {
    message.modelId = candidate.modelId.trim();
  }

  if (Array.isArray(candidate.kbHits)) {
    message.kbHits = candidate.kbHits
      .map((item) => sanitizeKnowledgeHit(item))
      .filter((item): item is KnowledgeBaseHit => Boolean(item));
  }

  if (Array.isArray(candidate.sourceHits)) {
    message.sourceHits = candidate.sourceHits
      .map((item) => sanitizeSourceHit(item))
      .filter((item): item is RetrievalSourceHit => Boolean(item));
  }

  const diagnosis = sanitizeDiagnosis(candidate.questionDiagnosis);
  if (diagnosis) {
    message.questionDiagnosis = diagnosis;
  }

  return message;
}

function sanitizeConversation(value: unknown, fallbackTimestamp: number): Conversation | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Conversation;
  const id = normalizeId(candidate.id);
  if (!id) return null;

  const createdAt = normalizeTimestamp(candidate.createdAt, fallbackTimestamp);
  const updatedAt = normalizeTimestamp(candidate.updatedAt, createdAt);
  const messages = Array.isArray(candidate.messages)
    ? candidate.messages
        .map((item) => sanitizeMessage(item, updatedAt))
        .filter((item): item is Message => Boolean(item))
    : [];
  const title = normalizeTrimmedString(candidate.title, 300) || deriveConversationTitle(messages);

  return {
    id,
    title: title || DEFAULT_CONVERSATION_TITLE,
    messages,
    createdAt,
    updatedAt: Math.max(updatedAt, createdAt),
  };
}

function sanitizeSettings(value: unknown): UserSettings | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<UserSettings>;
  const role = normalizeTrimmedString(candidate.role, 120);
  const roleName = normalizeTrimmedString(candidate.roleName, 120);

  if (!role || !roleName) {
    return null;
  }

  const settings: UserSettings = {
    role,
    roleName,
  };

  settings.chatModelId =
    typeof candidate.chatModelId === "string" && isChatModelId(candidate.chatModelId)
      ? candidate.chatModelId
      : DEFAULT_CHAT_MODEL_ID;
  settings.answerMode =
    typeof candidate.answerMode === "string" && isAnswerMode(candidate.answerMode)
      ? candidate.answerMode
      : DEFAULT_ANSWER_MODE;
  settings.knowledgeMode =
    typeof candidate.knowledgeMode === "string" && isKnowledgeMode(candidate.knowledgeMode)
      ? candidate.knowledgeMode
      : DEFAULT_KNOWLEDGE_MODE;
  settings.themeMode =
    typeof candidate.themeMode === "string" && isThemeMode(candidate.themeMode)
      ? candidate.themeMode
      : DEFAULT_THEME_MODE;
  settings.webSearchEnabled = candidate.webSearchEnabled === true;

  return settings;
}

function deriveConversationTitle(messages: Message[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return DEFAULT_CONVERSATION_TITLE;
  return firstUserMessage.content.slice(0, 30) + (firstUserMessage.content.length > 30 ? "..." : "");
}

function normalizeStatePayload(value: unknown): NormalizedStateSave {
  const candidate = value && typeof value === "object" ? (value as Partial<ChatStateSavePayload>) : {};
  const fallbackTimestamp = Date.now();
  const conversations = Array.isArray(candidate.conversations)
    ? candidate.conversations
        .map((item) => sanitizeConversation(item, fallbackTimestamp))
        .filter((item): item is Conversation => Boolean(item))
        .sort((left, right) => right.updatedAt - left.updatedAt)
    : [];
  const activeId = normalizeId(candidate.activeId);
  const normalizedActiveId = conversations.some((conversation) => conversation.id === activeId)
    ? activeId
    : conversations[0]?.id ?? null;

  return {
    conversations,
    activeId: normalizedActiveId,
    settings: sanitizeSettings(candidate.settings),
    clientUpdatedAt: normalizeTimestamp(candidate.clientUpdatedAt, fallbackTimestamp),
  };
}

function deserializeConversation(row: ConversationRow): Conversation {
  const fallbackTimestamp = Date.now();
  return sanitizeConversation(
    {
      id: row.id,
      title: row.title,
      messages: row.messages,
      createdAt: row.created_at_ms,
      updatedAt: row.updated_at_ms,
    },
    fallbackTimestamp
  ) || {
    id: normalizeId(row.id) || `${fallbackTimestamp}`,
    title: DEFAULT_CONVERSATION_TITLE,
    messages: [],
    createdAt: fallbackTimestamp,
    updatedAt: fallbackTimestamp,
  };
}

function deserializeSettings(row: UserStateRow | undefined): UserSettings | null {
  if (!row) return null;

  return sanitizeSettings({
    role: row.role,
    roleName: row.role_name,
    chatModelId: row.chat_model_id as ChatModelId | null,
    answerMode: row.answer_mode as AnswerMode | null,
    knowledgeMode: row.knowledge_mode as KnowledgeMode | null,
    themeMode: row.theme_mode as ThemeMode | null,
    webSearchEnabled: row.web_search_enabled === true,
  });
}

function toChatStatePayload(state: LocalStateRecord): ChatStatePayload {
  return {
    conversations: state.conversations,
    activeId: state.activeId,
    settings: state.settings,
  };
}

function sanitizeLocalState(value: unknown): LocalStateRecord {
  const candidate = value && typeof value === "object" ? value as Partial<LocalStateRecord> : {};
  const fallbackTimestamp = Date.now();
  const conversations = Array.isArray(candidate.conversations)
    ? candidate.conversations
        .map((item) => sanitizeConversation(item, fallbackTimestamp))
        .filter((item): item is Conversation => Boolean(item))
        .sort((left, right) => right.updatedAt - left.updatedAt)
    : [];
  const rawActiveId = normalizeId(candidate.activeId);
  const activeId = conversations.some((conversation) => conversation.id === rawActiveId)
    ? rawActiveId
    : conversations[0]?.id ?? null;

  return {
    conversations,
    activeId,
    settings: sanitizeSettings(candidate.settings),
    updatedAtMs: normalizeTimestamp(candidate.updatedAtMs, 0),
  };
}

async function readLocalState(userId: string): Promise<LocalStateRecord> {
  try {
    const raw = await fs.readFile(localStatePath(userId), "utf8");
    return sanitizeLocalState(JSON.parse(raw));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return {
        conversations: [],
        activeId: null,
        settings: null,
        updatedAtMs: 0,
      };
    }

    throw error;
  }
}

export function getLocalDevUserId() {
  return LOCAL_DEV_USER_ID;
}

export function parseChatStateSavePayload(body: unknown) {
  return normalizeStatePayload(body);
}

export async function getUserChatState(userId: string): Promise<ChatStatePayload> {
  if (shouldUseLocalStateStore()) {
    return toChatStatePayload(await readLocalState(userId));
  }

  return withDbClient(async (client) => {
    const [conversationsResult, userStateResult] = await Promise.all([
      client.query<ConversationRow>(
        `
          SELECT id, title, messages, created_at_ms, updated_at_ms
          FROM kb_chat_conversations
          WHERE user_id = $1
          ORDER BY updated_at_ms DESC
        `,
        [userId]
      ),
      client.query<UserStateRow>(
        `
          SELECT role, role_name, chat_model_id, answer_mode, knowledge_mode, theme_mode, web_search_enabled, active_conversation_id
          FROM kb_chat_user_state
          WHERE user_id = $1
          LIMIT 1
        `,
        [userId]
      ),
    ]);

    const conversations = conversationsResult.rows.map(deserializeConversation);
    const rawActiveId = normalizeId(userStateResult.rows[0]?.active_conversation_id);
    const activeId = conversations.some((conversation) => conversation.id === rawActiveId)
      ? rawActiveId
      : conversations[0]?.id ?? null;

    return {
      conversations,
      activeId,
      settings: deserializeSettings(userStateResult.rows[0]),
    };
  });
}

export async function getConversationRecord(userId: string, conversationId: string): Promise<Conversation | null> {
  const normalizedConversationId = normalizeId(conversationId);
  if (!normalizedConversationId) return null;

  if (shouldUseLocalStateStore()) {
    const currentState = await readLocalState(userId);
    return currentState.conversations.find((conversation) => conversation.id === normalizedConversationId) || null;
  }

  return withDbClient(async (client) => {
    const result = await client.query<ConversationRow>(
      `
        SELECT id, title, messages, created_at_ms, updated_at_ms
        FROM kb_chat_conversations
        WHERE user_id = $1 AND id = $2
        LIMIT 1
      `,
      [userId, normalizedConversationId]
    );

    const row = result.rows[0];
    return row ? deserializeConversation(row) : null;
  });
}

export async function saveUserChatState(userId: string, input: unknown): Promise<SaveStateResult> {
  const normalized = normalizeStatePayload(input);
  const activeId = normalized.activeId;
  const settings = normalized.settings;

  if (shouldUseLocalStateStore()) {
    const currentState = await readLocalState(userId);

    if (currentState.updatedAtMs > normalized.clientUpdatedAt) {
      return {
        state: toChatStatePayload(currentState),
        deletedConversationIds: [],
      };
    }

    const incomingConversationIds = normalized.conversations.map((conversation) => conversation.id);
    const preservedConversations = currentState.conversations.filter(
      (conversation) =>
        !incomingConversationIds.includes(conversation.id) &&
        conversation.updatedAt > normalized.clientUpdatedAt
    );
    const deletedConversationIds = currentState.conversations
      .filter(
        (conversation) =>
          !incomingConversationIds.includes(conversation.id) &&
          conversation.updatedAt <= normalized.clientUpdatedAt
      )
      .map((conversation) => conversation.id);
    const conversations = [...normalized.conversations, ...preservedConversations]
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const resolvedActiveId = conversations.some((conversation) => conversation.id === activeId)
      ? activeId
      : conversations[0]?.id ?? null;
    const nextState: LocalStateRecord = {
      conversations,
      activeId: resolvedActiveId,
      settings,
      updatedAtMs: normalized.clientUpdatedAt,
    };

    await writeLocalState(userId, nextState);

    return {
      state: toChatStatePayload(nextState),
      deletedConversationIds,
    };
  }

  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const currentUserState = await client.query<{ updated_at_ms: string | number }>(
        `
          SELECT updated_at_ms
          FROM kb_chat_user_state
          WHERE user_id = $1
          LIMIT 1
        `,
        [userId]
      );
      const currentUpdatedAt = normalizeTimestamp(currentUserState.rows[0]?.updated_at_ms, 0);

      if (currentUpdatedAt > normalized.clientUpdatedAt) {
        await client.query("ROLLBACK");
        return {
          state: await getUserChatState(userId),
          deletedConversationIds: [],
        };
      }

      const incomingConversationIds = normalized.conversations.map((conversation) => conversation.id);

      for (const conversation of normalized.conversations) {
        await client.query(
          `
            INSERT INTO kb_chat_conversations (
              user_id,
              id,
              title,
              messages,
              created_at_ms,
              updated_at_ms
            )
            VALUES ($1, $2, $3, $4::jsonb, $5, $6)
            ON CONFLICT (user_id, id)
            DO UPDATE SET
              title = EXCLUDED.title,
              messages = EXCLUDED.messages,
              created_at_ms = LEAST(kb_chat_conversations.created_at_ms, EXCLUDED.created_at_ms),
              updated_at_ms = EXCLUDED.updated_at_ms
            WHERE EXCLUDED.updated_at_ms >= kb_chat_conversations.updated_at_ms
          `,
          [
            userId,
            conversation.id,
            conversation.title,
            JSON.stringify(conversation.messages),
            conversation.createdAt,
            conversation.updatedAt,
          ]
        );
      }

      const deleteResult =
        incomingConversationIds.length > 0
          ? await client.query<{ id: string }>(
              `
                DELETE FROM kb_chat_conversations
                WHERE user_id = $1
                  AND updated_at_ms <= $3
                  AND NOT (id = ANY($2::text[]))
                RETURNING id
              `,
              [userId, incomingConversationIds, normalized.clientUpdatedAt]
            )
          : await client.query<{ id: string }>(
              `
                DELETE FROM kb_chat_conversations
                WHERE user_id = $1
                  AND updated_at_ms <= $2
                RETURNING id
              `,
              [userId, normalized.clientUpdatedAt]
            );

      await client.query(
        `
          INSERT INTO kb_chat_user_state (
            user_id,
            role,
            role_name,
            chat_model_id,
            answer_mode,
            knowledge_mode,
            theme_mode,
            web_search_enabled,
            active_conversation_id,
            updated_at_ms
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (user_id)
          DO UPDATE SET
            role = EXCLUDED.role,
            role_name = EXCLUDED.role_name,
            chat_model_id = EXCLUDED.chat_model_id,
            answer_mode = EXCLUDED.answer_mode,
            knowledge_mode = EXCLUDED.knowledge_mode,
            theme_mode = EXCLUDED.theme_mode,
            web_search_enabled = EXCLUDED.web_search_enabled,
            active_conversation_id = EXCLUDED.active_conversation_id,
            updated_at_ms = EXCLUDED.updated_at_ms
          WHERE EXCLUDED.updated_at_ms >= kb_chat_user_state.updated_at_ms
        `,
        [
          userId,
          settings?.role ?? null,
          settings?.roleName ?? null,
          settings?.chatModelId ?? null,
          settings?.answerMode ?? null,
          settings?.knowledgeMode ?? null,
          settings?.themeMode ?? null,
          settings?.webSearchEnabled ?? false,
          activeId,
          normalized.clientUpdatedAt,
        ]
      );

      await client.query("COMMIT");

      return {
        state: {
          conversations: normalized.conversations,
          activeId,
          settings,
        },
        deletedConversationIds: deleteResult.rows.map((row) => row.id),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function ensureConversationRecord(userId: string, conversationId: string, title?: string) {
  const normalizedConversationId = normalizeId(conversationId);
  if (!normalizedConversationId) {
    throw new Error("缺少有效的 conversationId。");
  }

  const now = Date.now();
  const normalizedTitle = normalizeTrimmedString(title, 300) || DEFAULT_CONVERSATION_TITLE;

  if (shouldUseLocalStateStore()) {
    const currentState = await readLocalState(userId);
    const existingConversation = currentState.conversations.find(
      (conversation) => conversation.id === normalizedConversationId
    );

    if (existingConversation) {
      return;
    }

    const nextConversations = [
      {
        id: normalizedConversationId,
        title: normalizedTitle,
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
      ...currentState.conversations,
    ].sort((left, right) => right.updatedAt - left.updatedAt);
    const nextState: LocalStateRecord = {
      conversations: nextConversations,
      activeId: currentState.activeId ?? normalizedConversationId,
      settings: currentState.settings,
      updatedAtMs: Math.max(currentState.updatedAtMs, now),
    };

    await writeLocalState(userId, nextState);
    return;
  }

  await withDbClient(async (client) => {
    await client.query(
      `
        INSERT INTO kb_chat_conversations (
          user_id,
          id,
          title,
          messages,
          created_at_ms,
          updated_at_ms
        )
        VALUES ($1, $2, $3, '[]'::jsonb, $4, $4)
        ON CONFLICT (user_id, id)
        DO NOTHING
      `,
      [userId, normalizedConversationId, normalizedTitle, now]
    );
  });
}
