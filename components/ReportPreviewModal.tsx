"use client";

import { useRef, useState, type ReactNode } from "react";
import type { ConversationReport } from "@/lib/report";

interface ReportPreviewModalProps {
  open: boolean;
  report: ConversationReport | null;
  loading: boolean;
  error?: string | null;
  onClose: () => void;
  onRetry: () => void;
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function buildFileName(report: ConversationReport): string {
  const safeTitle = report.conversationTitle.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 40) || "会话分析报告";
  const date = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(report.generatedAt)
    .replace(/\//g, "-");

  return `${safeTitle}-${date}.pdf`;
}

export default function ReportPreviewModal({
  open,
  report,
  loading,
  error,
  onClose,
  onRetry,
}: ReportPreviewModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!open) return null;

  const handleDownload = async () => {
    if (!report || !contentRef.current || isDownloading) return;

    setIsDownloading(true);
    try {
      const html2pdfModule = await import("html2pdf.js");
      const html2pdf = html2pdfModule.default;

      await html2pdf()
        .set({
          margin: [10, 10, 12, 10],
          filename: buildFileName(report),
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#f6f0e6",
          },
          jsPDF: {
            unit: "mm",
            format: "a4",
            orientation: "portrait",
          },
          pagebreak: {
            mode: ["css", "legacy"],
            before: [".report-page-break"],
            avoid: [
              ".report-card",
              ".report-meta-card",
              ".report-chip-row",
              ".report-transcript-header",
              ".report-transcript-paragraph",
            ],
          },
        })
        .from(contentRef.current)
        .save();
    } catch (downloadError) {
      console.error("Report download error:", downloadError);
      window.alert("PDF 下载失败，请稍后再试。");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4 py-4 backdrop-blur-md md:px-8">
      <div
        className="w-full max-w-[1200px] overflow-hidden rounded-[30px] border"
        style={{
          borderColor: "var(--surface-outline)",
          background: "var(--shell-surface)",
          boxShadow: "0 28px 90px rgba(10, 16, 27, 0.24)",
        }}
      >
        <div
          className="flex items-center justify-between gap-4 border-b px-5 py-4 md:px-8"
          style={{ borderColor: "var(--surface-outline)" }}
        >
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em]" style={{ color: "var(--color-amber-soft)" }}>
              Session Report
            </div>
            <h2 className="mt-2 text-xl font-semibold md:text-2xl" style={{ color: "var(--color-sidebar-text-bright)" }}>
              会话分析报告
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-full border px-4 py-2 text-sm transition-colors cursor-pointer"
              style={{
                borderColor: "var(--surface-outline-strong)",
                color: "var(--color-ink-soft)",
                background: "var(--subtle-surface)",
              }}
            >
              关闭
            </button>
            <button
              onClick={handleDownload}
              disabled={!report || loading || isDownloading}
              className="rounded-full px-4 py-2 text-sm font-medium transition-all cursor-pointer disabled:cursor-default"
              style={{
                background: "var(--brand-badge)",
                color: "var(--brand-badge-text)",
                opacity: !report || loading || isDownloading ? 0.55 : 1,
                boxShadow: "var(--button-accent-shadow)",
              }}
            >
              {isDownloading ? "正在导出..." : "下载 PDF"}
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-4 py-4 md:px-8 md:py-6">
          {loading ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-[28px] border bg-white/60 px-6 py-10 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: "var(--color-amber-deep)" }} />
              <div className="text-lg font-medium" style={{ color: "var(--color-sidebar-text-bright)" }}>
                正在整理这轮会话的分析报告
              </div>
              <p className="max-w-md text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                我们会基于当前会话全量消息、知识库命中和已上传资料，先生成一份可预览的业务分析报告。
              </p>
            </div>
          ) : error ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[28px] border bg-white/60 px-6 py-10 text-center">
              <div className="text-lg font-medium" style={{ color: "var(--color-sidebar-text-bright)" }}>
                报告生成失败
              </div>
              <p className="max-w-md text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                {error}
              </p>
              <button
                onClick={onRetry}
                className="rounded-full px-4 py-2 text-sm font-medium transition-all cursor-pointer"
                style={{
                  background: "var(--brand-badge)",
                  color: "var(--brand-badge-text)",
                  boxShadow: "var(--button-accent-shadow)",
                }}
              >
                重新生成
              </button>
            </div>
          ) : report ? (
            <div className="mx-auto max-w-[920px]">
              <div
                ref={contentRef}
                className="rounded-[28px] border px-8 py-8 md:px-12 md:py-12"
                style={{
                  background: "linear-gradient(180deg, #fbf7ef 0%, #f5efe4 100%)",
                  borderColor: "rgba(43, 55, 74, 0.12)",
                  color: "#1f2a3d",
                  boxShadow: "0 24px 48px rgba(26, 34, 48, 0.08)",
                }}
              >
                <div className="border-b pb-8" style={{ borderColor: "rgba(43, 55, 74, 0.12)" }}>
                  <div className="text-[11px] uppercase tracking-[0.28em]" style={{ color: "#ad7a35" }}>
                    Business Analysis Report
                  </div>
                  <h1 className="mt-4 text-3xl font-semibold leading-tight md:text-4xl">{report.reportTitle}</h1>
                  <p className="mt-4 max-w-3xl text-base leading-8 text-[#50607a]">{report.coverNote}</p>

                  <div className="mt-6 grid gap-3 text-sm md:grid-cols-2">
                    <ReportMetaItem label="会话标题" value={report.conversationTitle} />
                    <ReportMetaItem label="岗位" value={report.roleName} />
                    <ReportMetaItem label="模型" value={report.modelLabel} />
                    <ReportMetaItem label="生成时间" value={formatDateTime(report.generatedAt)} />
                  </div>
                </div>

                <ReportSection title="执行摘要" pageBreak>
                  <SectionLabel text="本轮对话在解决什么问题" />
                  <p className="mt-3 text-[15px] leading-8 text-[#2c3850]">
                    {report.executiveSummary.conversationGoal}
                  </p>

                  <SectionLabel text="最重要的结论" />
                  <ul className="mt-3 space-y-3">
                    {report.executiveSummary.topConclusions.map((item, index) => (
                      <li key={`${item}-${index}`} className="report-card rounded-[18px] border px-4 py-3 text-[15px] leading-7" style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.65)" }}>
                        {item}
                      </li>
                    ))}
                  </ul>

                  <SectionLabel text="总体判断" />
                  <p className="report-card mt-3 rounded-[18px] border px-4 py-4 text-[15px] leading-8" style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.7)" }}>
                    {report.executiveSummary.overallJudgment}
                  </p>
                </ReportSection>

                <ReportSection title="问题定义与背景">
                  <SectionLabel text="用户核心诉求" />
                  <p className="mt-3 text-[15px] leading-8 text-[#2c3850]">{report.problemDefinition.coreRequest}</p>

                  <SectionLabel text="已提供的上下文" />
                  <ul className="mt-3 space-y-2">
                    {report.problemDefinition.providedContext.map((item, index) => (
                      <li key={`${item}-${index}`} className="report-card rounded-[16px] border px-4 py-3 text-[15px] leading-7" style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.68)" }}>
                        {item}
                      </li>
                    ))}
                  </ul>

                  <SectionLabel text="当前业务场景 / 阶段" />
                  <p className="mt-3 text-[15px] leading-8 text-[#2c3850]">{report.problemDefinition.businessStage}</p>
                </ReportSection>

                <ReportSection title="关键分析与判断依据">
                  <div className="space-y-5">
                    {report.keyJudgments.map((item, index) => (
                      <div
                        key={`${item.title}-${index}`}
                        className="report-card rounded-[22px] border px-5 py-5"
                        style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.72)" }}
                      >
                        <div className="text-[11px] uppercase tracking-[0.24em] text-[#ad7a35]">Judgment {index + 1}</div>
                        <h3 className="mt-3 text-xl font-semibold">{item.title}</h3>
                        <p className="mt-3 text-[15px] leading-8 text-[#2c3850]">{item.conclusion}</p>
                        <p className="mt-3 text-sm leading-7 text-[#647089]">{item.basis}</p>
                        <SourceChips sources={item.sources} />
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {report.analysisDimensions.map((item) => (
                      <div
                        key={item.title}
                        className="report-card rounded-[20px] border px-5 py-4"
                        style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.7)" }}
                      >
                        <div className="text-sm font-semibold">{item.title}</div>
                        <p className="mt-3 text-sm leading-7 text-[#4e5d77]">{item.summary}</p>
                        <SourceChips sources={item.sources} compact />
                      </div>
                    ))}
                  </div>
                </ReportSection>

                <ReportSection title="可执行建议">
                  <div className="space-y-4">
                    {report.actionPlan.map((item, index) => (
                      <div
                        key={`${item.action}-${index}`}
                        className="report-card rounded-[20px] border px-5 py-5"
                        style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.72)" }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge text={item.timeframe} />
                          <Badge text={`${item.priority}优先级`} muted />
                        </div>
                        <div className="mt-3 text-[17px] font-medium leading-8">{item.action}</div>
                        <p className="mt-2 text-sm leading-7 text-[#56657d]">{item.reason}</p>
                        {item.ownerSuggestion ? (
                          <p className="mt-2 text-sm leading-7 text-[#647089]">建议执行角色：{item.ownerSuggestion}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </ReportSection>

                <ReportSection title="资料与引用摘要">
                  <p className="text-[15px] leading-8 text-[#2c3850]">{report.fileSummary.overview}</p>

                  {report.fileSummary.items.length > 0 ? (
                    <div className="mt-5 space-y-4">
                      {report.fileSummary.items.map((item) => (
                        <div
                          key={item.id}
                          className="report-card rounded-[20px] border px-5 py-4"
                          style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.72)" }}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold">{item.name}</div>
                            <Badge text={item.kind === "document" ? "文档" : item.kind === "image" ? "图片" : "视频"} muted />
                            {item.active ? <Badge text="当前参考资料" /> : null}
                          </div>
                          <p className="mt-3 text-sm leading-7 text-[#55657d]">{item.summary}</p>
                          {item.references.length > 0 ? (
                            <ul className="mt-3 space-y-2">
                              {item.references.map((reference, index) => (
                                <li key={`${reference}-${index}`} className="text-sm leading-7 text-[#647089]">
                                  - {reference}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-sm leading-7 text-[#7b879c]">当前报告主体没有单独标注这份资料的引用结论。</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-[20px] border px-5 py-5 text-sm leading-7 text-[#647089]" style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.65)" }}>
                      当前会话没有已就绪的上传资料，因此这份报告主要基于对话内容和知识库命中整理。
                    </div>
                  )}

                  {report.knowledgeHits.length > 0 ? (
                    <div className="mt-5 rounded-[20px] border px-5 py-4" style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.72)" }}>
                      <div className="text-sm font-semibold">本轮知识库命中</div>
                      <div className="report-chip-row mt-3 flex flex-wrap gap-2">
                        {report.knowledgeHits.map((hit) => (
                          <span
                            key={hit.id}
                            className="rounded-full border px-3 py-1 text-xs leading-6"
                            style={{ borderColor: "rgba(43, 55, 74, 0.14)", background: "rgba(248, 241, 229, 0.92)", color: "#8d632a" }}
                          >
                            {hit.id} · {hit.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </ReportSection>

                <ReportSection title="附录：完整聊天记录" pageBreak>
                  <div className="space-y-3">
                    {report.appendix.transcript.map((message) => (
                      <div
                        key={message.id}
                        className="rounded-[18px] border px-4 py-4"
                        style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.72)" }}
                      >
                        <div className="report-transcript-header flex flex-wrap items-center gap-3 text-xs leading-6 text-[#7d8799]">
                          <span>{message.role === "user" ? "用户" : "助手"}</span>
                          <span>{formatDateTime(message.timestamp)}</span>
                          {message.modelId ? <span>{message.modelId}</span> : null}
                        </div>
                        <div className="mt-3 space-y-3 text-[14px] leading-7 text-[#2c3850]">
                          {splitTranscriptContent(message.content).map((paragraph, index) => (
                            <p key={`${message.id}-${index}`} className="report-transcript-paragraph whitespace-pre-wrap">
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ReportSection>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReportMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-meta-card rounded-[18px] border px-4 py-3" style={{ borderColor: "rgba(43, 55, 74, 0.12)", background: "rgba(255,255,255,0.65)" }}>
      <div className="text-[11px] uppercase tracking-[0.24em] text-[#ad7a35]">{label}</div>
      <div className="mt-2 text-sm text-[#42506a]">{value}</div>
    </div>
  );
}

function ReportSection({
  title,
  children,
  pageBreak = false,
}: {
  title: string;
  children: ReactNode;
  pageBreak?: boolean;
}) {
  return (
    <section className={`mt-8 ${pageBreak ? "report-page-break" : ""}`}>
      <div className="border-b pb-3" style={{ borderColor: "rgba(43, 55, 74, 0.12)" }}>
        <div className="text-[11px] uppercase tracking-[0.24em] text-[#ad7a35]">Section</div>
        <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <div className="mt-6 text-xs uppercase tracking-[0.22em] text-[#ad7a35]">{text}</div>;
}

function Badge({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <span
      className="rounded-full px-3 py-1 text-xs leading-6"
      style={{
        background: muted ? "rgba(43, 55, 74, 0.07)" : "rgba(248, 241, 229, 0.92)",
        color: muted ? "#61708a" : "#8d632a",
      }}
    >
      {text}
    </span>
  );
}

function SourceChips({ sources, compact = false }: { sources: ConversationReport["keyJudgments"][number]["sources"]; compact?: boolean }) {
  if (!sources.length) return null;

  return (
    <div className={`report-chip-row flex flex-wrap gap-2 ${compact ? "mt-3" : "mt-4"}`}>
      {sources.map((source, index) => (
        <span
          key={`${source.type}-${source.label}-${index}`}
          className="rounded-full border px-3 py-1 text-xs leading-6"
          style={{ borderColor: "rgba(43, 55, 74, 0.14)", background: "rgba(255,255,255,0.88)", color: "#61708a" }}
        >
          {source.type === "knowledge_base" ? "知识库" : source.type === "file" ? "资料" : "对话"} · {source.label}
        </span>
      ))}
    </div>
  );
}

function splitTranscriptContent(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}
