import type { AnswerMode } from "./answer-modes";
import type { ChatModelId } from "./chat-models";
import type { KnowledgeBaseHit, Message } from "./types";

export const REPORT_ANALYSIS_DIMENSIONS = [
  "核心问题识别",
  "已知信息完整度",
  "关键判断结论",
  "判断依据来源",
  "风险与不确定项",
  "下一步动作建议",
] as const;

export type ReportAnalysisDimensionTitle = (typeof REPORT_ANALYSIS_DIMENSIONS)[number];
export type ReportSourceType = "knowledge_base" | "file" | "conversation";
export type ReportActionPriority = "高" | "中" | "低";
export type ReportActionTimeframe = "立刻做" | "本周做" | "后续跟进";

export interface ReportSourceReference {
  type: ReportSourceType;
  label: string;
  detail?: string;
}

export interface ReportExecutiveSummary {
  conversationGoal: string;
  topConclusions: string[];
  overallJudgment: string;
}

export interface ReportProblemDefinition {
  coreRequest: string;
  providedContext: string[];
  businessStage: string;
}

export interface ReportAnalysisDimension {
  title: ReportAnalysisDimensionTitle;
  summary: string;
  sources: ReportSourceReference[];
}

export interface ReportKeyJudgment {
  title: string;
  conclusion: string;
  basis: string;
  sources: ReportSourceReference[];
}

export interface ReportActionItem {
  timeframe: ReportActionTimeframe;
  priority: ReportActionPriority;
  action: string;
  reason: string;
  ownerSuggestion?: string;
}

export interface ReportFileSummaryItem {
  id: string;
  name: string;
  kind: "document" | "image" | "video";
  active: boolean;
  summary: string;
  references: string[];
}

export interface ConversationReport {
  reportTitle: string;
  generatedAt: number;
  conversationId: string;
  conversationTitle: string;
  roleId: string;
  roleName: string;
  modelId: ChatModelId | string;
  modelLabel: string;
  answerMode: AnswerMode;
  coverNote: string;
  executiveSummary: ReportExecutiveSummary;
  problemDefinition: ReportProblemDefinition;
  keyJudgments: ReportKeyJudgment[];
  analysisDimensions: ReportAnalysisDimension[];
  actionPlan: ReportActionItem[];
  fileSummary: {
    overview: string;
    items: ReportFileSummaryItem[];
  };
  knowledgeHits: KnowledgeBaseHit[];
  appendix: {
    transcript: Message[];
  };
}

export interface ReportGenerationRequest {
  conversationId: string;
  conversationTitle: string;
  messages: Message[];
  roleId: string;
  roleName: string;
  modelId: ChatModelId | string;
  answerMode: AnswerMode;
}
