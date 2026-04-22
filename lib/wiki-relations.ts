import { WIKI_RELATION_TYPES } from "@/lib/wiki-types";
import type { WikiRelation, WikiRelationType } from "@/lib/wiki-types";

export function isWikiRelationType(value: unknown): value is WikiRelationType {
  return typeof value === "string" && WIKI_RELATION_TYPES.includes(value as WikiRelationType);
}

export function normalizeWikiRelation(value: unknown): WikiRelation | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<WikiRelation>;
  const targetId = typeof candidate.targetId === "string" ? candidate.targetId.trim() : "";
  const type = candidate.type;
  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";

  if (!targetId || !isWikiRelationType(type)) {
    return null;
  }

  return {
    targetId,
    type,
    ...(note ? { note } : {}),
  };
}

export function normalizeWikiRelations(value: unknown): WikiRelation[] {
  if (!Array.isArray(value)) return [];

  const deduped = new Map<string, WikiRelation>();

  value
    .map((item) => normalizeWikiRelation(item))
    .filter((item): item is WikiRelation => Boolean(item))
    .forEach((relation) => {
      const key = `${relation.targetId}::${relation.type}`;
      if (!deduped.has(key)) {
        deduped.set(key, relation);
      }
    });

  return Array.from(deduped.values());
}

export function buildSeeAlsoRelations(targetIds: string[]): WikiRelation[] {
  return targetIds
    .map((targetId) => targetId.trim())
    .filter(Boolean)
    .map((targetId) => ({
      targetId,
      type: "see_also" as const,
    }));
}

export function deriveRelatedPageIds(relations: WikiRelation[], fallbackTargetIds: string[] = []) {
  const relationTargets = relations.map((relation) => relation.targetId).filter(Boolean);
  return Array.from(new Set([...relationTargets, ...fallbackTargetIds.map((item) => item.trim()).filter(Boolean)]));
}

export function parseWikiRelationsText(value: string): WikiRelation[] {
  const lines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return normalizeWikiRelations(
    lines.map((line) => {
      const [targetId = "", rawType = "", ...noteParts] = line.split("|").map((part) => part.trim());
      return {
        targetId,
        type: isWikiRelationType(rawType) ? rawType : "see_also",
        note: noteParts.join(" | ").trim() || undefined,
      };
    })
  );
}

export function formatWikiRelationsText(relations: WikiRelation[]) {
  return relations
    .map((relation) =>
      [relation.targetId, relation.type, relation.note || ""]
        .map((part) => part.trim())
        .filter((part, index) => index < 2 || Boolean(part))
        .join(" | ")
    )
    .join("\n");
}

export function getWikiRelationTypeLabel(type: WikiRelationType) {
  switch (type) {
    case "depends_on":
      return "依赖";
    case "prerequisite":
      return "前置";
    case "explains":
      return "原理解释";
    case "applies_to":
      return "场景应用";
    case "reinforces":
      return "执行保障";
    case "example_of":
      return "案例示例";
    case "contradicts":
      return "可能冲突";
    case "see_also":
    default:
      return "相关延伸";
  }
}
