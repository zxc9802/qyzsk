export type WikiCategory = "concepts" | "entities" | "roles" | "faq" | "synthesis";
export type WikiDraftStatus = "draft" | "approved" | "rejected";
export type WikiSourceStatus = "drafted" | "approved" | "rejected";

export interface WikiPage {
  id: string;
  title: string;
  category: WikiCategory;
  summary: string;
  roles: string[];
  sourceIds: string[];
  relatedPages: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
  content: string;
}

export interface WikiPageSearchDocument extends WikiPage {
  filePath: string;
}

export interface WikiDraft {
  id: string;
  sourceId: string;
  title: string;
  category: WikiCategory;
  summary: string;
  roles: string[];
  sourceIds: string[];
  relatedPages: string[];
  content: string;
  proposedSlug: string;
  status: WikiDraftStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WikiSourceRecord {
  id: string;
  title: string;
  content: string;
  status: WikiSourceStatus;
  draftIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WikiStats {
  publishedPages: number;
  draftCount: number;
  rawSourceCount: number;
  lastPublishedAt: string | null;
}
