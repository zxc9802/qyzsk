import { Conversation, UserSettings, Message } from "./types";

const CONVERSATIONS_KEY = "kb-chat-conversations";
const SETTINGS_KEY = "kb-chat-settings";
const ACTIVE_KEY = "kb-chat-active";

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getSettings(): UserSettings | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SETTINGS_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveSettings(settings: UserSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CONVERSATIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveConversations(convos: Conversation[]): void {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convos));
}

export function getActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function saveActiveId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
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
