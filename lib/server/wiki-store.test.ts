import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
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

async function writePublishedPageFixture() {
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
created_at: "2026-04-22"
updated_at: "2026-04-22"
version: 1
---

# 主页面
`,
    "utf8"
  );
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


test("admin-visible published pages hide seeded pages without removing them from retrieval", async () => {
  await withTempCwd(async () => {
    await mkdir(path.join(process.cwd(), "wiki", "concepts"), { recursive: true });

    await writeFile(
      path.join(process.cwd(), "wiki", "concepts", "AI智能体设计原则.md"),
      `---
id: "concepts/AI智能体设计原则"
title: "AI智能体设计原则"
category: "concepts"
summary: "历史内置知识"
roles: ["全员"]
source_ids: ["KB066"]
related_pages: []
created_at: "2026-04-08"
updated_at: "2026-04-08"
version: 1
---

# AI智能体设计原则
`,
      "utf8"
    );

    await writeFile(
      path.join(process.cwd(), "wiki", "concepts", "新增方法.md"),
      `---
id: "concepts/新增方法"
title: "新增方法"
category: "concepts"
summary: "用户新增知识"
roles: ["全员"]
source_ids: ["KB999"]
related_pages: []
created_at: "2026-07-07"
updated_at: "2026-07-07"
version: 1
---

# 新增方法
`,
      "utf8"
    );

    const {
      getWikiAdminStats,
      listAdminVisiblePublishedPages,
      listPublishedPages,
    } = await importStoreModule();

    const retrievalPages = await listPublishedPages();
    const adminPages = await listAdminVisiblePublishedPages();
    const adminStats = await getWikiAdminStats();

    assert.deepEqual(
      retrievalPages.map((page) => page.id).sort(),
      ["concepts/AI智能体设计原则", "concepts/新增方法"]
    );
    assert.deepEqual(adminPages.map((page) => page.id), ["concepts/新增方法"]);
    assert.equal(adminStats.publishedPages, 1);
    assert.equal(adminStats.lastPublishedAt, "2026-07-07");
  });
});

test("deletePublishedPage removes the page and strips inbound relations", async () => {
  await withTempCwd(async () => {
    const { deletePublishedPage, listPublishedPages, readPublishedPage, writePublishedPage } =
      await importStoreModule();

    await writePublishedPage({
      id: "roles/helper",
      title: "辅助页",
      category: "roles",
      summary: "辅助页摘要",
      roles: ["全员"],
      sourceIds: ["KB002"],
      relatedPages: [],
      relations: [],
      createdAt: "2026-04-22",
      updatedAt: "2026-04-22",
      version: 1,
      content: "# 辅助页",
    } as never);

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
      content: "# 主页面",
    } as never);

    await deletePublishedPage("roles/helper");

    assert.equal(await readPublishedPage("roles/helper"), null);
    await assert.rejects(() => access(path.join(process.cwd(), "wiki", "roles", "helper.md")));

    const remaining = await listPublishedPages();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, "concepts/main");
    assert.deepEqual(remaining[0].relations, []);
    assert.deepEqual(remaining[0].relatedPages, []);
  });
});

test("deleteWikiDraft removes the draft and unlinks it from the source", async () => {
  await withTempCwd(async () => {
    const { createWikiDraft, createWikiSourceRecord, deleteWikiDraft, listWikiDrafts, readWikiSourceRecord } =
      await importStoreModule();

    const source = await createWikiSourceRecord({
      title: "原始资料",
      content: "资料正文",
    });
    const draft = await createWikiDraft({
      sourceId: source.id,
      title: "草稿标题",
      category: "concepts",
      summary: "草稿摘要",
      roles: ["全员"],
      sourceIds: [source.id],
      relatedPages: [],
      relations: [],
      content: "草稿正文",
      proposedSlug: "draft-page",
      status: "draft",
    });

    await deleteWikiDraft(draft.id);

    assert.deepEqual(await listWikiDrafts(), []);
    const refreshedSource = await readWikiSourceRecord(source.id);
    assert.ok(refreshedSource);
    assert.deepEqual(refreshedSource.draftIds, []);
  });
});

test("deleteWikiSourceRecord removes the source and its drafts but keeps published pages", async () => {
  await withTempCwd(async () => {
    const {
      createWikiDraft,
      createWikiSourceRecord,
      deleteWikiSourceRecord,
      listWikiDrafts,
      listWikiSourceRecords,
      readPublishedPage,
      writePublishedPage,
    } = await importStoreModule();

    const source = await createWikiSourceRecord({
      title: "待删资料",
      content: "资料正文",
    });
    await createWikiDraft({
      sourceId: source.id,
      title: "待删草稿",
      category: "faq",
      summary: "草稿摘要",
      roles: ["全员"],
      sourceIds: [source.id],
      relatedPages: [],
      relations: [],
      content: "草稿正文",
      proposedSlug: "to-delete",
      status: "draft",
    });
    await writePublishedPage({
      id: "faq/keep",
      title: "保留页面",
      category: "faq",
      summary: "已发布内容应保留",
      roles: ["全员"],
      sourceIds: [source.id],
      relatedPages: [],
      relations: [],
      createdAt: "2026-04-22",
      updatedAt: "2026-04-22",
      version: 1,
      content: "# 保留页面",
    } as never);

    await deleteWikiSourceRecord(source.id);

    assert.deepEqual(await listWikiSourceRecords(), []);
    assert.deepEqual(await listWikiDrafts(), []);
    const published = await readPublishedPage("faq/keep");
    assert.ok(published);
    assert.equal(published.title, "保留页面");
  });
});

test("concurrent published cache rebuilds use distinct temporary files", async () => {
  await withTempCwd(async () => {
    await writePublishedPageFixture();
    const { listPublishedPages } = await importStoreModule();
    const originalRename = fs.rename;
    const originalDateNow = Date.now;
    const renames: Array<{ source: string; destination: string }> = [];

    fs.rename = async (oldPath, newPath) => {
      renames.push({ source: String(oldPath), destination: String(newPath) });
    };
    Date.now = () => 1_777_777_777_777;

    try {
      await Promise.all([listPublishedPages(), listPublishedPages()]);
    } finally {
      fs.rename = originalRename;
      Date.now = originalDateNow;
    }

    const cacheRenames = renames.filter((item) => item.destination.endsWith("published-index.json"));
    assert.equal(cacheRenames.length, 2);
    assert.equal(new Set(cacheRenames.map((item) => item.source)).size, 2);
  });
});

test("listPublishedPages does not rewrite a valid cache hit", async () => {
  await withTempCwd(async () => {
    await writePublishedPageFixture();
    const { listPublishedPages } = await importStoreModule();
    await listPublishedPages();

    const originalRename = fs.rename;
    const renamedDestinations: string[] = [];
    fs.rename = async (_oldPath, newPath) => {
      renamedDestinations.push(String(newPath));
    };

    try {
      const pages = await listPublishedPages();
      assert.equal(pages.length, 1);
    } finally {
      fs.rename = originalRename;
    }

    assert.equal(
      renamedDestinations.filter((destination) => destination.endsWith("published-index.json")).length,
      0
    );
  });
});
