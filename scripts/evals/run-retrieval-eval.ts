import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { buildRetrievalOrchestratorResult } from "@/lib/server/retrieval-orchestrator";
import type { KnowledgeMode } from "@/lib/knowledge-mode";

type RetrievalEvalCase = {
  id: string;
  query: string;
  role?: string;
  knowledgeMode?: KnowledgeMode;
  expectedWikiIds: string[];
};

type EvalFailure = {
  testCase: RetrievalEvalCase;
  wikiHitIds: string[];
  missingWikiIds: string[];
};

const EVAL_PATH = path.join(process.cwd(), "evals/wiki-retrieval-smoke.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function parseEvalCases(value: unknown): RetrievalEvalCase[] {
  if (!Array.isArray(value)) {
    throw new Error("Retrieval eval file must contain an array.");
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Eval case at index ${index} must be an object.`);
    }

    const expectedWikiIds = readStringArray(item.expectedWikiIds);
    if (
      typeof item.id !== "string" ||
      typeof item.query !== "string" ||
      !expectedWikiIds ||
      (item.role !== undefined && typeof item.role !== "string") ||
      (item.knowledgeMode !== undefined && item.knowledgeMode !== "wiki_first" && item.knowledgeMode !== "kb_only")
    ) {
      throw new Error(`Eval case at index ${index} has an invalid shape.`);
    }

    return {
      id: item.id,
      query: item.query,
      role: item.role,
      knowledgeMode: item.knowledgeMode,
      expectedWikiIds,
    };
  });
}

async function loadEvalCases() {
  const raw = await readFile(EVAL_PATH, "utf8");
  return parseEvalCases(JSON.parse(raw));
}

async function runCase(testCase: RetrievalEvalCase): Promise<EvalFailure | null> {
  const result = await buildRetrievalOrchestratorResult({
    query: testCase.query,
    role: testCase.role || "new",
    knowledgeMode: testCase.knowledgeMode || "wiki_first",
  });
  const wikiHitIds = result.sourceHits
    .filter((hit) => hit.type === "wiki")
    .map((hit) => hit.id);
  const wikiHitIdSet = new Set(wikiHitIds);
  const missingWikiIds = testCase.expectedWikiIds.filter((id) => !wikiHitIdSet.has(id));

  if (missingWikiIds.length === 0) {
    return null;
  }

  return {
    testCase,
    wikiHitIds,
    missingWikiIds,
  };
}

async function main() {
  const cases = await loadEvalCases();
  const failures: EvalFailure[] = [];

  for (const testCase of cases) {
    const failure = await runCase(testCase);
    if (failure) failures.push(failure);
  }

  for (const failure of failures) {
    console.error(
      [
        `[FAIL] ${failure.testCase.id}: ${failure.testCase.query}`,
        `  expected: ${failure.testCase.expectedWikiIds.join(", ") || "(none)"}`,
        `  missing:  ${failure.missingWikiIds.join(", ")}`,
        `  hits:     ${failure.wikiHitIds.join(", ") || "(none)"}`,
      ].join("\n")
    );
  }

  const passed = cases.length - failures.length;
  console.log(`Retrieval eval: ${passed}/${cases.length} passed`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
