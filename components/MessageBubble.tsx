"use client";

import type { KnowledgeBaseHit, QuestionDiagnosis, RetrievalSourceHit } from "@/lib/types";
import { getChatModelOption } from "@/lib/chat-models";
import { getWikiCategoryLabel } from "@/lib/wiki-category-labels";
import { Message } from "@/lib/types";
import { sanitizeAssistantOutput } from "@/lib/sanitize-assistant-output";
import { parseMessageMarkdown } from "@/lib/client/message-markdown";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  showQuestionDiagnosis?: boolean;
}

function renderWebCitationChips(hits: RetrievalSourceHit[]) {
  if (hits.length === 0) return null;

  return (
    <div className="web-citation-row">
      {hits.map((hit) => {
        const chipTitle = hit.siteName ? `${hit.title} · ${hit.siteName}` : hit.title;
        const chipLabel = hit.siteName || hit.title;

        return (
          <a
            key={`${hit.type}-${hit.id}-${hit.title}`}
            href={hit.url}
            target="_blank"
            rel="noreferrer"
            title={chipTitle}
            className="web-citation-chip"
          >
            <span className="inline-citation-icon" aria-hidden="true">↗</span>
            <span className="web-citation-chip-text">{chipLabel}</span>
          </a>
        );
      })}
    </div>
  );
}

function renderStructuredResponse(content: string, isStreaming: boolean, webHits: RetrievalSourceHit[]) {
  const conclusionMatch = content.match(/(?:^|\n)###?\s*(?:1[)）]?\s*)?先说结论\s*\n([\s\S]*?)(?=\n###?\s|$)/);
  const usedWebHitIds = new Set<string>();

  const buildUnusedWebHits = () => webHits.filter((hit) => !usedWebHitIds.has(hit.id));

  if (conclusionMatch) {
    const conclusionText = conclusionMatch[1].trim();
    const rest = content.replace(conclusionMatch[0], "").trim();

    return (
      <div>
        <div className="conclusion-box">
          <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: parseMessageMarkdown(conclusionText, webHits, usedWebHitIds) }} />
        </div>
        <div
          className={`ai-markdown ${isStreaming ? "streaming-cursor" : ""}`}
          dangerouslySetInnerHTML={{ __html: parseMessageMarkdown(rest, webHits, usedWebHitIds) }}
        />
        {renderWebCitationChips(buildUnusedWebHits())}
      </div>
    );
  }

  return (
    <div>
      <div
        className={`ai-markdown ${isStreaming ? "streaming-cursor" : ""}`}
        dangerouslySetInnerHTML={{ __html: parseMessageMarkdown(content, webHits, usedWebHitIds) }}
      />
      {renderWebCitationChips(buildUnusedWebHits())}
    </div>
  );
}

function renderSourceTypeLabel(type: RetrievalSourceHit["type"]) {
  if (type === "wiki") return "Wiki";
  if (type === "file") return "资料";
  if (type === "web") return "网页";
  return "KB";
}

function renderSourceCategoryLabel(hit: RetrievalSourceHit) {
  if (!hit.category) return "";
  if (hit.type === "wiki") return getWikiCategoryLabel(hit.category);
  return hit.category;
}

function renderSourcePanel(hits: RetrievalSourceHit[]) {
  if (hits.length === 0) return null;

  return (
    <div
      className="mt-4 rounded-[22px] border px-4 py-4"
      style={{
        background: "linear-gradient(180deg, rgba(214, 161, 99, 0.1), var(--chip-soft))",
        borderColor: "var(--surface-outline-accent)",
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-amber)" }} />
        <span className="text-[11px] uppercase tracking-[0.22em]" style={{ color: "var(--color-amber-soft)" }}>
          起芽知识库
        </span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {hits.map((hit) => (
          <div
            key={`${hit.type}-${hit.id}-${hit.title}`}
            className="min-w-0 rounded-[16px] border px-3 py-2.5"
            style={{
              background: "var(--muted-surface)",
              borderColor: "var(--surface-outline)",
            }}
          >
            {hit.url ? (
              <a
                href={hit.url}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] font-medium underline decoration-transparent transition-colors hover:decoration-current"
                style={{ color: "var(--color-sidebar-text-bright)" }}
              >
                {renderSourceTypeLabel(hit.type)} · {hit.title}
              </a>
            ) : (
              <div className="text-[12px] font-medium" style={{ color: "var(--color-sidebar-text-bright)" }}>
                {renderSourceTypeLabel(hit.type)} · {hit.title}
              </div>
            )}
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
              {renderSourceCategoryLabel(hit)}
            </div>
            {hit.detail ? (
              <div className="mt-1 text-[11px] leading-5" style={{ color: "var(--color-ink-soft)" }}>
                {hit.detail}
              </div>
            ) : null}
            {hit.siteName || hit.publishedAt ? (
              <div className="mt-1 text-[11px] leading-5" style={{ color: "var(--color-ink-muted)" }}>
                {[hit.siteName, hit.publishedAt].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderQuestionDiagnosisPanel(diagnosis: QuestionDiagnosis) {
  const isClarify = diagnosis.mode === "clarify";

  return (
    <div
      className="mb-4 rounded-[22px] border px-4 py-4"
      style={{
        background: isClarify
          ? "linear-gradient(180deg, rgba(214, 161, 99, 0.1), var(--chip-soft))"
          : "linear-gradient(180deg, var(--subtle-surface), var(--muted-surface))",
        borderColor: isClarify ? "var(--surface-outline-accent)" : "var(--surface-outline-strong)",
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]"
          style={{
            background: isClarify ? "var(--chip-soft)" : "var(--subtle-surface)",
            color: isClarify ? "var(--color-amber-deep)" : "var(--color-sidebar-text-bright)",
          }}
        >
          {diagnosis.categoryLabel}
        </span>
        <span className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          信息完整度 {diagnosis.completenessScore}%
        </span>
        <span className="text-[11px]" style={{ color: isClarify ? "var(--color-amber-deep)" : "var(--color-ink-muted)" }}>
          {isClarify ? "当前模式：先补信息" : "当前模式：可直接回答"}
        </span>
      </div>

      <div className="text-[13px] leading-6" style={{ color: "var(--color-ink-soft)" }}>
        {diagnosis.summary}
      </div>

      {diagnosis.missingSlots.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {diagnosis.missingSlots.map((slot) => (
            <span
              key={slot}
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px]"
              style={{
                background: "var(--subtle-surface)",
                border: "1px solid var(--surface-outline)",
                color: "var(--color-sidebar-text-bright)",
              }}
            >
              缺少：{slot}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function MessageBubble({
  message,
  isStreaming = false,
  showQuestionDiagnosis = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : sanitizeAssistantOutput(message.content);
  const questionDiagnosis = !isUser && showQuestionDiagnosis ? message.questionDiagnosis : undefined;
  const modelLabel = !isUser && message.modelId && questionDiagnosis?.mode !== "clarify"
    ? getChatModelOption(message.modelId).label
    : null;
  const sourceLabel = questionDiagnosis?.mode === "clarify" ? "系统引导" : modelLabel;
  const kbHits = !isUser ? message.kbHits || [] : [];
  const allSourceHits = !isUser
    ? message.sourceHits || kbHits.map<RetrievalSourceHit>((hit: KnowledgeBaseHit) => ({
        id: hit.id,
        type: "knowledge_base",
        title: hit.title,
        category: hit.category,
      }))
    : [];
  const localSourceHits = allSourceHits.filter((hit) => hit.type !== "web");
  const webSourceHits = allSourceHits.filter((hit) => hit.type === "web");

  if (isUser) {
    return (
      <div className="mb-5 flex justify-end animate-fade-up">
        <div
          className="max-w-[74%] rounded-[26px] rounded-br-[12px] border px-5 py-4 text-[15px] leading-8"
          style={{
            background: "var(--surface-user-bubble)",
            color: "var(--color-sidebar-text-bright)",
            borderColor: "var(--surface-outline-accent)",
            boxShadow: "var(--card-shadow)",
          }}
        >
          {displayContent}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 flex justify-start animate-fade-up">
      <div className="flex max-w-[88%] gap-4">
        <div className="mt-1 shrink-0">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-[16px] text-sm font-semibold"
            style={{
              background: "var(--brand-badge)",
              color: "var(--brand-badge-text)",
              boxShadow: "var(--brand-badge-shadow)",
            }}
          >
            K
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {sourceLabel ? (
            <div className="mb-2 px-1 text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
              {sourceLabel}
            </div>
          ) : null}
          <div
            className="rounded-[30px] rounded-tl-[14px] border px-7 py-6"
            style={{
              background: "var(--surface-card)",
              borderColor: "var(--surface-outline)",
              boxShadow: "var(--card-shadow-strong)",
            }}
          >
            {displayContent || localSourceHits.length > 0 || webSourceHits.length > 0 || questionDiagnosis ? (
              <>
                {renderSourcePanel(localSourceHits)}
                {questionDiagnosis ? renderQuestionDiagnosisPanel(questionDiagnosis) : null}
                {displayContent ? (
                  renderStructuredResponse(displayContent, isStreaming, webSourceHits)
                ) : isStreaming ? (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: "var(--color-amber)",
                            animation: `blink 1s ease-in-out ${i * 0.2}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>思考中...</span>
                  </div>
                ) : renderWebCitationChips(webSourceHits)}
              </>
            ) : isStreaming ? (
              <div className="flex items-center gap-2 py-1">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: "var(--color-amber)",
                        animation: `blink 1s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>思考中...</span>
              </div>
            ) : (
              <>
                {renderSourcePanel(localSourceHits)}
                {renderWebCitationChips(webSourceHits)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
