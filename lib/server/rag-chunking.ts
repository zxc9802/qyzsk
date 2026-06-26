import type { WikiPage } from "@/lib/wiki-types";
import { getRagConfig } from "@/lib/server/rag-config";
import type { KnowledgeBaseEntry } from "@/lib/server/kb-retrieval";

export type RagChunkDraft = {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  title: string;
  content: string;
  category: string;
  roles: string[];
  status: "canonical";
  metadata: Record<string, unknown>;
};

function normalizeParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitIntoChunks(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const paragraphs = normalizeParagraphs(text);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if (`${current}\n\n${paragraph}`.length <= chunkSize) {
      current = `${current}\n\n${paragraph}`;
      continue;
    }

    chunks.push(current);

    const overlapText = current.slice(Math.max(0, current.length - chunkOverlap)).trim();
    current = overlapText ? `${overlapText}\n\n${paragraph}` : paragraph;

    if (current.length > chunkSize) {
      chunks.push(current.slice(0, chunkSize));
      current = current.slice(Math.max(0, chunkSize - chunkOverlap)).trim();
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function buildWikiPageRagChunks(page: WikiPage): RagChunkDraft[] {
  const config = getRagConfig();
  const bodyChunks = splitIntoChunks(page.content, config.chunkSize, config.chunkOverlap);
  const normalizedChunks = bodyChunks.length > 0 ? bodyChunks : [page.content.trim()].filter(Boolean);

  return normalizedChunks.map((chunk, index) => ({
    id: `${page.id}#${index + 1}`,
    sourceType: "wiki_page",
    sourceId: page.id,
    chunkIndex: index,
    title: page.title,
    content: [
      `标题：${page.title}`,
      page.summary ? `摘要：${page.summary}` : "",
      page.roles.length > 0 ? `适用岗位：${page.roles.join("、")}` : "",
      `正文片段：${chunk}`,
    ]
      .filter(Boolean)
      .join("\n"),
    category: page.category,
    roles: page.roles,
    status: "canonical",
    metadata: {
      pageId: page.id,
      summary: page.summary,
      sourceIds: page.sourceIds,
      relatedPages: page.relatedPages,
      version: page.version,
      updatedAt: page.updatedAt,
    },
  }));
}

export function buildKbEntryRagChunks(entry: KnowledgeBaseEntry): RagChunkDraft[] {
  // 把每条 KB 的 triggerQuestions 当成独立 chunk 来 embed——它们是天然的
  // “用户会怎么问”语料，让口语化 query 能在语义层命中，而不是只靠字面 n-gram。
  // 没有触发问题时退化为标准回答，保证每条条目至少有一个可检索向量。
  const triggers =
    entry.triggerQuestions.length > 0
      ? entry.triggerQuestions
      : [entry.standardAnswer || entry.title].filter(Boolean);

  if (triggers.length === 0) return [];

  return triggers.map((trigger, index) => ({
    id: `${entry.id}#${index + 1}`,
    sourceType: "kb_entry",
    sourceId: entry.id,
    chunkIndex: index,
    title: entry.title,
    content: [
      `标题：${entry.title}`,
      entry.category ? `分类：${entry.category}` : "",
      entry.roles.length > 0 ? `适用岗位：${entry.roles.join("、")}` : "",
      `触发问题：${trigger}`,
      entry.standardAnswer ? `标准回答：${entry.standardAnswer}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    category: entry.category,
    roles: entry.roles,
    status: "canonical",
    metadata: {
      entryId: entry.id,
      triggerQuestion: trigger,
      relatedTerms: entry.relatedTerms,
    },
  }));
}
