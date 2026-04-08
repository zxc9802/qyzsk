import { getChatModelOption } from "@/lib/chat-models";

const PROVIDER_CONFIG = {
  newapi: {
    apiKey: process.env.NEWAPI_KEY?.trim() || "",
    apiUrl: buildApiUrl(process.env.NEWAPI_BASE_URL || ""),
    displayName: "Gemini 网关",
  },
  yunwu: {
    apiKey: process.env.YUNWU_API_KEY?.trim() || "",
    apiUrl: buildApiUrl(process.env.YUNWU_BASE_URL || "https://yunwu.ai/v1"),
    displayName: "Yunwu 网关",
  },
} as const;

function buildApiUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  return trimmed.endsWith("/v1")
    ? `${trimmed}/chat/completions`
    : `${trimmed}/v1/chat/completions`;
}

function resolveProviderConfig(modelId: string) {
  const modelOption = getChatModelOption(modelId);
  const provider = PROVIDER_CONFIG[modelOption.provider];
  const apiKey =
    (modelOption.apiKeyEnvName ? process.env[modelOption.apiKeyEnvName]?.trim() : provider.apiKey) || "";

  return {
    modelOption,
    provider: {
      ...provider,
      apiKey,
    },
  };
}

export async function generateModelText(options: {
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { modelOption, provider } = resolveProviderConfig(options.modelId);

  if (!provider.apiUrl || !provider.apiKey) {
    throw new Error(`${provider.displayName} 还没有配置完整。`);
  }

  const response = await fetch(provider.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelOption.apiModel,
      stream: false,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 2600,
      messages: [
        {
          role: "system",
          content: options.systemPrompt,
        },
        {
          role: "user",
          content: options.userPrompt,
        },
      ],
    }),
  });

  const rawText = await response.text();
  let payload: unknown = null;

  try {
    payload = JSON.parse(rawText);
  } catch {
    if (!response.ok) {
      throw new Error(rawText.slice(0, 300) || "模型返回了空错误信息。");
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : rawText.slice(0, 300) || "模型调用失败。";

    throw new Error(message);
  }

  const content =
    typeof payload === "object" &&
    payload &&
    "choices" in payload &&
    Array.isArray(payload.choices) &&
    payload.choices[0] &&
    typeof payload.choices[0] === "object" &&
    payload.choices[0] &&
    "message" in payload.choices[0] &&
    typeof payload.choices[0].message === "object" &&
    payload.choices[0].message &&
    "content" in payload.choices[0].message &&
    typeof payload.choices[0].message.content === "string"
      ? payload.choices[0].message.content
      : "";

  if (!content.trim()) {
    throw new Error("模型返回了空内容。");
  }

  return content.trim();
}
