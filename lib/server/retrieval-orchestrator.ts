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

const MAX_TOTAL_KNOWLEDGE_CHARS = 12000;
const MAX_WIKI_CONTEXT_CHARS = 7600;
const MAX_WIKI_PAGES = 4;
const MAX_KB_BACKFILL_ENTRIES = 3;
const WIKI_SCORE_THRESHOLD = 16;
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
  const wikiSearchResults = shouldUseWiki
    ? await searchWikiPages({
        query: retrievalQuery,
        role: options.role,
        diagnosis: options.diagnosis,
        topK: 6,
      })
    : [];
  const selectedWikiPages = selectWikiPages(wikiSearchResults);
  const wikiContext = selectedWikiPages.length > 0 ? buildWikiContext(selectedWikiPages) : "";

  const kbEntries =
    shouldUseWiki && selectedWikiPages.length > 0
      ? backfillKnowledgeBaseEntries(retrievalQuery, options.role, selectedWikiPages)
      : selectKnowledgeBaseEntriesByQuery(retrievalQuery, options.role);
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
    ...wikiSearchResults
      .filter((item) => selectedWikiPages.some((page) => page.id === item.page.id))
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
    usedWiki: selectedWikiPages.length > 0,
  };
}
