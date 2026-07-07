import { promises as fs } from "fs";
import path from "path";
import {
  buildSeeAlsoRelations,
  deriveRelatedPageIds,
  normalizeWikiRelations,
} from "@/lib/wiki-relations";
import type {
  WikiCategory,
  WikiDraft,
  WikiPage,
  WikiPageSearchDocument,
  WikiSourceRecord,
  WikiSourceStatus,
  WikiStats,
  WikiSubmitter,
} from "@/lib/wiki-types";

const PUBLISHED_ROOT = path.join(process.cwd(), "wiki");
const WORKSPACE_ROOT = path.join(process.cwd(), ".kb-chat-data", "wiki");
const DRAFTS_ROOT = path.join(WORKSPACE_ROOT, "drafts");
const SOURCES_ROOT = path.join(WORKSPACE_ROOT, "sources");
const CACHE_ROOT = path.join(WORKSPACE_ROOT, "cache");
const INDEX_CACHE_PATH = path.join(CACHE_ROOT, "published-index.json");
const INDEX_META_PATH = path.join(CACHE_ROOT, "published-index.meta.json");
const WIKI_LOG_PATH = path.join(PUBLISHED_ROOT, "_log.md");
const WIKI_SCHEMA_PATH = path.join(PUBLISHED_ROOT, "_schema.md");
const WIKI_INDEX_PATH = path.join(PUBLISHED_ROOT, "_index.md");

const WIKI_CATEGORIES: WikiCategory[] = ["concepts", "entities", "roles", "faq", "synthesis"];
const SEEDED_WIKI_PAGE_IDS = new Set([
  "concepts/AI智能体设计原则",
  "concepts/公司定位与跨境战略",
  "concepts/内容电商方法论",
  "concepts/直播成交协同方法",
  "concepts/短视频内容测试方法",
  "concepts/经营原则与高标准",
  "concepts/超级产品方法论",
  "concepts/运营漏斗诊断",
  "concepts/项目分级与资源聚焦",
  "entities/TikTok店铺运营框架",
  "entities/市场与渠道判断",
  "entities/防晒项目打法",
  "faq/TikTok商品卡与详情页优化",
  "faq/短视频脚本与放大量化",
  "faq/达人合作评估与复盘",
  "faq/防晒用户异议与复购",
  "roles/人才分级与用人原则",
  "roles/岗位职责地图",
  "roles/新员工提问原则",
  "roles/管理与复盘机制",
  "roles/管理和带教执行规范",
  "roles/达人建联SOP",
]);

const DEFAULT_SCHEMA = `# Wiki Schema

## 目录约定

| 目录 | 用途 |
|------|------|
| concepts/ | 公司方法论、原则、判断框架 |
| entities/ | 平台、品类、工具、关键实体 |
| roles/ | 岗位知识、决策树、提问规范 |
| faq/ | 高频问答和标准说法 |
| synthesis/ | 审核通过的综合分析页 |

## 内容规范

- 每个页面必须有 title、summary、sourceIds、relatedPages。
- relations 用来说明页面之间“为什么相关”，正式页面优先维护 typed relations。
- 优先写“结论 + 判断依据 + 下一步动作”，避免泛泛概述。
- 新页面应尽量引用已有页面，而不是重复同一段知识。
- 正式 Wiki 只发布审核通过的页面。
`;

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120) || "default";
}

function sanitizePageSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\-+|\-+$/g, "");

  return normalized || `untitled-${Date.now().toString(36)}`;
}

function draftPath(draftId: string) {
  return path.join(DRAFTS_ROOT, `${sanitizeId(draftId)}.json`);
}

function sourcePath(sourceId: string) {
  return path.join(SOURCES_ROOT, `${sanitizeId(sourceId)}.json`);
}

function normalizeLookupValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeSubmitter(value: unknown): WikiSubmitter | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as WikiSubmitter;
  const userId = typeof candidate.userId === "string" ? candidate.userId.trim() : "";
  if (!userId) return undefined;

  const submitter: WikiSubmitter = { userId };
  const account = typeof candidate.account === "string" ? candidate.account.trim() : "";
  const nickname = typeof candidate.nickname === "string" ? candidate.nickname.trim() : "";
  const role = typeof candidate.role === "string" ? candidate.role.trim() : "";
  const groupName = typeof candidate.groupName === "string" ? candidate.groupName.trim() : "";

  if (account) submitter.account = account;
  if (nickname) submitter.nickname = nickname;
  if (role) submitter.role = role;
  if (groupName) submitter.groupName = groupName;

  return submitter;
}

function normalizeWikiSourceRecord(record: WikiSourceRecord): WikiSourceRecord {
  return {
    ...record,
    submittedBy: normalizeSubmitter(record.submittedBy),
  };
}

function normalizePageId(pageId: string) {
  return pageId.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function normalizeWikiDraftRecord(draft: WikiDraft): WikiDraft {
  const relations = normalizeWikiRelations((draft as Partial<WikiDraft>).relations);
  const relatedPages = deriveRelatedPageIds(
    relations.length > 0 ? relations : buildSeeAlsoRelations(draft.relatedPages || []),
    draft.relatedPages || []
  );
  const targetPageId = typeof draft.targetPageId === "string" ? normalizePageId(draft.targetPageId) : "";

  return {
    ...draft,
    submittedBy: normalizeSubmitter(draft.submittedBy),
    ...(targetPageId ? { targetPageId } : {}),
    relatedPages,
    relations: relations.length > 0 ? relations : buildSeeAlsoRelations(relatedPages),
  };
}

function publishedFilePath(pageId: string) {
  const normalized = pageId.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return path.join(PUBLISHED_ROOT, `${normalized}.md`);
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return fallback;
    throw error;
  }
}

function serializeFrontmatter(page: Omit<WikiPage, "content">): string {
  const relatedPages = deriveRelatedPageIds(page.relations, page.relatedPages);
  return [
    "---",
    `id: ${JSON.stringify(page.id)}`,
    `title: ${JSON.stringify(page.title)}`,
    `category: ${JSON.stringify(page.category)}`,
    `summary: ${JSON.stringify(page.summary)}`,
    `roles: ${JSON.stringify(page.roles)}`,
    `source_ids: ${JSON.stringify(page.sourceIds)}`,
    `related_pages: ${JSON.stringify(relatedPages)}`,
    `relations: ${JSON.stringify(page.relations)}`,
    `created_at: ${JSON.stringify(page.createdAt)}`,
    `updated_at: ${JSON.stringify(page.updatedAt)}`,
    `version: ${page.version}`,
    "---",
  ].join("\n");
}

function parseFrontmatterValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("[") || trimmed.startsWith("{") || trimmed.startsWith("\"")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.replace(/^"+|"+$/g, "");
    }
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  return trimmed.replace(/^"+|"+$/g, "");
}

function parseMarkdownPage(raw: string, filePath: string): WikiPageSearchDocument | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatterLines = match[1].split("\n");
  const frontmatter: Record<string, unknown> = {};

  for (const line of frontmatterLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    frontmatter[key] = parseFrontmatterValue(value);
  }

  const category = frontmatter.category;
  if (!isWikiCategory(category)) return null;

  const fallbackRelatedPages = Array.isArray(frontmatter.related_pages)
    ? frontmatter.related_pages.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
  const typedRelations = normalizeWikiRelations(frontmatter.relations);
  const relations = typedRelations.length > 0 ? typedRelations : buildSeeAlsoRelations(fallbackRelatedPages);
  const relatedPages = deriveRelatedPageIds(relations, fallbackRelatedPages);

  return {
    id: String(frontmatter.id || ""),
    title: String(frontmatter.title || ""),
    category,
    summary: String(frontmatter.summary || ""),
    roles: Array.isArray(frontmatter.roles) ? frontmatter.roles.map(String) : [],
    sourceIds: Array.isArray(frontmatter.source_ids) ? frontmatter.source_ids.map(String) : [],
    relatedPages,
    relations,
    createdAt: String(frontmatter.created_at || ""),
    updatedAt: String(frontmatter.updated_at || ""),
    version: typeof frontmatter.version === "number" ? frontmatter.version : 1,
    content: match[2].trim(),
    filePath,
  };
}

function buildMarkdownPage(page: WikiPage): string {
  return `${serializeFrontmatter(page)}\n\n${page.content.trim()}\n`;
}

function normalizePublishedSearchDocument(
  page: Omit<WikiPageSearchDocument, "relations" | "relatedPages"> &
    Partial<Pick<WikiPageSearchDocument, "relations" | "relatedPages">>
): WikiPageSearchDocument {
  const relations = normalizeWikiRelations(page.relations);
  const relatedPages = deriveRelatedPageIds(
    relations.length > 0 ? relations : buildSeeAlsoRelations(page.relatedPages || []),
    page.relatedPages || []
  );

  return {
    ...page,
    relations: relations.length > 0 ? relations : buildSeeAlsoRelations(relatedPages),
    relatedPages,
  };
}

function buildIndexMarkdown(pages: WikiPage[]): string {
  const grouped = new Map<WikiCategory, WikiPage[]>();
  WIKI_CATEGORIES.forEach((category) => grouped.set(category, []));
  pages.forEach((page) => {
    grouped.get(page.category)?.push(page);
  });

  const header = `# Wiki 索引\n\n> 最后更新：${todayString()} | 总页面数：${pages.length}\n`;
  const sections = WIKI_CATEGORIES.map((category) => {
    const label =
      category === "concepts"
        ? "概念与方法论"
        : category === "entities"
          ? "实体"
          : category === "roles"
            ? "岗位知识"
            : category === "faq"
              ? "高频问答"
              : "综合分析";
    const rows = grouped.get(category) || [];
    const body =
      rows.length > 0
        ? rows
            .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"))
            .map(
              (page) =>
                `| ${page.id}.md | ${page.title} | ${page.summary || "—"} | ${
                  page.roles.length > 0 ? page.roles.join("、") : "—"
                } | ${page.sourceIds.length > 0 ? page.sourceIds.join(", ") : "—"} |`
            )
            .join("\n")
        : "| （暂无页面） |  |  |  |  |";

    return `## ${label} (${category}/)\n\n| 文件 | 标题 | 一句话摘要 | 关联岗位 | 来源 |\n|------|------|-----------|---------|------|\n${body}`;
  });

  return `${header}\n${sections.join("\n\n")}\n`;
}

async function walkMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const nextPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return walkMarkdownFiles(nextPath);
        }

        if (
          entry.isFile() &&
          entry.name.endsWith(".md") &&
          !entry.name.startsWith("_")
        ) {
          return [nextPath];
        }

        return [];
      })
    );

    return nested.flat();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return [];
    throw error;
  }
}

async function readPublishedPagesUncached(): Promise<WikiPageSearchDocument[]> {
  const files = await walkMarkdownFiles(PUBLISHED_ROOT);
  const pages = await Promise.all(
    files.map(async (filePath) => {
      const raw = await fs.readFile(filePath, "utf8");
      return parseMarkdownPage(raw, filePath);
    })
  );

  return pages.filter((page): page is WikiPageSearchDocument => Boolean(page));
}

async function computePublishedFingerprint() {
  const files = await walkMarkdownFiles(PUBLISHED_ROOT);
  const stats = await Promise.all(
    files.map(async (filePath) => {
      const stat = await fs.stat(filePath);
      return `${path.relative(PUBLISHED_ROOT, filePath)}:${stat.mtimeMs}`;
    })
  );

  return stats.sort().join("|");
}

async function ensureSchemaFile() {
  try {
    await fs.access(WIKI_SCHEMA_PATH);
  } catch {
    await ensureDir(PUBLISHED_ROOT);
    await fs.writeFile(WIKI_SCHEMA_PATH, DEFAULT_SCHEMA, "utf8");
  }
}

async function syncPublishedWikiPageToRagIfAvailable(page: WikiPage) {
  const modulePath = ["@/lib/server", "rag-indexer"].join("/");

  try {
    const ragModule = await import(modulePath);
    await ragModule.syncPublishedWikiPageToRag(page);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes(modulePath) || error.message.includes("rag-indexer"))
    ) {
      return;
    }

    throw error;
  }
}

export function generateWikiId(category: WikiCategory, title: string) {
  return `${category}/${sanitizePageSegment(title)}`;
}

export function isWikiCategory(value: unknown): value is WikiCategory {
  return typeof value === "string" && WIKI_CATEGORIES.includes(value as WikiCategory);
}

export async function ensureWikiWorkspace() {
  await Promise.all([
    ensureDir(PUBLISHED_ROOT),
    ensureDir(DRAFTS_ROOT),
    ensureDir(SOURCES_ROOT),
    ensureDir(CACHE_ROOT),
  ]);
  await ensureSchemaFile();
}

export async function listPublishedPages(): Promise<WikiPageSearchDocument[]> {
  await ensureWikiWorkspace();
  const fingerprint = await computePublishedFingerprint();
  const cachedMeta = await readJson<{ fingerprint: string } | null>(INDEX_META_PATH, null);

  if (cachedMeta?.fingerprint === fingerprint) {
    const cachedPages = await readJson<WikiPageSearchDocument[] | null>(INDEX_CACHE_PATH, null);
    if (cachedPages) {
      const normalizedCachedPages = cachedPages.map((page) => normalizePublishedSearchDocument(page));
      await writeJson(INDEX_CACHE_PATH, normalizedCachedPages);
      return normalizedCachedPages;
    }
  }

  const pages = await readPublishedPagesUncached();
  await writeJson(
    INDEX_CACHE_PATH,
    pages.map((page) => normalizePublishedSearchDocument(page))
  );
  await writeJson(INDEX_META_PATH, { fingerprint });
  return pages.map((page) => normalizePublishedSearchDocument(page));
}

export async function listPublishedWikiIds(): Promise<string[]> {
  const pages = await listPublishedPages();
  return pages.map((page) => page.id);
}

export async function listAdminVisiblePublishedPages(): Promise<WikiPageSearchDocument[]> {
  const pages = await listPublishedPages();
  return pages.filter((page) => !SEEDED_WIKI_PAGE_IDS.has(page.id));
}

export async function readPublishedPage(pageId: string): Promise<WikiPageSearchDocument | null> {
  await ensureWikiWorkspace();
  const filePath = publishedFilePath(pageId);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return parseMarkdownPage(raw, filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return null;
    throw error;
  }
}

export async function updatePublishedPage(
  pageId: string,
  updater: (current: WikiPageSearchDocument) => WikiPage
): Promise<WikiPageSearchDocument> {
  const current = await readPublishedPage(pageId);
  if (!current) {
    throw new Error("Wiki 页面不存在。");
  }

  const next = updater({
    ...current,
    updatedAt: nowIso(),
  });

  const normalizedPage: WikiPage = {
    ...next,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: nowIso(),
    version: Math.max(current.version + 1, next.version || current.version + 1),
  };

  await writePublishedPage(normalizedPage);
  const refreshed = await readPublishedPage(current.id);

  if (!refreshed) {
    throw new Error("Wiki 页面更新后无法重新读取。");
  }

  return refreshed;
}

export async function writePublishedPage(page: WikiPage) {
  await ensureWikiWorkspace();
  const filePath = publishedFilePath(page.id);
  await ensureDir(path.dirname(filePath));
  const normalizedPage: WikiPage = {
    ...page,
    relations: normalizeWikiRelations(page.relations),
    relatedPages: deriveRelatedPageIds(normalizeWikiRelations(page.relations), page.relatedPages),
  };
  await fs.writeFile(filePath, buildMarkdownPage(normalizedPage), "utf8");
  await appendWikiLog(`publish | ${page.id}\n- 标题：${page.title}\n- 版本：${page.version}`);
  const pages = await listPublishedPages();
  const mergedPages = pages
    .filter((item) => item.id !== page.id)
    .concat(
      normalizePublishedSearchDocument({
        ...normalizedPage,
        filePath,
      })
    );
  await writeJson(INDEX_CACHE_PATH, mergedPages);
  await writeJson(INDEX_META_PATH, { fingerprint: await computePublishedFingerprint() });
  await fs.writeFile(WIKI_INDEX_PATH, buildIndexMarkdown(mergedPages), "utf8");
  await syncPublishedWikiPageToRagIfAvailable(page).catch((error) => {
    console.error("Published wiki page RAG sync failed:", page.id, error);
  });
}

export async function appendWikiLog(entry: string) {
  await ensureWikiWorkspace();
  const heading = `## [${todayString()}] ${entry.trim()}\n`;

  try {
    await fs.appendFile(WIKI_LOG_PATH, `\n${heading}`, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
    await fs.writeFile(WIKI_LOG_PATH, `# Wiki 操作日志\n\n${heading}`, "utf8");
  }
}

export async function createWikiSourceRecord(input: {
  title: string;
  content: string;
  submittedBy?: WikiSubmitter;
}): Promise<WikiSourceRecord> {
  await ensureWikiWorkspace();
  const source: WikiSourceRecord = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim() || "未命名资料",
    content: input.content.trim(),
    status: "drafted",
    draftIds: [],
    submittedBy: normalizeSubmitter(input.submittedBy),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await writeJson(sourcePath(source.id), source);
  return source;
}

export async function readWikiSourceRecord(sourceId: string): Promise<WikiSourceRecord | null> {
  const source = await readJson<WikiSourceRecord | null>(sourcePath(sourceId), null);
  return source ? normalizeWikiSourceRecord(source) : null;
}

export async function findWikiSourceRecordByTitle(title: string): Promise<WikiSourceRecord | null> {
  const normalizedTitle = normalizeLookupValue(title);
  const sources = await listWikiSourceRecords();
  return sources.find((source) => normalizeLookupValue(source.title) === normalizedTitle) || null;
}

export async function listWikiSourceRecords(): Promise<WikiSourceRecord[]> {
  await ensureWikiWorkspace();
  try {
    const entries = await fs.readdir(SOURCES_ROOT);
    const records = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => readJson<WikiSourceRecord | null>(path.join(SOURCES_ROOT, entry), null))
    );

    return records
      .filter((item): item is WikiSourceRecord => Boolean(item))
      .map(normalizeWikiSourceRecord)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return [];
    throw error;
  }
}

export async function updateWikiSourceRecord(
  sourceId: string,
  updater: (current: WikiSourceRecord) => WikiSourceRecord
): Promise<WikiSourceRecord> {
  const current = await readWikiSourceRecord(sourceId);
  if (!current) {
    throw new Error("Wiki source not found");
  }

  const next = updater({
    ...current,
    updatedAt: nowIso(),
  });
  await writeJson(sourcePath(sourceId), next);
  return next;
}

export async function upsertWikiSourceRecordByTitle(input: {
  title: string;
  content: string;
  status?: WikiSourceStatus;
}) {
  const normalizedTitle = input.title.trim() || "未命名资料";
  const normalizedContent = input.content.trim();
  const nextStatus = input.status || "drafted";
  const existing = await findWikiSourceRecordByTitle(normalizedTitle);

  if (!existing) {
    const created = await createWikiSourceRecord({
      title: normalizedTitle,
      content: normalizedContent,
    });

    if (created.status === nextStatus) {
      return created;
    }

    return updateWikiSourceRecord(created.id, (current) => ({
      ...current,
      status: nextStatus,
    }));
  }

  return updateWikiSourceRecord(existing.id, (current) => ({
    ...current,
    title: normalizedTitle,
    content: normalizedContent,
    status: nextStatus,
  }));
}

export async function createWikiDraft(input: Omit<WikiDraft, "id" | "createdAt" | "updatedAt">) {
  await ensureWikiWorkspace();
  const relations = normalizeWikiRelations(input.relations);
  const draft: WikiDraft = normalizeWikiDraftRecord({
    ...input,
    submittedBy: normalizeSubmitter(input.submittedBy),
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    relations,
    relatedPages: deriveRelatedPageIds(relations, input.relatedPages),
  } as WikiDraft);
  await writeJson(draftPath(draft.id), draft);
  await updateWikiSourceRecord(draft.sourceId, (current) => ({
    ...current,
    draftIds: Array.from(new Set([...current.draftIds, draft.id])),
  }));
  return draft;
}

export async function readWikiDraft(draftId: string): Promise<WikiDraft | null> {
  const draft = await readJson<WikiDraft | null>(draftPath(draftId), null);
  return draft ? normalizeWikiDraftRecord(draft) : null;
}

function resolveDraftPageIds(draft: Pick<WikiDraft, "category" | "title" | "proposedSlug" | "targetPageId">) {
  const ids = new Set<string>();
  ids.add(normalizePageId(generateWikiId(draft.category, draft.title)));

  if (draft.proposedSlug.trim()) {
    ids.add(normalizePageId(`${draft.category}/${draft.proposedSlug}`));
  }

  const targetPageId = "targetPageId" in draft && typeof draft.targetPageId === "string"
    ? draft.targetPageId.trim()
    : "";
  if (targetPageId) {
    ids.add(normalizePageId(targetPageId));
  }

  return ids;
}

export async function listWikiDrafts(): Promise<WikiDraft[]> {
  await ensureWikiWorkspace();
  try {
    const entries = await fs.readdir(DRAFTS_ROOT);
    const drafts = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => readJson<WikiDraft | null>(path.join(DRAFTS_ROOT, entry), null))
    );

    return drafts
      .filter((item): item is WikiDraft => Boolean(item))
      .map(normalizeWikiDraftRecord)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return [];
    throw error;
  }
}

export async function findWikiDraftByPageId(pageId: string): Promise<WikiDraft | null> {
  const normalizedPageId = normalizePageId(pageId);
  const drafts = await listWikiDrafts();
  return drafts.find((draft) => resolveDraftPageIds(draft).has(normalizedPageId)) || null;
}

export async function listWikiDraftsBySubmitter(userId: string): Promise<WikiDraft[]> {
  const drafts = await listWikiDrafts();
  return drafts.filter((draft) => draft.submittedBy?.userId === userId);
}

export async function listWikiSourceRecordsBySubmitter(userId: string): Promise<WikiSourceRecord[]> {
  const sources = await listWikiSourceRecords();
  return sources.filter((source) => source.submittedBy?.userId === userId);
}

export async function updateWikiDraft(
  draftId: string,
  updater: (current: WikiDraft) => WikiDraft
): Promise<WikiDraft> {
  const current = await readWikiDraft(draftId);
  if (!current) {
    throw new Error("Wiki draft not found");
  }

  const next = updater({
    ...current,
    updatedAt: nowIso(),
  });
  const normalizedNext = normalizeWikiDraftRecord(next);
  await writeJson(draftPath(draftId), normalizedNext);
  return normalizedNext;
}

export async function upsertWikiDraftByPageId(
  pageId: string,
  input: Omit<WikiDraft, "id" | "createdAt" | "updatedAt" | "proposedSlug">
) {
  const normalizedPageId = normalizePageId(pageId);
  const proposedSlug = normalizedPageId.split("/").slice(1).join("/");
  const existing = await findWikiDraftByPageId(normalizedPageId);

  if (!existing) {
    return createWikiDraft({
      ...input,
      targetPageId: input.targetPageId || normalizedPageId,
      proposedSlug,
    });
  }

  return updateWikiDraft(existing.id, (current) => ({
    ...current,
    ...input,
    targetPageId: input.targetPageId || normalizedPageId,
    proposedSlug,
    status: input.status,
  }));
}

export async function getWikiStats(): Promise<WikiStats> {
  const [publishedPages, drafts, sources] = await Promise.all([
    listPublishedPages(),
    listWikiDrafts(),
    listWikiSourceRecords(),
  ]);

  return {
    publishedPages: publishedPages.length,
    draftCount: drafts.filter((draft) => draft.status === "draft").length,
    rawSourceCount: sources.length,
    lastPublishedAt:
      publishedPages.length > 0
        ? publishedPages
            .map((page) => page.updatedAt)
            .sort((left, right) => right.localeCompare(left))[0]
        : null,
  };
}

export async function getWikiAdminStats(): Promise<WikiStats> {
  const [publishedPages, drafts, sources] = await Promise.all([
    listAdminVisiblePublishedPages(),
    listWikiDrafts(),
    listWikiSourceRecords(),
  ]);

  return {
    publishedPages: publishedPages.length,
    draftCount: drafts.filter((draft) => draft.status === "draft").length,
    rawSourceCount: sources.length,
    lastPublishedAt:
      publishedPages.length > 0
        ? publishedPages
            .map((page) => page.updatedAt)
            .sort((left, right) => right.localeCompare(left))[0]
        : null,
  };
}
