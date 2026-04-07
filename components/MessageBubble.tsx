"use client";

import type { KnowledgeBaseHit, QuestionDiagnosis } from "@/lib/types";
import { getChatModelOption } from "@/lib/chat-models";
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

  // Headers
  html = html.replace(/^#{1,6}\s*(.+)$/gm, "<h3>$1</h3>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Unordered lists
  html = html.replace(/^[*\-] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = "<p>" + html + "</p>";

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/<p>\s*(<h3>)/g, "$1");
  html = html.replace(/(<\/h3>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<blockquote>)/g, "$1");
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, "$1");

  return html;
}

function renderStructuredResponse(content: string, isStreaming: boolean) {
  const conclusionMatch = content.match(
    /(?:^|\n)###?\s*(?:1[)）]?\s*)?先说结论\s*\n([\s\S]*?)(?=\n###?\s|$)/
  );

  if (conclusionMatch) {
    const conclusionText = conclusionMatch[1].trim();
    const rest = content.replace(conclusionMatch[0], "").trim();

    return (
      <div>
        <div className="conclusion-box">
          <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: parseMarkdown(conclusionText) }} />
        </div>
        <div className={`ai-markdown ${isStreaming ? "streaming-cursor" : ""}`}
          dangerouslySetInnerHTML={{ __html: parseMarkdown(rest) }} />
      </div>
    );
  }

  return (
    <div className={`ai-markdown ${isStreaming ? "streaming-cursor" : ""}`}
      dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }} />
  );
}

function renderKnowledgeBasePanel(hits: KnowledgeBaseHit[]) {
  if (hits.length === 0) return null;

  return (
    <div
      className="mt-3 rounded-xl px-3 py-3"
      style={{
        background: "rgba(212, 148, 76, 0.08)",
        border: "1px solid rgba(212, 148, 76, 0.18)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-amber)" }} />
        <span className="text-[11px] font-medium" style={{ color: "var(--color-amber-deep)" }}>
          本轮命中的知识库条目
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {hits.map((hit) => (
          <div
            key={`${hit.id}-${hit.title}`}
            className="min-w-0 rounded-lg px-2.5 py-2"
            style={{
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(212, 148, 76, 0.14)",
            }}
          >
            <div className="text-[11px] font-medium" style={{ color: "var(--color-ink)" }}>
              {hit.id} · {hit.title}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--color-ink-muted)" }}>
              {hit.category}
            </div>
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
      className="mb-3 rounded-xl px-3 py-3"
      style={{
        background: isClarify ? "rgba(212, 148, 76, 0.08)" : "rgba(31, 41, 55, 0.04)",
        border: isClarify
          ? "1px solid rgba(212, 148, 76, 0.18)"
          : "1px solid rgba(31, 41, 55, 0.08)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium"
          style={{
            background: isClarify ? "rgba(212, 148, 76, 0.14)" : "rgba(31, 41, 55, 0.08)",
            color: isClarify ? "var(--color-amber-deep)" : "var(--color-ink)",
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

      <div className="text-[12px] leading-5" style={{ color: "var(--color-ink-muted)" }}>
        {diagnosis.summary}
      </div>

      {diagnosis.missingSlots.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {diagnosis.missingSlots.map((slot) => (
            <span
              key={slot}
              className="inline-flex items-center rounded-full px-2 py-1 text-[10px]"
              style={{
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(212, 148, 76, 0.14)",
                color: "var(--color-ink)",
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

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 animate-fade-up">
        <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed"
          style={{
            background: "var(--color-amber-glow)",
            color: "var(--color-ink)",
            border: "1px solid rgba(212, 148, 76, 0.15)",
          }}>
          {displayContent}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-6 animate-fade-up">
      <div className="flex gap-3 max-w-[85%]">
        {/* Avatar */}
        <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm mt-1"
          style={{ background: "var(--color-amber)", color: "#fff", fontWeight: 600 }}>
          K
        </div>
        {/* Content */}
        <div className="flex-1">
          {sourceLabel ? (
            <div className="mb-1.5 px-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              {sourceLabel}
            </div>
          ) : null}
          <div
            className="px-7 py-5 rounded-2xl rounded-tl-md"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-light)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
            }}
          >
            {displayContent || kbHits.length > 0 || questionDiagnosis ? (
              <>
                {questionDiagnosis ? renderQuestionDiagnosisPanel(questionDiagnosis) : null}
                {displayContent ? (
                  renderStructuredResponse(displayContent, isStreaming)
                ) : isStreaming ? (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
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
                {renderKnowledgeBasePanel(kbHits)}
              </>
            ) : isStreaming ? (
              <div className="flex items-center gap-2 py-1">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
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
              renderKnowledgeBasePanel(kbHits)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
