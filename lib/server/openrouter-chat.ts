import { setTimeout as delay } from "node:timers/promises";
import { getChatModelOption } from "@/lib/chat-models";
import type { ProviderMessage } from "@/lib/server/claude-messages";
import { buildResponsesRequest, generateResponsesText } from "@/lib/server/openai-responses";
import { extractResponsesWebSearchHits } from "@/lib/server/openai-web-search";
import { readSseData } from "@/lib/sse";

type OpenRouterMessage = {
  content?: string;
  annotations?: Array<{
    type?: string;
    url_citation?: { url?: string; title?: string };
  }>;
};

type OpenRouterPayload = {
  model?: string;
  error?: { message?: string };
  usage?: unknown;
  choices?: Array<{
    finish_reason?: string | null;
    delta?: OpenRouterMessage;
    message?: OpenRouterMessage;
  }>;
};

async function readOpenRouterStream(response: Response, onContent: (text: string) => void) {
  if (!response.body) throw new Error("OpenRouter 返回了空数据流。");
  let text = "";
  let completed = false;
  const annotations: NonNullable<OpenRouterMessage["annotations"]> = [];
  const payload: OpenRouterPayload = {};
  for await (const data of readSseData(response.body)) {
    if (data === "[DONE]") {
      completed = true;
      break;
    }
    const chunk = JSON.parse(data) as OpenRouterPayload;
    const choice = chunk.choices?.[0];
    if (chunk.error || choice?.finish_reason === "error") throw new Error("OpenRouter 流式输出失败。");
    if (chunk.model) payload.model = chunk.model;
    if (chunk.usage) payload.usage = chunk.usage;
    if (choice?.finish_reason) completed = true;
    if (choice?.delta?.annotations) annotations.push(...choice.delta.annotations);
    const content = choice?.delta?.content;
    if (typeof content === "string" && content) {
      text += content;
      onContent(content);
    }
  }
  if (!completed) throw new Error("OpenRouter 流式连接提前中断。");
  payload.choices = [{ message: { content: text, annotations } }];
  return payload;
}

export async function generateGpt55Text(options: {
  messages: ProviderMessage[];
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  onContent?: (text: string) => void;
}) {
  const fetchImpl = options.fetchImpl || fetch;
  const primary = getChatModelOption("yunwu-gpt-5.4");
  const fallbackModel = "deepseek/deepseek-v4.1-flash";
  const apiKey = process.env.OPENLUX_API_KEY?.trim() || "";
  const maxTokens = options.maxTokens ?? 4096;
  const request = buildResponsesRequest(options.messages);
  let emittedContent = false;
  const onContent = options.onContent ? (text: string) => {
    emittedContent = true;
    options.onContent!(text);
  } : undefined;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    options.signal?.throwIfAborted();
    try {
      if (!apiKey) throw new Error("OpenLux API Key 未配置。");
      const timeout = AbortSignal.timeout(60_000);
      const result = await generateResponsesText({
        baseUrl: process.env.OPENLUX_API_BASE_URL?.trim() || "https://api.openlux.ai",
        apiKey,
        model: primary.apiModel,
        ...request,
        maxOutputTokens: maxTokens,
        webSearch: options.webSearch,
        signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        fetchImpl,
        onContent,
      });
      return {
        ...result,
        model: result.payload.model || primary.apiModel,
        providerId: "openlux" as const,
        hits: extractResponsesWebSearchHits(result.payload),
      };
    } catch {
      options.signal?.throwIfAborted();
      // Once text is visible, retrying would duplicate or replace the answer.
      if (emittedContent) throw new Error("回答输出中断，请重新发送问题。");
      // Do not log raw provider errors: they can contain request credentials.
      console.warn(`OpenLux ${primary.apiModel} attempt ${attempt + 1}/4 failed.`);
      if (attempt < 3) await delay(250 * 2 ** attempt, undefined, { signal: options.signal });
    }
  }

  options.signal?.throwIfAborted();
  const fallbackKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!fallbackKey) {
    throw new Error("首发模型请求及 3 次重试均失败，备用模型的 OPENROUTER_API_KEY 未配置。");
  }
  console.warn(`OpenLux retries exhausted; falling back to OpenRouter ${fallbackModel}.`);
  const baseUrl = (process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const timeout = AbortSignal.timeout(60_000);
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    headers: {
      Authorization: `Bearer ${fallbackKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: fallbackModel,
      messages: options.messages,
      stream: Boolean(onContent),
      ...(onContent ? { stream_options: { include_usage: true } } : {}),
      max_tokens: maxTokens,
      temperature: options.temperature ?? 0.3,
      ...(options.webSearch ? { plugins: [{ id: "web" }] } : {}),
    }),
  });
  const isStream = Boolean(onContent && response.ok && response.headers.get("content-type")?.includes("text/event-stream"));
  const payload = isStream
    ? await readOpenRouterStream(response, onContent!)
    : await response.json() as OpenRouterPayload;
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || `OpenRouter HTTP ${response.status}`);
  }
  const message = payload?.choices?.[0]?.message;
  const text = typeof message?.content === "string" ? message.content.trim() : "";
  if (!text) throw new Error("OpenRouter 返回了空内容。");
  if (!isStream) onContent?.(text);

  return {
    text,
    payload,
    model: payload.model || fallbackModel,
    providerId: "openrouter" as const,
    hits: extractResponsesWebSearchHits({
      output: [{ content: [{ annotations: (message?.annotations || []).map((annotation) => ({
        type: annotation.type,
        ...annotation.url_citation,
      })) }] }],
    }),
  };
}
