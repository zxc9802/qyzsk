import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import type { FileKind } from "@/lib/server/file-store";
import { getUploadEmbeddingConfig, isUploadEmbeddingConfigured } from "@/lib/server/rag-config";

const UPLOAD_EMBEDDING_FILE = "upload-embedding.json";
const MAX_INLINE_IMAGE_DIMENSION = 1024;
const MAX_TEXT_CHARS = 6000;

export type UploadEmbeddingPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export interface StoredUploadEmbedding {
  model: string;
  dimensions: number;
  embeddings: number[][];
  updatedAt: number;
}

function chunkText(text: string, maxChars: number): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const chunks: string[] = [];
  for (let cursor = 0; cursor < cleaned.length; cursor += maxChars) {
    chunks.push(cleaned.slice(cursor, cursor + maxChars));
  }
  return chunks.slice(0, 3);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
  return value;
}

function extractEmbedding(payload: unknown): number[] | null {
  const root = asRecord(payload);
  if (!root) return null;

  const direct = asNumberArray(root.embedding);
  if (direct) return direct;

  const embeddingObject = asRecord(root.embedding);
  const embeddingValues = asNumberArray(embeddingObject?.values);
  if (embeddingValues) return embeddingValues;

  if (Array.isArray(root.embeddings)) {
    for (const item of root.embeddings) {
      const fromArray = asNumberArray(item);
      if (fromArray) return fromArray;
      const record = asRecord(item);
      const values = asNumberArray(record?.values) || asNumberArray(record?.embedding);
      if (values) return values;
    }
  }

  if (Array.isArray(root.data)) {
    for (const item of root.data) {
      const record = asRecord(item);
      const values = asNumberArray(record?.embedding) || asNumberArray(asRecord(record?.embedding)?.values);
      if (values) return values;
    }
  }

  if (Array.isArray(root.candidates)) {
    for (const candidate of root.candidates) {
      const record = asRecord(candidate);
      const values =
        asNumberArray(record?.embedding) ||
        asNumberArray(asRecord(record?.embedding)?.values) ||
        asNumberArray(asRecord(record?.content)?.embedding);
      if (values) return values;
    }
  }

  return null;
}

async function loadInlineImagePart(filePath: string): Promise<UploadEmbeddingPart | null> {
  try {
    const buffer = await sharp(filePath)
      .rotate()
      .resize({
        width: MAX_INLINE_IMAGE_DIMENSION,
        height: MAX_INLINE_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 78 })
      .toBuffer();

    return {
      inline_data: {
        mime_type: "image/jpeg",
        data: buffer.toString("base64"),
      },
    };
  } catch {
    return null;
  }
}

async function loadVideoFrameParts(storagePath: string): Promise<UploadEmbeddingPart[]> {
  const frameDir = path.join(path.dirname(storagePath), "derived", "frames");

  try {
    const frames = (await fs.readdir(frameDir))
      .filter((name) => name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg"))
      .sort()
      .slice(0, 2);

    const parts: UploadEmbeddingPart[] = [];
    for (const frame of frames) {
      const part = await loadInlineImagePart(path.join(frameDir, frame));
      if (part) parts.push(part);
    }
    return parts;
  } catch {
    return [];
  }
}

export async function requestUploadEmbedding(parts: UploadEmbeddingPart[]): Promise<number[]> {
  const config = getUploadEmbeddingConfig();
  if (!config.apiKey) {
    throw new Error("未配置 UPLOAD_EMBEDDING_API_KEY，无法在上传时生成向量。");
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "x-goog-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: `models/${config.model.replace(/^models\//, "")}`,
      contents: [{ role: "user", parts }],
      content: { parts },
      outputDimensionality: config.dimensions,
      generationConfig: {
        outputDimensionality: config.dimensions,
      },
    }),
  });

  const rawText = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage =
      asRecord(asRecord(payload)?.error)?.message ||
      (typeof asRecord(payload)?.message === "string" ? asRecord(payload)?.message : "") ||
      rawText.slice(0, 300) ||
      "上传向量化请求失败。";
    throw new Error(String(errorMessage));
  }

  const embedding = extractEmbedding(payload);
  if (!embedding) {
    throw new Error("上传向量化接口没有返回可用的 embedding。");
  }

  return embedding;
}

export async function embedAndStoreUploadVector(options: {
  storageDir: string;
  title: string;
  text?: string;
  kind: FileKind;
  storagePath: string;
}): Promise<StoredUploadEmbedding | null> {
  if (!isUploadEmbeddingConfigured()) return null;

  const parts: UploadEmbeddingPart[] = [];
  const title = options.title.trim();
  if (title) {
    parts.push({ text: `资料标题：${title}` });
  }

  const textChunks = chunkText(options.text || "", MAX_TEXT_CHARS);
  if (textChunks[0]) {
    parts.push({ text: textChunks[0] });
  }

  if (options.kind === "image") {
    const imagePart = await loadInlineImagePart(options.storagePath);
    if (imagePart) parts.push(imagePart);
  }

  if (options.kind === "video") {
    parts.push(...(await loadVideoFrameParts(options.storagePath)));
  }

  if (parts.length === 0) return null;

  const embedding = await requestUploadEmbedding(parts);
  const extraEmbeddings: number[][] = [];

  for (const extraChunk of textChunks.slice(1)) {
    extraEmbeddings.push(await requestUploadEmbedding([{ text: extraChunk }]));
  }

  const stored: StoredUploadEmbedding = {
    model: getUploadEmbeddingConfig().model,
    dimensions: embedding.length,
    embeddings: [embedding, ...extraEmbeddings],
    updatedAt: Date.now(),
  };

  await fs.mkdir(options.storageDir, { recursive: true });
  await fs.writeFile(path.join(options.storageDir, UPLOAD_EMBEDDING_FILE), JSON.stringify(stored), "utf8");
  return stored;
}
