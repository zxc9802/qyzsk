"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import WikiPublisherDashboard from "@/components/admin/WikiPublisherDashboard";
import {
  AdminErrorBanner,
  AdminPageHeader,
  AdminSearchInput,
  AdminStatsGrid,
  CHAT_MODELS,
  formatDate,
  useDeferredSearchValue,
  useWikiAdminOverview,
} from "@/components/admin/WikiAdminShared";
import { useAppViewer } from "@/lib/client/app-session";
import type { ChatModelId } from "@/lib/chat-models";
import { getWikiCategoryLabel } from "@/lib/wiki-category-labels";
import type { WikiDraft, WikiPage, WikiSourceRecord } from "@/lib/wiki-types";

function EntryCard(props: {
  href: string;
  kicker: string;
  title: string;
  description: string;
  count?: string;
}) {
  return (
    <Link
      href={props.href}
      className="panel-surface group rounded-[28px] px-5 py-5 transition-transform duration-200 hover:-translate-y-0.5 md:px-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
            {props.kicker}
          </div>
          <h3 className="mt-3 text-2xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
            {props.title}
          </h3>
        </div>
        {props.count ? (
          <div
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: "var(--chip-soft)", color: "var(--color-amber-deep)" }}
          >
            {props.count}
          </div>
        ) : null}
      </div>
      <p className="mt-4 max-w-xl text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
        {props.description}
      </p>
      <div className="mt-5 text-sm font-medium" style={{ color: "var(--color-amber-deep)" }}>
        打开页面查看 →
      </div>
    </Link>
  );
}

function formatSourceStatusLabel(status: WikiSourceRecord["status"]) {
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已驳回";
  return "待处理";
}

function buildDraftSearchText(draft: WikiDraft) {
  return [
    draft.id,
    draft.targetPageId,
    draft.title,
    draft.summary,
    draft.content,
    draft.sourceId,
    draft.notes,
    draft.submittedBy?.nickname,
    draft.submittedBy?.account,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function buildPageSearchText(page: WikiPage) {
  return [
    page.id,
    page.title,
    page.summary,
    page.content,
    page.roles.join(" "),
    page.sourceIds.join(" "),
    page.relatedPages.join(" "),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function buildSourceSearchText(source: WikiSourceRecord) {
  return [
    source.id,
    source.title,
    source.content,
    source.status,
    source.submittedBy?.nickname,
    source.submittedBy?.account,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function AdminDashboard() {
  const {
    error,
    stats,
    draftCount,
    activeDrafts,
    publishedPages,
    sources,
    ingestTitle,
    setIngestTitle,
    ingestContent,
    setIngestContent,
    ingestModelId,
    setIngestModelId,
    submittingIngest,
    submitIngest,
    linting,
    lintResult,
    runLint,
  } = useWikiAdminOverview();
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredSearchValue(searchQuery);

  const categorySummary = useMemo(() => {
    const counts = new Map<string, number>();
    publishedPages.forEach((page) => {
      counts.set(page.category, (counts.get(page.category) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([category, count]) => `${getWikiCategoryLabel(category)}：${count}`);
  }, [publishedPages]);

  const sourceStatusSummary = useMemo(() => {
    const counts = new Map<string, number>();
    sources.forEach((source) => {
      counts.set(source.status, (counts.get(source.status) || 0) + 1);
    });
    return (["drafted", "approved", "rejected"] as const)
      .map((status) => `${formatSourceStatusLabel(status)}：${counts.get(status) || 0}`);
  }, [sources]);

  const searchResults = useMemo(() => {
    if (!deferredSearchQuery) return null;

    return {
      drafts: activeDrafts
        .filter((draft) => buildDraftSearchText(draft).includes(deferredSearchQuery))
        .slice(0, 6),
      pages: publishedPages
        .filter((page) => buildPageSearchText(page).includes(deferredSearchQuery))
        .slice(0, 6),
      sources: sources
        .filter((source) => buildSourceSearchText(source).includes(deferredSearchQuery))
        .slice(0, 6),
    };
  }, [activeDrafts, deferredSearchQuery, publishedPages, sources]);

  return (
    <div className="h-screen overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <AdminPageHeader
          title="知识审核与发布台"
          description="后台按照“待审核候选知识 / Wiki 页面库 / KB 资料库”三层结构组织。你可以直接搜索某条知识，再跳转到对应位置进行处理。"
          backHref="/"
          backLabel="返回聊天"
        />

        <AdminStatsGrid
          publishedPages={stats?.publishedPages || 0}
          draftCount={draftCount}
          rawSourceCount={stats?.rawSourceCount || 0}
          lastPublishedAt={stats?.lastPublishedAt}
        />

        <AdminErrorBanner error={error} />

        <section className="panel-surface rounded-[28px] px-5 py-5 md:px-7">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                Search Console
              </div>
              <h2 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                搜索 Wiki / KB / 候选知识
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                输入页面标题、KB 资料标题、草稿标题、来源 ID 或提交人，后台会把最相关的结果列出来，并直接带你定位到对应页面。
              </p>
              <div className="mt-4">
                <AdminSearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="搜索 Wiki 页面、KB 资料、候选知识、来源 ID、提交人"
                />
              </div>
            </div>

            <div className="grid gap-4">
              <div className="soft-panel rounded-[24px] px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                  Wiki 分类
                </div>
                <div className="mt-3 space-y-2 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                  {(categorySummary.length > 0 ? categorySummary : ["暂无已发布 Wiki 页面"]).map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="soft-panel rounded-[24px] px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                  KB 状态
                </div>
                <div className="mt-3 space-y-2 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                  {sourceStatusSummary.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {searchResults && (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="soft-panel rounded-[24px] px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                  待审核候选知识
                </div>
                <div className="mt-3 space-y-3">
                  {searchResults.drafts.length === 0 ? (
                    <div className="text-sm" style={{ color: "var(--color-ink-soft)" }}>没有命中候选知识。</div>
                  ) : (
                    searchResults.drafts.map((draft) => (
                      <Link
                        key={draft.id}
                        href={{ pathname: "/admin/drafts", query: { draftId: draft.id } }}
                        className="block rounded-[18px] border px-4 py-3"
                        style={{
                          borderColor: "var(--surface-outline-strong)",
                          background: "var(--surface-command)",
                        }}
                      >
                        <div className="text-sm font-medium" style={{ color: "var(--color-sidebar-text-bright)" }}>{draft.title}</div>
                        <div className="mt-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                          {draft.id} · {formatDate(draft.updatedAt)}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className="soft-panel rounded-[24px] px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                  Wiki 页面库
                </div>
                <div className="mt-3 space-y-3">
                  {searchResults.pages.length === 0 ? (
                    <div className="text-sm" style={{ color: "var(--color-ink-soft)" }}>没有命中 Wiki 页面。</div>
                  ) : (
                    searchResults.pages.map((page) => (
                      <Link
                        key={page.id}
                        href={{ pathname: "/admin/published", query: { pageId: page.id } }}
                        className="block rounded-[18px] border px-4 py-3"
                        style={{
                          borderColor: "var(--surface-outline-strong)",
                          background: "var(--surface-command)",
                        }}
                      >
                        <div className="text-sm font-medium" style={{ color: "var(--color-sidebar-text-bright)" }}>{page.title}</div>
                        <div className="mt-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                          {page.id} · {getWikiCategoryLabel(page.category)}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className="soft-panel rounded-[24px] px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                  KB 资料库
                </div>
                <div className="mt-3 space-y-3">
                  {searchResults.sources.length === 0 ? (
                    <div className="text-sm" style={{ color: "var(--color-ink-soft)" }}>没有命中 KB 资料。</div>
                  ) : (
                    searchResults.sources.map((source) => (
                      <Link
                        key={source.id}
                        href={{ pathname: "/admin/sources", query: { sourceId: source.id } }}
                        className="block rounded-[18px] border px-4 py-3"
                        style={{
                          borderColor: "var(--surface-outline-strong)",
                          background: "var(--surface-command)",
                        }}
                      >
                        <div className="text-sm font-medium" style={{ color: "var(--color-sidebar-text-bright)" }}>{source.title}</div>
                        <div className="mt-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                          {source.id} · {formatSourceStatusLabel(source.status)}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <EntryCard
            href="/admin/drafts"
            kicker="Draft Queue"
            title="待审核草稿"
            description="进入独立审核页后，再逐条编辑、保存、驳回或发布。主页面只显示数量和入口，不再直接堆全文内容。"
            count={`${draftCount} 条`}
          />
          <EntryCard
            href="/admin/published"
            kicker="Wiki Library"
            title="Wiki 页面库"
            description="按正式 Wiki 页面维度统一查看与修改，适合处理已发布的结构化知识。"
            count={`${stats?.publishedPages || 0} 页`}
          />
          <EntryCard
            href="/admin/sources"
            kicker="KB Library"
            title="KB 资料库"
            description="按 KB 原始资料维度管理知识来源、原文内容和审核状态，方便回溯与修订。"
            count={`${stats?.rawSourceCount || 0} 条`}
          />
        </section>

        <section className="panel-surface rounded-[28px] px-5 py-5 md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                Publish Knowledge
              </div>
              <h2 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                管理员直发知识
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                管理员在这里提交的内容会直接发布到正式 Wiki，不进入待审核草稿队列。普通成员提交的候选知识仍然需要审核。
              </p>
            </div>
            <div className="relative">
              <select
                value={ingestModelId}
                onChange={(event) => setIngestModelId(event.target.value as ChatModelId)}
                className="command-select pr-9"
              >
                {CHAT_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: "var(--color-ink-muted)" }}
              >
                <path d="M2.5 3.5L5 6.5L7.5 3.5" />
              </svg>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <input
              value={ingestTitle}
              onChange={(event) => setIngestTitle(event.target.value)}
              placeholder="资料标题，例如：防晒喷雾美区复盘"
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
              placeholder="粘贴原始资料内容。管理员提交后会直接写入正式 Wiki。"
              rows={10}
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
                {submittingIngest ? "正在发布..." : "直接发布知识"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <section className="panel-surface rounded-[28px] px-5 py-5 md:px-6">
            <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
              Review Flow
            </div>
            <h2 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
              当前审核流程
            </h2>
            <ol className="mt-4 space-y-3 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
              {[
                "管理员在本页提交资料后，系统会直接发布到正式 Wiki。",
                "普通成员提交资料后，系统会先生成候选草稿。",
                "进入“待审核草稿”页面逐条检查标题、分类、来源、正文和备注。",
                "审核通过后写入正式 Wiki，再到“已发布页面”查看最终结果。",
              ].map((item, index) => (
                <li key={item} className="soft-panel rounded-[20px] px-4 py-4">
                  <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--chip-soft)] text-xs font-semibold text-[var(--color-amber-deep)]">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </section>

          <section className="panel-surface rounded-[28px] px-5 py-5 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                  Lint
                </div>
                <h2 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                  Wiki 巡检
                </h2>
              </div>
              <button
                onClick={() => void runLint()}
                disabled={linting}
                className="rounded-full px-4 py-2.5 text-sm font-medium disabled:cursor-default"
                style={{
                  background: "var(--brand-badge)",
                  color: "var(--brand-badge-text)",
                  opacity: linting ? 0.6 : 1,
                }}
              >
                {linting ? "巡检中..." : "运行 lint"}
              </button>
            </div>
            <pre
              className="mt-4 whitespace-pre-wrap rounded-[20px] border px-4 py-4 text-xs leading-6"
              style={{
                borderColor: "var(--surface-outline-strong)",
                background: "var(--surface-command)",
                color: "var(--color-ink-soft)",
              }}
            >
              {lintResult || "尚未运行 Wiki 巡检。"}
            </pre>
            <div className="mt-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              当前原始资料数：{sources.length}
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { viewer, loading, error, isAdmin } = useAppViewer();

  if (loading) {
    return (
      <div className="h-screen overflow-y-auto px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl">
          <div className="panel-surface rounded-[28px] px-6 py-8 text-sm" style={{ color: "var(--color-ink-soft)" }}>
            正在识别当前账号的知识台权限...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen overflow-y-auto px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <AdminPageHeader
            title="知识台"
            description="读取当前账号权限时出现问题，请刷新页面后重试。"
            backHref="/"
            backLabel="返回聊天"
          />
          <AdminErrorBanner error={error} />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <WikiPublisherDashboard viewer={viewer} />;
  }

  return <AdminDashboard />;
}
