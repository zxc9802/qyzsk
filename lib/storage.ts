import type { ChatStatePayload } from "./chat-state";
import type { Conversation, Message, UserSettings } from "./types";

const LEGACY_CONVERSATIONS_KEY = "kb-chat-conversations";
const LEGACY_SETTINGS_KEY = "kb-chat-settings";
const LEGACY_ACTIVE_KEY = "kb-chat-active";

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function parseJson(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Message>;
  return Boolean(
    typeof candidate.id === "string" &&
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    typeof candidate.timestamp === "number" &&
    Number.isFinite(candidate.timestamp)
  );
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Conversation>;
  return Boolean(
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every(isMessage) &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    typeof candidate.updatedAt === "number" &&
    Number.isFinite(candidate.updatedAt)
  );
}

function isLegacySettings(value: unknown): value is UserSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UserSettings>;
  return Boolean(
    typeof candidate.role === "string" &&
    typeof candidate.roleName === "string"
  );
}

export function getLegacyChatState(): ChatStatePayload | null {
  const storage = getBrowserStorage();
  if (!storage) return null;

  const conversations = parseJson(storage.getItem(LEGACY_CONVERSATIONS_KEY));
  const normalizedConversations = Array.isArray(conversations)
    ? conversations.filter(isConversation)
    : [];
  const activeId = storage.getItem(LEGACY_ACTIVE_KEY);
  const settings = parseJson(storage.getItem(LEGACY_SETTINGS_KEY));

  if (normalizedConversations.length === 0 && !isLegacySettings(settings)) {
    return null;
  }

  return {
    conversations: normalizedConversations,
    activeId:
      activeId && normalizedConversations.some((conversation) => conversation.id === activeId)
        ? activeId
        : normalizedConversations[0]?.id ?? null,
    settings: isLegacySettings(settings) ? settings : null,
  };
}

export function mergeConversationsByUpdatedAt(
  serverConversations: Conversation[],
  legacyConversations: Conversation[]
) {
  const mergedById = new Map<string, Conversation>();

  for (const conversation of legacyConversations) {
    mergedById.set(conversation.id, conversation);
  }

  for (const conversation of serverConversations) {
    const existing = mergedById.get(conversation.id);
    if (!existing || conversation.updatedAt >= existing.updatedAt) {
      mergedById.set(conversation.id, conversation);
    }
  }

  return [...mergedById.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function createConversation(): Conversation {
  return {
    id: generateId(),
    title: "新对话",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function addMessage(
  convos: Conversation[],
  convoId: string,
  message: Message
): Conversation[] {
  return convos.map((c) => {
    if (c.id !== convoId) return c;
    const updated = {
      ...c,
      messages: [...c.messages, message],
      updatedAt: Date.now(),
    };
    if (message.role === "user" && c.messages.length === 0) {
      updated.title = message.content.slice(0, 30) + (message.content.length > 30 ? "..." : "");
    }
    return updated;
  });
}

export function updateLastAssistantMessage(
  convos: Conversation[],
  convoId: string,
  patch: string | Partial<Message>
): Conversation[] {
  return convos.map((c) => {
    if (c.id !== convoId) return c;
    const msgs = [...c.messages];
    const resolvedPatch = typeof patch === "string" ? { content: patch } : patch;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant") {
        msgs[i] = { ...msgs[i], ...resolvedPatch };
        break;
      }
    }
    return { ...c, messages: msgs, updatedAt: Date.now() };
  });
}

export function deleteConversation(
  convos: Conversation[],
  convoId: string
): Conversation[] {
  return convos.filter((c) => c.id !== convoId);
}
