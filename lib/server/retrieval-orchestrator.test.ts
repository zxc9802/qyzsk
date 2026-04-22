import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

async function importRetrievalModule() {
  const modulePath = pathToFileURL(path.join(REPO_ROOT, "lib/server/retrieval-orchestrator.ts")).href;
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

async function withTempCwd<T>(callback: () => Promise<T>) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kb-chat-retrieval-"));
  process.chdir(tempDir);

  try {
    return await callback();
  } finally {
    process.chdir(previousCwd);
  }
}

test("buildRetrievalOrchestratorResult adds relation summaries without loading related page full bodies", async () => {
  await withTempCwd(async () => {
    await mkdir(path.join(process.cwd(), "wiki", "concepts"), { recursive: true });
    await mkdir(path.join(process.cwd(), "wiki", "roles"), { recursive: true });
    await mkdir(path.join(process.cwd(), "lib"), { recursive: true });
    await writeFile(path.join(process.cwd(), "lib", "kb-content.txt"), "", "utf8");

    await writeFile(
      path.join(process.cwd(), "wiki", "concepts", "main.md"),
      `---
id: "concepts/main"
title: "主页面方法"
category: "concepts"
summary: "主页面摘要"
roles: ["全员"]
source_ids: ["KB001"]
related_pages: ["roles/helper"]
relations: [{"targetId":"roles/helper","type":"depends_on","note":"执行前先看辅助页"}]
created_at: "2026-04-22"
updated_at: "2026-04-22"
version: 1
---

# 主页面方法

这是主页面的完整正文，应该进入主要上下文。
`,
      "utf8"
    );

    await writeFile(
      path.join(process.cwd(), "wiki", "roles", "helper.md"),
      `---
id: "roles/helper"
title: "辅助执行页"
category: "roles"
summary: "辅助页摘要"
roles: ["全员"]
source_ids: ["KB002"]
related_pages: []
relations: []
created_at: "2026-04-22"
updated_at: "2026-04-22"
version: 1
---

# 辅助执行页

RELATED_FULL_BODY_SHOULD_NOT_BE_INCLUDED
`,
      "utf8"
    );

    const { buildRetrievalOrchestratorResult } = await importRetrievalModule();
    const result = await buildRetrievalOrchestratorResult({
      query: "主页面方法怎么做",
      role: "全员",
      knowledgeMode: "wiki_first",
      history: [],
    });

    assert.match(result.wikiContext, /辅助执行页/);
    assert.match(result.wikiContext, /执行前先看辅助页/);
    assert.doesNotMatch(result.wikiContext, /RELATED_FULL_BODY_SHOULD_NOT_BE_INCLUDED/);
  });
});
