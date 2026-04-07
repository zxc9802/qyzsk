import { ChatModelId } from "./chat-models";
import { AnswerMode } from "./answer-modes";

export interface KnowledgeBaseHit {
  id: string;
  title: string;
  category: string;
}

export interface QuestionDiagnosis {
  categoryId: string;
  categoryLabel: string;
  mode: "answer" | "clarify";
  completenessScore: number;
  missingSlots: string[];
  summary: string;
  clarificationStage?: "choose_scope" | "fill_slots";
  scopeOptions?: string[];
  selectedScope?: string;
  collectedSlots?: string[];
  ruleConfidence?: number;
  diagnosisSource?: "rule" | "hybrid" | "model";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  modelId?: ChatModelId | string;
  kbHits?: KnowledgeBaseHit[];
  questionDiagnosis?: QuestionDiagnosis;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "document" | "image" | "video";
  status: "processing" | "ready" | "failed";
  active: boolean;
  summary: string;
  excerpt: string;
  segmentCount: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  metadata: {
    extension?: string;
    pageCount?: number;
    durationSec?: number;
    width?: number;
    height?: number;
    frameCount?: number;
  };
}

export interface UserSettings {
  role: string;
  roleName: string;
  chatModelId?: ChatModelId;
  answerMode?: AnswerMode;
}

export const ROLES = [
  { id: "product", name: "产品岗", icon: "🧭", desc: "选品、定价、机会判断" },
  { id: "video", name: "视频岗", icon: "🎬", desc: "脚本、拍摄、内容策划" },
  { id: "operation", name: "运营岗", icon: "📊", desc: "店铺、流量、转化分析" },
  { id: "bd", name: "BD/达人岗", icon: "🤝", desc: "达人建联、合作策略" },
  { id: "live", name: "直播岗", icon: "📺", desc: "人货场、话术、节奏" },
  { id: "management", name: "管理层", icon: "👔", desc: "战略、资源、组织决策" },
  { id: "tech", name: "技术岗", icon: "⚙️", desc: "系统、工具、效率提升" },
  { id: "new", name: "新员工", icon: "🌱", desc: "快速上手公司方法论" },
] as const;

export const EXAMPLE_QUESTIONS = [
  {
    icon: "🧭",
    title: "这个产品能做吗？",
    desc: "判断一个产品值不值得投入",
    question: "我想判断一个产品值不值得做，应该从哪些维度分析？",
  },
  {
    icon: "📊",
    title: "店铺不出单怎么办？",
    desc: "排查店铺运营问题",
    question: "我的店铺最近不出单了，应该怎么排查问题？",
  },
  {
    icon: "🎬",
    title: "短视频没有量？",
    desc: "分析内容表现不佳的原因",
    question: "我发的短视频播放量一直很低，怎么分析原因？",
  },
  {
    icon: "☀️",
    title: "防晒项目怎么切入？",
    desc: "防晒品类选品与打法",
    question: "防晒项目应该怎么切入？从选品到内容到渠道帮我梳理一下。",
  },
  {
    icon: "🤝",
    title: "达人合作怎么推进？",
    desc: "达人建联与分销策略",
    question: "达人合作从建联到成交，应该怎么推进？",
  },
  {
    icon: "📋",
    title: "项目复盘怎么做？",
    desc: "结构化复盘方法",
    question: "上周的项目结束了，我应该怎么做一个有效的复盘？",
  },
];
