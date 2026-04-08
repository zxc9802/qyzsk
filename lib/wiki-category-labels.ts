import type { WikiCategory } from "@/lib/wiki-types";

export const WIKI_CATEGORY_LABELS: Record<WikiCategory, string> = {
  concepts: "方法论",
  entities: "实体",
  roles: "岗位",
  faq: "问答",
  synthesis: "综合分析",
};

export function getWikiCategoryLabel(category: string) {
  return WIKI_CATEGORY_LABELS[category as WikiCategory] || category;
}
