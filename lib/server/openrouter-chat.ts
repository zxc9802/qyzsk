import { setTimeout as delay } from "node:timers/promises";
import { getChatModelOption } from "@/lib/chat-models";
import type { ProviderMessage } from "@/lib/server/claude-messages";
import { buildResponsesRequest, generateResponsesText } from "@/lib/server/openai-responses";
import { extractResponsesWebSearchHits } from "@/lib/server/openai-web-search";

type OpenRouterPayload = {
  model?: string;
  error?: { message?: string };
  usage?: unknown;
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: Array<{
        type?: string;
        url_citation?: { url?: string; title?: string };
      }>;
    };
  }>;
};

// Keep the full answer buffered, as with the existing GPT Responses path, so a
// failed attempt cannot leak partial text before a retry or provider fallback.
export async function generateGpt55Text(options: {
  messages: ProviderMessage[];
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl || fetch;
  const primary = getChatModelOption("yunwu-gpt-5.4");
  const fallbackModel = "gpt-5.6-luna";
  const baseUrl = (process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  const maxTokens = options.maxTokens ?? 4096;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    options.signal?.throwIfAborted();
    try {
      if (!apiKey) throw new Error("OpenRouter API Key 未配置。");
      const timeout = AbortSignal.timeout(60_000);
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: primary.apiModel,
          messages: options.messages,
          stream: false,
          max_tokens: maxTokens,
          temperature: options.temperature ?? 0.3,
          ...(options.webSearch ? { plugins: [{ id: "web" }] } : {}),
        }),
      });
      const payload = await response.json() as OpenRouterPayload;
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error?.message || `OpenRouter HTTP ${response.status}`);
      }
      const message = payload?.choices?.[0]?.message;
      const text = typeof message?.content === "string" ? message.content.trim() : "";
      if (!text) throw new Error("OpenRouter 返回了空内容。");

      return {
        text,
        payload,
        model: payload.model || primary.apiModel,
        providerId: "openrouter" as const,
        hits: extractResponsesWebSearchHits({
          output: [{ content: [{ annotations: (message?.annotations || []).map((annotation) => ({
            type: annotation.type,
            ...annotation.url_citation,
          })) }] }],
        }),
      };
    } catch {
      options.signal?.throwIfAborted();
      // Do not log raw provider errors: they can contain request credentials.
      console.warn(`OpenRouter ${primary.apiModel} attempt ${attempt + 1}/4 failed.`);
      if (attempt < 3) await delay(250 * 2 ** attempt, undefined, { signal: options.signal });
    }
  }

  options.signal?.throwIfAborted();
  const fallbackKey = process.env.OPENLUX_API_KEY?.trim() || "";
  if (!fallbackKey) {
    throw new Error("首发模型请求及 3 次重试均失败，备用模型的 OPENLUX_API_KEY 未配置。");
  }
  console.warn(`OpenRouter retries exhausted; falling back to OpenLux ${fallbackModel}.`);
  const timeout = AbortSignal.timeout(60_000);
  const request = buildResponsesRequest(options.messages);
  const result = await generateResponsesText({
    baseUrl: process.env.OPENLUX_API_BASE_URL?.trim() || "https://api.openlux.ai",
    apiKey: fallbackKey,
    model: fallbackModel,
    ...request,
    maxOutputTokens: maxTokens,
    webSearch: options.webSearch,
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    fetchImpl,
  });
  return {
    ...result,
    model: result.payload.model || fallbackModel,
    providerId: "openlux" as const,
    hits: extractResponsesWebSearchHits(result.payload),
  };
}
