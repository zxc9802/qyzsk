import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function importStoreModule() {
  const modulePath = pathToFileURL(path.join(REPO_ROOT, "lib/server/wiki-store.ts")).href;
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

async function withTempCwd<T>(callback: () => Promise<T>) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kb-chat-wiki-store-"));
  process.chdir(tempDir);

  try {
    return await callback();
  } finally {
    process.chdir(previousCwd);
  }
}

test("listPublishedPages parses typed relations and derives relatedPages from them", async () => {
  await withTempCwd(async () => {
    await mkdir(path.join(process.cwd(), "wiki", "concepts"), { recursive: true });
    await writeFile(
      path.join(process.cwd(), "wiki", "concepts", "main.md"),
      `---
id: "concepts/main"
title: "主页面"
category: "concepts"
summary: "主页面摘要"
roles: ["全员"]
source_ids: ["KB001"]
related_pages: []
relations: [{"targetId":"roles/helper","type":"depends_on","note":"需要先理解辅助页"}]
created_at: "2026-04-22"
updated_at: "2026-04-22"
version: 1
---

# 主页面

正文
`,
      "utf8"
    );

    const { listPublishedPages } = await importStoreModule();
    const pages = await listPublishedPages();
    assert.equal(pages.length, 1);
    assert.deepEqual((pages[0] as { relations?: unknown }).relations, [
      {
        targetId: "roles/helper",
        type: "depends_on",
        note: "需要先理解辅助页",
      },
    ]);
    assert.deepEqual(pages[0].relatedPages, ["roles/helper"]);
  });
});

test("writePublishedPage persists typed relations into markdown frontmatter", async () => {
  await withTempCwd(async () => {
    const { writePublishedPage } = await importStoreModule();

    await writePublishedPage({
      id: "concepts/main",
      title: "主页面",
      category: "concepts",
      summary: "主页面摘要",
      roles: ["全员"],
      sourceIds: ["KB001"],
      relatedPages: ["roles/helper"],
      relations: [
        {
          targetId: "roles/helper",
          type: "depends_on",
          note: "需要先理解辅助页",
        },
      ],
      createdAt: "2026-04-22",
      updatedAt: "2026-04-22",
      version: 1,
      content: "# 主页面\n\n正文",
    } as never);

    const stored = await readFile(path.join(process.cwd(), "wiki", "concepts", "main.md"), "utf8");
    assert.match(stored, /relations:/);
    assert.match(stored, /"type":"depends_on"/);
  });
});

test("listPublishedPages normalizes legacy cached pages without relations", async () => {
  await withTempCwd(async () => {
    await mkdir(path.join(process.cwd(), "wiki", "roles"), { recursive: true });
    await mkdir(path.join(process.cwd(), ".kb-chat-data", "wiki", "cache"), { recursive: true });

    await writeFile(
      path.join(process.cwd(), "wiki", "roles", "helper.md"),
      `---
id: "roles/helper"
title: "辅助页"
category: "roles"
summary: "辅助页摘要"
roles: ["全员"]
source_ids: ["KB002"]
related_pages: []
created_at: "2026-04-22"
updated_at: "2026-04-22"
version: 1
---

# 辅助页
`,
      "utf8"
    );

    const { listPublishedPages } = await importStoreModule();
    await listPublishedPages();

    await writeFile(
      path.join(process.cwd(), ".kb-chat-data", "wiki", "cache", "published-index.json"),
      JSON.stringify([
        {
          id: "roles/helper",
          title: "辅助页",
          category: "roles",
          summary: "辅助页摘要",
          roles: ["全员"],
          sourceIds: ["KB002"],
          relatedPages: ["concepts/main"],
          createdAt: "2026-04-22",
          updatedAt: "2026-04-22",
          version: 1,
          content: "# 辅助页",
          filePath: path.join(process.cwd(), "wiki", "roles", "helper.md"),
        },
      ]),
      "utf8"
    );

    const pages = await listPublishedPages();

    assert.deepEqual(pages[0].relations, [{ targetId: "concepts/main", type: "see_also" }]);
    assert.deepEqual(pages[0].relatedPages, ["concepts/main"]);
  });
});
