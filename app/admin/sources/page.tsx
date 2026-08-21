"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AdminErrorBanner,
  AdminPageHeader,
  AdminSearchInput,
  AdminStatsGrid,
  formatDate,
  formatSourceStatusLabel,
  SOURCE_STATUS_GROUPS,
  useDeferredSearchValue,
  useWikiAdminOverview,
} from "@/components/admin/WikiAdminShared";
import WikiMediaGallery from "@/components/admin/WikiMediaGallery";
import { useAppViewer } from "@/lib/client/app-session";
import type { WikiSourceRecord, WikiSourceStatus } from "@/lib/wiki-types";

type SourceEditorState = {
  title: string;
  content: string;
  status: WikiSourceStatus;
};

function buildSourceEditorState(source: WikiSourceRecord): SourceEditorState {
  return {
    title: source.title,
    content: source.content,
    status: source.status,
  };
}

function formatSubmitterLabel(source: WikiSourceRecord) {
  return source.submittedBy?.nickname || source.submittedBy?.account || source.submittedBy?.userId || "未记录";
}

export default function AdminSourcesPage() {
  const router = useRouter();
  const { loading: sessionLoading, isAdmin } = useAppViewer();
  const {
    loading,
    error,
    stats,
    draftCount,
    sources,
    loadOverview,
  } = useWikiAdminOverview();
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceEditors, setSourceEditors] = useState<Record<string, SourceEditorState>>({});
  const [savingSourceId, setSavingSourceId] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [targetSourceId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("sourceId")?.trim() || ""
  );
  const deferredSearchQuery = useDeferredSearchValue(searchQuery);

  useEffect(() => {
    if (!sessionLoading && !isAdmin) {
      router.replace("/admin");
    }
  }, [isAdmin, router, sessionLoading]);

  useEffect(() => {
    setSourceEditors((previous) => {
      const nextEditors = { ...previous };

      sources.forEach((source) => {
        const existing = nextEditors[source.id];
        if (!existing || existing.status === "processing") {
          nextEditors[source.id] = buildSourceEditorState(source);
        }
      });

      return nextEditors;
    });
  }, [sources]);

  const filteredSources = useMemo(() => {
    const sortedSources = [...sources].sort((a, b) => {
      if (targetSourceId) {
        if (a.id === targetSourceId) return -1;
        if (b.id === targetSourceId) return 1;
      }

      return b.updatedAt.localeCompare(a.updatedAt);
    });

    if (!deferredSearchQuery) {
      return sortedSources;
    }

    return sortedSources.filter((source) =>
      [
        source.id,
        source.title,
        source.content,
        source.status,
        source.submittedBy?.nickname,
        source.submittedBy?.account,
      ]
        .join("\n")
        .toLowerCase()
        .includes(deferredSearchQuery)
    );
  }, [deferredSearchQuery, sources, targetSourceId]);

  const groupedSources = useMemo(
    () =>
      SOURCE_STATUS_GROUPS.map((status) => ({
        status,
        sources: filteredSources.filter((source) => source.status === status),
      })).filter((group) => group.sources.length > 0),
    [filteredSources]
  );

  useEffect(() => {
    if (!targetSourceId) return;
    const timeoutId = window.setTimeout(() => {
      document.getElementById(`source-${targetSourceId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [groupedSources, targetSourceId]);

  function updateSourceEditor(sourceId: string, patch: Partial<SourceEditorState>) {
    setSourceEditors((previous) => ({
      ...previous,
      [sourceId]: {
        ...(previous[sourceId] || {
          title: "",
          content: "",
          status: "drafted" as WikiSourceStatus,
        }),
        ...patch,
      },
    }));
  }

  async function saveSource(sourceId: string) {
    const editor = sourceEditors[sourceId];
    if (!editor) return;

    setSavingSourceId(sourceId);
    setSourceError(null);

    try {
      const response = await fetch(`/api/wiki/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editor.title,
          content: editor.content,
          status: editor.status,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "保存 KB 资料失败。");
      }

      await loadOverview();
    } catch (requestError) {
      setSourceError(requestError instanceof Error ? requestError.message : "保存 KB 资料失败。");
    } finally {
      setSavingSourceId(null);
    }
  }

  async function deleteSource(sourceId: string) {
    const source = sources.find((item) => item.id === sourceId);
    const confirmed = window.confirm(
      `确定删除 KB 资料「${source?.title || sourceId}」？相关未发布草稿会一并删除，已发布 Wiki 页面会保留。此操作不可恢复。`
    );
    if (!confirmed) return;

    setSavingSourceId(sourceId);
    setSourceError(null);

    try {
      const response = await fetch(`/api/wiki/sources/${sourceId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "删除 KB 资料失败。");
      }

      await loadOverview();
    } catch (requestError) {
      setSourceError(requestError instanceof Error ? requestError.message : "删除 KB 资料失败。");
    } finally {
      setSavingSourceId(null);
    }
  }

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
          title="KB 资料库"
          description="这里存放候选知识的原始资料，适合回溯知识来源、修正原文内容、调整资料状态，或随时删除不再需要的资料。"
          backHref="/admin"
          backLabel="返回审核台"
          extra={
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/drafts"
                className="rounded-full border px-4 py-2.5 text-sm"
                style={{
                  borderColor: "var(--surface-outline-strong)",
                  background: "var(--subtle-surface)",
                  color: "var(--color-sidebar-text-bright)",
                }}
              >
                查看待审核草稿
              </Link>
              <Link
                href="/admin/published"
                className="rounded-full border px-4 py-2.5 text-sm"
                style={{
                  borderColor: "var(--surface-outline-strong)",
                  background: "var(--subtle-surface)",
                  color: "var(--color-sidebar-text-bright)",
                }}
              >
                查看 Wiki 页面库
              </Link>
            </div>
          }
        />

        <AdminStatsGrid
          publishedPages={stats?.publishedPages || 0}
          draftCount={draftCount}
          rawSourceCount={stats?.rawSourceCount || 0}
          lastPublishedAt={stats?.lastPublishedAt}
        />

        <AdminErrorBanner error={error || sourceError} />

        <section className="panel-surface rounded-[24px] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
            KB Search
          </div>
          <h3 className="mt-2 text-lg font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
            搜索 KB 原始资料
          </h3>
          <p className="mt-3 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
            可以按资料标题、资料 ID、正文内容、提交人和审核状态来检索 KB。
          </p>
          <div className="mt-4">
            <AdminSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索 KB 标题、资料 ID、提交人"
            />
          </div>
        </section>

        {groupedSources.length === 0 ? (
          <div className="soft-panel rounded-[24px] px-5 py-6 text-sm" style={{ color: "var(--color-ink-soft)" }}>
            {sources.length === 0 ? "当前还没有 KB 原始资料。" : "没有命中当前搜索条件的 KB 资料。"}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedSources.map((group) => (
              <section key={group.status} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                      {group.status}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                      {formatSourceStatusLabel(group.status)}
                    </h2>
                  </div>
                  <div
                    className="rounded-full px-3 py-1 text-[11px]"
                    style={{ background: "var(--chip-soft)", color: "var(--color-amber-deep)" }}
                  >
                    {group.sources.length} 条
                  </div>
                </div>

                <div className="grid gap-4">
                  {group.sources.map((source) => {
                    const editor = sourceEditors[source.id] || buildSourceEditorState(source);
                    const isTargetSource = source.id === targetSourceId;

                    return (
                      <article
                        id={`source-${source.id}`}
                        key={source.id}
                        className="panel-surface rounded-[24px] px-5 py-5"
                        style={isTargetSource ? { outline: "1px solid rgba(214, 161, 99, 0.55)" } : undefined}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                              {source.id}
                            </div>
                            <div className="mt-2 space-y-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>
                              <div>更新时间：{formatDate(source.updatedAt)} · 草稿关联：{source.draftIds.length} 条</div>
                              <div>提交人：{formatSubmitterLabel(source)}</div>
                            </div>
                          </div>
                          <div
                            className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em]"
                            style={{ background: "var(--chip-soft)", color: "var(--color-amber-deep)" }}
                          >
                            {formatSourceStatusLabel(source.status)}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3">
                          <input
                            value={editor.title}
                            onChange={(event) => updateSourceEditor(source.id, { title: event.target.value })}
                            className="rounded-[16px] border px-4 py-3 text-sm outline-none"
                            style={{
                              borderColor: "var(--surface-outline-strong)",
                              background: "var(--surface-command)",
                              color: "var(--color-sidebar-text-bright)",
                            }}
                          />
                          <select
                            value={editor.status}
                            onChange={(event) => updateSourceEditor(source.id, { status: event.target.value as WikiSourceStatus })}
                            disabled={source.status === "processing"}
                            className="rounded-[16px] border px-4 py-3 text-sm outline-none"
                            style={{
                              borderColor: "var(--surface-outline-strong)",
                              background: "var(--surface-command)",
                              color: "var(--color-sidebar-text-bright)",
                            }}
                          >
                            {source.status === "processing" ? <option value="processing">处理中</option> : null}
                            {source.status === "failed" ? <option value="failed">处理失败</option> : null}
                            <option value="drafted">待处理</option>
                            <option value="approved">已通过</option>
                            <option value="rejected">已驳回</option>
                          </select>
                          {source.ingestError ? (
                            <div className="rounded-[16px] px-4 py-3 text-sm" style={{ color: "#fecaca", background: "rgba(127, 29, 29, 0.18)" }}>
                              {source.ingestError}
                            </div>
                          ) : null}
                          {source.ingestWarnings && source.ingestWarnings.length > 0 ? (
                            <div className="rounded-[16px] px-4 py-3 text-sm" style={{ color: "var(--color-amber-soft)", background: "var(--chip-soft)" }}>
                              {source.ingestWarnings.join("\n")}
                            </div>
                          ) : null}
                          <WikiMediaGallery media={source.media} />
                          <textarea
                            value={editor.content}
                            onChange={(event) => updateSourceEditor(source.id, { content: event.target.value })}
                            rows={12}
                            className="rounded-[22px] border px-4 py-4 text-sm leading-7 outline-none"
                            style={{
                              borderColor: "var(--surface-outline-strong)",
                              background: "var(--surface-command)",
                              color: "var(--color-sidebar-text-bright)",
                            }}
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          <button
                            onClick={() => void deleteSource(source.id)}
                            disabled={savingSourceId === source.id || loading}
                            className="rounded-full border px-4 py-2 text-sm disabled:cursor-default"
                            style={{
                              borderColor: "rgba(220, 38, 38, 0.96)",
                              background: "linear-gradient(145deg, rgba(239, 68, 68, 0.96), rgba(185, 28, 28, 0.98))",
                              color: "#ffffff",
                              opacity: savingSourceId === source.id || loading ? 0.6 : 1,
                            }}
                          >
                            删除资料
                          </button>
                          <button
                            onClick={() => void saveSource(source.id)}
                            disabled={savingSourceId === source.id || loading || source.status === "processing"}
                            className="rounded-full px-4 py-2 text-sm font-medium disabled:cursor-default"
                            style={{
                              background: "var(--brand-badge)",
                              color: "var(--brand-badge-text)",
                              opacity: savingSourceId === source.id || loading ? 0.6 : 1,
                            }}
                          >
                            {savingSourceId === source.id ? "保存中..." : "保存 KB 资料"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
