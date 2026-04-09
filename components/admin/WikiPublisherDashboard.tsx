"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_WIKI_DRAFT_MODEL_ID } from "@/lib/chat-models";
import { extractApiErrorMessage, readJsonSafely, redirectToMainAppIfNeeded } from "@/lib/client/api-response";
import type { AppViewer } from "@/lib/client/app-session";
import type { WikiDraft } from "@/lib/wiki-types";
import { AdminErrorBanner, AdminPageHeader, formatDate } from "@/components/admin/WikiAdminShared";

type PublisherOverviewPayload = {
  user?: AppViewer | null;
  stats?: {
    totalSubmissions: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    rawSourceCount: number;
    lastUpdatedAt?: string | null;
  };
  drafts?: WikiDraft[];
  error?: string;
  message?: string;
  redirectUrl?: string;
};

function getPublisherStatusMeta(status: WikiDraft["status"]) {
  if (status === "approved") {
    return {
      label: "已通过",
      description: "管理员已审核通过，这条知识已经进入正式内容库。",
      background: "rgba(34, 197, 94, 0.14)",
      color: "#bbf7d0",
      borderColor: "rgba(34, 197, 94, 0.34)",
    };
  }

  if (status === "rejected") {
    return {
      label: "审核未通过",
      description: "管理员已退回，可以根据备注补充后重新提交。",
      background: "rgba(248, 113, 113, 0.14)",
      color: "#fecaca",
      borderColor: "rgba(248, 113, 113, 0.34)",
    };
  }

  return {
    label: "正在审核",
    description: "已经提交成功，正在等待管理员审核。",
    background: "rgba(214, 161, 99, 0.14)",
    color: "var(--color-amber-soft)",
    borderColor: "rgba(214, 161, 99, 0.28)",
  };
}

export default function WikiPublisherDashboard(props: { viewer: AppViewer | null }) {
  const [overview, setOverview] = useState<PublisherOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestContent, setIngestContent] = useState("");
  const [submittingIngest, setSubmittingIngest] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/wiki/publisher/overview", {
        method: "GET",
        cache: "no-store",
      });
      const payload = await readJsonSafely<PublisherOverviewPayload>(response);
      if (redirectToMainAppIfNeeded(response, payload)) {
        return;
      }

      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "读取知识发布台失败"));
      }

      setOverview(payload || null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "读取知识发布台失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const drafts = overview?.drafts || [];
  const stats = overview?.stats || {
    totalSubmissions: drafts.length,
    pendingCount: drafts.filter((draft) => draft.status === "draft").length,
    approvedCount: drafts.filter((draft) => draft.status === "approved").length,
    rejectedCount: drafts.filter((draft) => draft.status === "rejected").length,
    rawSourceCount: drafts.length,
    lastUpdatedAt: drafts[0]?.updatedAt || null,
  };

  async function submitIngest() {
    if (!ingestContent.trim()) {
      setError("请先填写要发布的候选知识内容。");
      return;
    }

    setSubmittingIngest(true);
    setError(null);

    try {
      const response = await fetch("/api/wiki/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ingestTitle.trim(),
          content: ingestContent.trim(),
          modelId: DEFAULT_WIKI_DRAFT_MODEL_ID,
        }),
      });
      const payload = await readJsonSafely<{ error?: string; message?: string; redirectUrl?: string }>(response);
      if (redirectToMainAppIfNeeded(response, payload)) {
        return;
      }

      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "提交候选知识失败"));
      }

      setIngestTitle("");
      setIngestContent("");
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "提交候选知识失败");
    } finally {
      setSubmittingIngest(false);
    }
  }

  return (
    <div className="h-screen overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <AdminPageHeader
          title="知识发布台"
          description="这里不是管理员审核后台，而是成员自己的知识发布台。页面只保留候选知识发布和个人审核提醒，你只能看到自己提交内容的状态。"
          backHref="/"
          backLabel="返回聊天"
        />

        <AdminErrorBanner error={error} />

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
          <section className="panel-surface rounded-[28px] px-5 py-5 md:px-7">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                Publish Candidate
              </div>
              <h2 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                发布候选知识
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                {props.viewer?.nickname || props.viewer?.account || "当前成员"}，你提交的内容会先进入候选知识池，只有管理员审核通过后才会进入正式知识库。
              </p>
            </div>

            <div className="mt-4 grid gap-4">
              <input
                value={ingestTitle}
                onChange={(event) => setIngestTitle(event.target.value)}
                placeholder="候选知识标题，例如：美国站防晒喷雾复盘"
                className="rounded-[18px] border px-4 py-3 text-sm outline-none"
                style={{
                  borderColor: "var(--surface-outline-strong)",
                  background: "var(--surface-command)",
                  color: "var(--color-sidebar-text-bright)",
                }}
              />
              <textarea
                value={ingestContent}
                onChange={(event) => setIngestContent(event.target.value)}
                placeholder="把你的经验、复盘、案例或方法论贴在这里。提交后会先显示为“正在审核”。"
                rows={12}
                className="rounded-[22px] border px-4 py-4 text-sm leading-7 outline-none"
                style={{
                  borderColor: "var(--surface-outline-strong)",
                  background: "var(--surface-command)",
                  color: "var(--color-sidebar-text-bright)",
                }}
              />
              <div className="flex justify-end">
                <button
                  onClick={() => void submitIngest()}
                  disabled={submittingIngest}
                  className="rounded-full px-4 py-2.5 text-sm font-medium disabled:cursor-default"
                  style={{
                    background: "var(--brand-badge)",
                    color: "var(--brand-badge-text)",
                    opacity: submittingIngest ? 0.6 : 1,
                  }}
                >
                  {submittingIngest ? "正在生成候选草稿..." : "提交候选知识"}
                </button>
              </div>
            </div>
          </section>

          <section className="panel-surface rounded-[28px] px-5 py-5 md:px-6">
            <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
              Review Reminder
            </div>
            <h2 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
              我的审核提醒
            </h2>
            <div className="mt-4 space-y-3">
              {[
                `我提交的候选知识：${stats.totalSubmissions} 条`,
                `正在审核：${stats.pendingCount} 条`,
                `已通过：${stats.approvedCount} 条`,
                `审核未通过：${stats.rejectedCount} 条`,
              ].map((item, index) => (
                <div key={item} className="soft-panel rounded-[20px] px-4 py-4 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                  <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--chip-soft)] text-xs font-semibold text-[var(--color-amber-deep)]">
                    {index + 1}
                  </span>
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-[22px] border px-4 py-4 text-sm leading-7" style={{
              borderColor: "var(--surface-outline-strong)",
              background: "var(--surface-command)",
              color: "var(--color-ink-soft)",
            }}>
              {loading
                ? "正在读取你的发布状态..."
                : drafts.length === 0
                  ? "你还没有提交候选知识。第一次发布后，这里会显示审核提醒。"
                  : "你最近提交的候选知识状态已经同步完成，下面可以继续查看明细。"}
            </div>
          </section>
        </section>

        <section className="panel-surface rounded-[28px] px-5 py-5 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                Review Details
              </div>
              <h2 className="mt-2 text-2xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                我的审核提醒明细
              </h2>
            </div>
            <button
              onClick={() => void loadOverview()}
              disabled={loading}
              className="rounded-full border px-4 py-2 text-sm"
              style={{
                borderColor: "var(--surface-outline-strong)",
                background: "var(--subtle-surface)",
                color: "var(--color-sidebar-text-bright)",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "刷新中..." : "刷新状态"}
            </button>
          </div>

          {drafts.length === 0 ? (
            <div className="mt-5 soft-panel rounded-[24px] px-5 py-6 text-sm" style={{ color: "var(--color-ink-soft)" }}>
              当前还没有你自己提交的候选知识。
            </div>
          ) : (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {drafts.map((draft) => {
                const statusMeta = getPublisherStatusMeta(draft.status);
                return (
                  <article key={draft.id} className="soft-panel rounded-[24px] px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                          {draft.title}
                        </div>
                        <div className="mt-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                          提交时间：{formatDate(draft.createdAt)} · 最近更新：{formatDate(draft.updatedAt)}
                        </div>
                      </div>
                      <div
                        className="rounded-full border px-3 py-1 text-[11px] font-medium"
                        style={{
                          background: statusMeta.background,
                          color: statusMeta.color,
                          borderColor: statusMeta.borderColor,
                        }}
                      >
                        {statusMeta.label}
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                      {draft.summary}
                    </p>

                    <div className="mt-4 rounded-[20px] border px-4 py-4 text-sm leading-7" style={{
                      borderColor: "var(--surface-outline-strong)",
                      background: "rgba(255,255,255,0.02)",
                      color: "var(--color-ink-soft)",
                    }}>
                      {statusMeta.description}
                    </div>

                    {draft.notes?.trim() ? (
                      <div className="mt-4 rounded-[20px] border px-4 py-4 text-sm leading-7" style={{
                        borderColor: draft.status === "rejected" ? "rgba(248, 113, 113, 0.32)" : "var(--surface-outline-strong)",
                        background: draft.status === "rejected" ? "rgba(127, 29, 29, 0.14)" : "var(--surface-command)",
                        color: draft.status === "rejected" ? "#fecaca" : "var(--color-ink-soft)",
                      }}>
                        <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: draft.status === "rejected" ? "#fca5a5" : "var(--color-amber-soft)" }}>
                          审核备注
                        </div>
                        <div className="mt-2">{draft.notes}</div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
