import { ChatModelId } from "./chat-models";
import { AnswerMode } from "./answer-modes";
import { KnowledgeMode } from "./knowledge-mode";
import { ThemeMode } from "./theme";

export interface KnowledgeBaseHit {
  id: string;
  title: string;
  category: string;
}

export type RetrievalSourceType = "wiki" | "knowledge_base" | "file" | "web";

export interface RetrievalSourceHit {
  id: string;
  type: RetrievalSourceType;
  title: string;
  category: string;
  detail?: string;
  excerpt?: string;
  score?: number;
  url?: string;
  siteName?: string;
  publishedAt?: string;
}

export type ChatMediaKind = "image" | "video";
export type ChatMediaSource = "wiki" | "file";

export interface ChatMediaItem {
  id: string;
  kind: ChatMediaKind;
  name: string;
  mimeType: string;
  url: string;
  posterUrl?: string;
  caption?: string;
  source: ChatMediaSource;
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
  sourceHits?: RetrievalSourceHit[];
  mediaItems?: ChatMediaItem[];
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
  knowledgeMode?: KnowledgeMode;
  themeMode?: ThemeMode;
  webSearchEnabled?: boolean;
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

export type KbChatRoleId = (typeof ROLES)[number]["id"];

export const EXAMPLE_QUESTIONS: Array<{
  roleId: KbChatRoleId;
  icon: string;
  title: string;
  desc: string;
  question: string;
}> = [
  {
    roleId: "product",
    icon: "🧭",
    title: "这个产品能做吗？",
    desc: "判断一个产品值不值得投入",
    question: "我想判断一个产品值不值得做，应该从哪些维度分析？",
  },
  {
    roleId: "product",
    icon: "☀️",
    title: "防晒项目怎么切入？",
    desc: "防晒品类选品与打法",
    question: "防晒项目应该怎么切入？从选品到内容到渠道帮我梳理一下。",
  },
  {
    roleId: "product",
    icon: "🏷️",
    title: "这个价格定多少合适？",
    desc: "定价、利润和竞争带",
    question: "这个产品价格该怎么定？帮我看利润、竞争带和试错方式。",
  },
  {
    roleId: "operation",
    icon: "📊",
    title: "店铺不出单怎么办？",
    desc: "排查店铺运营问题",
    question: "我的店铺最近不出单了，应该怎么排查问题？",
  },
  {
    roleId: "operation",
    icon: "🛒",
    title: "有流量但不转化怎么办？",
    desc: "转化路径和页面问题",
    question: "店铺有流量但转化很差，应该从哪些环节排查？",
  },
  {
    roleId: "operation",
    icon: "📅",
    title: "活动该怎么排期？",
    desc: "节奏、货盘和目标拆解",
    question: "接下来一轮活动该怎么排期？帮我拆目标和货盘节奏。",
  },
  {
    roleId: "video",
    icon: "🎬",
    title: "短视频没有量？",
    desc: "分析内容表现不佳的原因",
    question: "我发的短视频播放量一直很低，怎么分析原因？",
  },
  {
    roleId: "video",
    icon: "📝",
    title: "这条内容怎么拍更有转化？",
    desc: "脚本、钩子和拍摄重点",
    question: "我想让这条短视频更有转化，脚本和拍摄应该怎么改？",
  },
  {
    roleId: "video",
    icon: "📌",
    title: "怎么做一版能测的内容计划？",
    desc: "选题、节奏和投放配合",
    question: "帮我排一版能测试的短视频内容计划，包括选题和节奏。",
  },
  {
    roleId: "bd",
    icon: "🤝",
    title: "达人合作怎么推进？",
    desc: "达人建联与分销策略",
    question: "达人合作从建联到成交，应该怎么推进？",
  },
  {
    roleId: "bd",
    icon: "⭐",
    title: "这个达人值不值得合作？",
    desc: "匹配度、报价和风险",
    question: "帮我判断这个达人值不值得合作，看匹配度、报价和风险。",
  },
  {
    roleId: "bd",
    icon: "🔗",
    title: "分销链路怎么设计？",
    desc: "佣金、样品和复盘",
    question: "达人分销链路该怎么设计？佣金、样品和复盘怎么配合。",
  },
  {
    roleId: "live",
    icon: "📺",
    title: "这场直播怎么排品？",
    desc: "人货场和节奏",
    question: "这场直播该怎么排品？帮我看人货场和节奏。",
  },
  {
    roleId: "live",
    icon: "💬",
    title: "看的人多但不下单？",
    desc: "话术、信任和逼单时机",
    question: "直播间看的人不少但不下单，话术和节奏该怎么调？",
  },
  {
    roleId: "live",
    icon: "🧾",
    title: "怎么复盘一场直播？",
    desc: "场次数据和下场动作",
    question: "刚结束一场直播，应该怎么复盘，下场先改什么？",
  },
  {
    roleId: "management",
    icon: "📋",
    title: "项目复盘怎么做？",
    desc: "结构化复盘方法",
    question: "上周的项目结束了，我应该怎么做一个有效的复盘？",
  },
  {
    roleId: "management",
    icon: "🎯",
    title: "资源该投到哪条业务？",
    desc: "优先级和取舍",
    question: "现在资源有限，该把人、货、预算投到哪条业务？",
  },
  {
    roleId: "management",
    icon: "🧭",
    title: "团队卡在哪，怎么拆？",
    desc: "目标和组织卡点",
    question: "团队进展卡住了，怎么判断卡点和接下来怎么拆？",
  },
  {
    roleId: "tech",
    icon: "⚙️",
    title: "这个流程能不能自动化？",
    desc: "工具、系统和效率",
    question: "这个业务流程能不能自动化？先做哪一段最划算。",
  },
  {
    roleId: "tech",
    icon: "🔍",
    title: "数据对不上怎么查？",
    desc: "口径、埋点和排查",
    question: "几个渠道的数据对不上，应该怎么查口径和埋点？",
  },
  {
    roleId: "tech",
    icon: "🛠️",
    title: "哪类工具值得先上？",
    desc: "投入产出和落地路径",
    question: "想提升效率，哪类工具值得先上，落地路径怎么排？",
  },
  {
    roleId: "new",
    icon: "🌱",
    title: "我入职后先看什么？",
    desc: "快速上手公司方法论",
    question: "我是新同事，入职后应该先看哪些方法论和资料？",
  },
  {
    roleId: "new",
    icon: "🙋",
    title: "这个问题该问谁、怎么问？",
    desc: "协作方式和信息准备",
    question: "遇到业务问题，该问谁、怎么把问题问清楚？",
  },
  {
    roleId: "new",
    icon: "📘",
    title: "公司常用判断框架有哪些？",
    desc: "先建立工作方法",
    question: "公司常用的判断框架有哪些？帮我按日常工作讲一遍。",
  },
];
