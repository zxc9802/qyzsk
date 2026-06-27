export type ChatProviderId = "newapi" | "yunwu" | "yunwu_claude_messages";

export type ChatModelId =
  | "gemini-3.1-pro-preview"
  | "yunwu-gemini-3-flash-preview"
  | "yunwu-gpt-5.4";

export interface ChatModelOption {
  id: ChatModelId;
  label: string;
  shortLabel: string;
  provider: ChatProviderId;
  apiModel: string;
  description: string;
  apiModelEnvName?: string;
  apiKeyEnvName?: string;
}

const LEGACY_MODEL_OPTIONS: Record<string, ChatModelOption> = {
  "gemini-3.1-flash-image-preview": {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 思考",
    shortLabel: "Gemini 思考",
    provider: "newapi",
    apiModel: "gemini-3.1-flash-image-preview",
    description: "历史消息使用的旧模型名，已从可选列表移除",
  },
  "gemini-2.5-flash-image": {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 思考",
    shortLabel: "Gemini 思考",
    provider: "newapi",
    apiModel: "gemini-2.5-flash-image",
    description: "历史消息使用的旧模型名，已从可选列表移除",
  },
};

export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: "gemini-3.1-pro-preview",
    label: "claude-opus-4-6",
    shortLabel: "claude-opus-4-6",
    provider: "yunwu_claude_messages",
    apiModel: "claude-opus-4-6",
    description: "当前 Claude 主模型",
    apiModelEnvName: "YUNWU_CLAUDE_CHAT_MODEL",
    apiKeyEnvName: "YUNWU_CLAUDE_CHAT_API_KEY",
  },
  {
    id: "yunwu-gemini-3-flash-preview",
    label: "Gemini 快速",
    shortLabel: "Gemini 快速",
    provider: "yunwu",
    apiModel: "gemini-3-flash-preview",
    description: "更快，适合日常追问",
    apiKeyEnvName: "YUNWU_GEMINI_API_KEY",
  },
  {
    id: "yunwu-gpt-5.4",
    label: "gpt-5.4",
    shortLabel: "gpt-5.4",
    provider: "yunwu",
    apiModel: "gpt-5.4",
    description: "走 Yunwu 的 GPT-5.4",
  },
];

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = "gemini-3.1-pro-preview";
export const DEFAULT_WIKI_DRAFT_MODEL_ID: ChatModelId = "yunwu-gemini-3-flash-preview";

export function isChatModelId(value: string): value is ChatModelId {
  return CHAT_MODELS.some((model) => model.id === value);
}

export function getChatModelOption(modelId?: string | null): ChatModelOption {
  if (modelId && LEGACY_MODEL_OPTIONS[modelId]) {
    return LEGACY_MODEL_OPTIONS[modelId];
  }

  return CHAT_MODELS.find((model) => model.id === modelId) || CHAT_MODELS[0];
}
