"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AdminErrorBanner,
  AdminPageHeader,
  AdminSearchInput,
  AdminStatsGrid,
  CATEGORY_OPTIONS,
  buildDraftEditorState,
  formatDate,
  useDeferredSearchValue,
  useWikiAdminOverview,
} from "@/components/admin/WikiAdminShared";
import { useAppViewer } from "@/lib/client/app-session";
import { getWikiCategoryLabel } from "@/lib/wiki-category-labels";
import type { WikiCategory } from "@/lib/wiki-types";

function formatSubmitterLabel(
  submittedBy?: {
    nickname?: string;
    account?: string;
    userId?: string;
  }
) {
  if (!submittedBy) return "未记录";
  return submittedBy.nickname || submittedBy.account || submittedBy.userId || "未记录";
}

export default function AdminDraftsPage() {
  const router = useRouter();
  const { loading: sessionLoading, isAdmin } = useAppViewer();
  const {
    error,
    stats,
    draftCount,
    activeDrafts,
    draftEditors,
    updateDraftEditor,
    savingDraftId,
    submitDraftAction,
    bulkApproving,
    approveAllDrafts,
  } = useWikiAdminOverview();
  const [searchQuery, setSearchQuery] = useState("");
  const [targetDraftId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("draftId")?.trim() || ""
  );
  const deferredSearchQuery = useDeferredSearchValue(searchQuery);

  const sortedDrafts = useMemo(
    () =>
      [...activeDrafts].sort((a, b) => {
        if (targetDraftId) {
          if (a.id === targetDraftId) return -1;
          if (b.id === targetDraftId) return 1;
        }
        return a.updatedAt < b.updatedAt ? 1 : -1;
      }),
    [activeDrafts, targetDraftId]
  );

  const filteredDrafts = useMemo(() => {
    if (!deferredSearchQuery) return sortedDrafts;
    return sortedDrafts.filter((draft) =>
      [
        draft.id,
        draft.targetPageId,
        draft.title,
        draft.summary,
        draft.content,
        draft.sourceId,
        draft.notes,
        draft.submittedBy?.nickname,
        draft.submittedBy?.account,
        draft.relations.map((relation) => `${relation.targetId} ${relation.type} ${relation.note || ""}`).join(" "),
      ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase()
        .includes(deferredSearchQuery)
    );
  }, [deferredSearchQuery, sortedDrafts]);

  useEffect(() => {
    if (!sessionLoading && !isAdmin) {
      router.replace("/admin");
    }
  }, [isAdmin, router, sessionLoading]);

  useEffect(() => {
    if (!targetDraftId) return;
    const timeoutId = window.setTimeout(() => {
      document.getElementById(`draft-${targetDraftId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [targetDraftId, filteredDrafts.length]);

  if (sessionLoading || !isAdmin) {
    return (
      <div className="h-screen overflow-y-auto px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl">
          <div className="panel-surface rounded-[28px] px-6 py-8 text-sm" style={{ color: "var(--color-ink-soft)" }}>
            正在返回知识发布台...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <AdminPageHeader
          title="待审核草稿"
          description="这里保留完整的草稿编辑和发布能力。主审核台只做导航和总览，真正的审核动作都集中在这个页面里。"
          backHref="/admin"
          backLabel="返回审核台"
          extra={
            <Link
              href="/admin/published"
              className="rounded-full border px-4 py-2.5 text-sm"
              style={{
                borderColor: "var(--surface-outline-strong)",
                background: "var(--subtle-surface)",
                color: "var(--color-sidebar-text-bright)",
              }}
            >
              查看已发布页面
            </Link>
          }
        />

        <AdminStatsGrid
          publishedPages={stats?.publishedPages || 0}
          draftCount={draftCount}
          rawSourceCount={stats?.rawSourceCount || 0}
          lastPublishedAt={stats?.lastPublishedAt}
        />

        <AdminErrorBanner error={error} />

        <section className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
              Draft Queue
            </div>
            <h2 className="mt-2 text-2xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
              当前待审核草稿
            </h2>
          </div>
          {sortedDrafts.length > 0 ? (
            <button
              onClick={() => void approveAllDrafts()}
              disabled={bulkApproving || Boolean(savingDraftId)}
              className="rounded-full px-4 py-2 text-sm font-medium disabled:cursor-default"
              style={{
                background: "var(--brand-badge)",
                color: "var(--brand-badge-text)",
                opacity: bulkApproving || Boolean(savingDraftId) ? 0.6 : 1,
              }}
            >
              {bulkApproving ? "批量发布中..." : "一键通过全部"}
            </button>
          ) : null}
        </section>

        <section className="panel-surface rounded-[24px] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
            Draft Search
          </div>
          <h3 className="mt-2 text-lg font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
            搜索待审核候选知识
          </h3>
          <p className="mt-3 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
            可以按标题、来源 ID、提交人、草稿内容来筛选，快速定位到某条待审核知识。
          </p>
          <div className="mt-4">
            <AdminSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索候选知识标题、来源 ID、提交人"
            />
          </div>
        </section>

        {filteredDrafts.length === 0 ? (
          <div className="soft-panel rounded-[24px] px-5 py-6 text-sm" style={{ color: "var(--color-ink-soft)" }}>
            {sortedDrafts.length === 0 ? "目前没有待审核的 Wiki 草稿。" : "没有命中当前搜索条件的候选知识。"}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDrafts.map((draft) => {
              const editor = draftEditors[draft.id] || buildDraftEditorState(draft);
              const isTargetDraft = draft.id === targetDraftId;

              return (
                <article
                  id={`draft-${draft.id}`}
                  key={draft.id}
                  className="panel-surface rounded-[28px] px-5 py-5 md:px-6"
                  style={isTargetDraft ? { outline: "1px solid rgba(214, 161, 99, 0.55)" } : undefined}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                        Draft · {draft.id}
                      </div>
                      <div className="mt-2 space-y-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>
                        <div>来源：{draft.sourceId} · 更新时间：{formatDate(draft.updatedAt)}</div>
                        <div>{draft.targetPageId ? `更新目标：${draft.targetPageId}` : "提案类型：新增页面"}</div>
                        <div>提交人：{formatSubmitterLabel(draft.submittedBy)}</div>
                      </div>
                    </div>
                    <div
                      className="rounded-full px-3 py-1 text-[11px]"
                      style={{ background: "var(--chip-soft)", color: "var(--color-amber-deep)" }}
                    >
                      {draft.status}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <input
                      value={editor.title}
                      onChange={(event) => updateDraftEditor(draft.id, { title: event.target.value })}
                      className="rounded-[16px] border px-4 py-3 text-sm outline-none"
                      style={{
                        borderColor: "var(--surface-outline-strong)",
                        background: "var(--surface-command)",
                        color: "var(--color-sidebar-text-bright)",
                      }}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        value={editor.category}
                        onChange={(event) => updateDraftEditor(draft.id, { category: event.target.value as WikiCategory })}
                        className="rounded-[16px] border px-4 py-3 text-sm outline-none"
                        style={{
                          borderColor: "var(--surface-outline-strong)",
                          background: "var(--surface-command)",
                          color: "var(--color-sidebar-text-bright)",
                        }}
                      >
                        {CATEGORY_OPTIONS.map((category) => (
                          <option key={category} value={category}>
                            {getWikiCategoryLabel(category)}
                          </option>
                        ))}
                      </select>
                      <input
                        value={editor.rolesText}
                        onChange={(event) => updateDraftEditor(draft.id, { rolesText: event.target.value })}
                        placeholder="适用岗位，用 、 分隔"
                        className="rounded-[16px] border px-4 py-3 text-sm outline-none"
                        style={{
                          borderColor: "var(--surface-outline-strong)",
                          background: "var(--surface-command)",
                          color: "var(--color-sidebar-text-bright)",
                        }}
                      />
                    </div>
                    <textarea
                      value={editor.summary}
                      onChange={(event) => updateDraftEditor(draft.id, { summary: event.target.value })}
                      rows={2}
                      placeholder="一句话摘要"
                      className="rounded-[18px] border px-4 py-3 text-sm leading-7 outline-none"
                      style={{
                        borderColor: "var(--surface-outline-strong)",
                        background: "var(--surface-command)",
                        color: "var(--color-sidebar-text-bright)",
                      }}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <textarea
                        value={editor.sourceIdsText}
                        onChange={(event) => updateDraftEditor(draft.id, { sourceIdsText: event.target.value })}
                        rows={2}
                        placeholder="来源条目，如 KB005, KB006"
                        className="rounded-[18px] border px-4 py-3 text-sm leading-7 outline-none"
                        style={{
                          borderColor: "var(--surface-outline-strong)",
                          background: "var(--surface-command)",
                          color: "var(--color-sidebar-text-bright)",
                        }}
                      />
                      <textarea
                        value={editor.relatedPagesText}
                        onChange={(event) => updateDraftEditor(draft.id, { relatedPagesText: event.target.value })}
                        rows={2}
                        placeholder="关联页面，一行一个 id"
                        className="rounded-[18px] border px-4 py-3 text-sm leading-7 outline-none"
                        style={{
                          borderColor: "var(--surface-outline-strong)",
                          background: "var(--surface-command)",
                          color: "var(--color-sidebar-text-bright)",
                        }}
                      />
                    </div>
                    <textarea
                      value={editor.relationsText}
                      onChange={(event) => updateDraftEditor(draft.id, { relationsText: event.target.value })}
                      rows={3}
                      placeholder={"页面关系，一行一条：targetId | type | note\n例如：roles/helper | depends_on | 执行前先看"}
                      className="rounded-[18px] border px-4 py-3 text-sm leading-7 outline-none"
                      style={{
                        borderColor: "var(--surface-outline-strong)",
                        background: "var(--surface-command)",
                        color: "var(--color-sidebar-text-bright)",
                      }}
                    />
                    <textarea
                      value={editor.content}
                      onChange={(event) => updateDraftEditor(draft.id, { content: event.target.value })}
                      rows={12}
                      className="rounded-[22px] border px-4 py-4 text-sm leading-7 outline-none"
                      style={{
                        borderColor: "var(--surface-outline-strong)",
                        background: "var(--surface-command)",
                        color: "var(--color-sidebar-text-bright)",
                      }}
                    />
                    <textarea
                      value={editor.notes}
                      onChange={(event) => updateDraftEditor(draft.id, { notes: event.target.value })}
                      rows={2}
                      placeholder="审核备注（可选）"
                      className="rounded-[18px] border px-4 py-3 text-sm leading-7 outline-none"
                      style={{
                        borderColor: "var(--surface-outline-strong)",
                        background: "var(--surface-command)",
                        color: "var(--color-sidebar-text-bright)",
                      }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => void submitDraftAction(draft.id, "save")}
                      disabled={savingDraftId === draft.id}
                      className="rounded-full border px-4 py-2 text-sm disabled:cursor-default"
                      style={{
                        borderColor: "var(--surface-outline-strong)",
                        background: "var(--subtle-surface)",
                        color: "var(--color-sidebar-text-bright)",
                        opacity: savingDraftId === draft.id ? 0.6 : 1,
                      }}
                    >
                      保存草稿
                    </button>
                    <button
                      onClick={() => void submitDraftAction(draft.id, "reject")}
                      disabled={savingDraftId === draft.id}
                      className="rounded-full border px-4 py-2 text-sm disabled:cursor-default"
                      style={{
                        borderColor: "rgba(220, 38, 38, 0.96)",
                        background: "linear-gradient(145deg, rgba(239, 68, 68, 0.96), rgba(185, 28, 28, 0.98))",
                        color: "#ffffff",
                        opacity: savingDraftId === draft.id ? 0.6 : 1,
                      }}
                    >
                      驳回
                    </button>
                    <button
                      onClick={() => void submitDraftAction(draft.id, "approve")}
                      disabled={savingDraftId === draft.id}
                      className="rounded-full px-4 py-2 text-sm font-medium disabled:cursor-default"
                      style={{
                        background: "var(--brand-badge)",
                        color: "var(--brand-badge-text)",
                        opacity: savingDraftId === draft.id ? 0.6 : 1,
                      }}
                    >
                      审核通过并发布
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
