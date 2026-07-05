import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDiagnosisReview,
  buildClarificationReplyForDiagnosis,
  diagnoseQuestion,
  parseDiagnosisReview,
  parseModelDiagnosisResult,
} from "@/lib/server/question-diagnosis";
import type { QuestionDiagnosis } from "@/lib/types";

test("diagnoseQuestion routes framework questions to answer mode without slot prompts", () => {
  const result = diagnoseQuestion("判断一个产品值不值得做，应该看哪些维度？", "product");

  assert.equal(result.diagnosis.categoryId, "product");
  assert.equal(result.diagnosis.mode, "answer");
  assert.deepEqual(result.diagnosis.missingSlots, []);
  assert.equal(result.clarificationReply, null);
});

test("diagnoseQuestion asks for missing slots on concrete operation cases", () => {
  const result = diagnoseQuestion("我的店铺最近不出单了，应该怎么排查问题？", "operation");

  assert.equal(result.diagnosis.categoryId, "operation");
  assert.equal(result.diagnosis.mode, "clarify");
  assert.equal(result.diagnosis.clarificationStage, "fill_slots");
  assert.ok(result.diagnosis.collectedSlots?.includes("最大卡点"));
  assert.ok(result.diagnosis.missingSlots.includes("平台"));
  assert.ok(result.clarificationReply?.includes("平台"));
});

test("diagnoseQuestion treats a numbered reply as scope selection for previous clarification", () => {
  const previousDiagnosis: QuestionDiagnosis = {
    categoryId: "product",
    categoryLabel: "产品选择类",
    mode: "clarify",
    completenessScore: 20,
    missingSlots: ["产品", "市场", "渠道", "价格带", "目标人群", "销售方式"],
    summary: "需要先缩小场景。",
    clarificationStage: "choose_scope",
    scopeOptions: ["判断新产品要不要做", "优化已有产品转化"],
    collectedSlots: [],
    diagnosisSource: "rule",
  };

  const result = diagnoseQuestion("1", "product", [
    {
      role: "assistant",
      content: "你现在更想问哪一种？",
      questionDiagnosis: previousDiagnosis,
    },
  ]);

  assert.equal(result.diagnosis.categoryId, "product");
  assert.equal(result.diagnosis.selectedScope, "判断新产品要不要做");
  assert.equal(result.diagnosis.clarificationStage, "fill_slots");
  assert.ok(result.clarificationReply?.includes("判断新产品要不要做"));
});

test("diagnoseQuestion merges structured slot fills from previous clarification", () => {
  const previousDiagnosis: QuestionDiagnosis = {
    categoryId: "operation",
    categoryLabel: "店铺运营类",
    mode: "clarify",
    completenessScore: 20,
    missingSlots: ["平台", "店铺阶段", "主营产品", "核心数据", "最大卡点", "流量来源"],
    summary: "需要补齐店铺背景。",
    clarificationStage: "fill_slots",
    selectedScope: "店铺不出单诊断",
    collectedSlots: [],
    diagnosisSource: "rule",
  };

  const result = diagnoseQuestion("平台：TikTok\n主营产品：防晒霜\n最大卡点：点击还行但没人下单", "operation", [
    {
      role: "assistant",
      content: "请补充店铺背景。",
      questionDiagnosis: previousDiagnosis,
    },
  ]);

  assert.equal(result.diagnosis.categoryId, "operation");
  assert.equal(result.diagnosis.mode, "clarify");
  assert.ok(result.diagnosis.collectedSlots?.includes("平台"));
  assert.ok(result.diagnosis.collectedSlots?.includes("主营产品"));
  assert.ok(result.diagnosis.collectedSlots?.includes("最大卡点"));
  assert.ok(!result.diagnosis.missingSlots.includes("平台"));
});

test("parse model diagnosis and review JSON tolerate extra text but reject invalid intent", () => {
  const diagnosis = parseModelDiagnosisResult(
    '说明：{"categoryId":"ai_tool","mode":"answer","completenessScore":100,"missingSlots":[],"summary":"可以直接回答","clarificationReply":""}',
    "怎么用 AI 问得更准？"
  );
  assert.equal(diagnosis?.diagnosis.categoryId, "ai_tool");
  assert.equal(diagnosis?.diagnosis.mode, "answer");

  const review = parseDiagnosisReview('```json\n{"intent":"slot_fill","filledSlots":["平台"]}\n```');
  assert.equal(review?.intent, "slot_fill");

  assert.equal(parseDiagnosisReview('{"intent":"do_anything"}'), null);
});

test("applyDiagnosisReview can complete a fill-slots clarification", () => {
  const latestClarification: QuestionDiagnosis = {
    categoryId: "operation",
    categoryLabel: "店铺运营类",
    mode: "clarify",
    completenessScore: 70,
    missingSlots: ["平台"],
    summary: "还差平台。",
    clarificationStage: "fill_slots",
    selectedScope: "店铺不出单诊断",
    collectedSlots: ["店铺阶段", "主营产品", "核心数据", "最大卡点", "流量来源"],
    diagnosisSource: "rule",
  };
  const fallbackDiagnosis = {
    ...latestClarification,
    collectedSlots: latestClarification.collectedSlots || [],
  };

  const result = applyDiagnosisReview(
    { intent: "slot_fill", filledSlots: ["平台"] },
    latestClarification,
    fallbackDiagnosis,
    buildClarificationReplyForDiagnosis(fallbackDiagnosis, "平台：TikTok")
  );

  assert.equal(result.diagnosis.mode, "answer");
  assert.deepEqual(result.diagnosis.missingSlots, []);
  assert.equal(result.clarificationReply, null);
});
