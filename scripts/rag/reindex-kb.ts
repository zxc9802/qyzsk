import { syncKnowledgeBaseToRag } from "@/lib/server/rag-indexer";
import { getRagConfig } from "@/lib/server/rag-config";

async function main() {
  const config = getRagConfig();

  console.log(
    `[rag:kb] provider=openai model=${config.embeddingModel} dimensions=${config.embeddingDimensions}`
  );

  const result = await syncKnowledgeBaseToRag();

  if (result.skipped) {
    throw new Error(`当前还不能执行 KB RAG 重建：${result.reason}`);
  }

  console.log(`[rag:kb] indexed entries=${result.entryCount} chunks=${result.chunkCount}`);
}

main().catch((error) => {
  console.error("[rag:kb] reindex failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
