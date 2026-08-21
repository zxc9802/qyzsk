import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function importMediaModule() {
  const modulePath = pathToFileURL(path.join(REPO_ROOT, "lib/server/wiki-media.ts")).href;
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

test("processWikiUploadInputs keeps valid files when one file fails", async () => {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kb-chat-wiki-media-"));
  process.chdir(tempDir);

  try {
    const { processWikiUploadInputs } = await importMediaModule();
    const result = await processWikiUploadInputs([
      {
        fileName: "note.txt",
        mimeType: "text/plain",
        size: 5,
        buffer: Buffer.from("hello"),
      },
      {
        fileName: "bad.exe",
        mimeType: "application/octet-stream",
        size: 1,
        buffer: Buffer.from("x"),
      },
    ]);

    assert.equal(result.assets.length, 1);
    assert.equal(result.assets[0]?.name, "note.txt");
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0] || "", /bad\.exe/);
  } finally {
    process.chdir(previousCwd);
  }
});
