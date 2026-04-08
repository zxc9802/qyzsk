"use client";

import Link from "next/link";
import {
  AdminErrorBanner,
  AdminPageHeader,
  AdminStatsGrid,
  AdminTokenPanel,
  CHAT_MODELS,
  useWikiAdminOverview,
} from "@/components/admin/WikiAdminShared";
import type { ChatModelId } from "@/lib/chat-models";

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

export default function AdminPage() {
  const {
    adminToken,
    persistToken,
    loading,
    error,
    loadOverview,
    stats,
    draftCount,
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

  return (
    <div className="h-screen overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <AdminPageHeader
          title="知识审核与发布台"
          description="主页面只保留总览和入口。待审核草稿、已发布页面分别进入独立页面处理，避免审核台随着内容增长越来越长。"
          backHref="/"
          backLabel="返回聊天"
        />

        <AdminTokenPanel
          adminToken={adminToken}
          onChange={persistToken}
          onRefresh={loadOverview}
          loading={loading}
        />

        <AdminStatsGrid
          publishedPages={stats?.publishedPages || 0}
          draftCount={draftCount}
          rawSourceCount={stats?.rawSourceCount || 0}
          lastPublishedAt={stats?.lastPublishedAt}
        />

        <AdminErrorBanner error={error} />

        <section className="grid gap-4 lg:grid-cols-2">
          <EntryCard
            href="/admin/drafts"
            kicker="Draft Queue"
            title="待审核草稿"
            description="进入独立审核页后，再逐条编辑、保存、驳回或发布。主页面只显示数量和入口，不再直接堆全文内容。"
            count={`${draftCount} 条`}
          />
          <EntryCard
            href="/admin/published"
            kicker="Published Pages"
            title="已发布页面"
            description="已发布知识页单独放到新页面查看，避免在审核台主页面直接展开很长的页面列表。"
            count={`${stats?.publishedPages || 0} 页`}
          />
        </section>

        <section className="panel-surface rounded-[28px] px-5 py-5 md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                Ingest Draft
              </div>
              <h2 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                提交候选知识
              </h2>
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
              placeholder="粘贴原始资料内容。这里提交的是候选知识，不会直接写入正式 Wiki。"
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
                disabled={submittingIngest || !adminToken.trim()}
                className="rounded-full px-4 py-2.5 text-sm font-medium disabled:cursor-default"
                style={{
                  background: "var(--brand-badge)",
                  color: "var(--brand-badge-text)",
                  opacity: submittingIngest || !adminToken.trim() ? 0.6 : 1,
                }}
              >
                {submittingIngest ? "正在生成草稿..." : "提交到审核流"}
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
                "先把原始资料提交成候选知识，系统会生成草稿。",
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
