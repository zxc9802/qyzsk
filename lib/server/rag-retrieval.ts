import { embedText } from "@/lib/server/embeddings";
import { getRagConfig, isRagSearchConfigured } from "@/lib/server/rag-config";
import { searchRagChunks } from "@/lib/server/rag-store";
import { listPublishedPages } from "@/lib/server/wiki-store";
import { getKnowledgeBaseEntries } from "@/lib/server/kb-retrieval";
import type { KnowledgeBaseEntry } from "@/lib/server/kb-retrieval";
import type { WikiSearchResult } from "@/lib/server/wiki-search";

function trimForExcerpt(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function buildSemanticScore(similarity: number) {
  return Math.round(18 + similarity * 20);
}

export async function searchCanonicalWikiPagesByVector(options: {
  query: string;
  topK?: number;
}): Promise<WikiSearchResult[]> {
  if (!isRagSearchConfigured()) return [];

  const query = options.query.trim();
  if (!query) return [];

  const queryEmbedding = await embedText(query);
  const config = getRagConfig();
  const chunkHits = await searchRagChunks({
    queryEmbedding,
    sourceType: "wiki_page",
    status: "canonical",
    topK: options.topK ?? config.topK,
    minSimilarity: config.minSimilarity,
  });

  if (chunkHits.length === 0) return [];

  const pages = await listPublishedPages();
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const bestChunkByPage = new Map<string, (typeof chunkHits)[number]>();

  for (const hit of chunkHits) {
    const current = bestChunkByPage.get(hit.sourceId);
    if (!current || (hit.similarity || 0) > (current.similarity || 0)) {
      bestChunkByPage.set(hit.sourceId, hit);
    }
  }

  return Array.from(bestChunkByPage.entries())
    .map(([pageId, hit]) => {
      const page = pageById.get(pageId);
      if (!page) return null;

      return {
        page,
        score: buildSemanticScore(hit.similarity || 0),
        excerpt: trimForExcerpt(hit.content.replace(/\n+/g, " "), 180),
      } satisfies WikiSearchResult;
    })
    .filter((item): item is WikiSearchResult => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, options.topK ?? config.topK);
}

export async function searchKbEntriesByVector(options: {
  query: string;
  topK?: number;
}): Promise<{ entry: KnowledgeBaseEntry; score: number }[]> {
  if (!isRagSearchConfigured()) return [];

  const query = options.query.trim();
  if (!query) return [];

  const queryEmbedding = await embedText(query);
  const config = getRagConfig();
  const chunkHits = await searchRagChunks({
    queryEmbedding,
    sourceType: "kb_entry",
    status: "canonical",
    topK: options.topK ?? config.topK,
    minSimilarity: config.minSimilarity,
  });

  if (chunkHits.length === 0) return [];

  const entries = getKnowledgeBaseEntries();
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  // 同一条 KB 可能因为多个 triggerQuestion chunk 命中，取相似度最高的一票。
  const bestSimilarityByEntry = new Map<string, number>();

  for (const hit of chunkHits) {
    const similarity = hit.similarity || 0;
    const current = bestSimilarityByEntry.get(hit.sourceId);
    if (current === undefined || similarity > current) {
      bestSimilarityByEntry.set(hit.sourceId, similarity);
    }
  }

  return Array.from(bestSimilarityByEntry.entries())
    .map(([entryId, similarity]) => ({
      entry: entryById.get(entryId),
      score: buildSemanticScore(similarity),
    }))
    .filter((item): item is { entry: KnowledgeBaseEntry; score: number } => Boolean(item.entry))
    .sort((left, right) => right.score - left.score)
    .slice(0, options.topK ?? config.topK);
}
