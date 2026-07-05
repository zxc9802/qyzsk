import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { KnowledgeBaseHit, RetrievalSourceHit } from "@/lib/types";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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
    await mkdir(path.join(process.cwd(), "wiki", "faq"), { recursive: true });
    await mkdir(path.join(process.cwd(), "wiki", "roles"), { recursive: true });
    await mkdir(path.join(process.cwd(), "lib"), { recursive: true });
    await writeFile(
      path.join(process.cwd(), "lib", "kb-content.txt"),
      `<a id="kb019高标准的定义"></a>### KB019｜高标准的定义

- category: 经营原则
- roles: 全员
- trigger_questions: 公司说高标准，具体是什么？
- standard_answer: 高标准的人会自己补齐信息，并把有效动作沉淀成可复制资产。
- framework: 思考质量—执行质量—复盘质量。
- next_actions: 提交方案前，自查是否回答了为什么做、怎么做、如何复盘。
- related_terms: 高标准,结果导向,沉淀

<a id="kb130下单转化率低要重点查异议没有被消除"></a>### KB130｜下单转化率低要重点查异议没有被消除

- category: 店铺运营
- roles: 运营岗
- trigger_questions: 店铺不出单怎么排查？
- standard_answer: 店铺不出单要重点看用户异议是否被详情页、评论区和客服话术消除。
- framework: 异议—承接—转化。
- next_actions: 先整理评论区和客服高频异议，再逐条补承接内容。
- related_terms: 不出单,转化,店铺
`,
      "utf8"
    );

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

    await writeFile(
      path.join(process.cwd(), "wiki", "faq", "store-diagnosis.md"),
      `---
id: "faq/store-diagnosis"
title: "店铺不出单诊断"
category: "faq"
summary: "店铺不出单要先看曝光、点击、转化和履约口碑。"
roles: ["运营岗"]
source_ids: ["KB130"]
related_pages: []
relations: []
created_at: "2026-04-22"
updated_at: "2026-04-22"
version: 1
---

# 店铺不出单诊断

店铺不出单要先分层排查曝光、点击、转化和履约口碑。
`,
      "utf8"
    );

    await writeFile(
      path.join(process.cwd(), "wiki", "concepts", "values.md"),
      `---
id: "concepts/values"
title: "经营原则与高标准"
category: "concepts"
summary: "高标准体现在主动补信息、复盘纠错和把有效动作沉淀成可复制资产。"
roles: ["全员"]
source_ids: ["KB019"]
related_pages: []
relations: []
created_at: "2026-04-22"
updated_at: "2026-04-22"
version: 1
---

# 经营原则与高标准

高标准的人会主动补齐信息、及时复盘纠错，并把有效动作沉淀成可复制资产。
`,
      "utf8"
    );

    const { buildRetrievalOrchestratorResult } = await importRetrievalModule();
    const relationResult = await buildRetrievalOrchestratorResult({
      query: "主页面方法怎么做",
      role: "全员",
      knowledgeMode: "wiki_first",
      history: [],
    });

    assert.match(relationResult.wikiContext, /辅助执行页/);
    assert.match(relationResult.wikiContext, /执行前先看辅助页/);
    assert.doesNotMatch(relationResult.wikiContext, /RELATED_FULL_BODY_SHOULD_NOT_BE_INCLUDED/);

    const result = await buildRetrievalOrchestratorResult({
      query: "店铺不出单怎么办",
      role: "operation",
      knowledgeMode: "wiki_first",
      history: [],
    });

    assert.ok(result.sourceHits.some((hit: RetrievalSourceHit) => hit.id === "faq/store-diagnosis"));
    assert.ok(result.sourceHits.some((hit: RetrievalSourceHit) => hit.id === "concepts/values"));
    assert.match(result.knowledgeContext, /店铺不出单要先分层排查/);
    assert.match(result.knowledgeContext, /高标准的人会主动补齐信息/);

    const valueHitCount = (
      await buildRetrievalOrchestratorResult({
        query: "高标准具体是什么意思",
        role: "new",
        knowledgeMode: "wiki_first",
        history: [],
      })
    ).sourceHits.filter((hit: RetrievalSourceHit) => hit.id === "concepts/values").length;
    assert.equal(valueHitCount, 1);

    const kbOnlyResult = await buildRetrievalOrchestratorResult({
      query: "店铺不出单怎么办",
      role: "operation",
      knowledgeMode: "kb_only",
      history: [],
    });

    assert.ok(kbOnlyResult.kbHits.some((hit: KnowledgeBaseHit) => hit.id === "KB130"));
    assert.ok(kbOnlyResult.kbHits.some((hit: KnowledgeBaseHit) => hit.id === "KB019"));
  });
});

test("mergeWikiSearchResults fuses keyword and vector results via RRF", async () => {
  const { mergeWikiSearchResults } = await importRetrievalModule();

  const page = (id: string) => ({ id } as never);
  const keywordResults = [
    { page: page("A"), score: 80, excerpt: "ka" },
    { page: page("B"), score: 60, excerpt: "kb" },
    { page: page("C"), score: 40, excerpt: "kc" },
  ] as never;
  const vectorResults = [
    { page: page("D"), score: 30, excerpt: "vd" },
    { page: page("A"), score: 25, excerpt: "va" },
    { page: page("E"), score: 22, excerpt: "ve" },
  ] as never;

  const merged = mergeWikiSearchResults(keywordResults, vectorResults);
  const ids = merged.map((item: { page: { id: string } }) => item.page.id);

  // A 双路命中，RRF 最高，排第一；score 取两路原生最高，不再 +4。
  assert.equal(ids[0], "A");
  assert.equal(merged[0].score, 80);
  // D 是向量路 rank-0，RRF 高于关键词路 rank-1 的 B，因此排在 B 前面——
  // 这正是“向量召回的语义相关页不再被关键词分数压制”的关键行为。
  assert.equal(ids[1], "D");
  assert.ok(ids.indexOf("D") < ids.indexOf("B"));
});

test("mergeKnowledgeBaseEntriesByRrf fuses keyword and vector KB ranks", async () => {
  const { mergeKnowledgeBaseEntriesByRrf } = await importRetrievalModule();

  const entry = (id: string) => ({ id } as never);
  const keywordEntries = [entry("A"), entry("B"), entry("C")];
  const vectorEntries = [entry("D"), entry("A"), entry("E")];

  const merged = mergeKnowledgeBaseEntriesByRrf(keywordEntries, vectorEntries, 10);
  const ids = merged.map((item: { id: string }) => item.id);

  assert.equal(ids[0], "A");
  assert.equal(ids[1], "D");
  assert.ok(ids.indexOf("D") < ids.indexOf("B"));
});

test("buildRetrievalOrchestratorResult reuses one query embedding for wiki and KB vector retrieval", async () => {
  await withTempCwd(async () => {
    await mkdir(path.join(process.cwd(), "wiki", "concepts"), { recursive: true });
    await mkdir(path.join(process.cwd(), "lib"), { recursive: true });
    await writeFile(
      path.join(process.cwd(), "lib", "kb-content.txt"),
      `<a id="kb130下单转化率低要重点查异议没有被消除"></a>### KB130｜下单转化率低要重点查异议没有被消除

- category: 店铺运营
- roles: 运营岗
- trigger_questions: 店铺不出单怎么排查？
- standard_answer: 店铺不出单要重点看用户异议是否被详情页、评论区和客服话术消除。
- framework: 异议—承接—转化。
- next_actions: 先整理评论区和客服高频异议。
- related_terms: 不出单,转化,店铺
`,
      "utf8"
    );
    await writeFile(
      path.join(process.cwd(), "wiki", "concepts", "store-diagnosis.md"),
      `---
id: "concepts/store-diagnosis"
title: "店铺不出单诊断"
category: "concepts"
summary: "店铺不出单要先看曝光、点击、转化和履约口碑。"
roles: ["运营岗"]
source_ids: ["KB130"]
related_pages: []
relations: []
created_at: "2026-04-22"
updated_at: "2026-04-22"
version: 1
---

# 店铺不出单诊断

店铺不出单要先分层排查曝光、点击、转化和履约口碑。
`,
      "utf8"
    );

    const previousEnv = {
      RAG_ENABLED: process.env.RAG_ENABLED,
      RAG_OPENAI_API_KEY: process.env.RAG_OPENAI_API_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
    };
    const previousFetch = globalThis.fetch;
    const previousConsoleError = console.error;
    let embeddingRequestCount = 0;

    process.env.RAG_ENABLED = "true";
    process.env.RAG_OPENAI_API_KEY = "test-key";
    process.env.DATABASE_URL = "postgres://127.0.0.1:1/kb_chat_test";
    globalThis.fetch = (async () => {
      embeddingRequestCount += 1;
      return new Response(
        JSON.stringify({
          data: [{ embedding: Array.from({ length: 1024 }, () => 0.01) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;
    console.error = ((firstArg: unknown, ...args: unknown[]) => {
      if (typeof firstArg === "string" && firstArg.includes("vector retrieval error")) {
        return;
      }
      previousConsoleError(firstArg, ...args);
    }) as typeof console.error;

    try {
      const { buildRetrievalOrchestratorResult } = await importRetrievalModule();
      await buildRetrievalOrchestratorResult({
        query: "店铺不出单怎么办",
        role: "operation",
        knowledgeMode: "wiki_first",
        history: [],
      });

      assert.equal(embeddingRequestCount, 1);
    } finally {
      if (previousEnv.RAG_ENABLED === undefined) delete process.env.RAG_ENABLED;
      else process.env.RAG_ENABLED = previousEnv.RAG_ENABLED;
      if (previousEnv.RAG_OPENAI_API_KEY === undefined) delete process.env.RAG_OPENAI_API_KEY;
      else process.env.RAG_OPENAI_API_KEY = previousEnv.RAG_OPENAI_API_KEY;
      if (previousEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousEnv.DATABASE_URL;
      globalThis.fetch = previousFetch;
      console.error = previousConsoleError;
    }
  });
});
