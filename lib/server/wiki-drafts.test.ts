import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function importModule<T>(relativePath: string): Promise<T> {
  const modulePath = pathToFileURL(path.join(REPO_ROOT, relativePath)).href;
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

let sharedTempDirPromise: Promise<string> | null = null;

async function getSharedTempDir() {
  if (!sharedTempDirPromise) {
    sharedTempDirPromise = mkdtemp(path.join(os.tmpdir(), "kb-chat-wiki-drafts-"));
  }

  return sharedTempDirPromise;
}

async function withTempCwd<T>(callback: () => Promise<T>) {
  const previousCwd = process.cwd();
  const tempDir = await getSharedTempDir();
  process.chdir(tempDir);
  await Promise.all([
    rm(path.join(tempDir, "wiki"), { recursive: true, force: true }),
    rm(path.join(tempDir, ".kb-chat-data"), { recursive: true, force: true }),
  ]);

  try {
    return await callback();
  } finally {
    process.chdir(previousCwd);
  }
}

async function withMockedDraftModel<T>(content: string, callback: () => Promise<T>) {
  const previousFetch = globalThis.fetch;
  const previousBaseUrl = process.env.YUNWU_BASE_URL;
  const previousApiKey = process.env.YUNWU_GEMINI_API_KEY;

  process.env.YUNWU_BASE_URL = "https://mocked.example/v1";
  process.env.YUNWU_GEMINI_API_KEY = "mocked-key";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );

  try {
    return await callback();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBaseUrl === undefined) {
      delete process.env.YUNWU_BASE_URL;
    } else {
      process.env.YUNWU_BASE_URL = previousBaseUrl;
    }

    if (previousApiKey === undefined) {
      delete process.env.YUNWU_GEMINI_API_KEY;
    } else {
      process.env.YUNWU_GEMINI_API_KEY = previousApiKey;
    }
  }
}

async function seedPublishedPage(options: {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  version?: number;
}) {
  const filePath = path.join(process.cwd(), "wiki", `${options.id}.md`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `---
id: ${JSON.stringify(options.id)}
title: ${JSON.stringify(options.title)}
category: ${JSON.stringify(options.category)}
summary: ${JSON.stringify(options.summary)}
roles: ["全员"]
source_ids: ["KB-LEGACY"]
related_pages: []
relations: []
created_at: "2026-04-22"
updated_at: "2026-04-22"
version: ${options.version || 1}
---

${options.content}
`,
    "utf8"
  );
}

function buildMultiDraftModelOutput() {
  return JSON.stringify({
    drafts: [
      {
        targetPageId: "concepts/运营漏斗诊断",
        title: "运营漏斗诊断",
        category: "concepts",
        summary: "基于新复盘补齐了高播放不成交的排查顺序和承接判断。",
        roles: ["运营"],
        sourceIds: [],
        relatedPages: ["entities/TikTok店铺运营框架"],
        relations: [
          {
            targetId: "entities/TikTok店铺运营框架",
            type: "applies_to",
            note: "漏斗诊断需要落回具体店铺承接链路",
          },
        ],
        content: "# 运营漏斗诊断\n\n## 先说结论\n\n新资料修正后的漏斗诊断顺序要先查点击、再查加购、最后查成交承接。",
      },
      {
        title: "高播放不成交排查",
        category: "faq",
        summary: "把视频高播放但不成交的排查动作拆成一条可执行 FAQ。",
        roles: ["运营"],
        sourceIds: [],
        relatedPages: ["concepts/运营漏斗诊断"],
        relations: [
          {
            targetId: "concepts/运营漏斗诊断",
            type: "depends_on",
            note: "FAQ 先依赖漏斗定位，再落到具体排查动作",
          },
        ],
        content: "# 高播放不成交排查\n\n## 先说结论\n\n先判断问题在点击、加购还是成交，再分别排查内容、详情页和承接。",
      },
    ],
  });
}

test("ingestWikiSource can create multiple draft proposals from one source", async () => {
  await withTempCwd(async () => {
    await seedPublishedPage({
      id: "concepts/运营漏斗诊断",
      title: "运营漏斗诊断",
      category: "concepts",
      summary: "旧版漏斗诊断",
      content: "# 运营漏斗诊断\n\n旧内容",
      version: 2,
    });
    await seedPublishedPage({
      id: "entities/TikTok店铺运营框架",
      title: "TikTok店铺运营框架",
      category: "entities",
      summary: "店铺承接框架",
      content: "# TikTok店铺运营框架\n\n旧框架",
    });

    await withMockedDraftModel(buildMultiDraftModelOutput(), async () => {
      const { ingestWikiSource } = await importModule<typeof import("@/lib/server/wiki-drafts")>(
        "lib/server/wiki-drafts.ts"
      );
      const { readWikiSourceRecord, listWikiDrafts } =
        await importModule<typeof import("@/lib/server/wiki-store")>("lib/server/wiki-store.ts");

      const result = await ingestWikiSource({
        title: "美国站视频复盘",
        content: "这份新复盘指出，高播放不成交时，应该先定位漏斗，再看详情页和承接。",
      });

      assert.equal(result.drafts.length, 2);
      assert.equal(result.source.id.length > 0, true);
      assert.equal(result.drafts[0]?.targetPageId, "concepts/运营漏斗诊断");
      assert.equal(result.drafts[1]?.targetPageId, undefined);

      const source = await readWikiSourceRecord(result.source.id);
      assert.ok(source);
      assert.deepEqual(source.draftIds.length, 2);

      const drafts = await listWikiDrafts();
      assert.equal(drafts.length, 2);
      assert.deepEqual(
        drafts
          .map((draft) => draft.targetPageId || null)
          .sort((left, right) => String(left).localeCompare(String(right), "zh-CN")),
        [null, "concepts/运营漏斗诊断"].sort((left, right) =>
          String(left).localeCompare(String(right), "zh-CN")
        )
      );
    });
  });
});

test("approveIngestedWikiSource approves all generated proposals and updates existing pages", async () => {
  await withTempCwd(async () => {
    await seedPublishedPage({
      id: "concepts/运营漏斗诊断",
      title: "运营漏斗诊断",
      category: "concepts",
      summary: "旧版漏斗诊断",
      content: "# 运营漏斗诊断\n\n旧内容",
      version: 2,
    });
    await seedPublishedPage({
      id: "entities/TikTok店铺运营框架",
      title: "TikTok店铺运营框架",
      category: "entities",
      summary: "店铺承接框架",
      content: "# TikTok店铺运营框架\n\n旧框架",
    });

    await withMockedDraftModel(buildMultiDraftModelOutput(), async () => {
      const { ingestWikiSource, approveIngestedWikiSource } =
        await importModule<typeof import("@/lib/server/wiki-drafts")>("lib/server/wiki-drafts.ts");

      const result = await ingestWikiSource({
        title: "美国站视频复盘",
        content: "这份新复盘指出，高播放不成交时，应该先定位漏斗，再看详情页和承接。",
      });
      const approvedDrafts = await approveIngestedWikiSource(result);

      assert.equal(approvedDrafts.length, 2);
      assert.deepEqual(approvedDrafts.map((draft) => draft.status), ["approved", "approved"]);

      const sourceFiles = await readFile(
        path.join(process.cwd(), ".kb-chat-data", "wiki", "sources", `${result.source.id}.json`),
        "utf8"
      );
      const source = JSON.parse(sourceFiles) as { status?: string; draftIds?: string[] };
      assert.ok(source);
      assert.equal(source.status, "approved");
      assert.equal(source.draftIds?.length, 2);

      const updatedPage = await readFile(path.join(process.cwd(), "wiki", "concepts", "运营漏斗诊断.md"), "utf8");
      assert.match(updatedPage, /version: 3/);
      assert.match(updatedPage, /新资料修正后的漏斗诊断顺序/);

      const newPage = await readFile(path.join(process.cwd(), "wiki", "faq", "高播放不成交排查.md"), "utf8");
      assert.match(newPage, /先判断问题在点击、加购还是成交/);

      const storedIndex = await readFile(
        path.join(process.cwd(), ".kb-chat-data", "wiki", "cache", "published-index.json"),
        "utf8"
      );
      assert.match(storedIndex, /高播放不成交排查/);
    });
  });
});
