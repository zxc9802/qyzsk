import { existsSync, promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { createRequire } from "module";
import { promisify } from "util";
import mammoth from "mammoth";
import sharp from "sharp";
import {
  ConversationFileRecord,
  FileKind,
  FileSegment,
  generateServerId,
  getFileRecord,
  saveFileRecord,
  saveFileSegments,
} from "@/lib/server/file-store";
import { generateGeminiText, geminiConfigured } from "@/lib/server/newapi-gemini";

const execFileAsync = promisify(execFile);
const nodeRequire = createRequire(import.meta.url);
const IMAGE_ANALYSIS_MAX_DIMENSION = 1280;
const VIDEO_FRAME_SCALE_WIDTH = 960;
const PDF_PARSE_SCRIPT = String.raw`
const fs = require("fs");
const { PDFParse } = require("pdf-parse");

(async () => {
  const filePath = process.argv[1];
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  const result = await parser.getText();
  await parser.destroy();
  process.stdout.write(JSON.stringify(result));
})().catch((error) => {
  process.stderr.write(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
`;
const FFMPEG_PATH = resolveFfmpegPath();

type ProcessedUploadResult = {
  record: ConversationFileRecord;
  segments: FileSegment[];
};

export const FILE_LIMITS = {
  document: 100 * 1024 * 1024,
  image: 20 * 1024 * 1024,
  video: 500 * 1024 * 1024,
};

export function inferUploadKind(fileName: string, mimeType: string): FileKind | null {
  const ext = path.extname(fileName).toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  if (
    normalizedMime === "application/pdf" ||
    normalizedMime === "application/msword" ||
    normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    [".pdf", ".doc", ".docx"].includes(ext)
  ) {
    return "document";
  }

  if (
    normalizedMime === "video/mp4" ||
    ext === ".mp4"
  ) {
    return "video";
  }

  if (
    normalizedMime === "image/png" ||
    normalizedMime === "image/jpeg" ||
    [".png", ".jpg", ".jpeg"].includes(ext)
  ) {
    return "image";
  }

  return null;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export async function processUploadedFile(
  record: ConversationFileRecord
): Promise<ConversationFileRecord> {
  try {
    const processed =
      record.kind === "document"
        ? await processDocument(record)
        : record.kind === "image"
          ? await processImage(record)
          : await processVideo(record);

    const persisted = await persistProcessedFile(record, processed.record, processed.segments);
    return persisted ?? processed.record;
  } catch (error) {
    const message = error instanceof Error ? error.message : "文件处理失败";
    const latestRecord = await getFileRecord(record.userId, record.conversationId, record.id);
    if (!latestRecord) {
      return {
        ...record,
        status: "failed",
        error: message,
        excerpt: message,
        updatedAt: Date.now(),
      };
    }

    const failedRecord: ConversationFileRecord = {
      ...latestRecord,
      status: "failed",
      error: message,
      excerpt: message,
      updatedAt: Date.now(),
    };
    await saveFileRecord(failedRecord);
    await saveFileSegments(record.userId, record.conversationId, record.id, []);
    return failedRecord;
  }
}

async function persistProcessedFile(
  originalRecord: ConversationFileRecord,
  processedRecord: ConversationFileRecord,
  segments: FileSegment[]
): Promise<ConversationFileRecord | null> {
  const latestRecord = await getFileRecord(originalRecord.userId, originalRecord.conversationId, originalRecord.id);
  if (!latestRecord) return null;

  const mergedRecord: ConversationFileRecord = {
    ...processedRecord,
    active: latestRecord.active,
    createdAt: latestRecord.createdAt,
    updatedAt: Date.now(),
  };

  await saveFileRecord(mergedRecord);
  await saveFileSegments(originalRecord.userId, originalRecord.conversationId, originalRecord.id, segments);
  return mergedRecord;
}

async function processDocument(record: ConversationFileRecord): Promise<ProcessedUploadResult> {
  const text = await extractDocumentText(record);

  if (!text) {
    throw new Error("文档里没有可解析的文本内容。请确认文件没有损坏，或尝试转成可复制文本后再上传。");
  }

  const segments = createDocumentSegments(text);
  // Keep the upload path lightweight: once text is extracted and chunked,
  // the document is immediately ready for retrieval and follow-up questions.
  const summary = buildPlainSummary(stripDocumentPageMarkers(text), "文档");

  return {
    record: {
      ...record,
      status: "ready",
      summary,
      excerpt: summary.slice(0, 160),
      segmentCount: segments.length,
      updatedAt: Date.now(),
      metadata: {
        ...record.metadata,
        pageCount: segments.some((segment) => segment.pageNumber)
          ? new Set(segments.map((segment) => segment.pageNumber).filter(Boolean)).size
          : record.metadata.pageCount,
      },
    },
    segments,
  };
}

async function processImage(record: ConversationFileRecord): Promise<ProcessedUploadResult> {
  const rotated = sharp(record.storagePath).rotate();
  const metadata = await rotated.metadata();
  const resized = await rotated
    .resize({
      width: IMAGE_ANALYSIS_MAX_DIMENSION,
      height: IMAGE_ANALYSIS_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 78 })
    .toBuffer();

  const analysis = geminiConfigured()
    ? await generateGeminiText({
        parts: [
          {
            text:
              "你在为内部业务助手做图片预处理。请用中文输出：\n### 图片概述\n一句到两段总结图片主要内容。\n### 可见文字\n尽量提取图片里能看清的文字，没有就写“未见清晰文字”。\n### 关键信息\n用3到5条要点说明可能影响业务判断的内容。\n不要编造看不见的细节，也不要输出 JSON。",
          },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: resized.toString("base64"),
            },
          },
        ],
      })
    : "图片已上传，但当前 Gemini 图片理解能力未配置成功。";

  const ocrSection = matchSection(analysis, "可见文字");
  const segments: FileSegment[] = [
    {
      id: generateServerId(),
      label: "图片摘要",
      content: analysis,
      segmentType: "summary",
    },
  ];

  if (ocrSection && ocrSection !== "未见清晰文字。") {
    segments.push({
      id: generateServerId(),
      label: "图片文字",
      content: ocrSection,
      segmentType: "ocr",
    });
  }

  return {
    record: {
      ...record,
      status: "ready",
      summary: analysis,
      excerpt: analysis.slice(0, 160),
      segmentCount: segments.length,
      updatedAt: Date.now(),
      metadata: {
        ...record.metadata,
        width: metadata.width,
        height: metadata.height,
      },
    },
    segments,
  };
}

async function processVideo(record: ConversationFileRecord): Promise<ProcessedUploadResult> {
  if (!FFMPEG_PATH) {
    throw new Error("当前环境没有可用的 ffmpeg 二进制，暂时无法处理 MP4 视频。");
  }

  const durationSec = await getVideoDuration(record.storagePath);
  const { framePaths, intervalSec } = await extractVideoFrames(record.storagePath, durationSec);

  if (framePaths.length === 0) {
    throw new Error("视频关键帧提取失败，暂时无法分析这个 MP4 文件。");
  }

  const resolvedParts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
    {
      text:
        "你在为内部业务助手做视频预处理。下面会按时间顺序给你若干关键帧。请用中文输出：\n### 视频概述\n总结视频主要内容和场景变化。\n### 逐帧观察\n按以下格式逐条写：\n- 00:00：描述\n- 00:12：描述\n### 可见文字\n总结所有画面里能识别到的文字，没有就写“未见清晰文字”。\n### 适合继续追问的点\n列出 3 条后续可追问的方向。\n不要输出 JSON。",
    },
  ];

  for (const [index, framePath] of framePaths.entries()) {
    const seconds = Math.round(index * intervalSec);
    const frameBuffer = await fs.readFile(framePath);
    resolvedParts.push({ text: `关键帧时间：${formatSeconds(seconds)}` });
    resolvedParts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: frameBuffer.toString("base64"),
      },
    });
  }

  const analysis = geminiConfigured()
    ? await generateGeminiText({
        parts: resolvedParts,
      })
    : "视频已上传，但当前 Gemini 视频理解能力未配置成功。";

  const segments: FileSegment[] = [
    {
      id: generateServerId(),
      label: "视频摘要",
      content: analysis,
      segmentType: "summary",
    },
  ];

  const frameLines = [...analysis.matchAll(/^-\s*(\d{2}:\d{2}(?::\d{2})?)[：:]\s*(.+)$/gm)];
  frameLines.forEach((match) => {
    segments.push({
      id: generateServerId(),
      label: `关键帧 ${match[1]}`,
      content: match[2].trim(),
      segmentType: "frame",
      startSec: parseClock(match[1]),
    });
  });

  return {
    record: {
      ...record,
      status: "ready",
      summary: analysis,
      excerpt: analysis.slice(0, 160),
      segmentCount: segments.length,
      updatedAt: Date.now(),
      metadata: {
        ...record.metadata,
        durationSec,
        frameCount: framePaths.length,
      },
    },
    segments,
  };
}

async function extractDocumentText(record: ConversationFileRecord): Promise<string> {
  const ext = path.extname(record.storagePath).toLowerCase();

  if (ext === ".pdf" || record.mimeType === "application/pdf") {
    const result = await extractPdfText(record.storagePath);
    const pageTexts = result.pages
      .map((page) => ({
        page: page.num,
        text: normalizeText(page.text),
      }))
      .filter((page) => page.text.length > 0)
      .map((page) => `[[PAGE:${page.page}]]\n${page.text}`);

    return pageTexts.join("\n\n");
  }

  if (ext === ".docx") {
    try {
      const result = await mammoth.extractRawText({ path: record.storagePath });
      return normalizeText(result.value);
    } catch {
      return normalizeText(await extractTextWithTextutil(record.storagePath));
    }
  }

  if (ext === ".doc") {
    return normalizeText(await extractTextWithTextutil(record.storagePath));
  }

  return normalizeText(await fs.readFile(record.storagePath, "utf8"));
}

async function extractPdfText(filePath: string): Promise<{
  pages: Array<{ num: number; text: string }>;
}> {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["-e", PDF_PARSE_SCRIPT, filePath],
    {
      cwd: process.cwd(),
      maxBuffer: 30 * 1024 * 1024,
    }
  );

  if (!stdout.trim()) {
    throw new Error(stderr.trim() || "PDF 文本提取失败，未返回可解析结果。");
  }

  try {
    return JSON.parse(stdout) as { pages: Array<{ num: number; text: string }> };
  } catch {
    throw new Error(stderr.trim() || "PDF 文本提取失败，返回结果不是合法 JSON。");
  }
}

function createDocumentSegments(text: string): FileSegment[] {
  if (text.includes("[[PAGE:")) {
    const pageChunks = text.split(/\n\n(?=\[\[PAGE:)/).map((page) => page.trim()).filter(Boolean);
    return pageChunks.flatMap((pageChunk) => {
      const match = pageChunk.match(/^\[\[PAGE:(\d+)\]\]\n([\s\S]*)$/);
      if (!match) return [];
      const pageNumber = Number(match[1]);
      const chunks = chunkText(match[2], 1200);
      return chunks.map((chunk, index) => ({
        id: generateServerId(),
        label: chunks.length === 1 ? `第 ${pageNumber} 页` : `第 ${pageNumber} 页 · 片段 ${index + 1}`,
        content: chunk,
        segmentType: "page" as const,
        pageNumber,
      }));
    });
  }

  return chunkText(text, 1200).map((chunk, index) => ({
    id: generateServerId(),
    label: `文档片段 ${index + 1}`,
    content: chunk,
    segmentType: "section" as const,
  }));
}

async function extractTextWithTextutil(filePath: string) {
  const { stdout } = await execFileAsync("/usr/bin/textutil", [
    "-convert",
    "txt",
    "-stdout",
    filePath,
  ], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function getVideoDuration(filePath: string): Promise<number> {
  const { stderr } = await execFileAsync(FFMPEG_PATH as string, ["-i", filePath], {
    maxBuffer: 8 * 1024 * 1024,
  }).catch((error: { stderr?: string }) => ({ stderr: error.stderr || "" }));

  const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (!match) return 0;

  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 100
  );
}

function resolveFfmpegPath(): string | null {
  const override = process.env.FFMPEG_BIN?.trim();
  if (override) return override;

  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const localNodeModulesPath = path.join(process.cwd(), "node_modules", "ffmpeg-static", binaryName);
  if (existsSync(localNodeModulesPath)) {
    return localNodeModulesPath;
  }

  try {
    const packagePath = nodeRequire.resolve("ffmpeg-static/package.json");
    const normalizedPackagePath = packagePath
      .replace(/^\[project\]/, process.cwd())
      .replace(/^\/ROOT/, process.cwd());
    const candidate = path.join(path.dirname(normalizedPackagePath), binaryName);
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

async function extractVideoFrames(filePath: string, durationSec: number) {
  const framesDir = path.join(path.dirname(filePath), "derived", "frames");
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });

  const frameTarget = durationSec > 150 ? 4 : 3;
  const intervalSec = Math.max(1, Math.round(durationSec > 0 ? durationSec / frameTarget : 8));
  const outputPattern = path.join(framesDir, "frame-%03d.jpg");

  await execFileAsync(FFMPEG_PATH as string, [
    "-y",
    "-i",
    filePath,
    "-vf",
    `fps=1/${intervalSec},scale=${VIDEO_FRAME_SCALE_WIDTH}:-2:force_original_aspect_ratio=decrease`,
    "-frames:v",
    String(frameTarget),
    "-q:v",
    "6",
    outputPattern,
  ], {
    maxBuffer: 16 * 1024 * 1024,
  });

  const framePaths = (await fs.readdir(framesDir))
    .filter((name) => name.endsWith(".jpg"))
    .sort()
    .map((name) => path.join(framesDir, name));

  return { framePaths, intervalSec };
}

function buildPlainSummary(text: string, assetLabel: string): string {
  const compact = normalizeText(text).slice(0, 600);
  if (!compact) {
    return `${assetLabel}已上传，但当前没有提取到足够的可读内容。`;
  }
  return `${assetLabel}已完成预处理。以下是开头内容摘要：\n\n${compact}${text.length > compact.length ? "..." : ""}`;
}

function stripDocumentPageMarkers(text: string): string {
  return text.replace(/\[\[PAGE:\d+\]\]\n?/g, "\n").trim();
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkText(text: string, maxChars: number): string[] {
  const cleaned = normalizeText(text);
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      pushCurrent();
      for (let cursor = 0; cursor < paragraph.length; cursor += maxChars) {
        chunks.push(paragraph.slice(cursor, cursor + maxChars).trim());
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) {
      pushCurrent();
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  pushCurrent();
  return chunks.filter(Boolean);
}

function matchSection(text: string, title: string): string | null {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\n)#{2,3}\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n#{2,3}\\s|$)`, "i");
  const result = text.match(regex)?.[1]?.trim();
  return result || null;
}

function formatSeconds(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return [hrs, mins, secs].map((value) => String(value).padStart(2, "0")).join(":");
  }

  return [mins, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

function parseClock(value: string): number {
  const parts = value.split(":").map((item) => Number(item));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}
