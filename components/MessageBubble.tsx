"use client";

import type { KnowledgeBaseHit, QuestionDiagnosis, RetrievalSourceHit } from "@/lib/types";
import { getChatModelOption } from "@/lib/chat-models";
import { getWikiCategoryLabel } from "@/lib/wiki-category-labels";
import { Message } from "@/lib/types";
import { sanitizeAssistantOutput } from "@/lib/sanitize-assistant-output";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function parseMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^---$/gm, "<hr />");
  html = html.replace(/^#{1,6}\s*(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  html = html.replace(/^[*\-] (.+)$/gm, '<li class="md-ul">$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-ol">$1</li>');
  html = html.replace(/((?:<li class="md-ul">.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(/((?:<li class="md-ol">.*<\/li>\n?)+)/g, "<ol>$1</ol>");
  html = html.replace(/ class="md-ul"/g, "").replace(/ class="md-ol"/g, "");

  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;

  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/<p>\s*(<h3>)/g, "$1");
  html = html.replace(/(<\/h3>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ol>)/g, "$1");
  html = html.replace(/(<\/ol>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<blockquote>)/g, "$1");
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<hr \/>)/g, "$1");
  html = html.replace(/(<hr \/>)\s*<\/p>/g, "$1");

  return html;
}

function renderStructuredResponse(content: string, isStreaming: boolean) {
  const conclusionMatch = content.match(/(?:^|\n)###?\s*(?:1[)）]?\s*)?先说结论\s*\n([\s\S]*?)(?=\n###?\s|$)/);

  if (conclusionMatch) {
    const conclusionText = conclusionMatch[1].trim();
    const rest = content.replace(conclusionMatch[0], "").trim();

    return (
      <div>
        <div className="conclusion-box">
          <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: parseMarkdown(conclusionText) }} />
        </div>
        <div
          className={`ai-markdown ${isStreaming ? "streaming-cursor" : ""}`}
          dangerouslySetInnerHTML={{ __html: parseMarkdown(rest) }}
        />
      </div>
    );
  }

  return (
    <div
      className={`ai-markdown ${isStreaming ? "streaming-cursor" : ""}`}
      dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
    />
  );
}

function renderSourceTypeLabel(type: RetrievalSourceHit["type"]) {
  if (type === "wiki") return "Wiki";
  if (type === "file") return "资料";
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
            <div className="text-[12px] font-medium" style={{ color: "var(--color-sidebar-text-bright)" }}>
              {renderSourceTypeLabel(hit.type)} · {hit.title}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
              {renderSourceCategoryLabel(hit)}
            </div>
            {hit.detail ? (
              <div className="mt-1 text-[11px] leading-5" style={{ color: "var(--color-ink-soft)" }}>
                {hit.detail}
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

export default function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : sanitizeAssistantOutput(message.content);
  const questionDiagnosis = !isUser ? message.questionDiagnosis : undefined;
  const modelLabel = !isUser && message.modelId && questionDiagnosis?.mode !== "clarify"
    ? getChatModelOption(message.modelId).label
    : null;
  const sourceLabel = questionDiagnosis?.mode === "clarify" ? "系统引导" : modelLabel;
  const kbHits = !isUser ? message.kbHits || [] : [];
  const sourceHits = !isUser
    ? message.sourceHits || kbHits.map<RetrievalSourceHit>((hit: KnowledgeBaseHit) => ({
        id: hit.id,
        type: "knowledge_base",
        title: hit.title,
        category: hit.category,
      }))
    : [];

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
            {displayContent || sourceHits.length > 0 || questionDiagnosis ? (
              <>
                {renderSourcePanel(sourceHits)}
                {questionDiagnosis ? renderQuestionDiagnosisPanel(questionDiagnosis) : null}
                {displayContent ? (
                  renderStructuredResponse(displayContent, isStreaming)
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
                ) : null}
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
              renderSourcePanel(sourceHits)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
