import { DEFAULT_CHAT_MODEL_ID } from "@/lib/chat-models";
import { generateModelText } from "@/lib/server/model-text";
import type { WikiCategory, WikiDraft } from "@/lib/wiki-types";
import {
  createWikiDraft,
  createWikiSourceRecord,
  generateWikiId,
  listPublishedPages,
} from "@/lib/server/wiki-store";

type DraftModelPayload = {
  title?: string;
  category?: WikiCategory;
  summary?: string;
  roles?: string[];
  sourceIds?: string[];
  relatedPages?: string[];
  content?: string;
};

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

function buildFallbackDraft(title: string, content: string): DraftModelPayload {
  const summary = content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const category = heuristicCategory(title, content);
  return {
    title: title.trim() || "未命名 Wiki 草稿",
    category,
    summary: summary || "待补充摘要",
    roles: ["全员"],
    relatedPages: [],
    sourceIds: [],
    content: `# ${title.trim() || "未命名 Wiki 草稿"}\n\n## 核心信息\n\n${content.trim()}`,
  };
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```json\n([\s\S]*?)```/);
  if (fenced) return fenced[1];

  const objectMatch = text.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0] : null;
}

function parseDraftPayload(raw: string): DraftModelPayload | null {
  const jsonText = extractJson(raw);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as DraftModelPayload;
    return parsed;
  } catch {
    return null;
  }
}

async function generateDraftPayload(options: {
  sourceTitle: string;
  sourceContent: string;
  modelId?: string;
}): Promise<DraftModelPayload> {
  const publishedPages = await listPublishedPages();
  const pageSummary = publishedPages
    .slice(0, 24)
    .map((page) => `- ${page.id}｜${page.title}｜${page.summary}`)
    .join("\n");

  const prompt = [
    "你是公司的 Wiki 草稿生成器。",
    "请基于输入资料生成 1 个待审核的 Wiki 页面草稿。",
    "",
    "要求：",
    "1. 输出 JSON，不要输出额外说明。",
    "2. category 只能是 concepts/entities/roles/faq/synthesis 之一。",
    "3. summary 控制在 40 到 80 个汉字。",
    "4. roles 尽量具体，没有把握时写 [\"全员\"]。",
    "5. relatedPages 只引用下方已存在的页面 id，不要编造不存在的页面。",
    "6. content 用 Markdown，结构优先写“先说结论 / 判断依据 / 下一步动作”。",
    "",
    "当前已存在页面：",
    pageSummary || "- 当前还没有已发布页面",
    "",
    `资料标题：${options.sourceTitle}`,
    "",
    "资料内容：",
    trimForModel(options.sourceContent, 12000),
    "",
    "请严格输出这个 JSON：",
    `{
  "title": "",
  "category": "concepts",
  "summary": "",
  "roles": ["全员"],
  "sourceIds": [],
  "relatedPages": [],
  "content": "# 标题\\n\\n## 先说结论\\n..."
}`,
  ].join("\n");

  try {
    const raw = await generateModelText({
      modelId: options.modelId || DEFAULT_CHAT_MODEL_ID,
      systemPrompt: "你只输出合法 JSON，不要输出 Markdown 解释。",
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 2200,
    });

    return parseDraftPayload(raw) || buildFallbackDraft(options.sourceTitle, options.sourceContent);
  } catch (error) {
    console.error("Wiki draft generation fallback:", error);
    return buildFallbackDraft(options.sourceTitle, options.sourceContent);
  }
}

export async function ingestWikiSource(options: {
  title: string;
  content: string;
  modelId?: string;
}) {
  const source = await createWikiSourceRecord({
    title: options.title,
    content: options.content,
  });

  const payload = await generateDraftPayload({
    sourceTitle: source.title,
    sourceContent: source.content,
    modelId: options.modelId,
  });

  const resolvedTitle = payload.title?.trim() || source.title;
  const resolvedCategory = payload.category || heuristicCategory(source.title, source.content);
  const draft = await createWikiDraft({
    sourceId: source.id,
    title: resolvedTitle,
    category: resolvedCategory,
    summary: payload.summary?.trim() || "待补充摘要",
    roles: payload.roles?.filter(Boolean) || ["全员"],
    sourceIds: payload.sourceIds?.filter(Boolean) || [],
    relatedPages: payload.relatedPages?.filter(Boolean) || [],
    content: payload.content?.trim() || buildFallbackDraft(source.title, source.content).content || "",
    proposedSlug: generateWikiId(resolvedCategory, resolvedTitle).split("/").slice(1).join("/"),
    status: "draft",
    notes: "",
  });

  return {
    source,
    draft,
  };
}

export function buildApprovedPageFromDraft(draft: WikiDraft) {
  const pageId = generateWikiId(draft.category, draft.title);
  const today = new Date().toISOString().slice(0, 10);

  return {
    id: pageId,
    title: draft.title,
    category: draft.category,
    summary: draft.summary,
    roles: draft.roles,
    sourceIds: draft.sourceIds.length > 0 ? draft.sourceIds : [draft.sourceId],
    relatedPages: draft.relatedPages,
    content: draft.content,
    createdAt: today,
    updatedAt: today,
    version: 1,
  };
}
