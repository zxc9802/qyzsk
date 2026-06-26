function parseBoolean(value: string | undefined, defaultValue = false) {
  if (!value) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseInteger(value: string | undefined, defaultValue: number, bounds?: { min?: number; max?: number }) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return defaultValue;

  let next = parsed;
  if (typeof bounds?.min === "number") {
    next = Math.max(bounds.min, next);
  }
  if (typeof bounds?.max === "number") {
    next = Math.min(bounds.max, next);
  }
  return next;
}

function parseFloatNumber(value: string | undefined, defaultValue: number, bounds?: { min?: number; max?: number }) {
  const parsed = Number.parseFloat(value || "");
  if (!Number.isFinite(parsed)) return defaultValue;

  let next = parsed;
  if (typeof bounds?.min === "number") {
    next = Math.max(bounds.min, next);
  }
  if (typeof bounds?.max === "number") {
    next = Math.min(bounds.max, next);
  }
  return next;
}

export type RagProvider = "openai";

export interface RagConfig {
  enabled: boolean;
  provider: RagProvider;
  openAiBaseUrl: string;
  openAiApiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  topK: number;
  minSimilarity: number;
  chunkSize: number;
  chunkOverlap: number;
}

export function getRagConfig(): RagConfig {
  return {
    enabled: parseBoolean(process.env.RAG_ENABLED, false),
    provider: "openai",
    openAiBaseUrl: (process.env.RAG_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")
      .trim()
      .replace(/\/+$/, ""),
    openAiApiKey: (process.env.RAG_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "").trim(),
    embeddingModel: (process.env.RAG_EMBEDDING_MODEL || "text-embedding-3-large").trim(),
    embeddingDimensions: parseInteger(process.env.RAG_EMBEDDING_DIMENSIONS, 1024, { min: 256, max: 3072 }),
    topK: parseInteger(process.env.RAG_TOP_K, 6, { min: 1, max: 24 }),
    minSimilarity: parseFloatNumber(process.env.RAG_MIN_SIMILARITY, 0.55, { min: 0, max: 1 }),
    chunkSize: parseInteger(process.env.RAG_CHUNK_SIZE, 900, { min: 300, max: 2400 }),
    chunkOverlap: parseInteger(process.env.RAG_CHUNK_OVERLAP, 140, { min: 40, max: 500 }),
  };
}

export function isRagEnabled() {
  return getRagConfig().enabled;
}

export function isRagDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function isRagSearchConfigured() {
  const config = getRagConfig();
  return config.enabled && Boolean(config.openAiBaseUrl) && Boolean(config.openAiApiKey) && isRagDatabaseConfigured();
}

export function getRagDisabledReason() {
  const config = getRagConfig();
  if (!config.enabled) return "RAG_ENABLED 未开启";
  if (!isRagDatabaseConfigured()) return "DATABASE_URL 未配置";
  if (!config.openAiApiKey) return "RAG_OPENAI_API_KEY 或 OPENAI_API_KEY 未配置";
  if (!config.openAiBaseUrl) return "RAG_OPENAI_BASE_URL 未配置";
  return null;
}
