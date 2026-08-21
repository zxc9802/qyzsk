import { createReadStream, promises as fs } from "fs";
import path from "path";
import COS from "cos-nodejs-sdk-v5";
import type { ConversationFileRecord, FileKind } from "@/lib/server/file-store";

export interface CosConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicBaseUrl?: string;
  signExpires: number;
  keyPrefix: string;
  objectAcl?: string;
}

function readEnv(name: string): string {
  return (process.env[name] || "").trim();
}

export function cosKeyPrefix(): string {
  return readEnv("COS_KEY_PREFIX").replace(/^\/+|\/+$/g, "") || "kb-chat";
}

export function getCosConfig(): CosConfig | null {
  const secretId = readEnv("COS_SECRET_ID");
  const secretKey = readEnv("COS_SECRET_KEY");
  const bucket = readEnv("COS_BUCKET");
  const region = readEnv("COS_REGION");
  if (!secretId || !secretKey || !bucket || !region) return null;

  const publicBaseUrl = readEnv("COS_PUBLIC_BASE_URL").replace(/\/+$/g, "") || undefined;
  const signExpiresRaw = Number(readEnv("COS_SIGN_EXPIRES") || "3600");
  const signExpires = Number.isFinite(signExpiresRaw) ? Math.max(60, Math.floor(signExpiresRaw)) : 3600;
  const objectAcl = readEnv("COS_OBJECT_ACL") || undefined;

  return {
    secretId,
    secretKey,
    bucket,
    region,
    publicBaseUrl,
    signExpires,
    keyPrefix: cosKeyPrefix(),
    objectAcl,
  };
}

export function isCosConfigured(): boolean {
  return getCosConfig() !== null;
}

export function shouldStoreOnCos(kind: FileKind | string): boolean {
  return isCosConfigured() && (kind === "image" || kind === "video");
}

export function sanitizeCosKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 180) || "file";
}

export function joinCosKey(parts: string[]): string {
  return [cosKeyPrefix(), ...parts.map(sanitizeCosKeyPart)].join("/");
}

export function joinPublicCosUrl(publicBaseUrl: string, key: string): string {
  return `${publicBaseUrl.replace(/\/+$/g, "")}/${key.replace(/^\/+/g, "")}`;
}

export function wikiMediaSourceKey(mediaId: string, fileName: string): string {
  return joinCosKey(["wiki", "media", mediaId, fileName]);
}

export function wikiMediaPosterKey(mediaId: string): string {
  return joinCosKey(["wiki", "media", mediaId, "poster.jpg"]);
}

export function conversationFileSourceKey(
  userId: string,
  conversationId: string,
  fileId: string,
  fileName: string
): string {
  return joinCosKey(["conversations", userId, conversationId, fileId, fileName]);
}

export function conversationFilePosterKey(userId: string, conversationId: string, fileId: string): string {
  return joinCosKey(["conversations", userId, conversationId, fileId, "poster.jpg"]);
}

export async function resolveLocalVideoPoster(storagePath: string): Promise<string | undefined> {
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

const OBJECT_ACLS = new Set([
  "default",
  "private",
  "public-read",
  "authenticated-read",
  "bucket-owner-read",
  "bucket-owner-full-control",
]);

function getCosClient(config: CosConfig) {
  return new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
  });
}

function asCosError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message) return new Error(`${fallback}：${error.message}`);
  return new Error(fallback);
}

export async function uploadLocalFileToCos(options: {
  key: string;
  filePath: string;
  contentType: string;
}): Promise<string> {
  const config = getCosConfig();
  if (!config) {
    throw new Error("腾讯云 COS 未配置。请设置 COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION。");
  }

  const fileStat = await fs.stat(options.filePath);
  const client = getCosClient(config);
  const params: COS.PutObjectParams = {
    Bucket: config.bucket,
    Region: config.region,
    Key: options.key,
    Body: createReadStream(options.filePath),
    ContentLength: fileStat.size,
    ContentType: options.contentType || "application/octet-stream",
    ContentDisposition: "inline",
  };
  if (config.objectAcl && OBJECT_ACLS.has(config.objectAcl)) {
    params.ACL = config.objectAcl as COS.ObjectACL;
  }

  try {
    await client.putObject(params);
  } catch (error) {
    throw asCosError(error, "图片/视频上传到腾讯云 COS 失败");
  }

  return options.key;
}

export async function uploadProcessedMediaToCos(options: {
  sourceKey: string;
  sourcePath: string;
  contentType: string;
  posterPath?: string;
  posterKey?: string;
}): Promise<{ remoteKey: string; posterRemoteKey?: string }> {
  const remoteKey = await uploadLocalFileToCos({
    key: options.sourceKey,
    filePath: options.sourcePath,
    contentType: options.contentType,
  });

  if (!options.posterPath || !options.posterKey) {
    return { remoteKey };
  }

  const posterRemoteKey = await uploadLocalFileToCos({
    key: options.posterKey,
    filePath: options.posterPath,
    contentType: "image/jpeg",
  });
  return { remoteKey, posterRemoteKey };
}

export async function uploadConversationFileToCos(
  record: ConversationFileRecord
): Promise<ConversationFileRecord> {
  if (!shouldStoreOnCos(record.kind)) return record;

  const extension = path.extname(record.storagePath) || record.metadata.extension || "";
  const sourceKey = conversationFileSourceKey(
    record.userId,
    record.conversationId,
    record.id,
    `source${extension}`
  );
  const posterPath = record.kind === "video" ? await resolveLocalVideoPoster(record.storagePath) : undefined;
  const uploaded = await uploadProcessedMediaToCos({
    sourceKey,
    sourcePath: record.storagePath,
    contentType: record.mimeType,
    posterPath,
    posterKey: posterPath
      ? conversationFilePosterKey(record.userId, record.conversationId, record.id)
      : undefined,
  });

  return {
    ...record,
    remoteKey: uploaded.remoteKey,
    ...(uploaded.posterRemoteKey ? { posterRemoteKey: uploaded.posterRemoteKey } : {}),
  };
}

export async function getCosAccessUrl(key: string): Promise<string> {
  const config = getCosConfig();
  if (!config) {
    throw new Error("腾讯云 COS 未配置。");
  }
  if (config.publicBaseUrl) {
    return joinPublicCosUrl(config.publicBaseUrl, key);
  }

  const client = getCosClient(config);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, url?: string) => {
      if (settled) return;
      settled = true;
      if (error || !url) {
        reject(asCosError(error, "获取腾讯云 COS 访问地址失败"));
        return;
      }
      resolve(url);
    };

    const url = client.getObjectUrl(
      {
        Bucket: config.bucket,
        Region: config.region,
        Key: key,
        Sign: true,
        Expires: config.signExpires,
      },
      (error, data) => finish(error, data?.Url)
    );
    if (url) finish(null, url);
  });
}

export async function tryGetCosRedirectUrl(key?: string): Promise<string | null> {
  if (!key || !isCosConfigured()) return null;
  try {
    return await getCosAccessUrl(key);
  } catch (error) {
    console.error("COS signed URL error:", key, error);
    return null;
  }
}

export async function deleteCosKeys(keys: Array<string | undefined | null>) {
  const config = getCosConfig();
  const validKeys = [...new Set(keys.filter((key): key is string => Boolean(key && key.trim())))];
  if (!config || validKeys.length === 0) return;

  const client = getCosClient(config);
  try {
    await client.deleteMultipleObject({
      Bucket: config.bucket,
      Region: config.region,
      Objects: validKeys.map((Key) => ({ Key })),
    });
  } catch (error) {
    throw asCosError(error, "从腾讯云 COS 删除文件失败");
  }
}
