import { getRagConfig } from "@/lib/server/rag-config";

type OpenAiEmbeddingItem = {
  embedding: number[];
};

type OpenAiEmbeddingResponse = {
  data?: OpenAiEmbeddingItem[];
  error?: {
    message?: string;
  };
};

function buildEmbeddingsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/embeddings`;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][];
function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function requestEmbeddings(texts: string[]): Promise<number[][]> {
  const config = getRagConfig();

  if (!config.openAiApiKey) {
    throw new Error("未配置 RAG OpenAI API Key，无法生成 embeddings。");
  }

  const response = await fetch(buildEmbeddingsUrl(config.openAiBaseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: texts,
      dimensions: config.embeddingDimensions,
    }),
  });

  const rawText = await response.text();
  let payload: OpenAiEmbeddingResponse | null = null;

  try {
    payload = JSON.parse(rawText) as OpenAiEmbeddingResponse;
  } catch {
    if (!response.ok) {
      throw new Error(rawText.slice(0, 300) || "Embeddings 服务返回了空错误信息。");
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message?.trim() || rawText.slice(0, 300) || "Embeddings 请求失败。");
  }

  const embeddings = payload?.data?.map((item) => item.embedding).filter((item): item is number[] => Array.isArray(item));
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error("Embeddings 返回数量和输入数量不一致。");
  }

  return embeddings;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const normalizedTexts = texts.map((text) => text.trim()).filter(Boolean);
  if (normalizedTexts.length === 0) return [];

  const chunks = chunkArray(normalizedTexts, 16);
  const results: number[][] = [];

  for (const batch of chunks) {
    const batchEmbeddings = await requestEmbeddings(batch);
    results.push(...batchEmbeddings);
  }

  return results;
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  if (!embedding) {
    throw new Error("未能生成 embedding。");
  }
  return embedding;
}
