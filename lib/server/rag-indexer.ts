import { embedTexts } from "@/lib/server/embeddings";
import { buildWikiPageRagChunks, buildKbEntryRagChunks } from "@/lib/server/rag-chunking";
import { getRagDisabledReason, isRagSearchConfigured } from "@/lib/server/rag-config";
import { replaceRagChunksForSource } from "@/lib/server/rag-store";
import { getKnowledgeBaseEntries } from "@/lib/server/kb-retrieval";
import type { WikiPage } from "@/lib/wiki-types";

export async function syncPublishedWikiPageToRag(page: WikiPage) {
  if (!isRagSearchConfigured()) {
    return {
      skipped: true,
      reason: getRagDisabledReason(),
      chunkCount: 0,
    };
  }

  const drafts = buildWikiPageRagChunks(page);
  const embeddings = await embedTexts(drafts.map((chunk) => chunk.content));
  const chunks = drafts.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));

  await replaceRagChunksForSource({
    sourceType: "wiki_page",
    sourceId: page.id,
    chunks,
  });

  return {
    skipped: false,
    chunkCount: chunks.length,
  };
}

export async function syncKnowledgeBaseToRag() {
  if (!isRagSearchConfigured()) {
    return {
      skipped: true,
      reason: getRagDisabledReason(),
      entryCount: 0,
      chunkCount: 0,
    };
  }

  const entries = getKnowledgeBaseEntries();
  let chunkCount = 0;

  for (const entry of entries) {
    const drafts = buildKbEntryRagChunks(entry);
    if (drafts.length === 0) continue;

    const embeddings = await embedTexts(drafts.map((chunk) => chunk.content));
    const chunks = drafts.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));

    await replaceRagChunksForSource({
      sourceType: "kb_entry",
      sourceId: entry.id,
      chunks,
    });

    chunkCount += chunks.length;
  }

  return {
    skipped: false,
    entryCount: entries.length,
    chunkCount,
  };
}
