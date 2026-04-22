import { Pool, type PoolClient } from "pg";

declare global {
  var __kbChatDbPool: Pool | undefined;
  var __kbChatSchemaReady: Promise<void> | undefined;
}

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL 未配置，无法启用共享会话存储。");
  }
  return value;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getDbPool() {
  if (!globalThis.__kbChatDbPool) {
    globalThis.__kbChatDbPool = new Pool({
      connectionString: getDatabaseUrl(),
    });
  }

  return globalThis.__kbChatDbPool;
}

async function runSchemaSetup(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS kb_chat_conversations (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL,
      PRIMARY KEY (user_id, id)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS kb_chat_conversations_user_updated_idx
    ON kb_chat_conversations (user_id, updated_at_ms DESC)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS kb_chat_user_state (
      user_id TEXT PRIMARY KEY,
      role TEXT,
      role_name TEXT,
      chat_model_id TEXT,
      answer_mode TEXT,
      knowledge_mode TEXT,
      theme_mode TEXT,
      web_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      active_conversation_id TEXT,
      updated_at_ms BIGINT NOT NULL
    )
  `);

  await client.query(`
    ALTER TABLE kb_chat_user_state
    ADD COLUMN IF NOT EXISTS web_search_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS kb_chat_report_cache (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      report_json JSONB NOT NULL,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL,
      PRIMARY KEY (user_id, conversation_id, fingerprint)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS kb_chat_report_cache_user_updated_idx
    ON kb_chat_report_cache (user_id, updated_at_ms DESC)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS kb_chat_conversation_context_state (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      state_json JSONB NOT NULL,
      updated_at_ms BIGINT NOT NULL,
      PRIMARY KEY (user_id, conversation_id)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS kb_chat_conversation_context_state_user_updated_idx
    ON kb_chat_conversation_context_state (user_id, updated_at_ms DESC)
  `);
}

export async function ensureKbChatSchema() {
  if (!globalThis.__kbChatSchemaReady) {
    globalThis.__kbChatSchemaReady = (async () => {
      const client = await getDbPool().connect();
      try {
        await runSchemaSetup(client);
      } finally {
        client.release();
      }
    })().catch((error) => {
      globalThis.__kbChatSchemaReady = undefined;
      throw error;
    });
  }

  return globalThis.__kbChatSchemaReady;
}

export async function withDbClient<T>(runner: (client: PoolClient) => Promise<T>) {
  await ensureKbChatSchema();
  const client = await getDbPool().connect();

  try {
    return await runner(client);
  } finally {
    client.release();
  }
}
