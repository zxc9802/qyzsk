import type { QuestionDiagnosis } from "@/lib/types";

export type QueryRewriteType = "direct" | "context_dependent" | "comparison" | "multi_intent" | "vague";

export type QueryRewriteHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type QueryRewriteResult = {
  queryType: QueryRewriteType;
  shouldRewrite: boolean;
  standaloneQuery: string;
  vectorQuery: string;
  keywordTerms: string[];
  confidence: number;
};

const CONTEXT_DEPENDENT_HINTS = [
  "这个",
  "那个",
  "这个怎么",
  "那这个",
  "这里",
  "上面",
  "下面",
  "刚才",
  "继续",
  "然后",
  "这样",
  "这种",
  "详细说",
  "展开",
];

const COMPARISON_HINTS = ["哪个", "哪一个", "比较", "更好", "哪个更", "区别", "对比", "差异"];
const VAGUE_HINTS = ["怎么办", "怎么弄", "咋办", "咋弄", "怎么搞", "不太行", "没效果"];

const DOMAIN_EXPANSIONS: Array<{ triggers: string[]; terms: string[] }> = [
  {
    triggers: ["不出单", "出单", "转化低", "成交低", "没人买", "下单少"],
    terms: ["运营漏斗", "转化", "点击", "商品卡", "详情页"],
  },
  {
    triggers: ["商品卡", "详情页", "货架"],
    terms: ["商品卡", "详情页", "点击", "转化", "店铺承接"],
  },
  {
    triggers: ["直播", "直播间", "主播", "话术"],
    terms: ["直播成交", "话术", "人货场", "转化"],
  },
  {
    triggers: ["达人", "建联", "合作", "bd"],
    terms: ["达人建联", "达人合作", "复盘", "筛选"],
  },
  {
    triggers: ["短视频", "脚本", "素材", "放量", "钩子"],
    terms: ["短视频内容测试", "脚本", "放量", "钩子"],
  },
  {
    triggers: ["防晒", "油腻", "复购", "肤感"],
    terms: ["防晒项目", "用户异议", "复购", "肤感"],
  },
  {
    triggers: ["新人", "新员工", "问ai", "问 ai", "提问"],
    terms: ["新员工提问", "补充业务上下文", "提问原则"],
  },
  {
    triggers: ["项目", "优先级", "投入", "资源", "取舍"],
    terms: ["项目分级", "资源聚焦", "超级产品"],
  },
];

function normalizeQuery(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeQuery(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function getRecentUserContext(history?: QueryRewriteHistoryMessage[]) {
  return (history || [])
    .filter((item) => item.role === "user")
    .map((item) => item.content.trim())
    .filter(Boolean)
    .slice(-2);
}

function detectQueryType(query: string): QueryRewriteType {
  const normalized = normalizeQuery(query);
  if (!normalized) return "vague";

  if (COMPARISON_HINTS.some((hint) => normalized.includes(normalizeQuery(hint)))) {
    return "comparison";
  }

  const separators = normalized.match(/[、，,；;？?]/g) || [];
  if (separators.length >= 2 || normalized.includes("分别")) {
    return "multi_intent";
  }

  if (CONTEXT_DEPENDENT_HINTS.some((hint) => normalized.includes(normalizeQuery(hint)))) {
    return "context_dependent";
  }

  if (VAGUE_HINTS.some((hint) => normalized.includes(normalizeQuery(hint)))) {
    return "vague";
  }

  return "direct";
}

function buildKeywordTerms(query: string, diagnosis?: QuestionDiagnosis) {
  const normalized = normalizeQuery(query);
  const terms: string[] = [];

  for (const rule of DOMAIN_EXPANSIONS) {
    if (rule.triggers.some((trigger) => normalized.includes(normalizeQuery(trigger)))) {
      terms.push(...rule.terms);
    }
  }

  if (diagnosis?.categoryLabel) terms.push(diagnosis.categoryLabel);
  if (diagnosis?.selectedScope) terms.push(diagnosis.selectedScope);
  diagnosis?.scopeOptions?.forEach((option) => terms.push(option));

  return uniqueStrings(terms).slice(0, 12);
}

function buildStandaloneQuery(query: string, queryType: QueryRewriteType, history?: QueryRewriteHistoryMessage[]) {
  const currentQuery = query.trim();
  if (queryType !== "context_dependent" && queryType !== "vague") {
    return currentQuery;
  }

  const recentUserContext = getRecentUserContext(history);
  if (recentUserContext.length === 0) {
    return currentQuery;
  }

  return `${recentUserContext.join("\n")}\n${currentQuery}`;
}

function buildVectorQuery(options: {
  standaloneQuery: string;
  queryType: QueryRewriteType;
  keywordTerms: string[];
  diagnosis?: QuestionDiagnosis;
}) {
  const hints: string[] = [];

  if (options.queryType === "comparison") hints.push("对比判断");
  if (options.queryType === "multi_intent") hints.push("分别拆解多个问题");
  if (options.diagnosis?.selectedScope) hints.push(options.diagnosis.selectedScope);
  hints.push(...options.keywordTerms);

  return uniqueStrings([options.standaloneQuery, ...hints]).join("\n");
}

function buildConfidence(queryType: QueryRewriteType, hasHistory: boolean, keywordCount: number) {
  if (queryType === "direct") return 0.9;
  if (queryType === "context_dependent") return hasHistory ? 0.78 : 0.52;
  if (queryType === "vague") return hasHistory || keywordCount > 0 ? 0.64 : 0.45;
  if (queryType === "comparison") return 0.82;
  return 0.76;
}

export function buildQueryRewrite(options: {
  query: string;
  role: string;
  history?: QueryRewriteHistoryMessage[];
  diagnosis?: QuestionDiagnosis;
}): QueryRewriteResult {
  const currentQuery = options.query.trim();
  const queryType = detectQueryType(currentQuery);
  const recentUserContext = getRecentUserContext(options.history);
  const standaloneQuery = buildStandaloneQuery(currentQuery, queryType, options.history);
  const keywordTerms = queryType === "direct" ? [] : buildKeywordTerms(standaloneQuery, options.diagnosis);
  const shouldRewrite = queryType !== "direct";
  const vectorQuery = shouldRewrite
    ? buildVectorQuery({
        standaloneQuery,
        queryType,
        keywordTerms,
        diagnosis: options.diagnosis,
      })
    : currentQuery;

  return {
    queryType,
    shouldRewrite,
    standaloneQuery,
    vectorQuery,
    keywordTerms,
    confidence: buildConfidence(queryType, recentUserContext.length > 0, keywordTerms.length),
  };
}
