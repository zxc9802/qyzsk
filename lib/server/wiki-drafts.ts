import { DEFAULT_WIKI_DRAFT_MODEL_ID } from "@/lib/chat-models";
import { buildSeeAlsoRelations, deriveRelatedPageIds, normalizeWikiRelations } from "@/lib/wiki-relations";
import { generateModelText } from "@/lib/server/model-text";
import type {
  WikiCategory,
  WikiDraft,
  WikiPageSearchDocument,
  WikiRelation,
  WikiSubmitter,
} from "@/lib/wiki-types";
import {
  createWikiDraft,
  createWikiSourceRecord,
  generateWikiId,
  listPublishedPages,
  readWikiSourceRecord,
} from "@/lib/server/wiki-store";

type DraftModelPayload = {
  targetPageId?: string;
  title?: string;
  category?: WikiCategory;
  summary?: string;
  roles?: string[];
  sourceIds?: string[];
  relatedPages?: string[];
  relations?: WikiRelation[];
  content?: string;
};

type DraftBatchModelPayload = {
  drafts?: DraftModelPayload[];
};

const DEFAULT_WIKI_DRAFT_TIMEOUT_MS = 12000;
const MAX_PAGE_SUMMARY_COUNT = 24;
const MAX_IMPACTED_PAGE_CONTEXT_COUNT = 4;

function getWikiDraftTimeoutMs() {
  const rawValue = Number(process.env.WIKI_DRAFT_TIMEOUT_MS || DEFAULT_WIKI_DRAFT_TIMEOUT_MS);
  if (!Number.isFinite(rawValue)) return DEFAULT_WIKI_DRAFT_TIMEOUT_MS;
  return Math.max(3000, Math.floor(rawValue));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function heuristicCategory(title: string, content: string): WikiCategory {
  const combined = `${title}\n${content}`.toLowerCase();
  if (/faq|常见|问答|新人/.test(combined)) return "faq";
  if (/岗位|角色|决策树|带教/.test(combined)) return "roles";
  if (/tiktok|shop|shopee|amazon|品类|平台|供应链|产品/.test(combined)) return "entities";
  if (/方法|框架|原则|漏斗|优先级|策略|判断/.test(combined)) return "concepts";
  return "synthesis";
}

function trimForModel(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function isDraftBatchModelPayload(value: unknown): value is { drafts: DraftModelPayload[] } {
  return typeof value === "object" && value !== null && Array.isArray((value as DraftBatchModelPayload).drafts);
}

function buildFallbackSummary(content: string) {
  return content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "待补充摘要";
}

function buildFallbackDraft(title: string, content: string): DraftModelPayload {
  const resolvedTitle = title.trim() || "未命名 Wiki 草稿";
  return {
    title: resolvedTitle,
    category: heuristicCategory(title, content),
    summary: buildFallbackSummary(content),
    roles: ["全员"],
    relatedPages: [],
    relations: [],
    sourceIds: [],
    content: `# ${resolvedTitle}\n\n## 核心信息\n\n${content.trim()}`,
  };
}

function buildFallbackDrafts(title: string, content: string) {
  return [buildFallbackDraft(title, content)];
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```json\n([\s\S]*?)```/);
  if (fenced) return fenced[1];

  const objectMatch = text.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0] : null;
}

function normalizePageId(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function buildSourceTerms(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^\p{L}\p{N}\u4e00-\u9fff]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
    )
  );
}

function scoreImpactedPage(page: WikiPageSearchDocument, sourceTerms: string[]) {
  const title = page.title.toLowerCase();
  const summary = page.summary.toLowerCase();
  const content = page.content.toLowerCase();

  let score = 0;
  for (const term of sourceTerms) {
    if (title.includes(term)) score += 12;
    if (summary.includes(term)) score += 8;
    if (content.includes(term)) score += term.length >= 4 ? 5 : 2;
  }

  return score;
}

function findImpactedPublishedPages(options: {
  sourceTitle: string;
  sourceContent: string;
  publishedPages: WikiPageSearchDocument[];
}) {
  const sourceTerms = buildSourceTerms(`${options.sourceTitle}\n${trimForModel(options.sourceContent, 1800)}`);

  return options.publishedPages
    .map((page) => ({
      page,
      score: scoreImpactedPage(page, sourceTerms),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_IMPACTED_PAGE_CONTEXT_COUNT)
    .map((item) => item.page);
}

function parseDraftPayloads(raw: string): DraftModelPayload[] | null {
  const jsonText = extractJson(raw);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as DraftBatchModelPayload | DraftModelPayload[] | DraftModelPayload;
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (isDraftBatchModelPayload(parsed)) {
      return parsed.drafts;
    }

    if (parsed && typeof parsed === "object") {
      return [parsed as DraftModelPayload];
    }

    return null;
  } catch {
    return null;
  }
}

function inferCategoryFromPageId(pageId?: string | null): WikiCategory | null {
  const prefix = pageId?.split("/")[0];
  if (
    prefix === "concepts" ||
    prefix === "entities" ||
    prefix === "roles" ||
    prefix === "faq" ||
    prefix === "synthesis"
  ) {
    return prefix;
  }

  return null;
}

function normalizeGeneratedDraftPayloads(options: {
  sourceTitle: string;
  sourceContent: string;
  publishedPages: WikiPageSearchDocument[];
  payloads: DraftModelPayload[];
}) {
  const fallbackDraft = buildFallbackDraft(options.sourceTitle, options.sourceContent);
  const publishedPageMap = new Map(options.publishedPages.map((page) => [page.id, page]));
  const publishedPageIds = new Set(options.publishedPages.map((page) => page.id));
  const dedupedDrafts = new Map<string, DraftModelPayload>();

  for (const payload of options.payloads) {
    const rawTargetPageId = typeof payload.targetPageId === "string" ? normalizePageId(payload.targetPageId) : "";
    const targetPageId = rawTargetPageId && publishedPageIds.has(rawTargetPageId) ? rawTargetPageId : undefined;
    const existingPage = targetPageId ? publishedPageMap.get(targetPageId) : null;

    const relations = normalizeWikiRelations(payload.relations).filter((relation) => publishedPageIds.has(relation.targetId));
    const relatedPages = deriveRelatedPageIds(
      relations,
      Array.isArray(payload.relatedPages) ? payload.relatedPages.filter((item) => publishedPageIds.has(item)) : []
    );

    const resolvedTitle = payload.title?.trim() || existingPage?.title || fallbackDraft.title || options.sourceTitle;
    const resolvedContent =
      payload.content?.trim() ||
      existingPage?.content ||
      fallbackDraft.content ||
      `# ${resolvedTitle}\n\n## 核心信息\n\n${options.sourceContent.trim()}`;
    const resolvedCategory =
      existingPage?.category ||
      inferCategoryFromPageId(targetPageId) ||
      payload.category ||
      heuristicCategory(resolvedTitle, resolvedContent);
    const resolvedSummary = payload.summary?.trim() || existingPage?.summary || buildFallbackSummary(resolvedContent);
    const resolvedRoles =
      Array.isArray(payload.roles) && payload.roles.filter(Boolean).length > 0
        ? payload.roles.filter(Boolean)
        : existingPage?.roles.length
          ? existingPage.roles
          : ["全员"];
    const resolvedSourceIds =
      Array.isArray(payload.sourceIds) && payload.sourceIds.filter(Boolean).length > 0
        ? payload.sourceIds.filter(Boolean)
        : existingPage?.sourceIds || [];

    const normalizedDraft: DraftModelPayload = {
      ...(targetPageId ? { targetPageId } : {}),
      title: resolvedTitle,
      category: resolvedCategory,
      summary: resolvedSummary,
      roles: resolvedRoles,
      sourceIds: resolvedSourceIds,
      relations,
      relatedPages,
      content: resolvedContent,
    };

    const stableKey = targetPageId || generateWikiId(resolvedCategory, resolvedTitle);
    if (!dedupedDrafts.has(stableKey)) {
      dedupedDrafts.set(stableKey, normalizedDraft);
    }
  }

  return dedupedDrafts.size > 0 ? Array.from(dedupedDrafts.values()) : buildFallbackDrafts(options.sourceTitle, options.sourceContent);
}

async function generateDraftPayloads(options: {
  sourceTitle: string;
  sourceContent: string;
  modelId?: string;
}): Promise<DraftModelPayload[]> {
  const publishedPages = await listPublishedPages();
  const pageSummary = publishedPages
    .slice(0, MAX_PAGE_SUMMARY_COUNT)
    .map((page) => `- ${page.id}｜${page.title}｜${page.summary}`)
    .join("\n");
  const impactedPages = findImpactedPublishedPages({
    sourceTitle: options.sourceTitle,
    sourceContent: options.sourceContent,
    publishedPages,
  });
  const impactedPageDetails = impactedPages
    .map((page) =>
      [
        `### ${page.id}`,
        `标题：${page.title}`,
        `摘要：${page.summary}`,
        "当前正文：",
        trimForModel(page.content, 1400),
      ].join("\n")
    )
    .join("\n\n");

  const prompt = [
    "你是公司的 Wiki 编译器。",
    "请基于输入资料生成 1 到 4 条待审核的 Wiki 草稿提案。",
    "目标不是只产出一篇新页，而是把会受影响的旧页面也顺手更新、串起来。",
    "",
    "要求：",
    "1. 输出 JSON，不要输出额外说明。",
    "2. category 只能是 concepts/entities/roles/faq/synthesis 之一。",
    "3. summary 控制在 40 到 80 个汉字。",
    "4. roles 尽量具体，没有把握时写 [\"全员\"]。",
    "5. relatedPages 和 relations 只引用下方已存在的页面 id，不要编造不存在的页面。",
    "6. 如果这份资料会修正某个已有页面，请在那条提案里填写 targetPageId；新增页面就不要填 targetPageId。",
    "7. 最多 4 条提案，不要对同一页面重复提案。",
    "8. content 用 Markdown，结构优先写“先说结论 / 判断依据 / 下一步动作”。",
    "9. 如果适合拆成“更新旧页 + 新增 FAQ/案例页”，请一起给出。",
    "",
    "当前已存在页面：",
    pageSummary || "- 当前还没有已发布页面",
    "",
    "优先检查这些可能受影响的页面：",
    impactedPageDetails || "- 暂时没有明显命中的旧页面",
    "",
    `资料标题：${options.sourceTitle}`,
    "",
    "资料内容：",
    trimForModel(options.sourceContent, 6000),
    "",
    "请严格输出这个 JSON：",
    `{
  "drafts": [
    {
      "targetPageId": "concepts/existing-page",
      "title": "",
      "category": "concepts",
      "summary": "",
      "roles": ["全员"],
      "sourceIds": [],
      "relatedPages": [],
      "relations": [],
      "content": "# 标题\\n\\n## 先说结论\\n..."
    }
  ]
}`,
  ].join("\n");

  try {
    const raw = await withTimeout(
      generateModelText({
        modelId: options.modelId || DEFAULT_WIKI_DRAFT_MODEL_ID,
        systemPrompt: "你只输出合法 JSON，不要输出 Markdown 解释。",
        userPrompt: prompt,
        temperature: 0.1,
        maxTokens: 2200,
      }),
      getWikiDraftTimeoutMs(),
      "Wiki 草稿生成超时"
    );

    const payloads = parseDraftPayloads(raw);
    if (!payloads || payloads.length === 0) {
      return buildFallbackDrafts(options.sourceTitle, options.sourceContent);
    }

    return normalizeGeneratedDraftPayloads({
      sourceTitle: options.sourceTitle,
      sourceContent: options.sourceContent,
      publishedPages,
      payloads,
    });
  } catch (error) {
    console.error("Wiki draft generation fallback:", error);
    return buildFallbackDrafts(options.sourceTitle, options.sourceContent);
  }
}

export async function ingestWikiSource(options: {
  title: string;
  content: string;
  modelId?: string;
  submittedBy?: WikiSubmitter;
}) {
  const source = await createWikiSourceRecord({
    title: options.title,
    content: options.content,
    submittedBy: options.submittedBy,
  });

  const payloads = await generateDraftPayloads({
    sourceTitle: source.title,
    sourceContent: source.content,
    modelId: options.modelId,
  });

  const drafts: WikiDraft[] = [];
  for (const payload of payloads) {
    const resolvedTitle = payload.title?.trim() || source.title;
    const resolvedCategory =
      inferCategoryFromPageId(payload.targetPageId) ||
      payload.category ||
      heuristicCategory(source.title, source.content);

    const relations = normalizeWikiRelations(payload.relations);
    const draft = await createWikiDraft({
      sourceId: source.id,
      ...(payload.targetPageId ? { targetPageId: normalizePageId(payload.targetPageId) } : {}),
      submittedBy: options.submittedBy,
      title: resolvedTitle,
      category: resolvedCategory,
      summary: payload.summary?.trim() || buildFallbackSummary(payload.content || source.content),
      roles: payload.roles?.filter(Boolean) || ["全员"],
      sourceIds: payload.sourceIds?.filter(Boolean) || [],
      relations,
      relatedPages: deriveRelatedPageIds(relations, payload.relatedPages?.filter(Boolean) || []),
      content: payload.content?.trim() || buildFallbackDraft(source.title, source.content).content || "",
      proposedSlug:
        payload.targetPageId?.trim()
          ? normalizePageId(payload.targetPageId).split("/").slice(1).join("/")
          : generateWikiId(resolvedCategory, resolvedTitle).split("/").slice(1).join("/"),
      status: "draft",
      notes: "",
    });
    drafts.push(draft);
  }

  const refreshedSource = await readWikiSourceRecord(source.id);

  return {
    source: refreshedSource || source,
    drafts,
    draft: drafts[0],
  };
}

export async function approveIngestedWikiSource(result: { drafts: WikiDraft[] }) {
  const { applyWikiDraftAction } = await import("@/lib/server/wiki-review");
  const approvedDrafts: WikiDraft[] = [];

  for (const draft of result.drafts) {
    approvedDrafts.push(await applyWikiDraftAction(draft.id, "approve", {}));
  }

  return approvedDrafts;
}

export function buildApprovedPageFromDraft(draft: WikiDraft) {
  const pageId = draft.targetPageId?.trim() ? normalizePageId(draft.targetPageId) : generateWikiId(draft.category, draft.title);
  const today = new Date().toISOString().slice(0, 10);

  return {
    id: pageId,
    title: draft.title,
    category: inferCategoryFromPageId(pageId) || draft.category,
    summary: draft.summary,
    roles: draft.roles,
    sourceIds: draft.sourceIds.length > 0 ? draft.sourceIds : [draft.sourceId],
    relations: draft.relations.length > 0 ? draft.relations : buildSeeAlsoRelations(draft.relatedPages),
    relatedPages: deriveRelatedPageIds(
      draft.relations.length > 0 ? draft.relations : buildSeeAlsoRelations(draft.relatedPages),
      draft.relatedPages
    ),
    content: draft.content,
    createdAt: today,
    updatedAt: today,
    version: 1,
  };
}
