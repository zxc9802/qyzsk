import type { QuestionDiagnosis, RetrievalSourceHit } from "@/lib/types";

export type SearchIntentType = "internal_only" | "external_public_fact" | "mixed";
export type LocalHitStrength = "strong" | "weak";

export interface WebSearchPolicyDecision {
  searchIntentType: SearchIntentType;
  localHitStrength: LocalHitStrength;
  explicitWebRequest: boolean;
  shouldAutoSearchWeb: boolean;
  shouldBypassClarification: boolean;
  shouldDownweightLocalKnowledge: boolean;
  coreEntityTerms: string[];
}

const INTERNAL_DIAGNOSIS_CATEGORY_IDS = new Set([
  "strategy",
  "product",
  "content",
  "operation",
  "traffic",
  "live",
  "review",
  "management",
]);

const GENERIC_HIT_PATTERNS = [
  /ai智能体/u,
  /知识库/u,
  /设计原则/u,
  /方法论/u,
  /分类回答/u,
  /员工问ai/u,
  /内部智能体/u,
];

const ENGLISH_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "what",
  "when",
  "where",
  "which",
  "how",
  "today",
  "latest",
  "recent",
  "official",
  "open",
  "login",
  "sign",
  "into",
  "from",
  "that",
  "this",
  "your",
  "their",
  "there",
  "price",
  "pricing",
  "policy",
  "rules",
  "docs",
  "document",
  "documentation",
  "guide",
  "backend",
]);

const EXPLICIT_WEB_PATTERNS = [
  /去网上搜/u,
  /联网搜/u,
  /联网查/u,
  /帮我搜/u,
  /帮我查官网/u,
  /查官网/u,
  /查最新/u,
  /搜一下官网/u,
  /官网查一下/u,
];

const ENTRANCE_PATTERNS = [
  /(后台|入口|官网|控制台|地址|网址|文档|登录).*(在哪|在哪里|怎么进|怎么登录|怎么打开|入口|网址|地址)/iu,
  /(在哪|在哪里|怎么进|怎么登录|怎么打开).*(后台|入口|官网|控制台|文档)/iu,
  /(seller center|business center|ads manager|console|dashboard|admin)/iu,
];

const PRICING_PATTERNS = [
  /(价格|费率|定价|报价|收费|多少钱|套餐|额度)/iu,
  /(input price|output price|cached input|pricing)/iu,
];

const POLICY_PATTERNS = [
  /(政策|规则|限制|提审|审核要求|资质|公告|版本|更新|变更)/iu,
  /(today|latest|recent|release note|changelog)/iu,
];

const DOC_CAPABILITY_PATTERNS = [
  /(官方文档|api文档|文档地址|能力|支持什么|有什么能力|功能列表|官方说明)/iu,
];

const INTERNAL_ONLY_PATTERNS = [
  /公司/u,
  /内部/u,
  /审批/u,
  /流程/u,
  /sop/iu,
  /权限/u,
  /口径/u,
  /带教/u,
  /组织/u,
  /制度/u,
  /规范/u,
];

function normalizeCompact(value: string): string {
  return value.toLowerCase().replace(/[\s\u3000:：,，。！？!?.、/()（）\-_]/g, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function detectExplicitWebRequest(query: string): boolean {
  return matchesAny(query, EXPLICIT_WEB_PATTERNS);
}

function hasExternalPublicSignal(query: string): boolean {
  return matchesAny(query, [...ENTRANCE_PATTERNS, ...PRICING_PATTERNS, ...POLICY_PATTERNS, ...DOC_CAPABILITY_PATTERNS]);
}

function hasInternalOnlySignal(query: string): boolean {
  return matchesAny(query, INTERNAL_ONLY_PATTERNS);
}

function inferIntentFromDiagnosis(diagnosis?: QuestionDiagnosis): SearchIntentType {
  if (!diagnosis?.categoryId) return "mixed";
  if (INTERNAL_DIAGNOSIS_CATEGORY_IDS.has(diagnosis.categoryId)) return "internal_only";
  return "mixed";
}

function classifySearchIntent(query: string, diagnosis?: QuestionDiagnosis): SearchIntentType {
  const explicitWebRequest = detectExplicitWebRequest(query);
  const externalPublicSignal = hasExternalPublicSignal(query);
  const internalOnlySignal = hasInternalOnlySignal(query);
  const diagnosisIntent = inferIntentFromDiagnosis(diagnosis);

  if (externalPublicSignal && (internalOnlySignal || diagnosisIntent === "internal_only")) {
    return "mixed";
  }

  if (externalPublicSignal) {
    return "external_public_fact";
  }

  if (explicitWebRequest && diagnosisIntent !== "internal_only") {
    return "mixed";
  }

  if (internalOnlySignal || diagnosisIntent === "internal_only") {
    return "internal_only";
  }

  return "mixed";
}

function extractQuotedTerms(query: string): string[] {
  return Array.from(query.matchAll(/[“"'`【](.{2,40}?)[”"'`】]/gu))
    .map((match) => match[1]?.trim() || "")
    .filter(Boolean);
}

function extractEnglishTerms(query: string): string[] {
  return Array.from(query.matchAll(/\b[a-z][a-z0-9.-]{1,}\b/giu))
    .map((match) => match[0]?.trim().toLowerCase() || "")
    .filter((token) => token && !ENGLISH_STOPWORDS.has(token));
}

function extractChineseEntityTerms(query: string): string[] {
  return Array.from(
    query.matchAll(
      /[\u4e00-\u9fa5A-Za-z0-9.\- ]{2,28}(?:后台|入口|官网|控制台|文档|模型|价格|费率|政策|规则|公告|版本|资质|限制|套餐|额度)/gu
    )
  )
    .map((match) => match[0]?.trim() || "")
    .filter((term) => term.length > 2);
}

export function extractCoreEntityTerms(query: string): string[] {
  const quotedTerms = extractQuotedTerms(query);
  const englishTerms = extractEnglishTerms(query);
  const chineseTerms = extractChineseEntityTerms(query);

  return uniqueStrings([...quotedTerms, ...englishTerms, ...chineseTerms])
    .filter((term) => term.length >= 2)
    .sort((left, right) => right.length - left.length)
    .slice(0, 8);
}

function isGenericLocalHit(hit: RetrievalSourceHit): boolean {
  const text = [hit.title, hit.detail, hit.excerpt, hit.category].filter(Boolean).join(" ");
  return GENERIC_HIT_PATTERNS.some((pattern) => pattern.test(text));
}

function hasEntityMatch(hit: RetrievalSourceHit, normalizedTerms: string[]): boolean {
  if (normalizedTerms.length === 0) return false;

  const haystack = normalizeCompact([hit.title, hit.detail, hit.excerpt, hit.category].filter(Boolean).join(" "));
  return normalizedTerms.some((term) => haystack.includes(term));
}

function inferLocalHitStrength(
  query: string,
  sourceHits: RetrievalSourceHit[],
  searchIntentType: SearchIntentType
): LocalHitStrength {
  const localHits = sourceHits.filter((hit) => hit.type !== "web");
  if (localHits.length === 0) return "weak";

  const normalizedEntityTerms = extractCoreEntityTerms(query)
    .map((term) => normalizeCompact(term))
    .filter((term) => term.length >= 2);

  if (normalizedEntityTerms.some((term) => localHits.some((hit) => hasEntityMatch(hit, [term])))) {
    return "strong";
  }

  if (localHits.every((hit) => isGenericLocalHit(hit))) {
    return "weak";
  }

  if (searchIntentType === "external_public_fact") {
    return "weak";
  }

  return normalizedEntityTerms.length > 0 ? "weak" : "strong";
}

export function buildWebSearchPolicyDecision(options: {
  query: string;
  diagnosis?: QuestionDiagnosis;
  sourceHits: RetrievalSourceHit[];
  webSearchEnabled: boolean;
  canUseReliableWebSearch: boolean;
}): WebSearchPolicyDecision {
  const explicitWebRequest = detectExplicitWebRequest(options.query);
  const searchIntentType = classifySearchIntent(options.query, options.diagnosis);
  const localHitStrength = inferLocalHitStrength(options.query, options.sourceHits, searchIntentType);
  const coreEntityTerms = extractCoreEntityTerms(options.query);
  const shouldAutoSearchWeb =
    options.webSearchEnabled
    && options.canUseReliableWebSearch
    && searchIntentType !== "internal_only"
    && (
      explicitWebRequest
      || searchIntentType === "external_public_fact"
      || (searchIntentType === "mixed" && localHitStrength === "weak")
    );

  return {
    searchIntentType,
    localHitStrength,
    explicitWebRequest,
    shouldAutoSearchWeb,
    shouldBypassClarification: shouldAutoSearchWeb,
    shouldDownweightLocalKnowledge: shouldAutoSearchWeb && localHitStrength === "weak",
    coreEntityTerms,
  };
}

export function buildWebSearchInstruction(options: {
  policy: WebSearchPolicyDecision;
  clarificationReply?: string;
}): string {
  const lines = [
    "## 联网搜索裁决规则",
    `当前搜索意图：${options.policy.searchIntentType}`,
    `当前本地命中强度：${options.policy.localHitStrength}`,
  ];

  if (options.policy.searchIntentType === "external_public_fact") {
    lines.push("这是外部公开事实类问题。平台入口、公开价格、公开政策、官网文档等信息，以网页官方当前结果为准。");
  }

  if (options.policy.searchIntentType === "mixed") {
    lines.push("这是混合问题。公司内部流程、SOP、权限规则以内网资料为准；外部公开事实可以用联网结果补充。");
  }

  if (options.policy.shouldDownweightLocalKnowledge) {
    lines.push("当前内网命中偏弱或不直接相关，不要把泛化方法论或无关条目当成直接结论依据。");
  }

  lines.push("如果内网资料与联网官方结果冲突，且冲突点属于平台入口、公开价格、公开政策或官网文档，请明确提示“内网资料可能已过期，以下以官网当前信息为准”。");

  if (options.clarificationReply && options.policy.shouldBypassClarification) {
    lines.push("当前问题仍有歧义，但可以先通过联网结果缩小范围。请先给出 2-3 个最可能候选项，每项附官网入口或官方文档；最后只追问一句确认。不要只回复“信息不足”。");
  }

  return lines.join("\n");
}
