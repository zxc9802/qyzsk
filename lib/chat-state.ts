import type { Conversation, UserSettings } from "./types";

export interface ChatStatePayload {
  conversations: Conversation[];
  activeId: string | null;
  settings: UserSettings | null;
}

export interface ChatStateSavePayload extends ChatStatePayload {
  clientUpdatedAt: number;
}
