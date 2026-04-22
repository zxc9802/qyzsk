import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildSeeAlsoRelations } from "../../lib/wiki-relations";
import {
  ensureWikiWorkspace,
  findWikiDraftByPageId,
  findWikiSourceRecordByTitle,
  generateWikiId,
  listPublishedPages,
  upsertWikiDraftByPageId,
  upsertWikiSourceRecordByTitle,
} from "../../lib/server/wiki-store";
import type { WikiCategory, WikiDraftStatus } from "../../lib/wiki-types";
import type { WikiRelation } from "../../lib/wiki-types";

const execFileAsync = promisify(execFile);

type SourceKey = "v1" | "v2";
type ImportAction = "create" | "update";

type DocumentConfig = {
  key: SourceKey;
  title: string;
  filePath: string;
};

type KBEntry = {
  id: string;
  title: string;
  category: string;
  roles: string[];
  triggerQuestions: string[];
  standardAnswer: string;
  framework: string;
  nextActions: string;
  relatedTerms: string[];
  sourceKey: SourceKey;
};

type PageDefinition = {
  title: string;
  category: WikiCategory;
  sourceKey: SourceKey;
  summary: string;
  sourceIds: string[];
  relatedTitles: string[];
  contentMode?: "default" | "faq";
};

type PendingSource = {
  key: SourceKey;
  title: string;
  action: ImportAction;
  content: string;
  sourceId: string;
};

type PendingDraft = {
  title: string;
  pageId: string;
  action: ImportAction;
  sourceKey: SourceKey;
  summary: string;
  sourceIds: string[];
  relatedPages: string[];
  relations: WikiRelation[];
  roles: string[];
  content: string;
};

const DOCUMENTS: DocumentConfig[] = [
  {
    key: "v1",
    title: "企业内部AI智能体交付包 v1",
    filePath: "/Users/a123/Downloads/企业内部ai智能体交付包 V1.docx",
  },
  {
    key: "v2",
    title: "知识库标准条目200条 v2｜专项深化版",
    filePath: "/Users/a123/Downloads/知识库标准条目200条 V2 专项深化版.docx",
  },
];

const PAGE_DEFINITIONS: PageDefinition[] = [
  {
    title: "超级产品方法论",
    category: "concepts",
    sourceKey: "v1",
    summary: "判断一个产品值不值得做，必须同时看需求、表达、渠道、供应链、利润与组织承接，而不是只看表面热度。",
    sourceIds: ["KB021", "KB022", "KB023", "KB024", "KB025", "KB026", "KB028", "KB029", "KB030", "KB031", "KB032", "KB035"],
    relatedTitles: ["内容电商方法论", "运营漏斗诊断", "防晒项目打法", "短视频内容测试方法"],
  },
  {
    title: "内容电商方法论",
    category: "concepts",
    sourceKey: "v1",
    summary: "内容是否能成交，不取决于画面是否精致，而取决于人群、钩子、卖点、目标与后续承接是否一致。",
    sourceIds: ["KB037", "KB038", "KB039", "KB040", "KB041", "KB042", "KB043", "KB044", "KB045"],
    relatedTitles: ["超级产品方法论", "运营漏斗诊断", "防晒项目打法", "短视频内容测试方法"],
  },
  {
    title: "运营漏斗诊断",
    category: "concepts",
    sourceKey: "v1",
    summary: "项目跑不动时先拆曝光、点击、转化、履约四层漏斗，再决定动作，避免凭感觉同时乱改。",
    sourceIds: ["KB052", "KB053", "KB054", "KB055", "KB062", "KB063", "KB097", "KB098"],
    relatedTitles: ["超级产品方法论", "内容电商方法论", "防晒项目打法", "短视频内容测试方法"],
  },
  {
    title: "新员工提问原则",
    category: "roles",
    sourceKey: "v1",
    summary: "提问前先补齐目标、场景、约束和已尝试动作，让 AI 和同事都能更快给出可执行答案。",
    sourceIds: ["KB007", "KB067", "KB068", "KB069", "KB070", "KB071", "KB099", "KB100"],
    relatedTitles: ["AI智能体设计原则", "岗位职责地图", "超级产品方法论", "内容电商方法论"],
  },
  {
    title: "公司定位与跨境战略",
    category: "concepts",
    sourceKey: "v1",
    summary: "公司当前的主线不是做纯流量生意，而是把中国内容电商能力迁移到海外，逐步沉淀产品与品牌资产。",
    sourceIds: ["KB001", "KB002", "KB003", "KB004", "KB005"],
    relatedTitles: ["经营原则与高标准", "项目分级与资源聚焦", "人才分级与用人原则", "管理与复盘机制"],
  },
  {
    title: "经营原则与高标准",
    category: "concepts",
    sourceKey: "v1",
    summary: "增长要建立在高利润、可复制和长期资产之上，高标准体现在主动补信息、纠错和兼顾效率与规则。",
    sourceIds: ["KB006", "KB007", "KB008", "KB009", "KB018", "KB019", "KB020"],
    relatedTitles: ["公司定位与跨境战略", "项目分级与资源聚焦", "人才分级与用人原则", "管理与复盘机制"],
  },
  {
    title: "人才分级与用人原则",
    category: "roles",
    sourceKey: "v1",
    summary: "人才分级的目的不是贴标签，而是把关键战役交给更强的人，提高组织试错效率和复制成功率。",
    sourceIds: ["KB010", "KB011", "KB017", "KB065"],
    relatedTitles: ["公司定位与跨境战略", "经营原则与高标准", "项目分级与资源聚焦", "管理与复盘机制"],
  },
  {
    title: "项目分级与资源聚焦",
    category: "concepts",
    sourceKey: "v1",
    summary: "项目分级的核心是把有限资源集中到真正高潜、可复制、能沉淀资产的方向，而不是平均投入。",
    sourceIds: ["KB012", "KB013", "KB014", "KB015", "KB016"],
    relatedTitles: ["公司定位与跨境战略", "经营原则与高标准", "人才分级与用人原则", "管理与复盘机制"],
  },
  {
    title: "岗位职责地图",
    category: "roles",
    sourceKey: "v1",
    summary: "不同岗位的核心价值不是分工表面动作，而是围绕目标承担判断、协同和把结果真正跑出来的责任。",
    sourceIds: ["KB027", "KB036", "KB049", "KB051", "KB079"],
    relatedTitles: ["公司定位与跨境战略", "项目分级与资源聚焦", "管理与复盘机制", "新员工提问原则"],
  },
  {
    title: "直播成交协同方法",
    category: "concepts",
    sourceKey: "v1",
    summary: "直播不是单独的成交场景，而是人货场、短视频、店铺承接与节奏控制共同作用的转化系统。",
    sourceIds: ["KB056", "KB057", "KB058", "KB059", "KB060", "KB061"],
    relatedTitles: ["TikTok店铺运营框架", "TikTok商品卡与详情页优化", "达人建联SOP", "达人合作评估与复盘"],
  },
  {
    title: "AI智能体设计原则",
    category: "concepts",
    sourceKey: "v1",
    summary: "内部 AI 智能体要先识别问题类型与上下文，再追问、纠偏和结构化回答，帮助组织沉淀可复用知识。",
    sourceIds: ["KB066", "KB067", "KB068", "KB069", "KB070", "KB071", "KB072", "KB073", "KB074", "KB075", "KB076", "KB077", "KB078", "KB080"],
    relatedTitles: ["新员工提问原则", "岗位职责地图", "管理与复盘机制", "经营原则与高标准"],
  },
  {
    title: "管理与复盘机制",
    category: "roles",
    sourceKey: "v1",
    summary: "管理的重点不是替员工做完，而是用周会、日报、OKR、复盘和培训机制持续提升团队独立作战能力。",
    sourceIds: ["KB064", "KB081", "KB082", "KB083", "KB084", "KB085", "KB086", "KB087", "KB088", "KB089", "KB090"],
    relatedTitles: ["公司定位与跨境战略", "经营原则与高标准", "人才分级与用人原则", "项目分级与资源聚焦"],
  },
  {
    title: "市场与渠道判断",
    category: "entities",
    sourceKey: "v1",
    summary: "选市场和渠道不能只看规模，要同时看成熟度差、规则门槛、成交路径以及公司现阶段能力是否匹配。",
    sourceIds: ["KB091", "KB092", "KB093", "KB094", "KB095", "KB096"],
    relatedTitles: ["公司定位与跨境战略", "超级产品方法论", "TikTok店铺运营框架"],
  },
  {
    title: "防晒项目打法",
    category: "entities",
    sourceKey: "v2",
    summary: "防晒项目的本质是围绕场景、人群、肤感和使用习惯做产品与内容设计，而不是只强调防晒参数本身。",
    sourceIds: [
      "KB101",
      "KB102",
      "KB103",
      "KB104",
      "KB105",
      "KB106",
      "KB107",
      "KB108",
      "KB109",
      "KB110",
      "KB111",
      "KB112",
      "KB113",
      "KB114",
      "KB115",
      "KB116",
      "KB117",
      "KB118",
      "KB119",
      "KB120",
    ],
    relatedTitles: ["超级产品方法论", "内容电商方法论", "运营漏斗诊断", "短视频内容测试方法"],
  },
  {
    title: "防晒用户异议与复购",
    category: "faq",
    sourceKey: "v2",
    summary: "防晒成交与复购的关键，在于提前回答油腻、泛白、补涂、价格与使用习惯等高频用户疑虑。",
    sourceIds: ["KB104", "KB107", "KB109", "KB112", "KB117", "KB118", "KB119"],
    relatedTitles: ["防晒项目打法", "内容电商方法论", "运营漏斗诊断"],
    contentMode: "faq",
  },
  {
    title: "TikTok店铺运营框架",
    category: "entities",
    sourceKey: "v2",
    summary: "TikTok 店铺运营本质上是内容、商品卡、详情页、直播与活动协同的一体化兴趣电商转化链路。",
    sourceIds: [
      "KB121",
      "KB122",
      "KB123",
      "KB124",
      "KB125",
      "KB126",
      "KB127",
      "KB128",
      "KB129",
      "KB130",
      "KB131",
      "KB132",
      "KB133",
      "KB134",
      "KB135",
      "KB136",
      "KB137",
      "KB138",
      "KB139",
      "KB140",
    ],
    relatedTitles: ["TikTok商品卡与详情页优化", "达人建联SOP", "达人合作评估与复盘", "直播成交协同方法"],
  },
  {
    title: "TikTok商品卡与详情页优化",
    category: "faq",
    sourceKey: "v2",
    summary: "商品卡和详情页的职责不是堆参数，而是快速解释产品价值、承接内容疑问并推动用户完成下单。",
    sourceIds: ["KB123", "KB124", "KB125", "KB133", "KB134", "KB135", "KB136", "KB137", "KB138", "KB139", "KB140"],
    relatedTitles: ["TikTok店铺运营框架", "达人建联SOP", "达人合作评估与复盘", "直播成交协同方法"],
    contentMode: "faq",
  },
  {
    title: "短视频内容测试方法",
    category: "concepts",
    sourceKey: "v2",
    summary: "短视频起量依赖选题、钩子、脚本、节奏与测试机制的连续优化，而不是偶尔拍出一条爆款就算方法论。",
    sourceIds: ["KB141", "KB142", "KB143", "KB144", "KB145", "KB146", "KB147", "KB148", "KB149", "KB150"],
    relatedTitles: ["超级产品方法论", "内容电商方法论", "运营漏斗诊断", "防晒项目打法"],
  },
  {
    title: "短视频脚本与放大量化",
    category: "faq",
    sourceKey: "v2",
    summary: "脚本和放量的核心不是多拍，而是用统一结构记录钩子、卖点、数据和迭代动作，让有效内容可复制。",
    sourceIds: ["KB151", "KB152", "KB153", "KB154", "KB155", "KB156", "KB157", "KB158", "KB159", "KB160"],
    relatedTitles: ["短视频内容测试方法", "内容电商方法论", "TikTok商品卡与详情页优化"],
    contentMode: "faq",
  },
  {
    title: "达人建联SOP",
    category: "roles",
    sourceKey: "v2",
    summary: "达人合作要先按匹配度、沟通节奏和素材协同建立稳定流程，重点不是单纯多加达人数量。",
    sourceIds: ["KB161", "KB162", "KB163", "KB164", "KB165", "KB166", "KB167", "KB168", "KB169", "KB170"],
    relatedTitles: ["TikTok店铺运营框架", "TikTok商品卡与详情页优化", "达人合作评估与复盘", "直播成交协同方法"],
  },
  {
    title: "达人合作评估与复盘",
    category: "faq",
    sourceKey: "v2",
    summary: "达人合作效果要回到人群匹配、内容质量、成交结果和复盘动作，避免只看单次播放或报价高低。",
    sourceIds: ["KB171", "KB172", "KB173", "KB174", "KB175", "KB176", "KB177", "KB178", "KB179", "KB180"],
    relatedTitles: ["TikTok店铺运营框架", "TikTok商品卡与详情页优化", "达人建联SOP", "直播成交协同方法"],
    contentMode: "faq",
  },
  {
    title: "管理和带教执行规范",
    category: "roles",
    sourceKey: "v2",
    summary: "管理和带教要把目标、标准、节奏、反馈与纠偏机制讲清楚，让新人能在真实任务中快速形成方法。",
    sourceIds: [
      "KB181",
      "KB182",
      "KB183",
      "KB184",
      "KB185",
      "KB186",
      "KB187",
      "KB188",
      "KB189",
      "KB190",
      "KB191",
      "KB192",
      "KB193",
      "KB194",
      "KB195",
      "KB196",
      "KB197",
      "KB198",
      "KB199",
      "KB200",
    ],
    relatedTitles: ["管理与复盘机制", "人才分级与用人原则", "项目分级与资源聚焦", "岗位职责地图"],
  },
];

const ROLE_ORDER = [
  "全员",
  "管理层",
  "项目负责人",
  "产品岗",
  "运营岗",
  "视频岗",
  "主播",
  "直播岗",
  "BD岗",
  "技术岗",
  "新员工",
  "管理者",
  "供应链相关",
] as const;

function normalizeText(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ");
}

function cleanInlineText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitDelimitedValues(value: string) {
  return value
    .split(/[、,，/]/)
    .map((item) => cleanInlineText(item))
    .filter(Boolean);
}

function createEmptyEntry(id: string, title: string, sourceKey: SourceKey): KBEntry {
  return {
    id,
    title: cleanInlineText(title),
    category: "",
    roles: [],
    triggerQuestions: [],
    standardAnswer: "",
    framework: "",
    nextActions: "",
    relatedTerms: [],
    sourceKey,
  };
}

function finalizeEntry(entry: KBEntry | null) {
  if (!entry) return null;
  if (!entry.category || !entry.standardAnswer) {
    throw new Error(`KB 条目解析不完整：${entry.id}｜${entry.title}`);
  }
  return {
    ...entry,
    category: cleanInlineText(entry.category),
    roles: entry.roles.map(cleanInlineText).filter(Boolean),
    triggerQuestions: entry.triggerQuestions.map(cleanInlineText).filter(Boolean),
    standardAnswer: cleanInlineText(entry.standardAnswer),
    framework: cleanInlineText(entry.framework),
    nextActions: cleanInlineText(entry.nextActions),
    relatedTerms: entry.relatedTerms.map(cleanInlineText).filter(Boolean),
  };
}

function parseDocumentEntries(sourceKey: SourceKey, text: string) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const entries = new Map<string, KBEntry>();
  let currentEntry: KBEntry | null = null;
  let currentField: keyof Pick<KBEntry, "category" | "standardAnswer" | "framework" | "nextActions"> | "roles" | "triggerQuestions" | "relatedTerms" | null = null;

  for (const line of lines) {
    const entryMatch = line.match(/^(KB\d{3})[｜|](.+)$/);
    if (entryMatch) {
      const finalized = finalizeEntry(currentEntry);
      if (finalized) {
        entries.set(finalized.id, finalized);
      }
      currentEntry = createEmptyEntry(entryMatch[1], entryMatch[2], sourceKey);
      currentField = null;
      continue;
    }

    if (!currentEntry) continue;

    const fieldMatch = line.match(/^[•*-]\s*([a-zA-Z_]+):\s*(.*)$/);
    if (fieldMatch) {
      const rawField = fieldMatch[1];
      const rawValue = cleanInlineText(fieldMatch[2]);
      currentField = null;

      if (rawField === "category") {
        currentEntry.category = rawValue;
        currentField = "category";
      } else if (rawField === "roles") {
        currentEntry.roles = splitDelimitedValues(rawValue);
        currentField = "roles";
      } else if (rawField === "trigger_questions") {
        currentEntry.triggerQuestions = rawValue
          .split(/\s*\/\s*/)
          .map(cleanInlineText)
          .filter(Boolean);
        currentField = "triggerQuestions";
      } else if (rawField === "standard_answer") {
        currentEntry.standardAnswer = rawValue;
        currentField = "standardAnswer";
      } else if (rawField === "framework") {
        currentEntry.framework = rawValue;
        currentField = "framework";
      } else if (rawField === "next_actions") {
        currentEntry.nextActions = rawValue;
        currentField = "nextActions";
      } else if (rawField === "related_terms") {
        currentEntry.relatedTerms = splitDelimitedValues(rawValue);
        currentField = "relatedTerms";
      }

      continue;
    }

    if (!currentField) continue;

    if (currentField === "roles") {
      currentEntry.roles = [...currentEntry.roles, ...splitDelimitedValues(line)];
      continue;
    }

    if (currentField === "triggerQuestions") {
      currentEntry.triggerQuestions = [
        ...currentEntry.triggerQuestions,
        ...line.split(/\s*\/\s*/).map(cleanInlineText).filter(Boolean),
      ];
      continue;
    }

    if (currentField === "relatedTerms") {
      currentEntry.relatedTerms = [...currentEntry.relatedTerms, ...splitDelimitedValues(line)];
      continue;
    }

    const existingValue = currentEntry[currentField];
    currentEntry[currentField] = cleanInlineText(`${existingValue} ${line}`);
  }

  const finalized = finalizeEntry(currentEntry);
  if (finalized) {
    entries.set(finalized.id, finalized);
  }

  return entries;
}

async function extractDocxText(filePath: string) {
  const { stdout } = await execFileAsync("textutil", ["-convert", "txt", "-stdout", filePath], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return normalizeText(stdout);
}

function getDocumentConfig(sourceKey: SourceKey) {
  const config = DOCUMENTS.find((item) => item.key === sourceKey);
  if (!config) {
    throw new Error(`未知来源配置：${sourceKey}`);
  }
  return config;
}

function ensureSummaryLength(title: string, summary: string) {
  const length = summary.trim().length;
  if (length < 40 || length > 80) {
    throw new Error(`页面摘要长度不符合要求：${title}（${length}）`);
  }
}

function getOrderedUniqueRoles(entries: KBEntry[]) {
  const seen = new Set<string>();
  const collected = entries.flatMap((entry) => entry.roles).filter(Boolean);
  const sorted = [
    ...ROLE_ORDER.filter((role) => collected.includes(role)),
    ...collected.filter((role) => !ROLE_ORDER.includes(role as (typeof ROLE_ORDER)[number])).sort((left, right) => left.localeCompare(right, "zh-CN")),
  ];

  return sorted.filter((role) => {
    if (seen.has(role)) return false;
    seen.add(role);
    return true;
  });
}

function buildReasoningLines(entries: KBEntry[]) {
  return entries.map((entry, index) => {
    const frameworkText = entry.framework ? `判断框架：${entry.framework}。` : "";
    return `${index + 1}. ${entry.id}｜${entry.title}：${entry.standardAnswer}${frameworkText}`;
  });
}

function buildFaqLines(entries: KBEntry[]) {
  return entries.map((entry) => {
    const question = entry.triggerQuestions[0] || `${entry.title}应该怎么理解？`;
    return `### ${question}\n\n${entry.standardAnswer}`;
  });
}

function buildActionLines(entries: KBEntry[]) {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const entry of entries) {
    if (!entry.nextActions || seen.has(entry.nextActions)) continue;
    seen.add(entry.nextActions);
    lines.push(`- ${entry.nextActions}（${entry.id}｜${entry.title}）`);
  }

  return lines;
}

function buildTraceLines(definition: PageDefinition, documentTitle: string) {
  return [
    `- 原始资料：${documentTitle}`,
    `- 覆盖 KB：${definition.sourceIds.join("、")}`,
  ];
}

function buildDraftContent(definition: PageDefinition, entries: KBEntry[]) {
  const documentTitle = getDocumentConfig(definition.sourceKey).title;
  const sections = [
    `# ${definition.title}`,
    "",
    "## 先说结论",
    definition.summary,
    "",
    `本页由《${documentTitle}》中的相关条目主题化整理而成，当前仍处于管理员审核前的 draft 状态，用于把原始资料转成可维护的 Wiki 页面。`,
    "",
    "## 判断依据",
    ...buildReasoningLines(entries),
  ];

  if (definition.contentMode === "faq") {
    sections.push("", "## FAQ", ...buildFaqLines(entries));
  }

  sections.push("", "## 下一步动作", ...buildActionLines(entries));
  sections.push("", "## 来源追溯", ...buildTraceLines(definition, documentTitle));

  return sections.join("\n");
}

function createEntryLookup(entryMaps: Map<SourceKey, Map<string, KBEntry>>) {
  return (sourceKey: SourceKey, sourceIds: string[]) =>
    sourceIds.map((sourceId) => {
      const entry = entryMaps.get(sourceKey)?.get(sourceId);
      if (!entry) {
        throw new Error(`未找到来源条目：${sourceKey} / ${sourceId}`);
      }
      return entry;
    });
}

function buildTitleToPageIdMap() {
  return new Map(PAGE_DEFINITIONS.map((definition) => [definition.title, generateWikiId(definition.category, definition.title)]));
}

function ensureRelatedPagesValid(relatedPages: string[], allowedPageIds: Set<string>, title: string) {
  for (const relatedPage of relatedPages) {
    if (!allowedPageIds.has(relatedPage)) {
      throw new Error(`页面 ${title} 包含无效 relatedPages：${relatedPage}`);
    }
  }
}

function ensureSourceOwnership(definition: PageDefinition, entries: KBEntry[]) {
  const invalidEntry = entries.find((entry) => entry.sourceKey !== definition.sourceKey);
  if (invalidEntry) {
    throw new Error(`页面 ${definition.title} 混入了错误来源：${invalidEntry.id}`);
  }
}

function deriveDraftStatus(): WikiDraftStatus {
  return "draft";
}

async function buildPendingChanges() {
  await ensureWikiWorkspace();
  const documentTexts = await Promise.all(
    DOCUMENTS.map(async (document) => ({
      ...document,
      text: await extractDocxText(document.filePath),
    }))
  );

  const entryMaps = new Map<SourceKey, Map<string, KBEntry>>();
  for (const document of documentTexts) {
    entryMaps.set(document.key, parseDocumentEntries(document.key, document.text));
  }

  if ((entryMaps.get("v1")?.size || 0) !== 100) {
    throw new Error(`v1 解析条目数异常：${entryMaps.get("v1")?.size || 0}`);
  }
  if ((entryMaps.get("v2")?.size || 0) !== 100) {
    throw new Error(`v2 解析条目数异常：${entryMaps.get("v2")?.size || 0}`);
  }

  const getEntries = createEntryLookup(entryMaps);
  const titleToPageId = buildTitleToPageIdMap();
  const publishedPages = await listPublishedPages();
  const allowedPageIds = new Set([
    ...publishedPages.map((page) => page.id),
    ...Array.from(titleToPageId.values()),
  ]);

  const pendingSources = await Promise.all(
    documentTexts.map(async (document) => {
      const existingSource = await findWikiSourceRecordByTitle(document.title);
      return {
        key: document.key,
        title: document.title,
        action: existingSource ? "update" : "create",
        content: document.text.trim(),
        sourceId: existingSource?.id || `pending-${document.key}`,
      } satisfies PendingSource;
    })
  );

  const sourceIdByKey = new Map(pendingSources.map((source) => [source.key, source.sourceId]));
  const pendingDrafts: PendingDraft[] = [];

  for (const definition of PAGE_DEFINITIONS) {
    ensureSummaryLength(definition.title, definition.summary);
    const entries = getEntries(definition.sourceKey, definition.sourceIds);
    ensureSourceOwnership(definition, entries);
    const pageId = generateWikiId(definition.category, definition.title);
    const relatedPages = definition.relatedTitles.map((relatedTitle) => {
      const relatedPageId = titleToPageId.get(relatedTitle);
      if (!relatedPageId) {
        throw new Error(`页面 ${definition.title} 引用了未知 related title：${relatedTitle}`);
      }
      return relatedPageId;
    });
    ensureRelatedPagesValid(relatedPages, allowedPageIds, definition.title);

    const roles = getOrderedUniqueRoles(entries);
    if (roles.length === 0) {
      throw new Error(`页面 ${definition.title} 没有可用 roles`);
    }

    const content = buildDraftContent(definition, entries);
    if (!content.includes("## 先说结论") || !content.includes("## 判断依据") || !content.includes("## 下一步动作")) {
      throw new Error(`页面 ${definition.title} 缺少必填结构`);
    }

    const existingDraft = await findWikiDraftByPageId(pageId);
    pendingDrafts.push({
      title: definition.title,
      pageId,
      action: existingDraft ? "update" : "create",
      sourceKey: definition.sourceKey,
      summary: definition.summary,
      sourceIds: definition.sourceIds,
      relatedPages,
      relations: buildSeeAlsoRelations(relatedPages),
      roles,
      content,
    });
  }

  for (const pendingDraft of pendingDrafts) {
    if (!sourceIdByKey.has(pendingDraft.sourceKey)) {
      throw new Error(`页面 ${pendingDraft.title} 缺少来源 sourceId`);
    }
  }

  return {
    pendingSources,
    pendingDrafts,
  };
}

async function printPlanSummary(pendingSources: PendingSource[], pendingDrafts: PendingDraft[], mode: "dry-run" | "apply") {
  console.log(`[wiki-import] mode: ${mode}`);
  console.log(`[wiki-import] source actions: ${pendingSources.length}`);
  pendingSources.forEach((source) => {
    console.log(`- [${source.action}] source | ${source.title}`);
  });
  console.log(`[wiki-import] draft actions: ${pendingDrafts.length}`);
  pendingDrafts.forEach((draft) => {
    console.log(`- [${draft.action}] draft | ${draft.pageId} | ${draft.sourceIds[0]}..${draft.sourceIds[draft.sourceIds.length - 1]}`);
  });
  console.log("[wiki-import] publish actions: 0");
}

async function applyPendingChanges(pendingSources: PendingSource[], pendingDrafts: PendingDraft[]) {
  const sourceIdByKey = new Map<SourceKey, string>();

  for (const source of pendingSources) {
    const saved = await upsertWikiSourceRecordByTitle({
      title: source.title,
      content: source.content,
      status: "drafted",
    });
    sourceIdByKey.set(source.key, saved.id);
  }

  for (const draft of pendingDrafts) {
    const sourceId = sourceIdByKey.get(draft.sourceKey);
    if (!sourceId) {
      throw new Error(`缺少 draft 来源 sourceId：${draft.title}`);
    }

    const definition = PAGE_DEFINITIONS.find((item) => item.title === draft.title);
    if (!definition) {
      throw new Error(`未找到页面定义：${draft.title}`);
    }

    await upsertWikiDraftByPageId(draft.pageId, {
      sourceId,
      title: draft.title,
      category: definition.category,
      summary: draft.summary,
      roles: draft.roles,
      sourceIds: draft.sourceIds,
      relatedPages: draft.relatedPages,
      relations: draft.relations,
      content: draft.content,
      status: deriveDraftStatus(),
      notes: `批量导入自《${getDocumentConfig(draft.sourceKey).title}》`,
    });
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { pendingSources, pendingDrafts } = await buildPendingChanges();
  await printPlanSummary(pendingSources, pendingDrafts, dryRun ? "dry-run" : "apply");

  if (dryRun) {
    return;
  }

  await applyPendingChanges(pendingSources, pendingDrafts);
  console.log("[wiki-import] completed");
}

await main();
