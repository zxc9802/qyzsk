import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKnowledgeBaseQuerySignals,
  buildKnowledgeBaseRetrieval,
  selectKnowledgeBaseEntriesByQuery,
  type KnowledgeBaseEntry,
} from "@/lib/server/kb-retrieval";
import { buildKbEntryRagChunks } from "@/lib/server/rag-chunking";

function selectIds(query: string, role: string): string[] {
  return selectKnowledgeBaseEntriesByQuery(query, role).map((entry) => entry.id);
}

function includesAny(ids: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => ids.includes(candidate));
}

test("buildKnowledgeBaseQuerySignals extracts dictionary phrases from continuous Chinese queries", () => {
  const signals = buildKnowledgeBaseQuerySignals("店铺不出单怎么办");

  assert.ok(signals.phrases.includes("店铺"));
  assert.ok(signals.phrases.includes("出单"));
});

test("buildKnowledgeBaseQuerySignals extracts diagnostic phrases from alternate wording", () => {
  const noOrderSignals = buildKnowledgeBaseQuerySignals("一直不出单");
  const lowOrderSignals = buildKnowledgeBaseQuerySignals("出单很少怎么办");

  assert.ok(noOrderSignals.phrases.includes("不出单"));
  assert.ok(lowOrderSignals.phrases.includes("出单"));
});

test("selectKnowledgeBaseEntriesByQuery keeps product methodology retrieval stable", () => {
  const ids = selectIds("判断一个产品值不值得做，应该看哪些维度？", "product");

  assert.ok(ids.includes("KB022"));
});

test("selectKnowledgeBaseEntriesByQuery keeps content methodology retrieval stable", () => {
  const ids = selectIds("短视频脚本应该先看人群还是卖点？", "video");

  assert.ok(ids.includes("KB038"));
});

test("selectKnowledgeBaseEntriesByQuery keeps AI onboarding retrieval stable", () => {
  const ids = selectIds("我刚入职，问 AI 之前应该先准备什么信息？", "new");

  assert.ok(includesAny(ids, ["KB007", "KB078"]));
});

test("selectKnowledgeBaseEntriesByQuery returns operation diagnostics across low-order variants", () => {
  const expectedDiagnosticIds = ["KB052", "KB130"];

  assert.ok(includesAny(selectIds("店铺不出单怎么办", "operation").slice(0, 3), expectedDiagnosticIds));
  assert.ok(includesAny(selectIds("一直不出单", "operation").slice(0, 3), expectedDiagnosticIds));
  assert.ok(includesAny(selectIds("出单很少怎么办", "operation").slice(0, 3), expectedDiagnosticIds));
});

test("buildKnowledgeBaseRetrieval drops unrelated questions instead of injecting low-score hits", () => {
  const retrieval = buildKnowledgeBaseRetrieval("今天天气怎么样", "operation");

  assert.deepEqual(retrieval.hits, []);
  assert.equal(retrieval.context, "");
});

function makeEntry(overrides: Partial<KnowledgeBaseEntry> = {}): KnowledgeBaseEntry {
  return {
    id: "KB001",
    title: "测试条目",
    category: "店铺运营",
    roles: ["运营岗"],
    triggerQuestions: ["店铺不出单怎么排查？", "转化率低怎么办？"],
    standardAnswer: "先看异议是否被消除。",
    framework: "",
    nextActions: "",
    relatedTerms: ["不出单", "转化"],
    ...overrides,
  };
}

test("buildKbEntryRagChunks creates one chunk per trigger question with entry context", () => {
  const entry = makeEntry();
  const chunks = buildKbEntryRagChunks(entry);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].sourceType, "kb_entry");
  assert.equal(chunks[0].sourceId, "KB001");
  assert.equal(chunks[0].chunkIndex, 0);
  assert.equal(chunks[1].chunkIndex, 1);
  assert.match(chunks[0].content, /店铺不出单怎么排查/);
  assert.match(chunks[0].content, /测试条目/);
  assert.match(chunks[0].content, /先看异议是否被消除/);
});

test("buildKbEntryRagChunks falls back to standard answer when no trigger questions", () => {
  const entry = makeEntry({ triggerQuestions: [], standardAnswer: "兜底回答" });
  const chunks = buildKbEntryRagChunks(entry);

  assert.equal(chunks.length, 1);
  assert.match(chunks[0].content, /兜底回答/);
});

test("buildKbEntryRagChunks returns nothing when entry has no searchable text", () => {
  const entry = makeEntry({ triggerQuestions: [], standardAnswer: "", title: "" });
  assert.equal(buildKbEntryRagChunks(entry).length, 0);
});
