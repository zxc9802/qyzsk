import type { QuestionDiagnosis } from "@/lib/types";
import type { WikiPageSearchDocument } from "@/lib/wiki-types";
import { listPublishedPages } from "@/lib/server/wiki-store";

export interface WikiSearchResult {
  page: WikiPageSearchDocument;
  score: number;
  excerpt: string;
}

const STOP_TERMS = new Set([
  "什么",
  "怎么",
  "怎么办",
  "为什么",
  "如何",
  "这个",
  "那个",
  "一下",
  "需要",
  "应该",
  "可以",
  "问题",
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildTerms(query: string, diagnosis?: QuestionDiagnosis): string[] {
  const terms = new Set<string>();
  const normalized = normalize(query);

  normalized
    .split(/[^\p{L}\p{N}\u4e00-\u9fff]+/u)
    .filter((item) => item.length >= 2 && !STOP_TERMS.has(item))
    .forEach((item) => terms.add(item));

  const hanParts = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  hanParts.forEach((part) => {
    if (!STOP_TERMS.has(part)) {
      terms.add(part);
    }

    if (part.length >= 4) {
      for (let index = 0; index <= part.length - 3; index += 1) {
        terms.add(part.slice(index, index + 3));
      }
    }
  });

  if (diagnosis) {
    terms.add(diagnosis.categoryLabel);
    diagnosis.scopeOptions?.forEach((option) => terms.add(option));
    diagnosis.missingSlots.forEach((slot) => terms.add(slot));
    if (diagnosis.selectedScope) {
      terms.add(diagnosis.selectedScope);
    }
  }

  return Array.from(terms);
}

function scorePage(page: WikiPageSearchDocument, terms: string[], role: string): number {
  const title = normalize(page.title);
  const summary = normalize(page.summary);
  const content = normalize(page.content);
  const roles = page.roles.map(normalize);
  const related = page.relatedPages.map(normalize);

  let score = 0;

  for (const term of terms) {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) continue;

    if (title.includes(normalizedTerm)) score += 28;
    if (summary.includes(normalizedTerm)) score += 18;
    if (content.includes(normalizedTerm)) score += normalizedTerm.length >= 4 ? 10 : 4;
    if (related.some((item) => item.includes(normalizedTerm))) score += 6;
    if (roles.some((item) => item.includes(normalizedTerm))) score += 8;
  }

  if (page.roles.includes("全员")) {
    score += 2;
  }

  if (page.roles.some((item) => normalize(item).includes(role))) {
    score += 12;
  }

  if (page.category === "faq") score += 2;
  if (page.category === "synthesis") score += 1;

  return score;
}

function buildExcerpt(page: WikiPageSearchDocument, terms: string[]) {
  const content = page.content.replace(/\n+/g, " ").trim();
  for (const term of terms) {
    const index = normalize(content).indexOf(normalize(term));
    if (index >= 0) {
      const start = Math.max(0, index - 36);
      const end = Math.min(content.length, index + 120);
      return `${start > 0 ? "..." : ""}${content.slice(start, end)}${end < content.length ? "..." : ""}`;
    }
  }

  return page.summary || content.slice(0, 140);
}

export async function searchWikiPages(options: {
  query: string;
  role: string;
  diagnosis?: QuestionDiagnosis;
  topK?: number;
}) {
  const pages = await listPublishedPages();
  const terms = buildTerms(options.query, options.diagnosis);
  const normalizedRole = normalize(options.role);

  const ranked = pages
    .map((page) => ({
      page,
      score: scorePage(page, terms, normalizedRole),
      excerpt: buildExcerpt(page, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked.slice(0, options.topK ?? 5) satisfies WikiSearchResult[];
}
