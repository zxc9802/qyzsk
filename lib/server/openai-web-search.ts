import type { RetrievalSourceHit } from "@/lib/types";

export interface ResponsesWebSearchClientConfig {
  baseUrl: string;
  apiKey: string;
  toolType?: "web_search" | "web_search_preview";
}

interface GenerateResponsesWebSearchOptions {
  client: ResponsesWebSearchClientConfig;
  model: string;
  instructions: string;
  input: string;
}

type OpenAIResponseAnnotation = {
  type?: string;
  url?: string;
  title?: string;
};

type OpenAIResponseContentItem = {
  type?: string;
  text?: string;
  annotations?: OpenAIResponseAnnotation[];
};

type OpenAIResponseOutputItem = {
  type?: string;
  content?: OpenAIResponseContentItem[];
};

type OpenAIResponsesPayload = {
  output_text?: string;
  output?: OpenAIResponseOutputItem[];
  error?: {
    message?: string;
  };
};

export interface ResponsesWebSearchResult {
  text: string;
  hits: RetrievalSourceHit[];
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "https://api.openai.com/v1";
  }

  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function buildResponseText(payload: OpenAIResponsesPayload) {
  const directText = payload.output_text?.trim();
  if (directText) {
    return directText;
  }

  const fallbackText = (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((item) => item.text || "")
    .join("")
    .trim();

  return fallbackText;
}

function buildWebSourceId(url: string, title: string, index: number) {
  return `web-${index + 1}-${title || url}`.slice(0, 160);
}

function getSiteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function extractHits(payload: OpenAIResponsesPayload): RetrievalSourceHit[] {
  const annotations = (payload.output || [])
    .flatMap((item) => item.content || [])
    .flatMap((item) => item.annotations || [])
    .filter((annotation) => annotation.type === "url_citation" && typeof annotation.url === "string");

  const uniqueByUrl = new Map<string, RetrievalSourceHit>();

  annotations.forEach((annotation, index) => {
    const url = annotation.url?.trim() || "";
    if (!url || uniqueByUrl.has(url)) return;

    const title = annotation.title?.trim() || getSiteName(url) || `网页来源 ${index + 1}`;
    const siteName = getSiteName(url);
    uniqueByUrl.set(url, {
      id: buildWebSourceId(url, title, index),
      type: "web",
      title,
      category: "网页",
      detail: siteName ? `来源站点：${siteName}` : "联网搜索来源",
      siteName: siteName || undefined,
      url,
    });
  });

  return Array.from(uniqueByUrl.values());
}

export async function generateResponsesWebSearch({
  client,
  model,
  instructions,
  input,
}: GenerateResponsesWebSearchOptions): Promise<ResponsesWebSearchResult> {
  const response = await fetch(`${normalizeBaseUrl(client.baseUrl)}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${client.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      tools: [{ type: client.toolType || "web_search" }],
      tool_choice: "auto",
    }),
  });

  const rawText = await response.text();
  let payload: OpenAIResponsesPayload | null = null;

  try {
    payload = JSON.parse(rawText) as OpenAIResponsesPayload;
  } catch {
    if (!response.ok) {
      throw new Error(rawText.slice(0, 400) || "OpenAI web search request failed.");
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || rawText.slice(0, 400) || "OpenAI web search request failed.");
  }

  const text = payload ? buildResponseText(payload) : rawText.trim();
  if (!text) {
    throw new Error("OpenAI web search returned an empty response.");
  }

  return {
    text,
    hits: payload ? extractHits(payload) : [],
  };
}
