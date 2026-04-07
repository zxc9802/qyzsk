import {
  generateGeminiTextWithClient,
  geminiClientConfigured,
  type GeminiPart,
  type GeminiNativeClientConfig,
} from "@/lib/server/gemini-native";

const GEMINI_BASE_URL = process.env.NEWAPI_BASE_URL?.trim() || "";
const GEMINI_API_KEY = process.env.NEWAPI_KEY?.trim() || "";
const GEMINI_MODEL = process.env.NEWAPI_MODEL?.trim() || "gemini-3.1-pro-preview";

interface GenerateGeminiTextOptions {
  model?: string;
  systemInstruction?: string;
  parts: GeminiPart[];
  temperature?: number;
}

const GEMINI_CLIENT: GeminiNativeClientConfig = {
  baseUrl: GEMINI_BASE_URL,
  apiKey: GEMINI_API_KEY,
  authMode: "query",
};

export function geminiConfigured(): boolean {
  return geminiClientConfigured(GEMINI_CLIENT);
}

export async function generateGeminiText({
  model = GEMINI_MODEL,
  systemInstruction,
  parts,
  temperature = 0.2,
}: GenerateGeminiTextOptions): Promise<string> {
  return generateGeminiTextWithClient({
    client: GEMINI_CLIENT,
    model,
    systemInstruction,
    parts,
    temperature,
  });
}
