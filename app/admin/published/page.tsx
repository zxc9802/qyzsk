"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildSeeAlsoRelations, formatWikiRelationsText, parseWikiRelationsText } from "@/lib/wiki-relations";
import {
  AdminErrorBanner,
  AdminPageHeader,
  AdminSearchInput,
  AdminStatsGrid,
  CATEGORY_OPTIONS,
  formatDate,
  splitText,
  useDeferredSearchValue,
  useWikiAdminOverview,
} from "@/components/admin/WikiAdminShared";
import { useAppViewer } from "@/lib/client/app-session";
import { getWikiCategoryLabel } from "@/lib/wiki-category-labels";
import type { WikiPage } from "@/lib/wiki-types";

type PageEditorState = {
  title: string;
  summary: string;
  rolesText: string;
  sourceIdsText: string;
  relatedPagesText: string;
  relationsText: string;
  content: string;
};

function buildPageEditorState(page: WikiPage): PageEditorState {
  return {
    title: page.title,
    summary: page.summary,
    rolesText: page.roles.join("、"),
    sourceIdsText: page.sourceIds.join(", "),
    relatedPagesText: page.relatedPages.join("\n"),
    relationsText: formatWikiRelationsText(
      page.relations.length > 0 ? page.relations : buildSeeAlsoRelations(page.relatedPages)
    ),
    content: page.content,
  };
}

function resolvePageRelations(editor: Pick<PageEditorState, "relationsText" | "relatedPagesText">) {
  const typedRelations = parseWikiRelationsText(editor.relationsText);
  if (typedRelations.length > 0) {
    return typedRelations;
  }

  return buildSeeAlsoRelations(splitText(editor.relatedPagesText, /[\n,，]+/u));
}

export default function AdminPublishedPage() {
  const router = useRouter();
  const { loading: sessionLoading, isAdmin } = useAppViewer();
  const {
    loading,
    error,
    stats,
    draftCount,
    publishedPages,
    loadOverview,
  } = useWikiAdminOverview();
  const [searchQuery, setSearchQuery] = useState("");
  const [pageEditors, setPageEditors] = useState<Record<string, PageEditorState>>({});
  const [savingPageId, setSavingPageId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [targetPageId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("pageId")?.trim() || ""
  );
  const deferredSearchQuery = useDeferredSearchValue(searchQuery);

  useEffect(() => {
    if (!sessionLoading && !isAdmin) {
      router.replace("/admin");
    }
  }, [isAdmin, router, sessionLoading]);

  useEffect(() => {
    setPageEditors((previous) => {
      const nextEditors = { ...previous };

      publishedPages.forEach((page) => {
        if (!nextEditors[page.id]) {
          nextEditors[page.id] = buildPageEditorState(page);
        }
      });

      return nextEditors;
    });
  }, [publishedPages]);

  const filteredPages = useMemo(() => {
    const sortedPages = [...publishedPages].sort((a, b) => {
      if (targetPageId) {
        if (a.id === targetPageId) return -1;
        if (b.id === targetPageId) return 1;
      }

      return b.updatedAt.localeCompare(a.updatedAt);
    });

    if (!deferredSearchQuery) {
      return sortedPages;
    }

    return sortedPages.filter((page) =>
      [
        page.id,
        page.title,
        page.summary,
        page.content,
        page.roles.join(" "),
        page.sourceIds.join(" "),
        page.relatedPages.join(" "),
        page.relations.map((relation) => `${relation.targetId} ${relation.type} ${relation.note || ""}`).join(" "),
      ]
        .join("\n")
        .toLowerCase()
        .includes(deferredSearchQuery)
    );
  }, [deferredSearchQuery, publishedPages, targetPageId]);

  const groupedPages = useMemo(
    () =>
      CATEGORY_OPTIONS.map((category) => ({
        category,
        pages: filteredPages.filter((page) => page.category === category),
      })).filter((group) => group.pages.length > 0),
    [filteredPages]
  );

  useEffect(() => {
    if (!targetPageId) return;
    const timeoutId = window.setTimeout(() => {
      document.getElementById(`page-${CSS.escape(targetPageId)}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [groupedPages, targetPageId]);

  function updatePageEditor(pageId: string, patch: Partial<PageEditorState>) {
    setPageEditors((previous) => ({
      ...previous,
      [pageId]: {
        ...(previous[pageId] || {
          title: "",
          summary: "",
          rolesText: "",
          sourceIdsText: "",
          relatedPagesText: "",
          relationsText: "",
          content: "",
        }),
        ...patch,
      },
    }));
  }

  async function savePage(pageId: string) {
    const editor = pageEditors[pageId];
    if (!editor) return;

    setSavingPageId(pageId);
    setPageError(null);

    try {
      const response = await fetch(`/api/wiki/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editor.title,
          summary: editor.summary,
          roles: splitText(editor.rolesText, /[、,，/]/u),
          sourceIds: splitText(editor.sourceIdsText, /[,\s，/]+/u),
          relatedPages: splitText(editor.relatedPagesText, /[\n,，]+/u),
          relations: resolvePageRelations(editor),
          content: editor.content,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "保存 Wiki 页面失败。");
      }

      await loadOverview();
    } catch (requestError) {
      setPageError(requestError instanceof Error ? requestError.message : "保存 Wiki 页面失败。");
    } finally {
      setSavingPageId(null);
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
          title="Wiki 页面库"
          description="这里按正式 Wiki 分类组织，适合按页面维度搜索、定位和直接修改已发布内容。页面 ID 保持稳定，方便长期引用。"
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
                href="/admin/sources"
                className="rounded-full border px-4 py-2.5 text-sm"
                style={{
                  borderColor: "var(--surface-outline-strong)",
                  background: "var(--subtle-surface)",
                  color: "var(--color-sidebar-text-bright)",
                }}
              >
                查看 KB 资料库
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

        <AdminErrorBanner error={error || pageError} />

        <section className="panel-surface rounded-[24px] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
            Wiki Search
          </div>
          <h3 className="mt-2 text-lg font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
            搜索正式 Wiki 页面
          </h3>
          <p className="mt-3 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
            支持按页面标题、页面 ID、摘要、正文、关联岗位和来源进行搜索。搜索后会按分类重新组织结果。
          </p>
          <div className="mt-4">
            <AdminSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="搜索标题、页面 ID、岗位、来源"
            />
          </div>
        </section>

        {groupedPages.length === 0 ? (
          <div className="soft-panel rounded-[24px] px-5 py-6 text-sm" style={{ color: "var(--color-ink-soft)" }}>
            {publishedPages.length === 0 ? "当前还没有已发布页面。" : "没有命中当前搜索条件的 Wiki 页面。"}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedPages.map((group) => (
              <section key={group.category} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                      {group.category}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                      {getWikiCategoryLabel(group.category)}
                    </h2>
                  </div>
                  <div
                    className="rounded-full px-3 py-1 text-[11px]"
                    style={{ background: "var(--chip-soft)", color: "var(--color-amber-deep)" }}
                  >
                    {group.pages.length} 页
                  </div>
                </div>

                <div className="grid gap-4">
                  {group.pages.map((page) => {
                    const editor = pageEditors[page.id] || buildPageEditorState(page);
                    const isTargetPage = page.id === targetPageId;

                    return (
                      <article
                        id={`page-${page.id}`}
                        key={page.id}
                        className="panel-surface rounded-[24px] px-5 py-5"
                        style={isTargetPage ? { outline: "1px solid rgba(214, 161, 99, 0.55)" } : undefined}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                              {page.id}
                            </div>
                            <div className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
                              更新时间：{formatDate(page.updatedAt)} · 版本：v{page.version}
                            </div>
                          </div>
                          <div
                            className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em]"
                            style={{ background: "var(--chip-soft)", color: "var(--color-amber-deep)" }}
                          >
                            {getWikiCategoryLabel(page.category)}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3">
                          <input
                            value={editor.title}
                            onChange={(event) => updatePageEditor(page.id, { title: event.target.value })}
                            className="rounded-[16px] border px-4 py-3 text-sm outline-none"
                            style={{
                              borderColor: "var(--surface-outline-strong)",
                              background: "var(--surface-command)",
                              color: "var(--color-sidebar-text-bright)",
                            }}
                          />
                          <textarea
                            value={editor.summary}
                            onChange={(event) => updatePageEditor(page.id, { summary: event.target.value })}
                            rows={2}
                            className="rounded-[18px] border px-4 py-3 text-sm leading-7 outline-none"
                            style={{
                              borderColor: "var(--surface-outline-strong)",
                              background: "var(--surface-command)",
                              color: "var(--color-sidebar-text-bright)",
                            }}
                          />
                          <div className="grid gap-3 md:grid-cols-3">
                            <input
                              value={editor.rolesText}
                              onChange={(event) => updatePageEditor(page.id, { rolesText: event.target.value })}
                              placeholder="关联岗位"
                              className="rounded-[16px] border px-4 py-3 text-sm outline-none"
                              style={{
                                borderColor: "var(--surface-outline-strong)",
                                background: "var(--surface-command)",
                                color: "var(--color-sidebar-text-bright)",
                              }}
                            />
                            <input
                              value={editor.sourceIdsText}
                              onChange={(event) => updatePageEditor(page.id, { sourceIdsText: event.target.value })}
                              placeholder="来源 ID"
                              className="rounded-[16px] border px-4 py-3 text-sm outline-none"
                              style={{
                                borderColor: "var(--surface-outline-strong)",
                                background: "var(--surface-command)",
                                color: "var(--color-sidebar-text-bright)",
                              }}
                            />
                            <input
                              value={editor.relatedPagesText}
                              onChange={(event) => updatePageEditor(page.id, { relatedPagesText: event.target.value })}
                              placeholder="关联页面，一行一个或逗号分隔"
                              className="rounded-[16px] border px-4 py-3 text-sm outline-none"
                              style={{
                                borderColor: "var(--surface-outline-strong)",
                                background: "var(--surface-command)",
                                color: "var(--color-sidebar-text-bright)",
                              }}
                            />
                          </div>
                          <textarea
                            value={editor.relationsText}
                            onChange={(event) => updatePageEditor(page.id, { relationsText: event.target.value })}
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
                            onChange={(event) => updatePageEditor(page.id, { content: event.target.value })}
                            rows={14}
                            className="rounded-[22px] border px-4 py-4 text-sm leading-7 outline-none"
                            style={{
                              borderColor: "var(--surface-outline-strong)",
                              background: "var(--surface-command)",
                              color: "var(--color-sidebar-text-bright)",
                            }}
                          />
                        </div>

                        <div className="mt-4 flex justify-end">
                          <button
                            onClick={() => void savePage(page.id)}
                            disabled={savingPageId === page.id || loading}
                            className="rounded-full px-4 py-2 text-sm font-medium disabled:cursor-default"
                            style={{
                              background: "var(--brand-badge)",
                              color: "var(--brand-badge-text)",
                              opacity: savingPageId === page.id || loading ? 0.6 : 1,
                            }}
                          >
                            {savingPageId === page.id ? "保存中..." : "保存 Wiki 页面"}
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
