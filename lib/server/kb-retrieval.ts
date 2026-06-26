import fs from "fs";
import path from "path";
import type { KnowledgeBaseHit } from "@/lib/types";

export type KnowledgeBaseEntry = {
  id: string;
  title: string;
  category: string;
  roles: string[];
  triggerQuestions: string[];
  standardAnswer: string;
  framework: string;
  nextActions: string;
  relatedTerms: string[];
};

type QuerySignals = {
  normalizedQuery: string;
  phrases: string[];
  looseTerms: string[];
};

const MAX_KB_CONTEXT_CHARS = 12000;
const MIN_SELECTED_ENTRIES = 3;
const MAX_SELECTED_ENTRIES = 6;
const ABSOLUTE_MIN_SCORE = 20;
const HAN_SEGMENT_PATTERN = /[\u4e00-\u9fff]{2,}/gu;
const HAN_CHAR_PATTERN = /[\u4e00-\u9fff]/u;
const STOP_TERMS = new Set([
  "什么",
  "怎么",
  "怎么办",
  "为什么",
  "是否",
  "是不是",
  "怎么做",
  "如何",
  "一个",
  "一下",
  "现在",
  "最近",
  "这个",
  "那个",
  "我们",
  "你们",
  "公司",
  "问题",
]);
const QUERY_EXPANSIONS: Array<[string, string[]]> = [
  ["不出单", ["转化", "成交", "下单", "漏斗"]],
  ["没单", ["不出单", "转化", "成交"]],
  ["卖不动", ["转化", "成交", "购买动机"]],
  ["流量起不来", ["冷启动", "曝光", "点击"]],
  ["冷启动", ["起号", "流量起不来", "验证"]],
  ["起号", ["冷启动", "验证", "流量起不来"]],
  ["店铺", ["运营", "转化", "履约"]],
  ["排查", ["诊断", "漏斗", "归因"]],
  ["达人合作", ["达人建联", "合作效率", "协同"]],
  ["推进不下去", ["效率", "推进", "协同"]],
  ["产品值不值得做", ["需求", "购买动机", "渠道适配", "超级产品"]],
  ["值不值得做", ["需求", "购买动机", "渠道适配"]],
];
const ROLE_LABELS: Record<string, string[]> = {
  product: ["产品岗", "产品负责人"],
  video: ["视频岗", "内容岗"],
  operation: ["运营岗"],
  bd: ["BD岗", "达人岗", "流量岗"],
  live: ["直播岗", "主播"],
  management: ["管理层", "管理者"],
  tech: ["技术岗"],
  new: ["全员", "新员工"],
};

let kbCache: KnowledgeBaseEntry[] | null = null;
let kbDictionaryCache: string[] | null = null;

export function getKnowledgeBaseEntries(): KnowledgeBaseEntry[] {
  if (kbCache) return kbCache;

  const kbPath = path.join(process.cwd(), "lib", "kb-content.txt");
  const raw = fs.readFileSync(kbPath, "utf8");
  kbCache = parseKnowledgeBaseEntries(raw);
  kbDictionaryCache = buildKnowledgeBaseDictionary(kbCache);
  return kbCache;
}

function getKnowledgeBaseDictionary(): string[] {
  if (kbDictionaryCache) return kbDictionaryCache;

  getKnowledgeBaseEntries();
  return kbDictionaryCache || [];
}

function parseKnowledgeBaseEntries(raw: string): KnowledgeBaseEntry[] {
  const headingPattern = /^(?:<a [^>]+><\/a>)?###\s*(KB\d{3})｜(.+)$/gm;
  const matches = [...raw.matchAll(headingPattern)];

  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index || raw.length : raw.length;
    const block = raw.slice(start, end);
    const fields = parseEntryFields(block);

    return {
      id: match[1].trim(),
      title: cleanValue(match[2]),
      category: cleanValue(fields.category || ""),
      roles: splitValue(fields.roles),
      triggerQuestions: splitValue(fields.trigger_questions),
      standardAnswer: cleanValue(fields.standard_answer || ""),
      framework: cleanValue(fields.framework || ""),
      nextActions: cleanValue(fields.next_actions || ""),
      relatedTerms: splitValue(fields.related_terms),
    };
  });
}

function parseEntryFields(block: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("- ")) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line
      .slice(2, colonIndex)
      .trim()
      .replace(/\\/g, "")
      .toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    result[key] = value;
  }

  return result;
}

function cleanValue(value: string): string {
  return value
    .replace(/\\([_+])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitValue(value?: string): string[] {
  if (!value) return [];

  return cleanValue(value)
    .split(/\s*\/\s*|\s*,\s*|\s*，\s*|\s*、\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildKnowledgeBaseDictionary(entries: KnowledgeBaseEntry[]): string[] {
  const dictionary = new Set<string>();

  for (const entry of entries) {
    addMeaningfulTerms(dictionary, entry.title);
    addMeaningfulTerms(dictionary, entry.category);
    entry.relatedTerms.forEach((term) => addMeaningfulTerms(dictionary, term));
    entry.triggerQuestions.forEach((question) => addMeaningfulTerms(dictionary, question));
  }

  return Array.from(dictionary).sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function addMeaningfulTerms(target: Set<string>, value: string): void {
  extractMeaningfulTerms(value).forEach((term) => target.add(term));
}

function extractMeaningfulTerms(value: string): string[] {
  const normalizedValue = stripStopTerms(normalize(value));
  const termSet = new Set<string>();

  normalizedValue
    .split(/[^\p{L}\p{N}\u4e00-\u9fff]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !STOP_TERMS.has(part))
    .forEach((part) => {
      if (HAN_CHAR_PATTERN.test(part)) {
        collectHanTerms(part).forEach((term) => termSet.add(term));
        return;
      }

      termSet.add(part);
    });

  return Array.from(termSet);
}

function collectHanTerms(value: string): string[] {
  const termSet = new Set<string>();
  const matches = value.match(HAN_SEGMENT_PATTERN) || [];

  matches.forEach((part) => {
    if (part.length <= 4 && !STOP_TERMS.has(part)) {
      termSet.add(part);
    }

    const maxLength = Math.min(4, part.length);
    for (let length = maxLength; length >= 2; length -= 1) {
      for (let index = 0; index <= part.length - length; index += 1) {
        const candidate = part.slice(index, index + length);
        if (!STOP_TERMS.has(candidate)) {
          termSet.add(candidate);
        }
      }
    }
  });

  return Array.from(termSet);
}

function stripStopTerms(value: string): string {
  let stripped = value;

  for (const stopTerm of STOP_TERMS) {
    stripped = stripped.replaceAll(stopTerm, " ");
  }

  return stripped;
}

function matchDictionaryTerms(value: string, dictionary: readonly string[]): string[] {
  const normalizedValue = stripStopTerms(normalize(value));
  if (!normalizedValue) return [];

  return dictionary.filter((term) => normalizedValue.includes(term));
}

function extractTriggerKeywords(value: string, dictionary: readonly string[]): string[] {
  const keywordSet = new Set<string>();

  matchDictionaryTerms(value, dictionary).forEach((keyword) => keywordSet.add(keyword));
  extractMeaningfulTerms(value).forEach((keyword) => keywordSet.add(keyword));

  return Array.from(keywordSet);
}

export function buildKnowledgeBaseQuerySignals(query: string): QuerySignals {
  const normalizedQuery = normalize(query);
  const phraseSet = new Set<string>();
  const looseTermSet = new Set<string>();
  const dictionary = getKnowledgeBaseDictionary();

  normalizedQuery
    .split(/[^\p{L}\p{N}\u4e00-\u9fff]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !STOP_TERMS.has(part))
    .forEach((part) => {
      phraseSet.add(part);
      if (part.length <= 4) {
        looseTermSet.add(part);
      }
    });

  const hanMatches = normalizedQuery.match(HAN_SEGMENT_PATTERN) || [];
  hanMatches.forEach((part) => {
    if (!STOP_TERMS.has(part)) {
      phraseSet.add(part);
    }

    matchDictionaryTerms(part, dictionary).forEach((term) => {
      phraseSet.add(term);
    });

    if (part.length >= 4) {
      for (let index = 0; index <= part.length - 3; index += 1) {
        const triGram = part.slice(index, index + 3);
        if (!STOP_TERMS.has(triGram)) {
          looseTermSet.add(triGram);
        }
      }
    }
  });

  for (const [trigger, expansions] of QUERY_EXPANSIONS) {
    if (!normalizedQuery.includes(trigger)) continue;

    expansions.forEach((item) => {
      phraseSet.add(item);
      if (item.length <= 4) {
        looseTermSet.add(item);
      }
    });
  }

  return {
    normalizedQuery,
    phrases: Array.from(phraseSet),
    looseTerms: Array.from(looseTermSet),
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreTriggerMatch(normalizedQuery: string, triggerQuestions: string[], queryPhrases: string[]): number {
  if (!normalizedQuery || triggerQuestions.length === 0) return 0;

  const dictionary = getKnowledgeBaseDictionary();
  let bestScore = 0;

  for (const trigger of triggerQuestions) {
    if (trigger.includes(normalizedQuery) || normalizedQuery.includes(trigger)) {
      return 80;
    }

    const triggerKeywords = extractTriggerKeywords(trigger, dictionary);
    if (triggerKeywords.length === 0) continue;

    const matchedCount = triggerKeywords.filter(
      (keyword) =>
        normalizedQuery.includes(keyword) ||
        queryPhrases.some((phrase) => phrase.includes(keyword) || keyword.includes(phrase))
    ).length;

    const coverage = matchedCount / triggerKeywords.length;
    if (coverage >= 0.8) {
      bestScore = Math.max(bestScore, 60);
    } else if (coverage >= 0.5) {
      bestScore = Math.max(bestScore, 35);
    } else if (coverage >= 0.3) {
      bestScore = Math.max(bestScore, 15);
    }
  }

  return bestScore;
}

function scoreEntry(entry: KnowledgeBaseEntry, signals: QuerySignals, role: string): number {
  const title = normalize(entry.title);
  const category = normalize(entry.category);
  const standardAnswer = normalize(entry.standardAnswer);
  const framework = normalize(entry.framework);
  const nextActions = normalize(entry.nextActions);
  const triggerQuestions = entry.triggerQuestions.map(normalize);
  const relatedTerms = entry.relatedTerms.map(normalize);

  let score = 0;

  for (const phrase of signals.phrases) {
    if (title.includes(phrase)) score += 48;
    if (category.includes(phrase)) score += 18;
    if (triggerQuestions.some((item) => item.includes(phrase))) score += 42;
    if (relatedTerms.some((item) => item.includes(phrase))) score += 36;
    if (standardAnswer.includes(phrase)) score += 16;
    if (framework.includes(phrase)) score += 14;
    if (nextActions.includes(phrase)) score += 12;
  }

  for (const term of signals.looseTerms) {
    if (title.includes(term)) score += 12;
    if (triggerQuestions.some((item) => item.includes(term))) score += 10;
    if (relatedTerms.some((item) => item.includes(term))) score += 10;
    if (standardAnswer.includes(term)) score += 4;
    if (framework.includes(term)) score += 4;
  }

  score += scoreTriggerMatch(signals.normalizedQuery, triggerQuestions, signals.phrases);

  const roleLabels = ROLE_LABELS[role] || [];
  if (entry.roles.includes("全员")) {
    score += 8;
  }
  if (roleLabels.some((label) => entry.roles.includes(label))) {
    score += 14;
  }

  return score;
}

export function selectKnowledgeBaseEntries(
  entries: KnowledgeBaseEntry[],
  signals: QuerySignals,
  role: string
): KnowledgeBaseEntry[] {
  const ranked = entries
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, signals, role),
    }))
    .filter((item) => item.score >= ABSOLUTE_MIN_SCORE)
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) return [];

  const topScore = ranked[0].score;
  const threshold = Math.max(24, Math.floor(topScore * 0.34));
  const selected: KnowledgeBaseEntry[] = [];

  for (const item of ranked) {
    if (selected.length >= MAX_SELECTED_ENTRIES) break;
    if (selected.length >= MIN_SELECTED_ENTRIES && item.score < threshold) break;

    selected.push(item.entry);
  }

  return selected;
}

function buildEntryBlock(entry: KnowledgeBaseEntry): string {
  const lines = [
    `条目：${entry.id}｜${entry.title}`,
    `分类：${entry.category || "未分类"}`,
  ];

  if (entry.roles.length > 0) {
    lines.push(`适用岗位：${entry.roles.join("、")}`);
  }

  if (entry.relatedTerms.length > 0) {
    lines.push(`相关词：${entry.relatedTerms.join("、")}`);
  }

  lines.push(`标准回答：${entry.standardAnswer}`);

  if (entry.framework) {
    lines.push(`方法框架：${entry.framework}`);
  }

  if (entry.nextActions) {
    lines.push(`下一步动作：${entry.nextActions}`);
  }

  return lines.join("\n");
}

export function toKnowledgeBaseHit(entry: KnowledgeBaseEntry): KnowledgeBaseHit {
  return {
    id: entry.id,
    title: entry.title,
    category: entry.category || "未分类",
  };
}

export function buildKnowledgeBaseContextFromEntries(entries: KnowledgeBaseEntry[]): string {
  if (entries.length === 0) {
    return "";
  }

  const blocks: string[] = [];
  let remainingBudget = MAX_KB_CONTEXT_CHARS;

  for (const entry of entries) {
    const block = buildEntryBlock(entry);
    if (block.length > remainingBudget && blocks.length > 0) break;
    blocks.push(block);
    remainingBudget -= block.length;
  }

  if (blocks.length === 0) {
    return "";
  }

  return [
    "以下是从公司知识库中检索出的高相关条目。请优先依据这些条目回答。",
    "如果这些条目不足以直接支持结论，请明确说明信息还不够，不要编造公司规则。",
    "不要把 KB 编号、条目 ID 或内部标签原样展示给用户。",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}

export function getKnowledgeBaseEntriesByIds(ids: string[]): KnowledgeBaseEntry[] {
  if (ids.length === 0) return [];

  const idSet = new Set(ids);
  return getKnowledgeBaseEntries().filter((entry) => idSet.has(entry.id));
}

export function buildKnowledgeBaseRetrieval(query: string, role: string): {
  context: string;
  hits: KnowledgeBaseHit[];
} {
  const signals = buildKnowledgeBaseQuerySignals(query);
  const selectedEntries = selectKnowledgeBaseEntries(getKnowledgeBaseEntries(), signals, role);

  if (selectedEntries.length === 0) {
    return {
      context: "",
      hits: [],
    };
  }

  const blocks: string[] = [];
  let remainingBudget = MAX_KB_CONTEXT_CHARS;
  const includedHits: KnowledgeBaseHit[] = [];

  for (const entry of selectedEntries) {
    const block = buildEntryBlock(entry);
    if (block.length > remainingBudget && blocks.length > 0) break;
    blocks.push(block);
    remainingBudget -= block.length;
    includedHits.push(toKnowledgeBaseHit(entry));
  }

  if (blocks.length === 0) {
    return {
      context: "",
      hits: [],
    };
  }

  return {
    context: buildKnowledgeBaseContextFromEntries(selectedEntries),
    hits: includedHits,
  };
}

export function buildKnowledgeBaseContext(query: string, role: string): string {
  return buildKnowledgeBaseRetrieval(query, role).context;
}

export function selectKnowledgeBaseEntriesByQuery(query: string, role: string): KnowledgeBaseEntry[] {
  return selectKnowledgeBaseEntries(getKnowledgeBaseEntries(), buildKnowledgeBaseQuerySignals(query), role);
}
