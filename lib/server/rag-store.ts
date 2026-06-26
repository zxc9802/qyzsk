import { withDbClient } from "@/lib/server/db";
import { getRagConfig } from "@/lib/server/rag-config";

declare global {
  var __kbChatRagSchemaReady: Promise<void> | undefined;
}

export interface RagChunkRecord {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  title: string;
  content: string;
  category: string;
  roles: string[];
  status: string;
  metadata: Record<string, unknown>;
  similarity?: number;
}

export interface RagChunkInsertInput {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  title: string;
  content: string;
  category: string;
  roles: string[];
  status: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}

function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

async function ensureVectorExtension() {
  await withDbClient(async (client) => {
    const existing = await client.query<{ exists: number }>("SELECT 1 as exists FROM pg_extension WHERE extname = 'vector' LIMIT 1");
    if (existing.rowCount && existing.rows[0]?.exists === 1) {
      return;
    }

    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    } catch (error) {
      throw new Error(
        `数据库里还没有可用的 pgvector 扩展。请先在目标数据库执行 CREATE EXTENSION vector; 原始错误：${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });
}

async function runRagSchemaSetup() {
  await ensureVectorExtension();

  await withDbClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS kb_chat_rag_chunks (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        roles JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'canonical',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        embedding vector NOT NULL,
        embedding_model TEXT NOT NULL DEFAULT '',
        embedding_dimensions INTEGER NOT NULL DEFAULT 0,
        updated_at_ms BIGINT NOT NULL
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS kb_chat_rag_chunks_source_idx
      ON kb_chat_rag_chunks (source_type, source_id, chunk_index)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS kb_chat_rag_chunks_status_idx
      ON kb_chat_rag_chunks (source_type, status, updated_at_ms DESC)
    `);
  });
}

export async function ensureRagSchema() {
  if (!globalThis.__kbChatRagSchemaReady) {
    globalThis.__kbChatRagSchemaReady = runRagSchemaSetup().catch((error) => {
      globalThis.__kbChatRagSchemaReady = undefined;
      throw error;
    });
  }

  return globalThis.__kbChatRagSchemaReady;
}

export async function replaceRagChunksForSource(options: {
  sourceType: string;
  sourceId: string;
  chunks: RagChunkInsertInput[];
}) {
  await ensureRagSchema();
  const config = getRagConfig();

  await withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query("DELETE FROM kb_chat_rag_chunks WHERE source_type = $1 AND source_id = $2", [
        options.sourceType,
        options.sourceId,
      ]);

      for (const chunk of options.chunks) {
        await client.query(
          `
            INSERT INTO kb_chat_rag_chunks (
              id,
              source_type,
              source_id,
              chunk_index,
              title,
              content,
              category,
              roles,
              status,
              metadata,
              embedding,
              embedding_model,
              embedding_dimensions,
              updated_at_ms
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8::jsonb, $9, $10::jsonb, $11::vector, $12, $13, $14
            )
          `,
          [
            chunk.id,
            chunk.sourceType,
            chunk.sourceId,
            chunk.chunkIndex,
            chunk.title,
            chunk.content,
            chunk.category,
            JSON.stringify(chunk.roles),
            chunk.status,
            JSON.stringify(chunk.metadata),
            toVectorLiteral(chunk.embedding),
            config.embeddingModel,
            chunk.embedding.length,
            Date.now(),
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function searchRagChunks(options: {
  queryEmbedding: number[];
  sourceType: string;
  status: string;
  topK: number;
  minSimilarity?: number;
}): Promise<RagChunkRecord[]> {
  await ensureRagSchema();
  const config = getRagConfig();

  return withDbClient(async (client) => {
    const result = await client.query<{
      id: string;
      source_type: string;
      source_id: string;
      chunk_index: number;
      title: string;
      content: string;
      category: string;
      roles: unknown;
      status: string;
      metadata: unknown;
      similarity: number;
    }>(
      `
        SELECT
          id,
          source_type,
          source_id,
          chunk_index,
          title,
          content,
          category,
          roles,
          status,
          metadata,
          1 - (embedding <=> $1::vector) AS similarity
        FROM kb_chat_rag_chunks
        WHERE source_type = $2
          AND status = $3
          AND embedding_model = $4
          AND embedding_dimensions = $5
          AND 1 - (embedding <=> $1::vector) >= $6
        ORDER BY embedding <=> $1::vector
        LIMIT $7
      `,
      [
        toVectorLiteral(options.queryEmbedding),
        options.sourceType,
        options.status,
        config.embeddingModel,
        options.queryEmbedding.length,
        options.minSimilarity ?? config.minSimilarity,
        options.topK,
      ]
    );

    return result.rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      chunkIndex: row.chunk_index,
      title: row.title,
      content: row.content,
      category: row.category,
      roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
      status: row.status,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {},
      similarity: Number(row.similarity) || 0,
    }));
  });
}
