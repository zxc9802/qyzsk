export type KnowledgeMode = "wiki_first" | "kb_only";

export interface KnowledgeModeOption {
  id: KnowledgeMode;
  label: string;
  shortLabel: string;
  description: string;
}

export const KNOWLEDGE_MODES: KnowledgeModeOption[] = [
  {
    id: "wiki_first",
    label: "Wiki 优先",
    shortLabel: "Wiki 优先",
    description: "优先使用整理过的 Wiki 页面，再用 KB 条目做事实兜底。",
  },
  {
    id: "kb_only",
    label: "仅 KB",
    shortLabel: "仅 KB",
    description: "跳过 Wiki，只使用现有知识库条目和会话资料。",
  },
];

export const DEFAULT_KNOWLEDGE_MODE: KnowledgeMode = "wiki_first";

export function isKnowledgeMode(value: string): value is KnowledgeMode {
  return KNOWLEDGE_MODES.some((item) => item.id === value);
}

export function getKnowledgeModeOption(mode?: string | null): KnowledgeModeOption {
  return KNOWLEDGE_MODES.find((item) => item.id === mode) || KNOWLEDGE_MODES[0];
}
