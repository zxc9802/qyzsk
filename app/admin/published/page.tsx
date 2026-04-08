"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AdminErrorBanner,
  AdminPageHeader,
  AdminStatsGrid,
  AdminTokenPanel,
  formatDate,
  useWikiAdminOverview,
} from "@/components/admin/WikiAdminShared";
import { useAppViewer } from "@/lib/client/app-session";
import { getWikiCategoryLabel } from "@/lib/wiki-category-labels";

export default function AdminPublishedPage() {
  const router = useRouter();
  const { loading: sessionLoading, isAdmin } = useAppViewer();
  const {
    adminToken,
    persistToken,
    loading,
    error,
    loadOverview,
    stats,
    draftCount,
    publishedPages,
  } = useWikiAdminOverview();

  useEffect(() => {
    if (!sessionLoading && !isAdmin) {
      router.replace("/admin");
    }
  }, [isAdmin, router, sessionLoading]);

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
          title="已发布页面"
          description="正式 Wiki 页面单独放到这一页查看。主审核台只保留入口，避免发布内容越来越多后把总页面拉得过长。"
          backHref="/admin"
          backLabel="返回审核台"
          extra={
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
          }
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

        <section className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
              Published Pages
            </div>
            <h2 className="mt-2 text-2xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
              正式知识页面列表
            </h2>
          </div>

          {publishedPages.length === 0 ? (
            <div className="soft-panel rounded-[24px] px-5 py-6 text-sm" style={{ color: "var(--color-ink-soft)" }}>
              当前还没有已发布页面。
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {publishedPages.map((page) => (
                <article
                  key={page.id}
                  className="panel-surface rounded-[24px] px-5 py-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                        {page.title}
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                        {page.id}
                      </div>
                    </div>
                    <div
                      className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em]"
                      style={{ background: "var(--chip-soft)", color: "var(--color-amber-deep)" }}
                    >
                      {getWikiCategoryLabel(page.category)}
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                    {page.summary}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                    <span>更新时间：{formatDate(page.updatedAt)}</span>
                    <span>版本：v{page.version}</span>
                    <span>来源：{page.sourceIds.length} 条</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
