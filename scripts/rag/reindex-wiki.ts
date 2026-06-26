import { syncPublishedWikiPageToRag } from "@/lib/server/rag-indexer";
import { getRagDisabledReason, getRagConfig } from "@/lib/server/rag-config";
import { listPublishedPages } from "@/lib/server/wiki-store";

async function main() {
  const config = getRagConfig();
  const disabledReason = getRagDisabledReason();

  console.log(`[rag] provider=openai model=${config.embeddingModel} dimensions=${config.embeddingDimensions}`);

  if (disabledReason) {
    throw new Error(`当前还不能执行 RAG 重建：${disabledReason}`);
  }

  const pages = await listPublishedPages();
  let chunkCount = 0;

  for (const page of pages) {
    const result = await syncPublishedWikiPageToRag(page);
    chunkCount += result.chunkCount;
  }

  console.log(`[rag] indexed pages=${pages.length} chunks=${chunkCount}`);
}

main().catch((error) => {
  console.error("[rag] reindex failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
