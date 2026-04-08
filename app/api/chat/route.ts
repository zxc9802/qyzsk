import { NextRequest } from "next/server";
import { DEFAULT_ANSWER_MODE, isAnswerMode } from "@/lib/answer-modes";
import { DEFAULT_CHAT_MODEL_ID, getChatModelOption, isChatModelId } from "@/lib/chat-models";
import { DEFAULT_KNOWLEDGE_MODE, isKnowledgeMode } from "@/lib/knowledge-mode";
import { buildSimpleAnswerPrompt, buildSystemPrompt } from "@/lib/system-prompt";
import { buildConversationFileDiagnosisContext } from "@/lib/server/file-retrieval";
import { generateGeminiTextWithClient, type GeminiNativeClientConfig } from "@/lib/server/gemini-native";
import { buildConversationMediaContext, type OpenAIContentPart } from "@/lib/server/media-parts";
import { buildRetrievalOrchestratorResult } from "@/lib/server/retrieval-orchestrator";
import {
  buildModelDiagnosisPrompt,
  diagnoseQuestion,
  parseModelDiagnosisResult,
  type DiagnosisHistoryMessage,
} from "@/lib/server/question-diagnosis";
import { appSessionErrorResponse, assertAppSession } from "@/lib/server/app-session";
import type { QuestionDiagnosis } from "@/lib/types";

export const runtime = "nodejs";

const RECENT_HISTORY_LIMIT = 8;
const PROVIDER_CONFIG = {
  newapi: {
    apiKey: process.env.NEWAPI_KEY?.trim() || "",
    apiUrl: buildApiUrl(process.env.NEWAPI_BASE_URL || ""),
    displayName: "Gemini 网关",
  },
  yunwu: {
    apiKey: process.env.YUNWU_API_KEY?.trim() || "",
    apiUrl: buildApiUrl(process.env.YUNWU_BASE_URL || "https://yunwu.ai/v1"),
    displayName: "Yunwu 网关",
  },
} as const;

function resolveProviderConfig(modelOption: ReturnType<typeof getChatModelOption>) {
  const provider = PROVIDER_CONFIG[modelOption.provider];
  const apiKey =
    (modelOption.apiKeyEnvName ? process.env[modelOption.apiKeyEnvName]?.trim() : provider.apiKey) || "";

  return {
    ...provider,
    apiKey,
  };
}

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
  questionDiagnosis?: QuestionDiagnosis;
};

type UpstreamErrorShape = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type UpstreamErrorDetails = {
  message: string;
  type?: string;
  code?: string;
};

function buildApiUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/v1")
    ? `${trimmed}/chat/completions`
    : `${trimmed}/v1/chat/completions`;
}

function buildProviderBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createSseEventResponse(events: unknown[], status = 200) {
  const payload = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");

  return new Response(`${payload}data: [DONE]\n\n`, {
    status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function normalizeHistory(history: unknown): HistoryMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter((item): item is HistoryMessage => {
      return Boolean(
        item &&
        typeof item === "object" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
      );
    })
    .map((item) => ({
      role: item.role,
      content: item.content,
      questionDiagnosis:
        item.questionDiagnosis &&
        typeof item.questionDiagnosis === "object" &&
        typeof item.questionDiagnosis.categoryId === "string" &&
        typeof item.questionDiagnosis.categoryLabel === "string" &&
        (item.questionDiagnosis.mode === "answer" || item.questionDiagnosis.mode === "clarify")
          ? item.questionDiagnosis
          : undefined,
    }))
    .slice(-RECENT_HISTORY_LIMIT);
}

async function runModelDiagnosis(
  apiUrl: string,
  apiKey: string,
  apiModel: string,
  prompt: string | OpenAIContentPart[]
): Promise<string | null> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: apiModel,
      stream: false,
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: "你只做 JSON 诊断输出，不做业务回答，不要输出多余文字。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  try {
    const parsed = await response.json();
    const content = parsed?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

function isGeminiModel(modelOption: ReturnType<typeof getChatModelOption>): boolean {
  return modelOption.apiModel.startsWith("gemini-");
}

function buildGeminiClient(
  modelOption: ReturnType<typeof getChatModelOption>,
  provider: ReturnType<typeof resolveProviderConfig>
): GeminiNativeClientConfig | null {
  if (!isGeminiModel(modelOption) || !provider.apiKey) return null;

  if (modelOption.provider === "newapi") {
    const baseUrl = buildProviderBaseUrl(process.env.NEWAPI_BASE_URL || "");
    if (!baseUrl) return null;

    return {
      baseUrl,
      apiKey: provider.apiKey,
      authMode: "query",
    };
  }

  const baseUrl = buildProviderBaseUrl(process.env.YUNWU_BASE_URL || "https://yunwu.ai/v1");
  if (!baseUrl) return null;

  return {
    baseUrl,
    apiKey: provider.apiKey,
    authMode: "bearer",
  };
}

function buildOpenAITextPart(text: string): OpenAIContentPart {
  return {
    type: "text",
    text,
  };
}

function buildGeminiAnswerContext(options: {
  selectedScopeContext: string;
  knowledgeContext: string;
  fileContext: string;
  recentHistory: HistoryMessage[];
  message: string;
}): string {
  const historyText = options.recentHistory.length > 0
    ? `最近对话：\n${options.recentHistory
        .map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.content}`)
        .join("\n")}`
    : "";

  return [
    options.selectedScopeContext,
    options.knowledgeContext,
    options.fileContext,
    historyText,
    `当前用户问题：${options.message}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function readUpstreamError(text: string): UpstreamErrorDetails {
  try {
    const parsed = JSON.parse(text) as UpstreamErrorShape;
    const message = parsed.error?.message?.trim();
    if (message) {
      return {
        message,
        type: parsed.error?.type,
        code: parsed.error?.code,
      };
    }
  } catch {
    // Fall through to raw text handling.
  }

  const fallback = text.trim();
  if (!fallback) {
    return { message: "上游模型服务返回了空错误信息。" };
  }

  return { message: fallback.slice(0, 300) };
}

export async function POST(req: NextRequest) {
  try {
    try {
      await assertAppSession(req);
    } catch (error) {
      return appSessionErrorResponse(error, req);
    }

    const { message, role, history, conversationId, modelId, answerMode, knowledgeMode } = await req.json();

    if (!message || typeof message !== "string") {
      return createJsonResponse({ error: "Missing message" }, 400);
    }

    const resolvedModelId =
      typeof modelId === "string" && isChatModelId(modelId)
        ? modelId
        : DEFAULT_CHAT_MODEL_ID;
    const resolvedAnswerMode =
      typeof answerMode === "string" && isAnswerMode(answerMode)
        ? answerMode
        : DEFAULT_ANSWER_MODE;
    const resolvedKnowledgeMode =
      typeof knowledgeMode === "string" && isKnowledgeMode(knowledgeMode)
        ? knowledgeMode
        : DEFAULT_KNOWLEDGE_MODE;
    const modelOption = getChatModelOption(resolvedModelId);
    const provider = resolveProviderConfig(modelOption);
    const recentHistory = normalizeHistory(history);
    const mediaContext =
      typeof conversationId === "string" && conversationId
        ? await buildConversationMediaContext(conversationId)
        : { hasMedia: false, geminiParts: [], openAIParts: [] };
    let diagnosis: QuestionDiagnosis | undefined;
    let clarificationReply: string | undefined;

    if (resolvedAnswerMode === "deep") {
      const diagnosisFileContext =
        typeof conversationId === "string" && conversationId
          ? await buildConversationFileDiagnosisContext(conversationId, message)
          : "";
      const fallbackDiagnosisResult = diagnoseQuestion(message, role || "new", recentHistory as DiagnosisHistoryMessage[]);
      let diagnosisResult = fallbackDiagnosisResult;

      if (provider.apiUrl && provider.apiKey) {
        const diagnosisPrompt = buildModelDiagnosisPrompt(
          message,
          role || "new",
          recentHistory as DiagnosisHistoryMessage[],
          diagnosisFileContext
        );
        const geminiClient = buildGeminiClient(modelOption, provider);
        const modelDiagnosisContent =
          geminiClient && mediaContext.hasMedia
            ? await generateGeminiTextWithClient({
                client: geminiClient,
                model: modelOption.apiModel,
                systemInstruction: "你只做 JSON 诊断输出，不做业务回答，不要输出多余文字。",
                parts: [{ text: diagnosisPrompt }, ...mediaContext.geminiParts],
                temperature: 0.1,
              }).catch(() => null)
            : await runModelDiagnosis(
                provider.apiUrl,
                provider.apiKey,
                modelOption.apiModel,
                mediaContext.hasMedia
                  ? [buildOpenAITextPart(diagnosisPrompt), ...mediaContext.openAIParts]
                  : diagnosisPrompt
              );

        diagnosisResult = parseModelDiagnosisResult(modelDiagnosisContent || "", message) || fallbackDiagnosisResult;
      }

      diagnosis = diagnosisResult.diagnosis;
      clarificationReply = diagnosisResult.clarificationReply || undefined;
    }

    if (!provider.apiUrl || !provider.apiKey) {
      return createSseEventResponse(
        [
          ...(diagnosis ? [{ questionDiagnosis: diagnosis }] : []),
          { content: `${provider.displayName} 还没有配置完整，请检查 .env 里的对应网关地址和 API Key。` },
        ]
      );
    }

    if (clarificationReply) {
      return createSseEventResponse(
        [
          ...(diagnosis ? [{ questionDiagnosis: diagnosis }] : []),
          { content: clarificationReply },
        ]
      );
    }

    const systemPrompt =
      resolvedAnswerMode === "deep"
        ? buildSystemPrompt(role || "new")
        : buildSimpleAnswerPrompt();
    const selectedScopeContext = diagnosis?.selectedScope
      ? `当前用户已经明确选择的细分场景：${diagnosis.selectedScope}。请按这个场景回答。`
      : "";
    const retrieval = await buildRetrievalOrchestratorResult({
      query: message,
      role: role || "new",
      conversationId: typeof conversationId === "string" ? conversationId : undefined,
      history: recentHistory,
      diagnosis,
      knowledgeMode: resolvedKnowledgeMode,
    });
    const knowledgeContext = retrieval.knowledgeContext;
    const fileContext = retrieval.fileContext;
    const kbHits = retrieval.kbHits;
    const sourceHits = retrieval.sourceHits;
    const geminiClient = buildGeminiClient(modelOption, provider);

    if (geminiClient && mediaContext.hasMedia) {
      try {
        const answerText = await generateGeminiTextWithClient({
          client: geminiClient,
          model: modelOption.apiModel,
          systemInstruction: systemPrompt,
          parts: [
            {
              text: buildGeminiAnswerContext({
                selectedScopeContext,
                knowledgeContext,
                fileContext,
                recentHistory,
                message,
              }),
            },
            ...mediaContext.geminiParts,
          ],
          temperature: 0.3,
        });

        return createSseEventResponse(
          [
            ...(diagnosis ? [{ questionDiagnosis: diagnosis }] : []),
            ...(kbHits.length > 0 ? [{ kbHits }] : []),
            ...(sourceHits.length > 0 ? [{ sourceHits }] : []),
            { content: answerText },
          ]
        );
      } catch (error) {
        console.error("Gemini multimodal answer fallback:", error);
      }
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...(selectedScopeContext ? [{ role: "system", content: selectedScopeContext }] : []),
      ...(knowledgeContext ? [{ role: "system", content: knowledgeContext }] : []),
      ...(fileContext ? [{ role: "system", content: fileContext }] : []),
      ...recentHistory.map((item) => ({
        role: item.role,
        content: item.content,
      })),
      {
        role: "user",
        content: mediaContext.hasMedia
          ? [buildOpenAITextPart(message), ...mediaContext.openAIParts]
          : message,
      },
    ];

    const response = await fetch(provider.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelOption.apiModel,
        messages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      const upstreamError = readUpstreamError(errText);
      console.error("Chat provider error:", provider.displayName, response.status, upstreamError);

      const isQuotaError =
        upstreamError.code === "insufficient_quota" ||
        upstreamError.type === "insufficient_quota" ||
        /quota|billing/i.test(upstreamError.message);

      const userMessage =
        response.status === 401
          ? `${provider.displayName} 鉴权失败，请检查对应的 API Key 是否正确。`
          : isQuotaError
            ? `${provider.displayName} 已经接通，但当前网关额度不足，暂时还不能正常回答。请充值或切换到有额度的模型。`
            : `模型服务调用失败：${upstreamError.message}`;

      return createSseEventResponse(
        [
          ...(diagnosis ? [{ questionDiagnosis: diagnosis }] : []),
          { content: userMessage },
        ]
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let closed = false;

        const safeEnqueue = (payload: string) => {
          if (closed) return;

          try {
            controller.enqueue(encoder.encode(payload));
          } catch {
            closed = true;
          }
        };

        const safeClose = () => {
          if (closed) return;

          try {
            controller.close();
          } catch {
            // Ignore close errors after the consumer disconnects.
          } finally {
            closed = true;
          }
        };

        if (!reader) {
          safeEnqueue("data: [DONE]\n\n");
          safeClose();
          return;
        }

        try {
          if (diagnosis) {
            safeEnqueue(`data: ${JSON.stringify({ questionDiagnosis: diagnosis })}\n\n`);
          }

          if (kbHits.length > 0) {
            safeEnqueue(`data: ${JSON.stringify({ kbHits })}\n\n`);
          }

          if (sourceHits.length > 0) {
            safeEnqueue(`data: ${JSON.stringify({ sourceHits })}\n\n`);
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;

              const data = line.slice(6).trim();
              if (data === "[DONE]") {
                safeEnqueue("data: [DONE]\n\n");
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  safeEnqueue(`data: ${JSON.stringify({ content })}\n\n`);
                }
              } catch {
                // Skip malformed chunks from the upstream stream.
              }
            }
          }
        } catch (error) {
          console.error("Stream read error:", error);
        } finally {
          safeEnqueue("data: [DONE]\n\n");
          safeClose();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return createJsonResponse({ error: "Internal server error" }, 500);
  }
}
