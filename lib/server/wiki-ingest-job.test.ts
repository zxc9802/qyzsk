import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function importJobModule() {
  const modulePath = pathToFileURL(path.join(REPO_ROOT, "lib/server/wiki-ingest-job.ts")).href;
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

async function importStoreModule() {
  const modulePath = pathToFileURL(path.join(REPO_ROOT, "lib/server/wiki-store.ts")).href;
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

test("runWikiIngestJob marks the source failed when every upload is unusable", async () => {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kb-chat-wiki-ingest-"));
  process.chdir(tempDir);

  try {
    const { createProcessingWikiSource, runWikiIngestJob } = await importJobModule();
    const { readWikiSourceRecord } = await importStoreModule();
    const files = [
      {
        fileName: "bad.exe",
        mimeType: "application/octet-stream",
        size: 1,
        buffer: Buffer.from("x"),
      },
    ];

    const source = await createProcessingWikiSource({
      title: "坏文件",
      content: "",
      files,
    });
    await runWikiIngestJob({
      sourceId: source.id,
      title: source.title,
      content: "",
      files,
      autoApprove: false,
    });

    const refreshed = await readWikiSourceRecord(source.id);
    assert.ok(refreshed);
    assert.equal(refreshed.status, "failed");
    assert.ok(refreshed.ingestError);
  } finally {
    process.chdir(previousCwd);
  }
});
