import assert from "node:assert/strict";
import test from "node:test";

import { buildQueryRewrite } from "@/lib/server/query-rewrite";

test("buildQueryRewrite leaves direct queries unchanged", () => {
  const rewrite = buildQueryRewrite({
    query: "达人建联SOP怎么做？",
    role: "bd",
  });

  assert.equal(rewrite.queryType, "direct");
  assert.equal(rewrite.shouldRewrite, false);
  assert.equal(rewrite.standaloneQuery, "达人建联SOP怎么做？");
  assert.equal(rewrite.vectorQuery, "达人建联SOP怎么做？");
  assert.deepEqual(rewrite.keywordTerms, []);
  assert.ok(rewrite.confidence >= 0.85);
});

test("buildQueryRewrite expands context-dependent follow-up with recent history", () => {
  const rewrite = buildQueryRewrite({
    query: "这个怎么弄",
    role: "operation",
    history: [
      { role: "user", content: "TikTok 店铺不出单，商品卡详情页和运营漏斗都要看什么？" },
      { role: "assistant", content: "可以先拆曝光、点击、转化和详情页承接。" },
    ],
  });

  assert.equal(rewrite.queryType, "context_dependent");
  assert.equal(rewrite.shouldRewrite, true);
  assert.match(rewrite.standaloneQuery, /TikTok 店铺不出单/);
  assert.match(rewrite.vectorQuery, /运营漏斗/);
  assert.ok(rewrite.keywordTerms.includes("运营漏斗"));
  assert.ok(rewrite.keywordTerms.includes("商品卡"));
  assert.ok(rewrite.confidence > 0.6);
});

test("buildQueryRewrite identifies comparison and multi-intent queries", () => {
  const comparison = buildQueryRewrite({
    query: "商品卡和直播哪个更适合先做？",
    role: "operation",
  });
  const multiIntent = buildQueryRewrite({
    query: "达人建联、短视频脚本和直播成交分别怎么推进？",
    role: "management",
  });

  assert.equal(comparison.queryType, "comparison");
  assert.equal(comparison.shouldRewrite, true);
  assert.ok(comparison.keywordTerms.includes("商品卡"));
  assert.ok(comparison.keywordTerms.includes("直播成交"));
  assert.match(comparison.vectorQuery, /对比/);

  assert.equal(multiIntent.queryType, "multi_intent");
  assert.equal(multiIntent.shouldRewrite, true);
  assert.ok(multiIntent.keywordTerms.includes("达人建联"));
  assert.ok(multiIntent.keywordTerms.includes("短视频内容测试"));
  assert.ok(multiIntent.keywordTerms.includes("直播成交"));
});
