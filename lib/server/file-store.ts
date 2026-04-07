import { promises as fs } from "fs";
import path from "path";

export const STORAGE_ROOT = path.join(process.cwd(), ".kb-chat-data");
export const MAX_ACTIVE_FILES = 3;

export type FileKind = "document" | "image" | "video";
export type FileStatus = "processing" | "ready" | "failed";
export type FileSegmentType = "summary" | "page" | "section" | "ocr" | "frame";

export interface ConversationFileRecord {
  id: string;
  conversationId: string;
  name: string;
  mimeType: string;
  size: number;
  kind: FileKind;
  status: FileStatus;
  active: boolean;
  storagePath: string;
  summary: string;
  excerpt: string;
  segmentCount: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  metadata: {
    extension?: string;
    pageCount?: number;
    durationSec?: number;
    width?: number;
    height?: number;
    frameCount?: number;
  };
}

export interface FileSegment {
  id: string;
  label: string;
  content: string;
  segmentType: FileSegmentType;
  pageNumber?: number;
  startSec?: number;
  endSec?: number;
}

export interface ClientConversationFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: FileKind;
  status: FileStatus;
  active: boolean;
  summary: string;
  excerpt: string;
  segmentCount: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  metadata: ConversationFileRecord["metadata"];
}

function sanitizeId(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  return sanitized || "default";
}

function conversationDir(conversationId: string): string {
  return path.join(STORAGE_ROOT, "conversations", sanitizeId(conversationId));
}

function filesDir(conversationId: string): string {
  return path.join(conversationDir(conversationId), "files");
}

function fileDir(conversationId: string, fileId: string): string {
  return path.join(filesDir(conversationId), sanitizeId(fileId));
}

function metaPath(conversationId: string, fileId: string): string {
  return path.join(fileDir(conversationId, fileId), "meta.json");
}

function segmentsPath(conversationId: string, fileId: string): string {
  return path.join(fileDir(conversationId, fileId), "segments.json");
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath));
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

export function generateServerId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureStorageRoot() {
  await ensureDir(STORAGE_ROOT);
}

export function inferExtension(fileName: string, mimeType: string): string {
  const currentExt = path.extname(fileName).toLowerCase();
  if (currentExt) return currentExt;

  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "application/msword":
      return ".doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    case "video/mp4":
      return ".mp4";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    default:
      return "";
  }
}

export async function createPendingFileRecord(options: {
  conversationId: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: FileKind;
  buffer: Buffer;
}): Promise<ConversationFileRecord> {
  await ensureStorageRoot();

  const id = generateServerId();
  const extension = inferExtension(options.fileName, options.mimeType);
  const dir = fileDir(options.conversationId, id);
  const storagePath = path.join(dir, `source${extension}`);
  const now = Date.now();

  await ensureDir(dir);
  await fs.writeFile(storagePath, options.buffer);

  const record: ConversationFileRecord = {
    id,
    conversationId: options.conversationId,
    name: options.fileName,
    mimeType: options.mimeType,
    size: options.size,
    kind: options.kind,
    status: "processing",
    active: true,
    storagePath,
    summary: "",
    excerpt: "",
    segmentCount: 0,
    createdAt: now,
    updatedAt: now,
    metadata: {
      extension,
    },
  };

  await saveFileRecord(record);
  await enforceActiveFileLimit(options.conversationId, id);
  return record;
}

export async function saveFileRecord(record: ConversationFileRecord) {
  await writeJson(metaPath(record.conversationId, record.id), record);
}

export async function getFileRecord(
  conversationId: string,
  fileId: string
): Promise<ConversationFileRecord | null> {
  const filePath = metaPath(conversationId, fileId);
  const result = await readJson<ConversationFileRecord | null>(filePath, null);
  return result;
}

export async function updateFileRecord(
  conversationId: string,
  fileId: string,
  updater: (record: ConversationFileRecord) => ConversationFileRecord
): Promise<ConversationFileRecord> {
  const current = await getFileRecord(conversationId, fileId);
  if (!current) {
    throw new Error("File record not found");
  }

  const updated = updater({ ...current, updatedAt: Date.now() });
  await saveFileRecord(updated);
  return updated;
}

export async function saveFileSegments(
  conversationId: string,
  fileId: string,
  segments: FileSegment[]
) {
  await writeJson(segmentsPath(conversationId, fileId), segments);
}

export async function getFileSegments(
  conversationId: string,
  fileId: string
): Promise<FileSegment[]> {
  return readJson<FileSegment[]>(segmentsPath(conversationId, fileId), []);
}

export async function listConversationFiles(
  conversationId: string
): Promise<ConversationFileRecord[]> {
  const dir = filesDir(conversationId);

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => getFileRecord(conversationId, entry.name))
    );

    return records
      .filter((item): item is ConversationFileRecord => Boolean(item))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return [];
    throw error;
  }
}

export async function setConversationFileActive(
  conversationId: string,
  fileId: string,
  active: boolean
): Promise<ConversationFileRecord[]> {
  const files = await listConversationFiles(conversationId);
  const now = Date.now();

  await Promise.all(
    files.map(async (file) => {
      if (file.id !== fileId) return;
      await saveFileRecord({ ...file, active, updatedAt: now });
    })
  );

  if (active) {
    await enforceActiveFileLimit(conversationId, fileId);
  }

  return listConversationFiles(conversationId);
}

export async function enforceActiveFileLimit(
  conversationId: string,
  prioritizedFileId?: string
) {
  const files = await listConversationFiles(conversationId);
  const activeFiles = files.filter((file) => file.active);

  if (activeFiles.length <= MAX_ACTIVE_FILES) return;

  const prioritized = activeFiles.find((file) => file.id === prioritizedFileId);
  const others = activeFiles
    .filter((file) => file.id !== prioritizedFileId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const keepIds = new Set(
    [prioritized, ...others.slice(0, MAX_ACTIVE_FILES - (prioritized ? 1 : 0))]
      .filter(Boolean)
      .map((file) => file!.id)
  );

  await Promise.all(
    activeFiles.map(async (file) => {
      if (keepIds.has(file.id)) return;
      await saveFileRecord({ ...file, active: false, updatedAt: Date.now() });
    })
  );
}

export async function deleteConversationFiles(conversationId: string) {
  await fs.rm(conversationDir(conversationId), { recursive: true, force: true });
}

export async function deleteConversationFile(
  conversationId: string,
  fileId: string
): Promise<void> {
  await fs.rm(fileDir(conversationId, fileId), { recursive: true, force: true });
}

export function toClientConversationFile(
  record: ConversationFileRecord
): ClientConversationFile {
  return {
    id: record.id,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    kind: record.kind,
    status: record.status,
    active: record.active,
    summary: record.summary,
    excerpt: record.excerpt,
    segmentCount: record.segmentCount,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    metadata: record.metadata,
  };
}
