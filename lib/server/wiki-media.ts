import { promises as fs } from "fs";
import path from "path";
import {
  FILE_LIMITS,
  formatBytes,
  inferUploadKind,
  normalizeUploadMimeType,
  processStandaloneFile,
} from "@/lib/server/file-processing";
import {
  deleteCosKeys,
  shouldStoreOnCos,
  uploadProcessedMediaToCos,
  wikiMediaPosterKey,
  wikiMediaSourceKey,
} from "@/lib/server/cos";
import { generateServerId, inferExtension, STORAGE_ROOT } from "@/lib/server/file-store";
import { embedAndStoreUploadVector } from "@/lib/server/upload-embeddings";
import type { WikiMediaAsset, WikiMediaKind } from "@/lib/wiki-types";
import { normalizeWikiMediaAssets } from "@/lib/wiki-types";

const MEDIA_ROOT = path.join(STORAGE_ROOT, "wiki", "media");

export interface WikiMediaRecord extends WikiMediaAsset {
  storagePath: string;
  posterPath?: string;
  remoteKey?: string;
  posterRemoteKey?: string;
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120) || "default";
}

function mediaDir(mediaId: string) {
  return path.join(MEDIA_ROOT, sanitizeId(mediaId));
}

function metaPath(mediaId: string) {
  return path.join(mediaDir(mediaId), "meta.json");
}

async function writeJson(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return fallback;
    throw error;
  }
}

async function resolveVideoPoster(storagePath: string): Promise<string | undefined> {
  const frameDir = path.join(path.dirname(storagePath), "derived", "frames");
  try {
    const frames = (await fs.readdir(frameDir))
      .filter((name) => name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg"))
      .sort();
    return frames[0] ? path.join(frameDir, frames[0]) : undefined;
  } catch {
    return undefined;
  }
}

export function toClientWikiMediaAsset(record: WikiMediaRecord): WikiMediaAsset {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    ...(record.summary ? { summary: record.summary } : {}),
  };
}

export async function readWikiMediaRecord(mediaId: string): Promise<WikiMediaRecord | null> {
  return readJson<WikiMediaRecord | null>(metaPath(mediaId), null);
}

export async function purgeWikiMediaStorage(mediaId: string) {
  const record = await readWikiMediaRecord(mediaId);
  await deleteCosKeys([record?.remoteKey, record?.posterRemoteKey]);
  await fs.rm(mediaDir(mediaId), { recursive: true, force: true });
}

export async function deleteWikiMediaRecords(media?: WikiMediaAsset[]) {
  await Promise.all(normalizeWikiMediaAssets(media).map((item) => purgeWikiMediaStorage(item.id)));
}

export async function createWikiMediaFromUpload(options: {
  fileName: string;
  mimeType: string;
  size: number;
  kind: WikiMediaKind;
  buffer: Buffer;
}): Promise<{
  record: WikiMediaRecord;
  asset: WikiMediaAsset;
  textBlock: string;
}> {
  const id = generateServerId();
  const extension = inferExtension(options.fileName, options.mimeType);
  const dir = mediaDir(id);
  const storagePath = path.join(dir, `source${extension}`);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(storagePath, options.buffer);

  const processed = await processStandaloneFile({
    fileName: options.fileName,
    mimeType: options.mimeType,
    storagePath,
    kind: options.kind,
  });

  const posterPath = options.kind === "video" ? await resolveVideoPoster(storagePath) : undefined;
  const record: WikiMediaRecord = {
    id,
    kind: options.kind,
    name: options.fileName,
    mimeType: options.mimeType,
    size: options.size,
    summary: processed.summary,
    storagePath,
    ...(posterPath ? { posterPath } : {}),
  };

  if (shouldStoreOnCos(options.kind)) {
    try {
      const uploaded = await uploadProcessedMediaToCos({
        sourceKey: wikiMediaSourceKey(id, `source${extension}`),
        sourcePath: storagePath,
        contentType: options.mimeType,
        posterPath,
        posterKey: posterPath ? wikiMediaPosterKey(id) : undefined,
      });
      record.remoteKey = uploaded.remoteKey;
      if (uploaded.posterRemoteKey) record.posterRemoteKey = uploaded.posterRemoteKey;
    } catch (error) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  await writeJson(metaPath(id), record);
  await embedAndStoreUploadVector({
    storageDir: dir,
    title: options.fileName,
    text: [processed.summary, processed.text].filter(Boolean).join("\n\n"),
    kind: options.kind,
    storagePath,
  }).catch((error) => {
    console.error("Wiki upload embedding error:", id, error);
  });

  const label = options.kind === "document" ? "文档" : options.kind === "image" ? "图片" : "视频";
  const textBlock = [
    `【${label} ${options.fileName}】`,
    processed.summary || processed.excerpt || processed.text || `${label}已上传。`,
  ].join("\n");

  return {
    record,
    asset: toClientWikiMediaAsset(record),
    textBlock,
  };
}

export async function processWikiUploadFiles(files: File[]) {
  const inputs = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      buffer: Buffer.from(await file.arrayBuffer()),
    }))
  );
  return processWikiUploadInputs(inputs);
}

export async function processWikiUploadInputs(
  inputs: Array<{
    fileName: string;
    mimeType: string;
    size: number;
    buffer: Buffer;
  }>
) {
  const assets: WikiMediaAsset[] = [];
  const textBlocks: string[] = [];
  const errors: string[] = [];

  for (const input of inputs) {
    try {
      const mimeType = normalizeUploadMimeType(input.fileName, input.mimeType);
      const kind = inferUploadKind(input.fileName, mimeType);
      if (!kind) {
        errors.push(`暂不支持 ${input.fileName}。当前支持 PDF / Word / TXT / 图片 / 视频。`);
        continue;
      }

      if (input.size > FILE_LIMITS[kind]) {
        errors.push(
          `${input.fileName} 太大了。当前 ${kind === "video" ? "视频" : kind === "image" ? "图片" : "文档"} 上限是 ${formatBytes(FILE_LIMITS[kind])}。`
        );
        continue;
      }

      const created = await createWikiMediaFromUpload({
        fileName: input.fileName,
        mimeType,
        size: input.size,
        kind,
        buffer: input.buffer,
      });
      assets.push(created.asset);
      textBlocks.push(created.textBlock);
    } catch (error) {
      errors.push(
        `${input.fileName}：${error instanceof Error && error.message ? error.message : "处理失败。"}`
      );
    }
  }

  return {
    assets: normalizeWikiMediaAssets(assets),
    textBlocks,
    errors,
  };
}
