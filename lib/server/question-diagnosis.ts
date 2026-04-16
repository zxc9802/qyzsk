import type { QuestionDiagnosis } from "@/lib/types";

export type DiagnosisHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  questionDiagnosis?: QuestionDiagnosis;
};

type QuestionCategoryId =
  | "strategy"
  | "product"
  | "content"
  | "operation"
  | "traffic"
  | "live"
  | "review"
  | "management"
  | "ai_tool"
  | "training";

type SlotDefinition = {
  label: string;
  patterns: RegExp[];
  aliases?: string[];
};

type QuestionCategoryDefinition = {
  id: QuestionCategoryId;
  label: string;
  keywords: Array<[string, number]>;
  roleBoosts?: string[];
  slots?: SlotDefinition[];
  templateLines?: string[];
  scopeOptions?: string[];
};

type DiagnosisMode = QuestionDiagnosis["mode"];

type RankedCategory = {
  definition: QuestionCategoryDefinition;
  score: number;
};

type DiagnosisReview = {
  intent: "scope_choice" | "slot_fill" | "new_question" | "uncertain";
  selectedScope?: string;
  filledSlots?: string[];
};

type DiagnosisResult = {
  diagnosis: QuestionDiagnosis;
  clarificationReply: string | null;
  modelReviewPrompt?: string | null;
};

type ModelDiagnosisPayload = {
  categoryId?: string;
  categoryLabel?: string;
  mode?: string;
  completenessScore?: number;
  missingSlots?: unknown;
  summary?: string;
  clarificationStage?: string | null;
  scopeOptions?: unknown;
  selectedScope?: string;
  collectedSlots?: unknown;
  clarificationReply?: string;
};

const FRAMEWORK_HINTS = [
  "框架",
  "维度",
  "思路",
  "方法",
  "原则",
  "步骤",
  "模板",
  "sop",
  "怎么做",
  "怎么写",
  "怎么判断",
  "是什么",
  "什么意思",
  "讲讲",
  "介绍",
  "梳理",
  "从哪些",
  "应该看",
  "怎么分析",
];

const SPECIFIC_CASE_HINTS = [
  "这个",
  "这条",
  "这款",
  "最近",
  "现在",
  "为什么",
  "怎么办",
  "怎么排查",
  "怎么拍",
  "帮我看",
  "推进不下去",
  "没跑起来",
  "不出单",
  "值不值得做",
  "能不能做",
  "适不适合",
];

const DEFAULT_SLOT_ALIASES: Record<string, string[]> = {
  产品: ["产品", "sku", "款式", "品"],
  市场: ["市场", "国家", "地区"],
  渠道: ["渠道", "平台"],
  价格带: ["价格带", "价格", "客单", "售价"],
  目标人群: ["目标人群", "人群", "受众", "用户"],
  销售方式: ["销售方式", "怎么卖", "打法", "销售渠道"],
  主卖点: ["主卖点", "卖点", "痛点", "主打"],
  内容目标: ["内容目标", "目标", "内容目标方向"],
  账号类型: ["账号类型", "账号", "账号形态", "账号定位", "号型"],
  平台: ["平台", "渠道"],
  店铺阶段: ["店铺阶段", "阶段"],
  主营产品: ["主营产品", "产品"],
  核心数据: ["核心数据", "数据", "近7天核心数据"],
  最大卡点: ["最大卡点", "卡点", "核心卡点"],
  流量来源: ["流量来源", "流量"],
  "市场/平台": ["市场/平台", "市场", "平台"],
  合作对象类型: ["合作对象类型", "达人类型", "博主类型"],
  当前阶段: ["当前阶段", "推进阶段", "阶段"],
  目标动作: ["目标动作", "目标", "目标结果"],
  直播阶段: ["直播阶段", "阶段"],
  当前目标: ["当前目标", "目标"],
  目标: ["目标"],
  动作: ["动作"],
  结果数据: ["结果数据", "结果", "数据"],
  与预期差: ["与预期差", "差距", "预期差"],
  怀疑原因: ["怀疑原因", "原因", "猜测"],
};

const CATEGORY_DEFINITIONS: QuestionCategoryDefinition[] = [
  {
    id: "product",
    label: "产品选择类",
    roleBoosts: ["product", "management"],
    keywords: [
      ["产品", 18],
      ["选品", 24],
      ["值不值得做", 34],
      ["能不能做", 30],
      ["适不适合", 28],
      ["超级产品", 26],
      ["价格带", 16],
      ["购买动机", 16],
      ["赛道", 14],
      ["类目", 14],
    ],
    slots: [
      {
        label: "产品",
        patterns: [
          /产品[：:]/u,
          /sku[：:]/iu,
          /(防晒|喷雾|防晒霜|防晒棒|锅|锅具|面霜|精华|洗发水|杯子|耳机|服装|面膜)/iu,
        ],
      },
      {
        label: "市场",
        patterns: [
          /市场[：:]/u,
          /(东南亚|欧美|美国|英国|法国|德国|日本|韩国|印尼|印度尼西亚|马来西亚|菲律宾|越南|泰国|新加坡)/iu,
        ],
      },
      {
        label: "渠道",
        patterns: [
          /渠道[：:]/u,
          /平台[：:]/u,
          /(tiktok|tiktok shop|shopee|lazada|amazon|亚马逊|独立站|直播|短视频|达人)/iu,
        ],
      },
      {
        label: "价格带",
        patterns: [
          /价格带[：:]/u,
          /客单[：:]/u,
          /售价[：:]/u,
          /\d+\s*(元|人民币|rmb|美元|美金|刀)/iu,
          /\d+\s*[-~到至]\s*\d+\s*(元|人民币|rmb|美元|美金|刀)/iu,
        ],
      },
      {
        label: "目标人群",
        patterns: [
          /人群[：:]/u,
          /用户[：:]/u,
          /受众[：:]/u,
          /(宝妈|学生|白领|上班族|女性|男性|油皮|干皮|敏感肌|通勤|旅行|户外)/iu,
        ],
      },
      {
        label: "销售方式",
        patterns: [
          /(主号|矩阵号|达人|直播|投流|短视频|分销|店铺承接)/iu,
          /怎么卖/u,
        ],
      },
    ],
    templateLines: [
      "- 产品：",
      "- 市场：",
      "- 渠道：",
      "- 价格带：",
      "- 目标人群：",
      "- 你想怎么卖（主号/矩阵/达人/直播）：",
    ],
  },
  {
    id: "content",
    label: "内容策划类",
    roleBoosts: ["video", "bd"],
    keywords: [
      ["视频", 22],
      ["脚本", 24],
      ["内容", 14],
      ["钩子", 20],
      ["卖点", 20],
      ["起量", 16],
      ["带货", 16],
      ["素材", 14],
      ["怎么拍", 28],
      ["怎么写", 14],
    ],
    slots: [
      {
        label: "产品",
        patterns: [
          /产品[：:]/u,
          /(防晒|喷雾|锅|锅具|面霜|精华|面膜|洗发水|耳机|服装)/iu,
        ],
      },
      {
        label: "目标人群",
        patterns: [
          /人群[：:]/u,
          /受众[：:]/u,
          /(宝妈|学生|白领|男性|女性|油皮|干皮|敏感肌|通勤|旅行|户外)/iu,
        ],
      },
      {
        label: "主卖点",
        patterns: [
          /卖点[：:]/u,
          /痛点[：:]/u,
          /主打/u,
          /(不粘|清爽|轻薄|高颜值|便携|保湿|防晒|不油)/iu,
        ],
      },
      {
        label: "内容目标",
        patterns: [
          /(起量|带货|引流直播|种草|转化|曝光)/iu,
          /目标[：:]/u,
        ],
      },
      {
        label: "账号类型",
        patterns: [
          /(主号|矩阵号|达人号|店铺号|人设号)/iu,
          /账号[：:]/u,
        ],
      },
    ],
    templateLines: [
      "- 产品：",
      "- 目标人群：",
      "- 主卖点：",
      "- 内容目标（起量/带货/引流直播）：",
      "- 账号类型：",
    ],
    scopeOptions: [
      "短视频内容怎么打",
      "达人分销怎么推",
      "店铺承接怎么转化",
      "直播怎么成交",
    ],
  },
  {
    id: "operation",
    label: "店铺运营类",
    roleBoosts: ["operation", "management"],
    keywords: [
      ["店铺", 24],
      ["不出单", 34],
      ["没单", 30],
      ["转化", 20],
      ["曝光", 16],
      ["点击", 16],
      ["商品卡", 14],
      ["页面", 14],
      ["履约", 12],
      ["排查", 22],
      ["诊断", 22],
    ],
    slots: [
      {
        label: "平台",
        patterns: [
          /平台[：:]/u,
          /(tiktok|tiktok shop|shopee|lazada|amazon|亚马逊|独立站)/iu,
        ],
      },
      {
        label: "店铺阶段",
        patterns: [
          /阶段[：:]/u,
          /(冷启动|新店|测试期|放量期|稳定期|起店)/iu,
        ],
      },
      {
        label: "主营产品",
        patterns: [
          /主营产品[：:]/u,
          /产品[：:]/u,
          /(防晒|喷雾|锅|锅具|面霜|精华|面膜|洗发水)/iu,
        ],
      },
      {
        label: "核心数据",
        patterns: [
          /(近7天|近 7 天|近30天|近 30 天)/u,
          /(曝光|点击|ctr|cvr|转化率|客单价|gmv|订单量|退款率|评分)/iu,
        ],
      },
      {
        label: "最大卡点",
        patterns: [
          /(卡点|卡在|不出单|没转化|没点击|没曝光|履约差|评价差)/iu,
        ],
      },
      {
        label: "流量来源",
        patterns: [
          /(自然流|付费|达人|直播|短视频|广告|商品卡|搜索)/iu,
          /流量来源[：:]/u,
        ],
      },
    ],
    templateLines: [
      "- 平台：",
      "- 店铺阶段：",
      "- 主营产品：",
      "- 近7天核心数据（曝光/点击/转化/客单）：",
      "- 当前最大卡点：",
      "- 主要流量来源：",
    ],
  },
  {
    id: "traffic",
    label: "达人合作类",
    roleBoosts: ["bd", "operation"],
    keywords: [
      ["达人", 26],
      ["建联", 24],
      ["合作", 20],
      ["分销", 16],
      ["投流", 14],
      ["流量", 12],
      ["推进不下去", 28],
      ["矩阵", 14],
    ],
    slots: [
      {
        label: "产品",
        patterns: [
          /产品[：:]/u,
          /(防晒|喷雾|锅|锅具|面霜|精华|面膜|洗发水)/iu,
        ],
      },
      {
        label: "市场/平台",
        patterns: [
          /平台[：:]/u,
          /市场[：:]/u,
          /(tiktok|shopee|lazada|东南亚|美国|英国|印尼|马来西亚)/iu,
        ],
      },
      {
        label: "合作对象类型",
        patterns: [
          /(达人类型|博主类型|腰部达人|头部达人|尾部达人|垂类达人)/iu,
        ],
      },
      {
        label: "当前阶段",
        patterns: [
          /(建联|寄样|沟通|跟进|出片|带货|复投)/iu,
          /阶段[：:]/u,
        ],
      },
      {
        label: "目标动作",
        patterns: [
          /(拿素材|成交|出片|带货|复投|分发)/iu,
          /目标[：:]/u,
        ],
      },
    ],
    templateLines: [
      "- 产品：",
      "- 市场/平台：",
      "- 合作对象类型：",
      "- 当前推进阶段：",
      "- 目标动作：",
      "- 你现在最卡在哪：",
    ],
    scopeOptions: [
      "达人建联怎么做",
      "寄样出片怎么推进",
      "达人带货怎么转化",
      "素材协同怎么放大",
    ],
  },
  {
    id: "live",
    label: "直播运营类",
    roleBoosts: ["live", "operation"],
    keywords: [
      ["直播", 28],
      ["主播", 20],
      ["直播间", 24],
      ["话术", 20],
      ["停留", 16],
      ["互动", 16],
      ["转化", 12],
    ],
    slots: [
      {
        label: "产品",
        patterns: [
          /产品[：:]/u,
          /(防晒|喷雾|锅|锅具|面霜|精华|面膜|洗发水)/iu,
        ],
      },
      {
        label: "直播阶段",
        patterns: [
          /(新号|冷启动|测试期|稳定期|放量期)/iu,
          /阶段[：:]/u,
        ],
      },
      {
        label: "当前目标",
        patterns: [
          /(拉停留|拉互动|拉转化|成交|场观|在线人数)/iu,
          /目标[：:]/u,
        ],
      },
      {
        label: "流量来源",
        patterns: [
          /(自然流|短视频|付费|达人导流)/iu,
          /流量来源[：:]/u,
        ],
      },
      {
        label: "最大卡点",
        patterns: [
          /(停留差|互动差|转化差|话术|节奏|人货场|承接)/iu,
        ],
      },
    ],
    templateLines: [
      "- 产品：",
      "- 直播阶段：",
      "- 当前目标：",
      "- 流量来源：",
      "- 最大卡点：",
      "- 当前你已有的素材/活动机制：",
    ],
  },
  {
    id: "review",
    label: "复盘优化类",
    roleBoosts: ["management", "product", "operation"],
    keywords: [
      ["复盘", 34],
      ["归因", 26],
      ["没跑起来", 28],
      ["失败", 16],
      ["优化", 16],
      ["迭代", 16],
      ["项目结束", 18],
      ["结果不好", 18],
    ],
    slots: [
      {
        label: "目标",
        patterns: [
          /目标[：:]/u,
          /(目标是|预期是)/u,
        ],
      },
      {
        label: "动作",
        patterns: [
          /动作[：:]/u,
          /(做了什么|执行了什么|采取了什么)/u,
        ],
      },
      {
        label: "结果数据",
        patterns: [
          /结果[：:]/u,
          /(数据|gmv|订单|曝光|点击|转化|播放|出单)/iu,
        ],
      },
      {
        label: "与预期差",
        patterns: [
          /(差距|没达到|低于预期|偏差)/iu,
        ],
      },
      {
        label: "怀疑原因",
        patterns: [
          /(怀疑|原因|猜测|归因)/iu,
        ],
      },
    ],
    templateLines: [
      "- 目标是什么：",
      "- 你做了什么动作：",
      "- 结果数据是什么：",
      "- 和预期差在哪里：",
      "- 你怀疑的原因是什么：",
      "- 你现在最想先解决什么：",
    ],
  },
  {
    id: "management",
    label: "组织管理类",
    roleBoosts: ["management"],
    keywords: [
      ["团队", 20],
      ["管理", 24],
      ["资源", 18],
      ["okr", 24],
      ["优先级", 18],
      ["带教", 18],
      ["组织", 20],
      ["人才", 18],
    ],
  },
  {
    id: "strategy",
    label: "战略判断类",
    roleBoosts: ["management", "product"],
    keywords: [
      ["战略", 28],
      ["方向", 20],
      ["主战场", 22],
      ["阶段", 14],
      ["市场", 14],
      ["优先级", 12],
      ["公司现在", 18],
      ["为什么做跨境", 24],
    ],
  },
  {
    id: "ai_tool",
    label: "AI工具使用类",
    roleBoosts: ["tech"],
    keywords: [
      ["ai", 18],
      ["prompt", 20],
      ["工作流", 20],
      ["自动化", 18],
      ["智能体", 18],
      ["api", 20],
      ["模型", 14],
      ["gpt", 16],
      ["gemini", 16],
    ],
  },
  {
    id: "training",
    label: "培训学习类",
    roleBoosts: ["new", "tech"],
    keywords: [
      ["学习", 20],
      ["培训", 20],
      ["入门", 18],
      ["上手", 18],
      ["术语", 20],
      ["什么意思", 20],
      ["讲的是什么", 18],
      ["解释", 18],
    ],
  },
];

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeCompact(value: string): string {
  return value.toLowerCase().replace(/[\s：:，,。！？!?.、/（）()\-]/g, "");
}

function scoreCategory(query: string, role: string, definition: QuestionCategoryDefinition): number {
  let score = 0;

  definition.keywords.forEach(([keyword, weight]) => {
    if (query.includes(keyword.toLowerCase())) {
      score += weight;
    }
  });

  if (definition.roleBoosts?.includes(role)) {
    score += 8;
  }

  return score;
}

function rankCategories(query: string, role: string): RankedCategory[] {
  return CATEGORY_DEFINITIONS
    .map((definition) => ({
      definition,
      score: scoreCategory(query, role, definition),
    }))
    .sort((left, right) => right.score - left.score);
}

function getCategoryDefinitionById(categoryId: string): QuestionCategoryDefinition {
  return CATEGORY_DEFINITIONS.find((definition) => definition.id === categoryId)
    || CATEGORY_DEFINITIONS.find((definition) => definition.id === "training")!;
}

function calculateRuleConfidence(ranked: RankedCategory[]): number {
  const top = ranked[0]?.score || 0;
  const second = ranked[1]?.score || 0;

  if (top <= 0) return 0.1;

  const baseScore = Math.min(top / 60, 1);
  const gapScore = top > 0 ? Math.max((top - second) / top, 0) : 0;
  return Number(Math.min(0.98, 0.55 * baseScore + 0.45 * gapScore).toFixed(2));
}

function detectIntent(normalizedQuery: string): "framework" | "specific" {
  const frameworkScore = FRAMEWORK_HINTS.reduce(
    (total, hint) => total + (normalizedQuery.includes(hint) ? 1 : 0),
    0
  );
  const specificScore = SPECIFIC_CASE_HINTS.reduce(
    (total, hint) => total + (normalizedQuery.includes(hint) ? 1 : 0),
    0
  );

  if (frameworkScore > specificScore) {
    return "framework";
  }

  if (specificScore > 0) {
    return "specific";
  }

  return normalizedQuery.length <= 20 ? "specific" : "framework";
}

function hasGenericProductReference(normalizedQuery: string): boolean {
  return /(这个产品|这款产品|这个品|它)/u.test(normalizedQuery);
}

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSlotAliases(slot: SlotDefinition): string[] {
  return Array.from(new Set([slot.label, ...(slot.aliases || []), ...(DEFAULT_SLOT_ALIASES[slot.label] || [])]))
    .sort((left, right) => right.length - left.length);
}

function extractStructuredSlots(query: string, definition: QuestionCategoryDefinition): string[] {
  if (!definition.slots || definition.slots.length === 0) return [];

  const aliasToSlot = new Map<string, string>();
  const aliases: string[] = [];

  definition.slots.forEach((slot) => {
    getSlotAliases(slot).forEach((alias) => {
      if (!aliasToSlot.has(alias)) {
        aliasToSlot.set(alias, slot.label);
        aliases.push(alias);
      }
    });
  });

  if (aliases.length === 0) return [];

  const matcher = new RegExp(
    `(?:^|[\\s\\n\\r，,；;])(${aliases.map(escapeRegex).join("|")})\\s*[：:]`,
    "giu"
  );

  const matches = Array.from(query.matchAll(matcher));
  if (matches.length === 0) return [];

  const filledSlots = new Set<string>();

  matches.forEach((match, index) => {
    const alias = match[1];
    const slotLabel = aliasToSlot.get(alias);
    if (!slotLabel) return;

    const valueStart = (match.index || 0) + match[0].length;
    const nextStart = index < matches.length - 1
      ? (matches[index + 1].index || query.length)
      : query.length;
    const rawValue = query.slice(valueStart, nextStart).replace(/^[\s，,；;]+|[\s，,；;]+$/gu, "");

    if (!rawValue) return;
    if (slotLabel === "产品" && hasGenericProductReference(normalizeQuery(rawValue))) return;

    filledSlots.add(slotLabel);
  });

  return Array.from(filledSlots);
}

function detectFilledSlots(query: string, definition: QuestionCategoryDefinition): string[] {
  if (!definition.slots || definition.slots.length === 0) return [];

  const structuredSlots = extractStructuredSlots(query, definition);
  const fuzzySlots = definition.slots
    .filter((slot) => {
      if (slot.label === "产品" && hasGenericProductReference(query)) {
        return false;
      }

      return slot.patterns.some((pattern) => pattern.test(query));
    })
    .map((slot) => slot.label);

  return mergeCollectedSlots(structuredSlots, fuzzySlots);
}

function detectMissingSlots(query: string, definition: QuestionCategoryDefinition): string[] {
  if (!definition.slots || definition.slots.length === 0) return [];

  const filledSlots = new Set(detectFilledSlots(query, definition));

  return definition.slots
    .filter((slot) => !filledSlots.has(slot.label))
    .map((slot) => slot.label);
}

function calculateCompleteness(totalSlots: number, missingSlots: string[], intent: "framework" | "specific"): number {
  if (intent === "framework" || totalSlots === 0) {
    return 100;
  }

  const presentCount = Math.max(totalSlots - missingSlots.length, 0);
  return Math.max(20, Math.round((presentCount / totalSlots) * 100));
}

function calculateCompletenessFromFilled(totalSlots: number, filledCount: number): number {
  if (totalSlots === 0) return 100;
  return Math.max(20, Math.round((filledCount / totalSlots) * 100));
}

function shouldClarify(
  definition: QuestionCategoryDefinition,
  intent: "framework" | "specific",
  completenessScore: number,
  missingSlots: string[]
): boolean {
  if (!definition.slots || definition.slots.length === 0) return false;
  if (intent !== "specific") return false;
  if (missingSlots.length === 0) return false;

  return completenessScore < 80;
}

export function getLatestClarification(history: DiagnosisHistoryMessage[]): QuestionDiagnosis | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.role !== "assistant") continue;
    const diagnosis = message.questionDiagnosis;
    if (!diagnosis) continue;
    if (
      diagnosis.mode === "clarify"
      || diagnosis.clarificationStage === "choose_scope"
      || diagnosis.clarificationStage === "fill_slots"
      || Boolean(diagnosis.selectedScope)
      || Boolean(diagnosis.collectedSlots?.length)
    ) {
      return diagnosis;
    }
  }

  return null;
}

function matchScopeChoice(query: string, scopeOptions?: string[]): string | null {
  if (!scopeOptions || scopeOptions.length === 0) return null;

  const indexMatch = query.trim().match(/^([1-9]\d*)[.)、\s]*$/u);
  if (indexMatch) {
    const matchedIndex = Number(indexMatch[1]) - 1;
    if (matchedIndex >= 0 && matchedIndex < scopeOptions.length) {
      return scopeOptions[matchedIndex];
    }
  }

  const normalizedQuery = normalizeCompact(query);
  if (!normalizedQuery) return null;

  for (const option of scopeOptions) {
    const normalizedOption = normalizeCompact(option);
    if (
      normalizedQuery === normalizedOption ||
      normalizedOption.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedOption)
    ) {
      return option;
    }
  }

  return null;
}

function mergeCollectedSlots(previous: string[] = [], incoming: string[] = []): string[] {
  return Array.from(new Set([...previous, ...incoming]));
}

function buildSummary(
  definition: QuestionCategoryDefinition,
  mode: DiagnosisMode,
  intent: "framework" | "specific",
  selectedScope?: string
): string {
  if (mode === "clarify") {
    if (selectedScope) {
      return `这是一个${definition.label}，你已经明确了当前场景：${selectedScope}。接下来把剩余关键背景补齐，就可以往下分析。`;
    }

    return `这是一个${definition.label}，你现在在问具体案例，但当前信息还不够。先补关键背景，再往下判断会更准。`;
  }

  if (intent === "framework") {
    return `这是一个${definition.label}，你现在更像是在问方法框架或通用思路，不需要先补齐具体案例槽位，可以直接回答。`;
  }

  return `这是一个${definition.label}，当前关键信息已经基本够用，可以直接进入分析和建议。`;
}

function shouldNarrowScope(
  normalizedQuery: string,
  definition: QuestionCategoryDefinition,
  diagnosis: QuestionDiagnosis
): boolean {
  if (!definition.scopeOptions?.length) return false;
  if (diagnosis.completenessScore > 40) return false;
  if (diagnosis.missingSlots.length < 4) return false;

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  return compactQuery.length <= 12;
}

function buildFillSlotsReply(
  definition: QuestionCategoryDefinition,
  diagnosis: QuestionDiagnosis
): string {
  const template = definition.templateLines?.join("\n") || "- 请补充更具体的业务背景：";
  const remainingText = diagnosis.missingSlots.slice(0, 3).join("、");
  const scopeText = diagnosis.selectedScope ? `“${diagnosis.selectedScope}”` : "这个场景";

  return [
    `好，我们就按${scopeText}继续。现在还差 ${remainingText}${diagnosis.missingSlots.length > 3 ? " 等" : ""}信息。`,
    "",
    "请直接按这个格式补给我：",
    template,
  ].join("\n");
}

function buildClarificationReply(
  normalizedQuery: string,
  definition: QuestionCategoryDefinition,
  diagnosis: QuestionDiagnosis
): string {
  if (diagnosis.selectedScope) {
    return buildFillSlotsReply(definition, diagnosis);
  }

  const template = definition.templateLines?.join("\n") || "- 请补充更具体的业务背景：";
  const briefMissingText = diagnosis.missingSlots.slice(0, 3).join("、");
  const narrowScope = shouldNarrowScope(normalizedQuery, definition, diagnosis);

  if (narrowScope) {
    return [
      "这个问题范围还太大，我先帮你缩一下，不然很容易答成泛建议。",
      "",
      "你现在更想问哪一种？",
      ...(definition.scopeOptions || []).map((item, index) => `${index + 1}. ${item}`),
      "",
      "如果你已经有明确场景，也可以直接按这个格式补给我：",
      template,
    ].join("\n");
  }

  return [
    `这个问题我先不直接下结论，不然很容易变成泛建议。你现在还缺少 ${briefMissingText}${diagnosis.missingSlots.length > 3 ? " 等" : ""}关键信息。`,
    "",
    "请直接按这个格式补给我：",
    template,
    "",
    "你补完后，我就按公司的框架直接往下拆。",
  ].join("\n");
}

function buildScopeSelectionDiagnosis(
  definition: QuestionCategoryDefinition,
  selectedScope: string,
  collectedSlots: string[] = []
): DiagnosisResult {
  const allSlots = definition.slots?.map((slot) => slot.label) || [];
  const mergedCollectedSlots = mergeCollectedSlots([], collectedSlots);
  const missingSlots = allSlots.filter((slot) => !mergedCollectedSlots.includes(slot));
  const diagnosis: QuestionDiagnosis = {
    categoryId: definition.id,
    categoryLabel: definition.label,
    mode: missingSlots.length === 0 ? "answer" : "clarify",
    completenessScore: calculateCompletenessFromFilled(allSlots.length, mergedCollectedSlots.length),
    missingSlots,
    summary: buildSummary(
      definition,
      missingSlots.length === 0 ? "answer" : "clarify",
      "specific",
      selectedScope
    ),
    clarificationStage: missingSlots.length === 0 ? undefined : "fill_slots",
    selectedScope,
    collectedSlots: mergedCollectedSlots,
    ruleConfidence: 0.96,
    diagnosisSource: "rule",
  };

  return {
    diagnosis,
    clarificationReply:
      diagnosis.mode === "clarify"
        ? buildClarificationReply(normalizeQuery(selectedScope), definition, diagnosis)
        : null,
  };
}

function shouldRequestModelReview(
  normalizedQuery: string,
  latestClarification: QuestionDiagnosis | null,
  ruleConfidence: number,
  diagnosis: QuestionDiagnosis
): boolean {
  if (!latestClarification) return false;
  if (diagnosis.mode !== "clarify") return false;

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  return compactQuery.length <= 24 || ruleConfidence < 0.78;
}

function buildModelReviewPrompt(
  query: string,
  role: string,
  history: DiagnosisHistoryMessage[],
  diagnosis: QuestionDiagnosis,
  latestClarification: QuestionDiagnosis
): string {
  const contextMessages = history
    .slice(-4)
    .map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.content}`)
    .join("\n");

  return [
    "你是一个中文问答路由判断器，只做诊断，不做业务回答。",
    "请判断当前用户这句话，属于下面哪一种：",
    "1. scope_choice：用户是在选择上一轮助手给出的场景选项之一",
    "2. slot_fill：用户是在补充上一轮助手要求的关键槽位",
    "3. new_question：用户已经开启了一个新问题",
    "4. uncertain：无法可靠判断",
    "",
    "你必须只输出一行 JSON，不要输出解释。",
    'JSON 格式：{"intent":"scope_choice|slot_fill|new_question|uncertain","selectedScope":"","filledSlots":["槽位1","槽位2"]}',
    "",
    `当前岗位：${role}`,
    `当前规则判断类别：${diagnosis.categoryLabel}`,
    `上一轮引导类别：${latestClarification.categoryLabel}`,
    `上一轮引导阶段：${latestClarification.clarificationStage || "fill_slots"}`,
    `上一轮场景选项：${(latestClarification.scopeOptions || []).join(" / ") || "无"}`,
    `上一轮缺失槽位：${latestClarification.missingSlots.join(" / ") || "无"}`,
    "",
    "最近对话：",
    contextMessages || "无",
    "",
    `当前用户输入：${query}`,
    "",
    "filledSlots 只能从这些槽位里选：产品、市场、渠道、价格带、目标人群、销售方式、主卖点、内容目标、账号类型、平台、店铺阶段、主营产品、核心数据、最大卡点、流量来源、市场/平台、合作对象类型、当前阶段、目标动作、直播阶段、当前目标、目标、动作、结果数据、与预期差、怀疑原因。",
  ].join("\n");
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

export function parseDiagnosisReview(raw: string): DiagnosisReview | null {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as DiagnosisReview;
    if (!parsed || typeof parsed.intent !== "string") return null;
    if (!["scope_choice", "slot_fill", "new_question", "uncertain"].includes(parsed.intent)) {
      return null;
    }

    return {
      intent: parsed.intent,
      selectedScope: typeof parsed.selectedScope === "string" ? parsed.selectedScope : undefined,
      filledSlots: Array.isArray(parsed.filledSlots)
        ? parsed.filledSlots.filter((item): item is string => typeof item === "string")
        : undefined,
    };
  } catch {
    return null;
  }
}

export function buildModelDiagnosisPrompt(
  query: string,
  role: string,
  history: DiagnosisHistoryMessage[] = [],
  fileContext = ""
): string {
  const categoryGuide = CATEGORY_DEFINITIONS.map((definition) => {
    const slotText = definition.slots?.map((slot) => slot.label).join(" / ") || "无固定槽位";
    const scopeText = definition.scopeOptions?.join(" / ") || "无";
    return `- ${definition.id} | ${definition.label} | 关键槽位：${slotText} | 常见细分场景：${scopeText}`;
  }).join("\n");

  const contextMessages = history
    .slice(-6)
    .map((item) => {
      const base = `${item.role === "user" ? "用户" : "助手"}：${item.content}`;
      if (item.role === "assistant" && item.questionDiagnosis) {
        const diagnosis = item.questionDiagnosis;
        return `${base}\n  [诊断：${diagnosis.categoryLabel} | ${diagnosis.mode} | 阶段=${diagnosis.clarificationStage || "none"} | 已收集=${(diagnosis.collectedSlots || []).join("/") || "无"} | 缺失=${diagnosis.missingSlots.join("/") || "无"}]`;
      }
      return base;
    })
    .join("\n");

  return [
    "你是公司内部业务助手的“问题诊断器”，只负责判断这一轮是先追问，还是可以直接回答。",
    "必须结合最近对话判断用户是不是在补上一轮信息，不能把每一句都当成全新问题。",
    "如果用户已经用“字段：内容”的方式补了信息，要优先相信这些结构化字段。",
    "如果当前会话已经挂着可用文档、图片或视频资料，必须把它们视为已提供上下文，不能再说“用户没有上传文档”或“未提供文档内容”。",
    "如果用户说“这个文档”“这份资料”“这个文件”，默认优先理解为在问当前会话里已激活的资料。",
    "如果用户问的是通用方法、框架、思路，不要强行卡在补信息，应该直接回答。",
    "如果用户问的是具体案例，但信息还不够，就进入 clarify。",
    "如果要 clarify：",
    "1. 还没缩小到具体场景时，用 clarificationStage=choose_scope，并给出 2-4 个 scopeOptions。",
    "2. 场景已经明确，但还差字段时，用 clarificationStage=fill_slots。",
    "3. clarificationReply 必须简洁，不能把上一轮同一段引导原样重复一遍。",
    "4. clarificationReply 只问还缺的内容，不要问已经给过的内容。",
    "如果已经足够回答，就用 mode=answer，clarificationReply 设为空字符串。",
    "",
    "你必须只输出一行 JSON，不要输出解释，不要输出 markdown。",
    'JSON 格式：{"categoryId":"","categoryLabel":"","mode":"clarify|answer","completenessScore":0,"missingSlots":[],"summary":"","clarificationStage":"choose_scope|fill_slots|null","scopeOptions":[],"selectedScope":"","collectedSlots":[],"clarificationReply":""}',
    "",
    `当前岗位：${role}`,
    "可选分类：",
    categoryGuide,
    "",
    "最近对话：",
    contextMessages || "无",
    "",
    "当前激活资料：",
    fileContext || "无",
    "",
    `当前用户输入：${query}`,
  ].join("\n");
}

export function parseModelDiagnosisResult(
  raw: string,
  query: string
): DiagnosisResult | null {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as ModelDiagnosisPayload;
    const definition =
      (typeof parsed.categoryId === "string" && CATEGORY_DEFINITIONS.find((item) => item.id === parsed.categoryId))
      || (typeof parsed.categoryLabel === "string" && CATEGORY_DEFINITIONS.find((item) => item.label === parsed.categoryLabel))
      || CATEGORY_DEFINITIONS.find((item) => item.id === "training")!;

    const mode: DiagnosisMode = parsed.mode === "answer" ? "answer" : "clarify";
    const rawMissingSlots = Array.isArray(parsed.missingSlots)
      ? parsed.missingSlots.filter((item): item is string => typeof item === "string")
      : [];
    const collectedSlots = Array.isArray(parsed.collectedSlots)
      ? parsed.collectedSlots.filter((item): item is string => typeof item === "string")
      : [];
    const completenessScore =
      typeof parsed.completenessScore === "number" && Number.isFinite(parsed.completenessScore)
        ? Math.max(0, Math.min(100, Math.round(parsed.completenessScore)))
        : mode === "answer"
          ? 100
          : calculateCompletenessFromFilled(definition.slots?.length || 0, collectedSlots.length);
    const clarificationStage =
      parsed.clarificationStage === "choose_scope" || parsed.clarificationStage === "fill_slots"
        ? parsed.clarificationStage
        : undefined;
    const scopeOptions = Array.isArray(parsed.scopeOptions)
      ? parsed.scopeOptions.filter((item): item is string => typeof item === "string")
      : undefined;
    const selectedScope = typeof parsed.selectedScope === "string" && parsed.selectedScope.trim()
      ? parsed.selectedScope.trim()
      : undefined;
    const missingSlots =
      mode === "answer"
        ? []
        : rawMissingSlots.length > 0
          ? rawMissingSlots
          : detectMissingSlots(normalizeQuery(query), definition);
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : buildSummary(definition, mode, mode === "answer" ? "framework" : "specific", selectedScope);

    const diagnosis: QuestionDiagnosis = {
      categoryId: definition.id,
      categoryLabel: definition.label,
      mode,
      completenessScore,
      missingSlots,
      summary,
      clarificationStage,
      scopeOptions: clarificationStage === "choose_scope" ? scopeOptions || definition.scopeOptions : scopeOptions,
      selectedScope,
      collectedSlots,
      diagnosisSource: "model",
    };

    const clarificationReply =
      mode === "clarify"
        ? (typeof parsed.clarificationReply === "string" && parsed.clarificationReply.trim()
          ? parsed.clarificationReply.trim()
          : buildClarificationReply(normalizeQuery(query), definition, diagnosis))
        : null;

    return {
      diagnosis,
      clarificationReply,
    };
  } catch {
    return null;
  }
}

export function applyDiagnosisReview(
  review: DiagnosisReview | null,
  latestClarification: QuestionDiagnosis | null,
  fallbackDiagnosis: QuestionDiagnosis,
  fallbackClarificationReply: string | null
): DiagnosisResult {
  if (!review || !latestClarification) {
    return {
      diagnosis: fallbackDiagnosis,
      clarificationReply: fallbackClarificationReply,
    };
  }

  const definition = getCategoryDefinitionById(latestClarification.categoryId);

  if (review.intent === "scope_choice") {
    const selectedScope =
      matchScopeChoice(review.selectedScope || "", latestClarification.scopeOptions)
      || matchScopeChoice(review.selectedScope || "", definition.scopeOptions);

    if (selectedScope) {
      const hybridResult = buildScopeSelectionDiagnosis(
        definition,
        selectedScope,
        latestClarification.collectedSlots || []
      );
      hybridResult.diagnosis.diagnosisSource = "hybrid";
      hybridResult.diagnosis.ruleConfidence = Math.max(hybridResult.diagnosis.ruleConfidence || 0, 0.9);
      hybridResult.diagnosis.scopeOptions = latestClarification.scopeOptions || definition.scopeOptions;
      return hybridResult;
    }
  }

  if (review.intent === "slot_fill") {
    const allSlots = definition.slots?.map((slot) => slot.label) || [];
    const collectedSlots = mergeCollectedSlots(
      latestClarification.collectedSlots || [],
      review.filledSlots || []
    );
    const remainingSlots = allSlots.filter((slot) => !collectedSlots.includes(slot));
    const selectedScope = latestClarification.selectedScope;

    if (remainingSlots.length === 0) {
      return {
        diagnosis: {
          categoryId: definition.id,
          categoryLabel: definition.label,
          mode: "answer",
          completenessScore: 100,
          missingSlots: [],
          summary: buildSummary(definition, "answer", "specific", selectedScope),
          clarificationStage: "fill_slots",
          selectedScope,
          collectedSlots,
          ruleConfidence: 0.9,
          diagnosisSource: "hybrid",
        },
        clarificationReply: null,
      };
    }

    const diagnosis: QuestionDiagnosis = {
      categoryId: definition.id,
      categoryLabel: definition.label,
      mode: "clarify",
      completenessScore: calculateCompletenessFromFilled(allSlots.length, collectedSlots.length),
      missingSlots: remainingSlots,
      summary: buildSummary(definition, "clarify", "specific", selectedScope),
      clarificationStage: "fill_slots",
      selectedScope,
      collectedSlots,
      ruleConfidence: 0.82,
      diagnosisSource: "hybrid",
    };

    return {
      diagnosis,
      clarificationReply: buildClarificationReply("", definition, diagnosis),
    };
  }

  return {
    diagnosis: fallbackDiagnosis,
    clarificationReply: fallbackClarificationReply,
  };
}

export function diagnoseQuestion(
  query: string,
  role: string,
  history: DiagnosisHistoryMessage[] = []
): DiagnosisResult {
  const normalizedQuery = normalizeQuery(query);
  const ranked = rankCategories(normalizedQuery, role);
  const definition =
    ranked[0]?.score > 0
      ? ranked[0].definition
      : CATEGORY_DEFINITIONS.find((item) => item.id === "training")!;
  const latestClarification = getLatestClarification(history);
  const matchedScope =
    latestClarification?.clarificationStage === "choose_scope"
      ? matchScopeChoice(normalizedQuery, latestClarification.scopeOptions)
      : null;

  if (latestClarification && matchedScope) {
    const previousDefinition = getCategoryDefinitionById(latestClarification.categoryId);
    const scopeFilledSlots = detectFilledSlots(normalizedQuery, previousDefinition);
    const scopeResult = buildScopeSelectionDiagnosis(
      previousDefinition,
      matchedScope,
      mergeCollectedSlots(latestClarification.collectedSlots || [], scopeFilledSlots)
    );
    scopeResult.diagnosis.scopeOptions = latestClarification.scopeOptions;
    return scopeResult;
  }

  if (latestClarification?.clarificationStage === "fill_slots") {
    const previousDefinition = getCategoryDefinitionById(latestClarification.categoryId);
    const filledSlots = detectFilledSlots(normalizedQuery, previousDefinition);
    const collectedSlots = mergeCollectedSlots(latestClarification.collectedSlots || [], filledSlots);

    if (filledSlots.length > 0) {
      const allSlots = previousDefinition.slots?.map((slot) => slot.label) || [];
      const remainingSlots = allSlots.filter((slot) => !collectedSlots.includes(slot));

      if (remainingSlots.length === 0) {
        return {
          diagnosis: {
            categoryId: previousDefinition.id,
            categoryLabel: previousDefinition.label,
            mode: "answer",
            completenessScore: 100,
            missingSlots: [],
            summary: buildSummary(previousDefinition, "answer", "specific", latestClarification.selectedScope),
            clarificationStage: "fill_slots",
            selectedScope: latestClarification.selectedScope,
            collectedSlots,
            ruleConfidence: 0.88,
            diagnosisSource: "rule",
          },
          clarificationReply: null,
        };
      }

      const fillDiagnosis: QuestionDiagnosis = {
        categoryId: previousDefinition.id,
        categoryLabel: previousDefinition.label,
        mode: "clarify",
        completenessScore: calculateCompletenessFromFilled(allSlots.length, collectedSlots.length),
        missingSlots: remainingSlots,
        summary: buildSummary(previousDefinition, "clarify", "specific", latestClarification.selectedScope),
        clarificationStage: "fill_slots",
        selectedScope: latestClarification.selectedScope,
        collectedSlots,
        ruleConfidence: 0.84,
        diagnosisSource: "rule",
      };

      return {
        diagnosis: fillDiagnosis,
        clarificationReply: buildClarificationReply(normalizedQuery, previousDefinition, fillDiagnosis),
      };
    }
  }

  const intent = detectIntent(normalizedQuery);
  const rawMissingSlots = detectMissingSlots(normalizedQuery, definition);
  const missingSlots = intent === "framework" ? [] : rawMissingSlots;
  const completenessScore = calculateCompleteness(
    definition.slots?.length || 0,
    missingSlots,
    intent
  );
  const mode: DiagnosisMode = shouldClarify(definition, intent, completenessScore, missingSlots)
    ? "clarify"
    : "answer";
  const ruleConfidence = calculateRuleConfidence(ranked);
  const collectedSlots = mode === "clarify" ? detectFilledSlots(normalizedQuery, definition) : [];
  const clarificationStage =
    mode === "clarify" && shouldNarrowScope(normalizedQuery, definition, {
      categoryId: definition.id,
      categoryLabel: definition.label,
      mode,
      completenessScore,
      missingSlots,
      summary: "",
      collectedSlots,
    })
      ? "choose_scope"
      : mode === "clarify"
        ? "fill_slots"
        : undefined;

  const diagnosis: QuestionDiagnosis = {
    categoryId: definition.id,
    categoryLabel: definition.label,
    mode,
    completenessScore,
    missingSlots,
    summary: buildSummary(definition, mode, intent),
    clarificationStage,
    scopeOptions: clarificationStage === "choose_scope" ? definition.scopeOptions : undefined,
    collectedSlots,
    ruleConfidence,
    diagnosisSource: "rule",
  };

  const clarificationReply = mode === "clarify"
    ? buildClarificationReply(normalizedQuery, definition, diagnosis)
    : null;

  return {
    diagnosis,
    clarificationReply,
    modelReviewPrompt: shouldRequestModelReview(normalizedQuery, latestClarification, ruleConfidence, diagnosis)
      ? buildModelReviewPrompt(query, role, history, diagnosis, latestClarification!)
      : null,
  };
}
