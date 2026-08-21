export type WikiCategory = "concepts" | "entities" | "roles" | "faq" | "synthesis";
export type WikiDraftStatus = "draft" | "approved" | "rejected";
export type WikiSourceStatus = "processing" | "drafted" | "approved" | "rejected" | "failed";
export type WikiRelationType =
  | "prerequisite"
  | "depends_on"
  | "explains"
  | "applies_to"
  | "reinforces"
  | "see_also"
  | "example_of"
  | "contradicts";

export const WIKI_RELATION_TYPES: WikiRelationType[] = [
  "prerequisite",
  "depends_on",
  "explains",
  "applies_to",
  "reinforces",
  "see_also",
  "example_of",
  "contradicts",
];

export interface WikiRelation {
  targetId: string;
  type: WikiRelationType;
  note?: string;
}

export interface WikiSubmitter {
  userId: string;
  account?: string;
  nickname?: string;
  role?: string;
  groupName?: string;
}

export type WikiMediaKind = "document" | "image" | "video";

export interface WikiMediaAsset {
  id: string;
  kind: WikiMediaKind;
  name: string;
  mimeType: string;
  size: number;
  summary?: string;
}

export function normalizeWikiMediaAssets(value: unknown): WikiMediaAsset[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<WikiMediaAsset>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const mimeType = typeof candidate.mimeType === "string" ? candidate.mimeType.trim() : "";
      const kind = candidate.kind;
      const size = typeof candidate.size === "number" && Number.isFinite(candidate.size) ? candidate.size : 0;
      if (!id || !name || (kind !== "document" && kind !== "image" && kind !== "video")) {
        return null;
      }

      const asset: WikiMediaAsset = {
        id,
        kind,
        name,
        mimeType: mimeType || "application/octet-stream",
        size,
      };
      const summary = typeof candidate.summary === "string" ? candidate.summary.trim() : "";
      if (summary) asset.summary = summary;
      return asset;
    })
    .filter((item): item is WikiMediaAsset => Boolean(item));
}

export interface WikiPage {
  id: string;
  title: string;
  category: WikiCategory;
  summary: string;
  roles: string[];
  sourceIds: string[];
  relatedPages: string[];
  relations: WikiRelation[];
  createdAt: string;
  updatedAt: string;
  version: number;
  content: string;
  media?: WikiMediaAsset[];
}

export interface WikiPageSearchDocument extends WikiPage {
  filePath: string;
}

export interface WikiDraft {
  id: string;
  sourceId: string;
  targetPageId?: string;
  submittedBy?: WikiSubmitter;
  title: string;
  category: WikiCategory;
  summary: string;
  roles: string[];
  sourceIds: string[];
  relatedPages: string[];
  relations: WikiRelation[];
  content: string;
  proposedSlug: string;
  status: WikiDraftStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  media?: WikiMediaAsset[];
}

export interface WikiSourceRecord {
  id: string;
  title: string;
  content: string;
  status: WikiSourceStatus;
  draftIds: string[];
  submittedBy?: WikiSubmitter;
  createdAt: string;
  updatedAt: string;
  media?: WikiMediaAsset[];
  ingestError?: string;
  ingestWarnings?: string[];
}

export interface WikiStats {
  publishedPages: number;
  draftCount: number;
  rawSourceCount: number;
  lastPublishedAt: string | null;
}
