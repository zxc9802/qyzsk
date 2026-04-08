import { getChatModelOption } from "@/lib/chat-models";
import {
  type ConversationReport,
  type ReportAnalysisDimension,
  REPORT_ANALYSIS_DIMENSIONS,
  type ReportFileSummaryItem,
  type ReportGenerationRequest,
  type ReportKeyJudgment,
  type ReportSourceReference,
} from "@/lib/report";
import type { KnowledgeBaseHit, Message, QuestionDiagnosis } from "@/lib/types";
import { listConversationFiles } from "@/lib/server/file-store";
import { generateModelText } from "@/lib/server/model-text";

const REPORT_MODEL_ID = "yunwu-gemini-3-flash-preview";
const MAX_PROMPT_CHARS = 18000;
const MAX_FILE_SUMMARY_CHARS = 420;
const MAX_TIMELINE_ITEM_CHARS = 280;
const MAX_ASSISTANT_HIGHLIGHTS = 6;
const MAX_USER_REQUESTS = 5;

type ReportModelDraft = {
  reportTitle?: string;
  coverNote?: string;
  executiveSummary?: {
    conversationGoal?: string;
    topConclusions?: string[];
    overallJudgment?: string;
  };
  problemDefinition?: {
    coreRequest?: string;
    providedContext?: string[];
    businessStage?: string;
  };
  keyJudgments?: Array<{
    title?: string;
    conclusion?: string;
    basis?: string;
    sources?: ReportSourceReference[];
  }>;
  analysisDimensions?: Array<{
    title?: string;
    summary?: string;
    sources?: ReportSourceReference[];
  }>;
  actionPlan?: Array<{
    timeframe?: string;
    priority?: string;
    action?: string;
    reason?: string;
    ownerSuggestion?: string;
  }>;
  fileSummaryOverview?: string;
};

type ResolvedReportDraft = {
  reportTitle: string;
  coverNote: string;
  executiveSummary: {
    conversationGoal: string;
    topConclusions: string[];
    overallJudgment: string;
  };
  problemDefinition: {
    coreRequest: string;
    providedContext: string[];
    businessStage: string;
  };
  keyJudgments: ReportKeyJudgment[];
  analysisDimensions: Array<{
    title: ReportAnalysisDimension["title"];
    summary: string;
    sources: ReportSourceReference[];
  }>;
  actionPlan: Array<{
    timeframe: "立刻做" | "本周做" | "后续跟进";
    priority: "高" | "中" | "低";
    action: string;
    reason: string;
    ownerSuggestion?: string;
  }>;
  fileSummaryOverview: string;
};

export async function buildConversationReport(
  input: ReportGenerationRequest,
  userId: string
): Promise<ConversationReport> {
  const messages = normalizeMessages(input.messages);
  const knowledgeHits = collectKnowledgeHits(messages);
  const diagnoses = collectDiagnoses(messages);
  const files = input.conversationId ? await listConversationFiles(userId, input.conversationId) : [];
  const fileItems = files
    .filter((file) => file.status === "ready")
    .map<ReportFileSummaryItem>((file) => ({
      id: file.id,
      name: file.name,
      kind: file.kind,
      active: file.active,
      summary: trimTo(file.summary || file.excerpt || "暂无摘要。", MAX_FILE_SUMMARY_CHARS),
      references: [],
    }));

  const prompt = buildReportPrompt({
    input,
    messages,
    knowledgeHits,
    diagnoses,
    fileItems,
  });

  let draft: ReportModelDraft | null = null;

  try {
    const raw = await generateModelText({
      modelId: REPORT_MODEL_ID,
      systemPrompt: buildReportSystemPrompt(),
      userPrompt: prompt,
      temperature: 0.15,
      maxTokens: 2200,
    });
    draft = parseReportDraft(raw);
  } catch (error) {
    console.error("Report generation fallback:", error);
  }

  const fallback = buildFallbackDraft({
    input,
    messages,
    knowledgeHits,
    diagnoses,
    fileItems,
  });
  const resolvedDraft = mergeDraftWithFallback(draft, fallback);

  return buildFinalReport({
    input,
    messages,
    knowledgeHits,
    fileItems,
    draft: resolvedDraft,
  });
}

function buildReportSystemPrompt(): string {
  return `你是公司的内部业务分析报告撰写助手。

你的任务不是继续聊天，而是把当前会话整理成结构化的业务分析报告草稿。

严格要求：
1. 只输出 JSON，不要输出 Markdown，不要加解释。
2. 只能填充我给你的固定字段，不要新增字段。
3. 文案要像业务分析报告，不要像聊天回复。
4. 对“判断依据来源”要优先引用我提供的知识库条目、上传资料和对话补充信息。
5. 如果信息不足，要在“风险与不确定项”里明确写出来，不要伪造确定性。
6. 资料摘要部分不要展开大段原文，只做摘要级描述。`;
}

function buildReportPrompt(options: {
  input: ReportGenerationRequest;
  messages: Message[];
  knowledgeHits: KnowledgeBaseHit[];
  diagnoses: QuestionDiagnosis[];
  fileItems: ReportFileSummaryItem[];
}): string {
  const firstUserMessage = options.messages.find((item) => item.role === "user")?.content || "";
  const latestUserMessage = [...options.messages].reverse().find((item) => item.role === "user")?.content || "";
  const latestAssistantMessage = [...options.messages].reverse().find((item) => item.role === "assistant")?.content || "";
  const userRequests = buildUserRequestSummary(options.messages);
  const assistantHighlights = buildAssistantHighlights(options.messages);
  const conversationBody = buildConversationBodySummary(options.messages);
  const diagnosisSummary =
    options.diagnoses.length > 0
      ? options.diagnoses
          .map((item, index) => {
            const missing = item.missingSlots.length > 0 ? `；缺失项：${item.missingSlots.join("、")}` : "";
            const selectedScope = item.selectedScope ? `；已选场景：${item.selectedScope}` : "";
            return `${index + 1}. ${item.categoryLabel} / 模式=${item.mode} / 完整度=${item.completenessScore}%${missing}${selectedScope} / 摘要：${item.summary}`;
          })
          .join("\n")
      : "无显式诊断记录。";
  const kbSummary =
    options.knowledgeHits.length > 0
      ? options.knowledgeHits.map((item) => `- ${item.id}｜${item.title}（${item.category}）`).join("\n")
      : "- 无明确知识库命中";
  const fileSummary =
    options.fileItems.length > 0
      ? options.fileItems
          .map(
            (item) =>
              `- ${item.name}｜类型=${item.kind}｜${item.active ? "当前激活" : "未激活"}｜摘要=${item.summary}`
          )
          .join("\n")
      : "- 当前会话没有已就绪资料";

  const jsonSkeleton = `{
  "reportTitle": "",
  "coverNote": "",
  "executiveSummary": {
    "conversationGoal": "",
    "topConclusions": ["", "", ""],
    "overallJudgment": ""
  },
  "problemDefinition": {
    "coreRequest": "",
    "providedContext": ["", ""],
    "businessStage": ""
  },
  "keyJudgments": [
    {
      "title": "",
      "conclusion": "",
      "basis": "",
      "sources": [
        { "type": "knowledge_base", "label": "KB000｜示例", "detail": "为什么引用它" },
        { "type": "file", "label": "示例文件.pdf", "detail": "引用了哪部分摘要" },
        { "type": "conversation", "label": "用户补充信息", "detail": "从对话里得到的线索" }
      ]
    }
  ],
  "analysisDimensions": [
    { "title": "核心问题识别", "summary": "", "sources": [] },
    { "title": "已知信息完整度", "summary": "", "sources": [] },
    { "title": "关键判断结论", "summary": "", "sources": [] },
    { "title": "判断依据来源", "summary": "", "sources": [] },
    { "title": "风险与不确定项", "summary": "", "sources": [] },
    { "title": "下一步动作建议", "summary": "", "sources": [] }
  ],
  "actionPlan": [
    {
      "timeframe": "立刻做",
      "priority": "高",
      "action": "",
      "reason": "",
      "ownerSuggestion": ""
    }
  ],
  "fileSummaryOverview": ""
}`;

  const fullPrompt = [
    `会话标题：${options.input.conversationTitle}`,
    `当前岗位：${options.input.roleName}`,
    `报告生成模型：${getChatModelOption(REPORT_MODEL_ID).label}`,
    `回答模式：${options.input.answerMode === "deep" ? "深度回答" : "简单回答"}`,
    `首轮用户诉求：${firstUserMessage || "无"}`,
    `最近用户核心问题：${latestUserMessage || "无"}`,
    `最近助手结论摘要：${trimTo(latestAssistantMessage || "无", 800)}`,
    "",
    "【用户主要诉求变化】",
    userRequests,
    "",
    "【助手关键结论摘录】",
    assistantHighlights,
    "",
    "【诊断记录】",
    diagnosisSummary,
    "",
    "【知识库命中】",
    kbSummary,
    "",
    "【上传资料摘要】",
    fileSummary,
    "",
    "【对话主体线索（按时间顺序精简）】",
    conversationBody,
    "",
    "请基于以上信息生成结构化业务分析报告。",
    "要求：",
    "1. 报告主体突出结论、依据、问题、动作建议。",
    "2. 不要复述聊天腔，要整理成报告腔。",
    "3. providedContext 只保留真正重要的背景，不要超过 5 条。",
    "4. keyJudgments 控制在 3 到 5 条。",
    "5. actionPlan 控制在 3 到 6 条，按轻重缓急排序。",
    "6. analysisDimensions 必须完整覆盖这 6 个固定标题。",
    "7. sources 只能使用我给你的知识库、文件名或对话补充信息，不要编造新的来源标签。",
    "8. 如果资料不足，要在“风险与不确定项”明确写出。",
    "9. 只输出合法 JSON。",
    "",
    "请严格使用这个 JSON 骨架：",
    jsonSkeleton,
  ].join("\n");

  return trimForModel(fullPrompt, MAX_PROMPT_CHARS);
}

function normalizeMessages(messages: Message[]): Message[] {
  return messages
    .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item) => ({
      ...item,
      content: item.content.trim(),
    }))
    .filter((item) => item.content.length > 0);
}

function collectKnowledgeHits(messages: Message[]): KnowledgeBaseHit[] {
  const seen = new Set<string>();
  const hits: KnowledgeBaseHit[] = [];

  for (const message of messages) {
    for (const hit of message.kbHits || []) {
      const key = `${hit.id}::${hit.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }
  }

  return hits;
}

function collectDiagnoses(messages: Message[]): QuestionDiagnosis[] {
  return messages
    .map((item) => item.questionDiagnosis)
    .filter((item): item is QuestionDiagnosis => Boolean(item));
}

function trimForModel(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;

  const headBudget = Math.floor(maxChars * 0.45);
  const tailBudget = Math.floor(maxChars * 0.45);
  return `${value.slice(0, headBudget)}\n\n[中间部分已折叠，以保证报告生成稳定]\n\n${value.slice(-tailBudget)}`;
}

function parseReportDraft(raw: string): ReportModelDraft | null {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as ReportModelDraft;
  } catch {
    return null;
  }
}

function buildFallbackDraft(options: {
  input: ReportGenerationRequest;
  messages: Message[];
  knowledgeHits: KnowledgeBaseHit[];
  diagnoses: QuestionDiagnosis[];
  fileItems: ReportFileSummaryItem[];
}): ResolvedReportDraft {
  const latestUserMessage =
    [...options.messages].reverse().find((item) => item.role === "user")?.content || options.input.conversationTitle;
  const latestAssistantMessage =
    [...options.messages].reverse().find((item) => item.role === "assistant")?.content || "本轮对话已形成一轮初步业务分析。";
  const topConclusions = extractTopLines(latestAssistantMessage, 4);
  const latestDiagnosis = options.diagnoses.at(-1);
  const providedContext = [
    options.fileItems.length > 0 ? `当前会话引用了 ${options.fileItems.length} 份资料。` : "当前会话没有上传资料。",
    options.knowledgeHits.length > 0
      ? `本轮累计命中了 ${options.knowledgeHits.length} 条知识库条目。`
      : "本轮没有明显知识库命中。",
    latestDiagnosis
      ? `最近一次诊断类别为 ${latestDiagnosis.categoryLabel}，完整度 ${latestDiagnosis.completenessScore}%。`
      : "本轮没有额外诊断面板。",
  ].filter(Boolean);

  return {
    reportTitle: `${options.input.conversationTitle}｜会话分析报告`,
    coverNote: "这是一份基于当前会话全量消息自动整理的业务分析报告，可用于复盘、对齐和后续执行。",
    executiveSummary: {
      conversationGoal: latestUserMessage,
      topConclusions:
        topConclusions.length > 0 ? topConclusions : ["本轮对话已形成初步分析结论，可继续按行动清单推进。"],
      overallJudgment: "当前会话已经沉淀出可执行的分析框架，但仍建议结合业务现场数据继续验证。",
    },
    problemDefinition: {
      coreRequest: latestUserMessage,
      providedContext,
      businessStage: inferBusinessStage(options.messages, options.fileItems),
    },
    keyJudgments: [
      {
        title: "当前核心判断",
        conclusion: topConclusions[0] || "本轮对话已给出一轮初步业务判断。",
        basis: trimTo(latestAssistantMessage, 220),
        sources: buildFallbackSources(options.knowledgeHits, options.fileItems),
      },
    ],
    analysisDimensions: REPORT_ANALYSIS_DIMENSIONS.map((title) => ({
      title,
      summary: buildFallbackDimensionSummary(title, {
        latestUserMessage,
        latestDiagnosis,
        knowledgeHits: options.knowledgeHits,
        fileItems: options.fileItems,
      }),
      sources: buildFallbackSources(options.knowledgeHits, options.fileItems),
    })),
    actionPlan: [
      {
        timeframe: "立刻做",
        priority: "高",
        action: "把本轮对话里的核心结论和缺失信息先整理成执行清单。",
        reason: "这样能避免后续继续讨论时丢失上下文。",
        ownerSuggestion: "当前提问人或对应岗位负责人",
      },
      {
        timeframe: "本周做",
        priority: "中",
        action: "按报告里的关键判断逐条补证据、补数据或补资料。",
        reason: "当前结论已有方向，但仍需要更多现场信息支撑。",
        ownerSuggestion: "业务执行同学",
      },
    ],
    fileSummaryOverview:
      options.fileItems.length > 0
        ? "当前会话已有资料可作为判断依据，报告已优先复用这些资料摘要。"
        : "当前会话没有附加资料，报告主要依据对话内容生成。",
  };
}

function mergeDraftWithFallback(
  draft: ReportModelDraft | null,
  fallback: ResolvedReportDraft
): ResolvedReportDraft {
  if (!draft) return fallback;

  const mergedAnalysisDimensions = REPORT_ANALYSIS_DIMENSIONS.map((title, index) => {
    const candidate = draft.analysisDimensions?.find((item) => item.title === title) || draft.analysisDimensions?.[index];
    const fallbackItem = fallback.analysisDimensions[index] || fallback.analysisDimensions[0];

    return {
      title,
      summary: cleanText(candidate?.summary) || fallbackItem.summary,
      sources: normalizeSources(candidate?.sources, fallbackItem.sources || []),
    };
  });

  return {
    reportTitle: cleanText(draft.reportTitle) || fallback.reportTitle,
    coverNote: cleanText(draft.coverNote) || fallback.coverNote,
    executiveSummary: {
      conversationGoal:
        cleanText(draft.executiveSummary?.conversationGoal) || fallback.executiveSummary.conversationGoal,
      topConclusions: normalizeStringArray(
        draft.executiveSummary?.topConclusions,
        fallback.executiveSummary.topConclusions
      ),
      overallJudgment:
        cleanText(draft.executiveSummary?.overallJudgment) || fallback.executiveSummary.overallJudgment,
    },
    problemDefinition: {
      coreRequest: cleanText(draft.problemDefinition?.coreRequest) || fallback.problemDefinition.coreRequest,
      providedContext: normalizeStringArray(
        draft.problemDefinition?.providedContext,
        fallback.problemDefinition.providedContext
      ),
      businessStage: cleanText(draft.problemDefinition?.businessStage) || fallback.problemDefinition.businessStage,
    },
    keyJudgments: normalizeKeyJudgments(draft.keyJudgments, fallback.keyJudgments),
    analysisDimensions: mergedAnalysisDimensions,
    actionPlan: normalizeActionPlan(draft.actionPlan, fallback.actionPlan),
    fileSummaryOverview: cleanText(draft.fileSummaryOverview) || fallback.fileSummaryOverview,
  };
}

function buildFinalReport(options: {
  input: ReportGenerationRequest;
  messages: Message[];
  knowledgeHits: KnowledgeBaseHit[];
  fileItems: ReportFileSummaryItem[];
  draft: ResolvedReportDraft;
}): ConversationReport {
  const allSources = [
    ...options.draft.keyJudgments.flatMap((item) => item.sources || []),
    ...options.draft.analysisDimensions.flatMap((item) => item.sources || []),
  ];
  const resolvedFileItems = options.fileItems.map((item) => ({
    ...item,
    references: Array.from(
      new Set(
        allSources
          .filter((source) => source.type === "file" && source.label === item.name)
          .map((source) => source.detail || source.label)
      )
    ),
  }));

  return {
    reportTitle: options.draft.reportTitle,
    generatedAt: Date.now(),
    conversationId: options.input.conversationId,
    conversationTitle: options.input.conversationTitle,
    roleId: options.input.roleId,
    roleName: options.input.roleName,
    modelId: REPORT_MODEL_ID,
    modelLabel: getChatModelOption(REPORT_MODEL_ID).label,
    answerMode: options.input.answerMode,
    coverNote: options.draft.coverNote,
    executiveSummary: options.draft.executiveSummary,
    problemDefinition: options.draft.problemDefinition,
    keyJudgments: options.draft.keyJudgments,
    analysisDimensions: options.draft.analysisDimensions,
    actionPlan: options.draft.actionPlan,
    fileSummary: {
      overview: options.draft.fileSummaryOverview,
      items: resolvedFileItems,
    },
    knowledgeHits: options.knowledgeHits,
    appendix: {
      transcript: options.messages,
    },
  };
}

function buildUserRequestSummary(messages: Message[]): string {
  const requests = messages
    .filter((message) => message.role === "user")
    .map((message) => trimTo(cleanText(message.content), 120))
    .filter(Boolean);

  const uniqueRequests = Array.from(new Set(requests)).slice(0, MAX_USER_REQUESTS);
  if (uniqueRequests.length === 0) return "- 无明确用户问题";

  return uniqueRequests.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function buildAssistantHighlights(messages: Message[]): string {
  const highlights = messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => extractTopLines(message.content, 3))
    .map((item) => trimTo(item, 120))
    .filter(Boolean);

  const uniqueHighlights = Array.from(new Set(highlights)).slice(0, MAX_ASSISTANT_HIGHLIGHTS);
  if (uniqueHighlights.length === 0) return "- 暂无可提炼的助手结论";

  return uniqueHighlights.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function buildConversationBodySummary(messages: Message[]): string {
  const timeline = messages.map((message, index) => {
    const prefix = message.role === "user" ? "用户" : "助手";
    const diagnosis =
      message.role === "assistant" && message.questionDiagnosis
        ? `｜诊断=${message.questionDiagnosis.categoryLabel}/${message.questionDiagnosis.mode}/${message.questionDiagnosis.completenessScore}%`
        : "";
    const kb =
      message.role === "assistant" && message.kbHits && message.kbHits.length > 0
        ? `｜KB=${message.kbHits
            .slice(0, 2)
            .map((hit) => hit.id)
            .join("、")}`
        : "";

    return `${index + 1}. ${prefix}${diagnosis}${kb}：${trimTo(cleanText(message.content), MAX_TIMELINE_ITEM_CHARS)}`;
  });

  return trimForModel(timeline.join("\n"), Math.max(6000, MAX_PROMPT_CHARS - 8000));
}

function normalizeStringArray(candidate: string[] | undefined, fallback: string[]): string[] {
  const normalized = (candidate || []).map((item) => cleanText(item)).filter(Boolean);
  return normalized.length > 0 ? normalized.slice(0, 6) : fallback;
}

function normalizeSources(
  candidate: ReportSourceReference[] | undefined,
  fallback: ReportSourceReference[]
): ReportSourceReference[] {
  const normalized = (candidate || [])
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      type:
        item.type === "knowledge_base" || item.type === "file" || item.type === "conversation"
          ? item.type
          : "conversation",
      label: cleanText(item.label) || "对话补充信息",
      detail: cleanText(item.detail),
    }))
    .filter((item) => item.label)
    .slice(0, 4);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeKeyJudgments(
  candidate: ReportModelDraft["keyJudgments"],
  fallback: ReportKeyJudgment[]
): ReportKeyJudgment[] {
  const normalized = (candidate || [])
    .map((item) => ({
      title: cleanText(item.title),
      conclusion: cleanText(item.conclusion),
      basis: cleanText(item.basis),
      sources: normalizeSources(item.sources, fallback[0]?.sources || []),
    }))
    .filter((item) => item.title && item.conclusion)
    .slice(0, 5);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeActionPlan(
  candidate: ReportModelDraft["actionPlan"],
  fallback: ResolvedReportDraft["actionPlan"]
): ResolvedReportDraft["actionPlan"] {
  const normalized = (candidate || [])
    .map<ResolvedReportDraft["actionPlan"][number]>((item) => {
      const timeframe: ResolvedReportDraft["actionPlan"][number]["timeframe"] =
        item.timeframe === "立刻做" || item.timeframe === "本周做" || item.timeframe === "后续跟进"
          ? item.timeframe
          : "本周做";
      const priority: ResolvedReportDraft["actionPlan"][number]["priority"] =
        item.priority === "高" || item.priority === "中" || item.priority === "低" ? item.priority : "中";

      return {
        timeframe,
        priority,
        action: cleanText(item.action),
        reason: cleanText(item.reason),
        ownerSuggestion: cleanText(item.ownerSuggestion),
      };
    })
    .filter((item) => item.action && item.reason)
    .slice(0, 6);

  return normalized.length > 0 ? normalized : fallback;
}

function buildFallbackSources(
  knowledgeHits: KnowledgeBaseHit[],
  fileItems: ReportFileSummaryItem[]
): ReportSourceReference[] {
  const sources: ReportSourceReference[] = [];

  if (knowledgeHits[0]) {
    sources.push({
      type: "knowledge_base",
      label: `${knowledgeHits[0].id}｜${knowledgeHits[0].title}`,
      detail: knowledgeHits[0].category,
    });
  }

  if (fileItems[0]) {
    sources.push({
      type: "file",
      label: fileItems[0].name,
      detail: "引用了资料摘要",
    });
  }

  sources.push({
    type: "conversation",
    label: "对话补充信息",
    detail: "来自当前会话原始问答",
  });

  return sources;
}

function extractTopLines(value: string, maxCount: number): string[] {
  const lines = value
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean)
    .filter((line) => line.length >= 10);

  return Array.from(new Set(lines)).slice(0, maxCount);
}

function inferBusinessStage(messages: Message[], fileItems: ReportFileSummaryItem[]): string {
  const joined = messages.map((item) => item.content).join("\n");

  if (/复盘|总结|优化/.test(joined)) return "复盘优化阶段";
  if (/冷启动|起量|起号/.test(joined)) return "冷启动阶段";
  if (/选品|值不值得做|判断/.test(joined)) return "判断评估阶段";
  if (fileItems.length > 0) return "资料分析阶段";
  return "问题诊断阶段";
}

function buildFallbackDimensionSummary(
  title: ReportAnalysisDimension["title"],
  options: {
    latestUserMessage: string;
    latestDiagnosis?: QuestionDiagnosis;
    knowledgeHits: KnowledgeBaseHit[];
    fileItems: ReportFileSummaryItem[];
  }
): string {
  switch (title) {
    case "核心问题识别":
      return `这轮对话最核心的任务是围绕“${trimTo(options.latestUserMessage, 60)}”给出可执行分析，而不是只做表面复述。`;
    case "已知信息完整度":
      return options.latestDiagnosis
        ? `最近一次诊断显示信息完整度为 ${options.latestDiagnosis.completenessScore}% ，仍需结合已有资料和上下文继续校准。`
        : "当前会话已提供部分背景，但仍需要结合更多业务现场信息验证。";
    case "关键判断结论":
      return "本轮已经形成一轮初步业务判断，后续应围绕关键结论继续拆成可执行动作。";
    case "判断依据来源":
      return `当前报告主要依据 ${options.knowledgeHits.length > 0 ? "知识库命中" : "对话补充信息"}${options.fileItems.length > 0 ? " 与 上传资料摘要" : ""} 综合得出。`;
    case "风险与不确定项":
      return "部分判断仍属于基于现有信息的推断，真正执行前建议补数据、补证据或补业务背景。";
    case "下一步动作建议":
      return "建议优先把关键结论转成动作清单，并在执行中继续补充证据和反馈。";
  }
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function trimTo(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}
