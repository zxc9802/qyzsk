import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKnowledgeBaseQuerySignals,
  buildKnowledgeBaseRetrieval,
  selectKnowledgeBaseEntriesByQuery,
} from "@/lib/server/kb-retrieval";

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
