import type { ProviderMessage } from "@/lib/server/claude-messages";

export type OpenAIResponsesPayload = {
  model?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string }>;
    }>;
  }>;
  usage?: unknown;
  error?: {
    message?: string;
  };
};

export function buildResponsesRequest(messages: ProviderMessage[]) {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => typeof message.content === "string"
      ? message.content
      : message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n"))
    .filter(Boolean)
    .join("\n\n");
  const input = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.type === "text"
          ? {
              type: message.role === "assistant" ? "output_text" : "input_text",
              text: part.text,
            }
          : {
              type: "input_image",
              image_url: part.image_url.url,
            }),
    }));

  return { instructions, input };
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "https://api.openlux.ai/v1";
  }

  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function extractResponsesText(payload: OpenAIResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((item) => typeof item.text === "string" ? item.text : "")
    .join("")
    .trim();
}

export async function generateResponsesText(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  instructions: string;
  input: unknown;
  maxOutputTokens?: number;
  webSearch?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; payload: OpenAIResponsesPayload }> {
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`${normalizeBaseUrl(options.baseUrl)}/responses`, {
    method: "POST",
    signal: options.signal,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      instructions: options.instructions,
      input: options.input,
      max_output_tokens: options.maxOutputTokens || 4096,
      ...(options.webSearch ? { tools: [{ type: "web_search_preview" }] } : {}),
    }),
  });

  const rawText = await response.text();
  let payload: OpenAIResponsesPayload | null = null;

  try {
    payload = JSON.parse(rawText) as OpenAIResponsesPayload;
  } catch {
    if (!response.ok) {
      throw new Error(rawText.slice(0, 400) || "OpenLux Responses request failed.");
    }
  }

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || rawText.slice(0, 400) || "OpenLux Responses request failed.");
  }

  if (!payload) {
    throw new Error("OpenLux Responses returned a non-JSON response.");
  }

  const text = extractResponsesText(payload);
  if (!text) {
    throw new Error("OpenLux Responses returned an empty response.");
  }

  return { text, payload };
}
