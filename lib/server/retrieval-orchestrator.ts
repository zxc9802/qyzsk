import type { KnowledgeMode } from "@/lib/knowledge-mode";
import type { KnowledgeBaseHit, QuestionDiagnosis, RetrievalSourceHit } from "@/lib/types";
import type { WikiPageSearchDocument } from "@/lib/wiki-types";
import {
  buildKnowledgeBaseContextFromEntries,
  getKnowledgeBaseEntriesByIds,
  selectKnowledgeBaseEntriesByQuery,
  toKnowledgeBaseHit,
  type KnowledgeBaseEntry,
} from "@/lib/server/kb-retrieval";
import { buildConversationFileRetrieval } from "@/lib/server/file-retrieval";
import { searchWikiPages } from "@/lib/server/wiki-search";
import { listPublishedPages } from "@/lib/server/wiki-store";
import { getWikiRelationTypeLabel } from "@/lib/wiki-relations";
import type { WikiRelation, WikiRelationType } from "@/lib/wiki-types";

const MAX_TOTAL_KNOWLEDGE_CHARS = 12000;
const MAX_WIKI_CONTEXT_CHARS = 7600;
const MAX_WIKI_PAGES = 4;
const MAX_WIKI_RELATION_SUMMARIES = 3;
const MAX_KB_BACKFILL_ENTRIES = 3;
const MAX_VALUE_WIKI_PAGES = 1;
const MAX_VALUE_KB_ENTRIES = 2;
const WIKI_SCORE_THRESHOLD = 16;
const VALUE_WIKI_PAGE_IDS = new Set([
  "concepts/经营原则与高标准",
  "roles/人才分级与用人原则",
  "roles/新员工提问原则",
  "roles/管理与复盘机制",
]);
const VALUE_KB_ENTRY_IDS = new Set([
  "KB006",
  "KB007",
  "KB008",
  "KB009",
  "KB010",
  "KB011",
  "KB017",
  "KB018",
  "KB019",
  "KB020",
  "KB065",
  "KB067",
  "KB068",
  "KB069",
  "KB070",
  "KB071",
  "KB099",
  "KB100",
]);
const VALUE_QUERY_RULES: Array<{ terms: string[]; values: string[] }> = [
  {
    terms: ["ai", "智能体", "提问", "问ai", "问 AI", "信息不足", "上下文", "不知道", "不会"],
    values: ["补充业务上下文", "先问AI", "信息不足", "不编造", "先分类再回答"],
  },
  {
    terms: ["错误", "复盘", "纠错", "问题", "失败", "优化", "改正"],
    values: ["及时指出错误", "复盘纠错", "高标准", "避免复发"],
  },
  {
    terms: ["项目", "优先级", "资源", "投入", "取舍", "决策", "推进"],
    values: ["公司利益", "项目分级", "资源聚焦", "决策统一"],
  },
  {
    terms: ["流程", "规则", "合规", "合同", "财务", "权限", "执行"],
    values: ["效率优先", "不能忽略规则", "决策统一", "坚决执行"],
  },
  {
    terms: ["复制", "沉淀", "sop", "SOP", "标准", "方法库", "放大", "规模"],
    values: ["可复制", "可沉淀资产", "组织能力", "高利润"],
  },
  {
    terms: ["员工", "人才", "招聘", "晋升", "培养", "带教", "负责人", "新项目", "强者"],
    values: ["人才是核心资产", "S级人才", "强者打样", "筛选大于培养"],
  },
];
const DEFAULT_VALUE_QUERY = "高标准 补充业务上下文 及时纠错 可复制 沉淀 结果负责";
const CONTEXT_DEPENDENT_HINTS = [
  "这个",
  "那个",
  "这个怎么",
  "那这个",
  "这里",
  "上面",
  "下面",
  "刚才",
  "继续",
  "然后",
  "这样",
  "这种",
  "为什么",
  "为啥",
  "怎么做",
  "怎么改",
  "怎么弄",
  "怎么处理",
  "详细说",
  "展开",
];

export type RetrievalHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type VectorWikiSearchResult = Awaited<ReturnType<typeof searchWikiPages>>;

function trimForContext(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function normalizeQuery(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isContextDependentQuery(query: string) {
  const normalized = normalizeQuery(query);
  if (!normalized) return false;
  if (normalized.length <= 12) return true;
  return CONTEXT_DEPENDENT_HINTS.some((hint) => normalized.includes(hint));
}

function buildRetrievalQuery(options: {
  query: string;
  history?: RetrievalHistoryMessage[];
  diagnosis?: QuestionDiagnosis;
}) {
  const currentQuery = options.query.trim();
  if (!currentQuery) return "";

  const previousUserTurns = (options.history || [])
    .filter((item) => item.role === "user")
    .map((item) => item.content.trim())
    .filter(Boolean)
    .slice(-2);
  const shouldUseHistory = isContextDependentQuery(currentQuery);
  const segments = [currentQuery, currentQuery];

  if (shouldUseHistory) {
    segments.push(...previousUserTurns);
  }

  if (options.diagnosis?.selectedScope) {
    segments.push(options.diagnosis.selectedScope.trim());
  }

  return segments.filter(Boolean).join("\n");
}

function buildWikiContext(pages: WikiPageSearchDocument[]) {
  if (pages.length === 0) return "";

  const blocks = pages.map((page) => {
    const body = trimForContext(page.content, 1800);
    const related = page.relatedPages.length > 0 ? `\n相关页面：${page.relatedPages.join("、")}` : "";

    return [
      `页面：${page.title} (${page.id})`,
      `摘要：${page.summary || "暂无摘要"}`,
      page.roles.length > 0 ? `适用岗位：${page.roles.join("、")}` : "",
      page.sourceIds.length > 0 ? `来源条目：${page.sourceIds.join("、")}` : "",
      `正文：\n${body}${related}`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    "以下是从公司 Wiki 中检索出的高相关页面。它们是经过整理的知识页，回答时优先使用。",
    "如果 Wiki 结论和 KB 条目存在差异，请优先保持谨慎，并用更明确的 KB 条目做事实兜底。",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}

function getRelationPriority(type: WikiRelationType) {
  switch (type) {
    case "depends_on":
      return 1;
    case "prerequisite":
      return 2;
    case "explains":
      return 3;
    case "applies_to":
      return 4;
    case "reinforces":
      return 5;
    case "example_of":
      return 6;
    case "contradicts":
      return 7;
    case "see_also":
    default:
      return 8;
  }
}

function selectRelatedWikiSummaries(options: {
  selectedPages: WikiPageSearchDocument[];
  allPages: WikiPageSearchDocument[];
}) {
  const pageById = new Map(options.allPages.map((page) => [page.id, page]));
  const selectedIds = new Set(options.selectedPages.map((page) => page.id));
  const candidates: Array<{
    sourcePage: WikiPageSearchDocument;
    relation: WikiRelation;
    targetPage: WikiPageSearchDocument;
  }> = [];
  const seenTargets = new Set<string>();

  const orderedRelations = options.selectedPages.flatMap((page) =>
    (page.relations || [])
      .slice()
      .sort((left, right) => getRelationPriority(left.type) - getRelationPriority(right.type))
      .map((relation) => ({ page, relation }))
  );

  for (const { page, relation } of orderedRelations) {
    if (seenTargets.has(relation.targetId) || selectedIds.has(relation.targetId)) {
      continue;
    }

    const targetPage = pageById.get(relation.targetId);
    if (!targetPage) continue;

    seenTargets.add(relation.targetId);
    candidates.push({
      sourcePage: page,
      relation,
      targetPage,
    });

    if (candidates.length >= MAX_WIKI_RELATION_SUMMARIES) {
      break;
    }
  }

  return candidates;
}

function buildRelatedWikiContext(
  relations: Array<{
    sourcePage: WikiPageSearchDocument;
    relation: WikiRelation;
    targetPage: WikiPageSearchDocument;
  }>
) {
  if (relations.length === 0) return "";

  return [
    "以下是根据页面关系补充的轻量导航信息，只用于帮助串联知识，不代表需要展开阅读整页：",
    "",
    relations
      .map(({ sourcePage, relation, targetPage }) =>
        [
          `关系补充：${targetPage.title} (${targetPage.id})`,
          `来自页面：${sourcePage.title}`,
          `关系类型：${getWikiRelationTypeLabel(relation.type)}`,
          relation.note ? `关系说明：${relation.note}` : "",
          `摘要：${targetPage.summary || "暂无摘要"}`,
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n---\n\n"),
  ].join("\n");
}

function mergeWikiSearchResults(
  keywordResults: Awaited<ReturnType<typeof searchWikiPages>>,
  vectorResults: VectorWikiSearchResult
) {
  const merged = new Map<
    string,
    {
      page: WikiPageSearchDocument;
      score: number;
      excerpt: string;
    }
  >();

  keywordResults.forEach((item) => {
    merged.set(item.page.id, item);
  });

  vectorResults.forEach((item) => {
    const current = merged.get(item.page.id);
    if (!current) {
      merged.set(item.page.id, item);
      return;
    }

    merged.set(item.page.id, {
      ...current,
      score: Math.max(current.score, item.score) + 4,
      excerpt: current.excerpt || item.excerpt,
    });
  });

  return Array.from(merged.values()).sort((left, right) => right.score - left.score);
}

async function searchCanonicalWikiPagesByVectorWithFallback(options: {
  query: string;
  topK?: number;
}): Promise<VectorWikiSearchResult> {
  const modulePath = ["@/lib/server", "rag-retrieval"].join("/");

  try {
    const ragModule = await import(modulePath);
    return ragModule.searchCanonicalWikiPagesByVector(options);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes(modulePath) || error.message.includes("rag-retrieval"))
    ) {
      return [];
    }

    throw error;
  }
}

function selectWikiPages(pages: Awaited<ReturnType<typeof searchWikiPages>>) {
  const selected: WikiPageSearchDocument[] = [];
  let budget = MAX_WIKI_CONTEXT_CHARS;

  for (const item of pages) {
    if (selected.length >= MAX_WIKI_PAGES) break;
    if (item.score < WIKI_SCORE_THRESHOLD && selected.length > 0) break;

    const estimatedLength = item.page.content.length + item.page.summary.length + 180;
    if (estimatedLength > budget && selected.length > 0) break;
    selected.push(item.page);
    budget -= estimatedLength;
  }

  return selected;
}

function toWikiSourceHit(page: WikiPageSearchDocument, score: number): RetrievalSourceHit {
  return {
    id: page.id,
    type: "wiki",
    title: page.title,
    category: page.category,
    detail: page.summary,
    excerpt: trimForContext(page.content.replace(/\n+/g, " "), 140),
    score,
  };
}

function uniqueKnowledgeBaseEntries(entries: KnowledgeBaseEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function backfillKnowledgeBaseEntries(query: string, role: string, pages: WikiPageSearchDocument[]) {
  const sourceEntries = getKnowledgeBaseEntriesByIds(
    pages.flatMap((page) => page.sourceIds).filter(Boolean)
  );
  const queryEntries = selectKnowledgeBaseEntriesByQuery(query, role);

  return uniqueKnowledgeBaseEntries([...sourceEntries, ...queryEntries]).slice(0, MAX_KB_BACKFILL_ENTRIES);
}

function buildValueRetrievalQuery(options: {
  query: string;
  role: string;
  diagnosis?: QuestionDiagnosis;
}) {
  const haystack = normalizeQuery(
    [
      options.query,
      options.role,
      options.diagnosis?.categoryLabel || "",
      options.diagnosis?.selectedScope || "",
      ...(options.diagnosis?.missingSlots || []),
      ...(options.diagnosis?.scopeOptions || []),
    ].join(" ")
  );
  const values = new Set<string>();

  for (const rule of VALUE_QUERY_RULES) {
    if (rule.terms.some((term) => haystack.includes(normalizeQuery(term)))) {
      rule.values.forEach((value) => values.add(value));
    }
  }

  if (values.size === 0) {
    DEFAULT_VALUE_QUERY.split(/\s+/).forEach((value) => values.add(value));
  }

  return Array.from(values).join(" ");
}

function isValueWikiPage(page: WikiPageSearchDocument) {
  if (VALUE_WIKI_PAGE_IDS.has(page.id)) return true;

  const joined = normalizeQuery([page.title, page.summary].join(" "));
  return (
    joined.includes("经营原则") ||
    joined.includes("高标准") ||
    joined.includes("人才分级") ||
    joined.includes("新员工提问") ||
    joined.includes("管理与复盘")
  );
}

function isValueKnowledgeBaseEntry(entry: KnowledgeBaseEntry) {
  return VALUE_KB_ENTRY_IDS.has(entry.id);
}

function selectValueKnowledgeBaseEntries(query: string, role: string, existingEntries: KnowledgeBaseEntry[]) {
  const existingIds = new Set(existingEntries.map((entry) => entry.id));
  return selectKnowledgeBaseEntriesByQuery(query, role)
    .filter((entry) => isValueKnowledgeBaseEntry(entry) && !existingIds.has(entry.id))
    .slice(0, MAX_VALUE_KB_ENTRIES);
}

export async function buildRetrievalOrchestratorResult(options: {
  query: string;
  role: string;
  userId?: string;
  conversationId?: string;
  history?: RetrievalHistoryMessage[];
  diagnosis?: QuestionDiagnosis;
  knowledgeMode: KnowledgeMode;
}) {
  const retrievalQuery = buildRetrievalQuery({
    query: options.query,
    history: options.history,
    diagnosis: options.diagnosis,
  });
  const shouldUseWiki = options.knowledgeMode === "wiki_first";
  const keywordWikiSearchResults = shouldUseWiki
    ? await searchWikiPages({
        query: retrievalQuery,
        role: options.role,
        diagnosis: options.diagnosis,
        topK: 6,
      })
    : [];
  const keywordSelectedWikiPages = selectWikiPages(keywordWikiSearchResults);
  const vectorWikiSearchResults =
    shouldUseWiki && keywordSelectedWikiPages.length < 2
      ? await searchCanonicalWikiPagesByVectorWithFallback({
          query: retrievalQuery,
          topK: 4,
        }).catch((error) => {
          console.error("Wiki vector retrieval error:", error);
          return [];
        })
      : [];
  const wikiSearchResults = mergeWikiSearchResults(keywordWikiSearchResults, vectorWikiSearchResults);
  const selectedWikiPages = selectWikiPages(wikiSearchResults);
  const valueRetrievalQuery = buildValueRetrievalQuery({
    query: retrievalQuery,
    role: options.role,
    diagnosis: options.diagnosis,
  });
  const selectedWikiIds = new Set(selectedWikiPages.map((page) => page.id));
  const valueWikiSearchResults = shouldUseWiki
    ? (
        await searchWikiPages({
          query: valueRetrievalQuery,
          role: options.role,
          diagnosis: options.diagnosis,
          topK: 8,
        })
      )
        .filter((item) => isValueWikiPage(item.page) && !selectedWikiIds.has(item.page.id))
        .slice(0, MAX_VALUE_WIKI_PAGES)
    : [];
  const valueWikiPages = valueWikiSearchResults.map((item) => item.page);
  const allPublishedPages = selectedWikiPages.length > 0 ? await listPublishedPages() : [];
  const relationSummaries =
    selectedWikiPages.length > 0
      ? selectRelatedWikiSummaries({
          selectedPages: selectedWikiPages,
          allPages: allPublishedPages,
        })
      : [];
  const wikiContext =
    selectedWikiPages.length > 0 || valueWikiPages.length > 0
      ? [
          selectedWikiPages.length > 0 ? buildWikiContext(selectedWikiPages) : "",
          buildRelatedWikiContext(relationSummaries),
          valueWikiPages.length > 0 ? buildWikiContext(valueWikiPages) : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : "";

  const primaryKbEntries =
    shouldUseWiki && selectedWikiPages.length > 0
      ? backfillKnowledgeBaseEntries(retrievalQuery, options.role, selectedWikiPages)
      : selectKnowledgeBaseEntriesByQuery(retrievalQuery, options.role);
  const valueKbEntries = selectValueKnowledgeBaseEntries(valueRetrievalQuery, options.role, primaryKbEntries);
  const kbEntries = uniqueKnowledgeBaseEntries([...primaryKbEntries, ...valueKbEntries]);
  const kbContext = buildKnowledgeBaseContextFromEntries(kbEntries);
  const kbHits: KnowledgeBaseHit[] = kbEntries.map(toKnowledgeBaseHit);

  const fileRetrieval =
    options.userId && options.conversationId && options.conversationId.trim()
      ? await buildConversationFileRetrieval(options.userId, options.conversationId, retrievalQuery)
      : { context: "", hits: [] as RetrievalSourceHit[] };

  const knowledgeSegments = [wikiContext, kbContext].filter(Boolean);
  let combinedKnowledgeContext = knowledgeSegments.join("\n\n");

  if (combinedKnowledgeContext.length > MAX_TOTAL_KNOWLEDGE_CHARS) {
    combinedKnowledgeContext = trimForContext(combinedKnowledgeContext, MAX_TOTAL_KNOWLEDGE_CHARS);
  }

  const sourceHits = [
    ...[
      ...wikiSearchResults.filter((item) => selectedWikiPages.some((page) => page.id === item.page.id)),
      ...valueWikiSearchResults,
    ]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.page.id === item.page.id) === index)
      .map((item) => toWikiSourceHit(item.page, item.score)),
    ...kbHits.map((hit) => ({
      id: hit.id,
      type: "knowledge_base" as const,
      title: hit.title,
      category: hit.category,
    })),
    ...fileRetrieval.hits,
  ];

  return {
    knowledgeContext: combinedKnowledgeContext,
    wikiContext,
    kbContext,
    fileContext: fileRetrieval.context,
    sourceHits,
    kbHits,
    usedWiki: selectedWikiPages.length > 0 || valueWikiPages.length > 0,
  };
}
