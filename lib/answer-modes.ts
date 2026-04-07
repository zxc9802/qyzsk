export type AnswerMode = "deep" | "simple";

export interface AnswerModeOption {
  id: AnswerMode;
  label: string;
  shortLabel: string;
  description: string;
}

export const ANSWER_MODES: AnswerModeOption[] = [
  {
    id: "deep",
    label: "深度回答",
    shortLabel: "深度回答",
    description: "保留系统引导、问题诊断和结构化回答。",
  },
  {
    id: "simple",
    label: "简单回答",
    shortLabel: "简单回答",
    description: "跳过深度引导，直接结合知识库和资料回答。",
  },
];

export const DEFAULT_ANSWER_MODE: AnswerMode = "deep";

export function isAnswerMode(value: string): value is AnswerMode {
  return ANSWER_MODES.some((mode) => mode.id === value);
}

export function getAnswerModeOption(mode?: string | null): AnswerModeOption {
  return ANSWER_MODES.find((item) => item.id === mode) || ANSWER_MODES[0];
}
