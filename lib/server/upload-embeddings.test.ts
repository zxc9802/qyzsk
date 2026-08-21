import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "os";
import path from "path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function importEmbeddingsModule() {
  const modulePath = pathToFileURL(path.join(REPO_ROOT, "lib/server/embeddings.ts")).href;
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

async function importUploadEmbeddingsModule() {
  const modulePath = pathToFileURL(path.join(REPO_ROOT, "lib/server/upload-embeddings.ts")).href;
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

test("requestUploadEmbedding uses the Gemini upload endpoint, not the retrieval model", async () => {
  const previousEnv = {
    UPLOAD_EMBEDDING_API_KEY: process.env.UPLOAD_EMBEDDING_API_KEY,
    UPLOAD_EMBEDDING_URL: process.env.UPLOAD_EMBEDDING_URL,
  };
  const previousFetch = globalThis.fetch;
  let calledUrl = "";

  process.env.UPLOAD_EMBEDDING_API_KEY = "upload-key";
  process.env.UPLOAD_EMBEDDING_URL =
    "https://api.openlux.ai/v1beta/models/gemini-embedding-2-preview:generateContent";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calledUrl = String(input);
    return new Response(JSON.stringify({ embedding: { values: [0.11, 0.22, 0.33] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const { requestUploadEmbedding } = await importUploadEmbeddingsModule();
    const embedding = await requestUploadEmbedding([{ text: "店铺复盘图片" }]);
    assert.match(calledUrl, /gemini-embedding-2-preview:generateContent/);
    assert.deepEqual(embedding, [0.11, 0.22, 0.33]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnv.UPLOAD_EMBEDDING_API_KEY === undefined) delete process.env.UPLOAD_EMBEDDING_API_KEY;
    else process.env.UPLOAD_EMBEDDING_API_KEY = previousEnv.UPLOAD_EMBEDDING_API_KEY;
    if (previousEnv.UPLOAD_EMBEDDING_URL === undefined) delete process.env.UPLOAD_EMBEDDING_URL;
    else process.env.UPLOAD_EMBEDDING_URL = previousEnv.UPLOAD_EMBEDDING_URL;
  }
});

test("embedText keeps using the previous OpenAI retrieval embedding endpoint", async () => {
  const previousEnv = {
    RAG_OPENAI_API_KEY: process.env.RAG_OPENAI_API_KEY,
    RAG_OPENAI_BASE_URL: process.env.RAG_OPENAI_BASE_URL,
    UPLOAD_EMBEDDING_API_KEY: process.env.UPLOAD_EMBEDDING_API_KEY,
  };
  const previousFetch = globalThis.fetch;
  let calledUrl = "";

  process.env.RAG_OPENAI_API_KEY = "retrieval-key";
  process.env.RAG_OPENAI_BASE_URL = "https://api.openai.com/v1";
  process.env.UPLOAD_EMBEDDING_API_KEY = "upload-key";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calledUrl = String(input);
    return new Response(JSON.stringify({ data: [{ embedding: Array.from({ length: 1024 }, () => 0.01) }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const { embedText } = await importEmbeddingsModule();
    const embedding = await embedText("店铺不出单怎么办");
    assert.equal(calledUrl, "https://api.openai.com/v1/embeddings");
    assert.equal(embedding.length, 1024);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnv.RAG_OPENAI_API_KEY === undefined) delete process.env.RAG_OPENAI_API_KEY;
    else process.env.RAG_OPENAI_API_KEY = previousEnv.RAG_OPENAI_API_KEY;
    if (previousEnv.RAG_OPENAI_BASE_URL === undefined) delete process.env.RAG_OPENAI_BASE_URL;
    else process.env.RAG_OPENAI_BASE_URL = previousEnv.RAG_OPENAI_BASE_URL;
    if (previousEnv.UPLOAD_EMBEDDING_API_KEY === undefined) delete process.env.UPLOAD_EMBEDDING_API_KEY;
    else process.env.UPLOAD_EMBEDDING_API_KEY = previousEnv.UPLOAD_EMBEDDING_API_KEY;
  }
});

test("embedAndStoreUploadVector writes Gemini vectors next to the uploaded file", async () => {
  const previousEnv = {
    UPLOAD_EMBEDDING_API_KEY: process.env.UPLOAD_EMBEDDING_API_KEY,
  };
  const previousFetch = globalThis.fetch;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kb-chat-upload-embed-"));

  process.env.UPLOAD_EMBEDDING_API_KEY = "upload-key";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ embedding: { values: [0.5, 0.6] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    const { embedAndStoreUploadVector } = await importUploadEmbeddingsModule();
    const stored = await embedAndStoreUploadVector({
      storageDir: tempDir,
      title: "复盘截图",
      text: "这是一张店铺后台截图",
      kind: "document",
      storagePath: path.join(tempDir, "source.txt"),
    });

    assert.ok(stored);
    assert.equal(stored?.model, "gemini-embedding-2-preview");
    const raw = await readFile(path.join(tempDir, "upload-embedding.json"), "utf8");
    assert.match(raw, /0\.5/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnv.UPLOAD_EMBEDDING_API_KEY === undefined) delete process.env.UPLOAD_EMBEDDING_API_KEY;
    else process.env.UPLOAD_EMBEDDING_API_KEY = previousEnv.UPLOAD_EMBEDDING_API_KEY;
  }
});
