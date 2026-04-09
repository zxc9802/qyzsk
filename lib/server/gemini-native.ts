export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export interface GeminiNativeClientConfig {
  baseUrl: string;
  apiKey: string;
  authMode: "query" | "bearer" | "google_header";
}

interface GenerateGeminiTextOptions {
  client: GeminiNativeClientConfig;
  model: string;
  systemInstruction?: string;
  parts: GeminiPart[];
  temperature?: number;
  tools?: GeminiTool[];
}

export interface GeminiTool {
  google_search?: Record<string, never>;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
  groundingMetadata?: GeminiGroundingMetadata;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
  };
}

export interface GeminiGroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: Array<{
    web?: {
      uri?: string;
      title?: string;
    };
  }>;
}

export interface GeminiGeneratedResult {
  text: string;
  groundingMetadata?: GeminiGroundingMetadata;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

function buildGeminiUrl(
  client: GeminiNativeClientConfig,
  model: string
): string {
  const baseUrl = normalizeBaseUrl(client.baseUrl);
  const endpoint = `${baseUrl}/v1beta/models/${model}:generateContent`;

  if (client.authMode === "query") {
    return `${endpoint}?key=${client.apiKey}`;
  }

  return endpoint;
}

function buildHeaders(client: GeminiNativeClientConfig): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(client.authMode === "bearer" ? { Authorization: `Bearer ${client.apiKey}` } : {}),
    ...(client.authMode === "google_header" ? { "x-goog-api-key": client.apiKey } : {}),
  };
}

export function geminiClientConfigured(client: GeminiNativeClientConfig): boolean {
  return Boolean(client.baseUrl.trim() && client.apiKey.trim());
}

export async function generateGeminiResultWithClient({
  client,
  model,
  systemInstruction,
  parts,
  temperature = 0.2,
  tools,
}: GenerateGeminiTextOptions): Promise<GeminiGeneratedResult> {
  if (!geminiClientConfigured(client)) {
    throw new Error("Gemini gateway is not configured.");
  }

  const response = await fetch(buildGeminiUrl(client, model), {
    method: "POST",
    headers: buildHeaders(client),
    body: JSON.stringify({
      systemInstruction: systemInstruction
        ? {
            parts: [{ text: systemInstruction }],
          }
        : undefined,
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      tools,
      generationConfig: {
        temperature,
      },
    }),
  });

  const rawText = await response.text();
  let payload: GeminiResponse | null = null;

  try {
    payload = JSON.parse(rawText) as GeminiResponse;
  } catch {
    if (!response.ok) {
      throw new Error(rawText.slice(0, 300) || "Gemini request failed.");
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || rawText.slice(0, 300) || "Gemini request failed.");
  }

  const text = payload?.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    text,
    groundingMetadata: payload?.candidates?.[0]?.groundingMetadata,
  };
}

export async function generateGeminiTextWithClient(options: GenerateGeminiTextOptions): Promise<string> {
  const result = await generateGeminiResultWithClient(options);
  return result.text;
}
