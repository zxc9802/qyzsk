import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { getFileSegments, listConversationFiles } from "@/lib/server/file-store";
import type { GeminiPart } from "@/lib/server/gemini-native";

const MAX_MEDIA_FILES = 2;
const MAX_VIDEO_FRAMES = 3;
const MAX_IMAGE_DIMENSION = 1600;

export type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ConversationMediaContext {
  hasMedia: boolean;
  geminiParts: GeminiPart[];
  openAIParts: OpenAIContentPart[];
}

export async function buildConversationMediaContext(
  userId: string,
  conversationId: string
): Promise<ConversationMediaContext> {
  const mediaFiles = (await listConversationFiles(userId, conversationId))
    .filter((file) => file.active && file.status === "ready" && (file.kind === "image" || file.kind === "video"))
    .slice(0, MAX_MEDIA_FILES);

  if (mediaFiles.length === 0) {
    return {
      hasMedia: false,
      geminiParts: [],
      openAIParts: [],
    };
  }

  const geminiParts: GeminiPart[] = [];
  const openAIParts: OpenAIContentPart[] = [];

  for (const file of mediaFiles) {
    if (file.kind === "image") {
      const imageData = await loadImageForModel(file.storagePath);
      if (!imageData) continue;

      geminiParts.push({ text: `当前激活图片：${file.name}` });
      geminiParts.push({
        inline_data: {
          mime_type: imageData.mimeType,
          data: imageData.base64,
        },
      });

      openAIParts.push({ type: "text", text: `当前激活图片：${file.name}` });
      openAIParts.push({
        type: "image_url",
        image_url: {
          url: `data:${imageData.mimeType};base64,${imageData.base64}`,
        },
      });
      continue;
    }

    const framePayloads = await loadVideoFramesForModel(userId, conversationId, file.id, file.storagePath);
    if (framePayloads.length === 0) continue;

    geminiParts.push({ text: `当前激活视频：${file.name}。以下是按时间顺序抽取的关键帧。` });
    openAIParts.push({ type: "text", text: `当前激活视频：${file.name}。以下是按时间顺序抽取的关键帧。` });

    framePayloads.forEach((frame) => {
      geminiParts.push({ text: `视频关键帧：${frame.label}` });
      geminiParts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: frame.base64,
        },
      });

      openAIParts.push({ type: "text", text: `视频关键帧：${frame.label}` });
      openAIParts.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${frame.base64}`,
        },
      });
    });
  }

  return {
    hasMedia: geminiParts.length > 0 || openAIParts.length > 0,
    geminiParts,
    openAIParts,
  };
}

async function loadImageForModel(filePath: string): Promise<{ mimeType: string; base64: string } | null> {
  try {
    const buffer = await sharp(filePath)
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer();

    return {
      mimeType: "image/jpeg",
      base64: buffer.toString("base64"),
    };
  } catch {
    return null;
  }
}

async function loadVideoFramesForModel(
  userId: string,
  conversationId: string,
  fileId: string,
  storagePath: string
): Promise<Array<{ label: string; base64: string }>> {
  const frameDir = path.join(path.dirname(storagePath), "derived", "frames");

  try {
    const [entries, segments] = await Promise.all([
      fs.readdir(frameDir),
      getFileSegments(userId, conversationId, fileId),
    ]);
    const frameLabels = segments
      .filter((segment) => segment.segmentType === "frame")
      .sort((left, right) => (left.startSec || 0) - (right.startSec || 0))
      .map((segment) => segment.label);

    const frameFiles = entries
      .filter((entry) => entry.toLowerCase().endsWith(".jpg") || entry.toLowerCase().endsWith(".jpeg"))
      .sort()
      .slice(0, MAX_VIDEO_FRAMES);

    const payloads = await Promise.all(
      frameFiles.map(async (frameFile, index) => {
        const buffer = await fs.readFile(path.join(frameDir, frameFile));
        return {
          label: frameLabels[index] || `关键帧 ${index + 1}`,
          base64: buffer.toString("base64"),
        };
      })
    );

    return payloads;
  } catch {
    return [];
  }
}
