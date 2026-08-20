import { approveIngestedWikiSource, createDraftsFromSource } from "@/lib/server/wiki-drafts";
import { processWikiUploadInputs } from "@/lib/server/wiki-media";
import { createWikiSourceRecord, readWikiSourceRecord, updateWikiSourceRecord } from "@/lib/server/wiki-store";
import type { WikiSourceRecord, WikiSubmitter } from "@/lib/wiki-types";

export type WikiIngestFileInput = {
  fileName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

export async function createProcessingWikiSource(options: {
  title: string;
  content: string;
  submittedBy?: WikiSubmitter;
  files: WikiIngestFileInput[];
}) {
  const title = options.title.trim() || options.files[0]?.fileName.replace(/\.[^.]+$/, "") || "未命名资料";
  return createWikiSourceRecord({
    title,
    content: options.content,
    submittedBy: options.submittedBy,
    status: "processing",
  });
}

export async function runWikiIngestJob(options: {
  sourceId: string;
  title: string;
  content: string;
  modelId?: string;
  submittedBy?: WikiSubmitter;
  files: WikiIngestFileInput[];
  autoApprove: boolean;
}) {
  try {
    const uploaded =
      options.files.length > 0
        ? await processWikiUploadInputs(options.files)
        : { assets: [], textBlocks: [], errors: [] as string[] };

    const content = [options.content, ...uploaded.textBlocks].filter(Boolean).join("\n\n");
    if (!content && uploaded.assets.length === 0) {
      const failure = uploaded.errors[0] || "没有可用的资料内容。";
      await updateWikiSourceRecord(options.sourceId, (current) => ({
        ...current,
        status: "failed",
        ingestError: failure,
        ingestWarnings: uploaded.errors,
      }));
      return;
    }

    const nextTitle =
      options.title.trim() || uploaded.assets[0]?.name.replace(/\.[^.]+$/, "") || "未命名资料";

    const source = await updateWikiSourceRecord(options.sourceId, (current) => ({
      ...current,
      title: nextTitle,
      content,
      media: uploaded.assets,
      ingestError: undefined,
      ingestWarnings: uploaded.errors,
    }));

    const drafts = await createDraftsFromSource({
      source,
      modelId: options.modelId,
      submittedBy: options.submittedBy,
    });

    if (options.autoApprove) {
      await approveIngestedWikiSource({ drafts });
    } else {
      await updateWikiSourceRecord(options.sourceId, (current) => ({
        ...current,
        status: "drafted",
      }));
    }
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "处理知识失败。";
    const existing = await readWikiSourceRecord(options.sourceId);
    if (!existing) return;
    await updateWikiSourceRecord(options.sourceId, (current) => ({
      ...current,
      status: "failed",
      ingestError: message,
    }));
  }
}

export function describeQueuedIngest(source: WikiSourceRecord, autoApprove: boolean) {
  if (autoApprove) {
    return `「${source.title}」已开始处理，完成后会直接写入正式 Wiki。`;
  }
  return `「${source.title}」已开始处理，完成后会进入待审核草稿。`;
}
