"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID, type ChatModelId } from "@/lib/chat-models";
import { getWikiCategoryLabel } from "@/lib/wiki-category-labels";
import type { WikiCategory, WikiDraft, WikiPage, WikiSourceRecord, WikiStats } from "@/lib/wiki-types";

type OverviewPayload = {
  stats: WikiStats;
  drafts: WikiDraft[];
  sources: WikiSourceRecord[];
  pages: WikiPage[];
};

type DraftEditorState = {
  title: string;
  category: WikiCategory;
  summary: string;
  rolesText: string;
  sourceIdsText: string;
  relatedPagesText: string;
  content: string;
  notes: string;
};

const ADMIN_TOKEN_STORAGE_KEY = "kb-chat-wiki-admin-token";
const CATEGORY_OPTIONS: WikiCategory[] = ["concepts", "entities", "roles", "faq", "synthesis"];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildDraftEditorState(draft: WikiDraft): DraftEditorState {
  return {
    title: draft.title,
    category: draft.category,
    summary: draft.summary,
    rolesText: draft.roles.join("、"),
    sourceIdsText: draft.sourceIds.join(", "),
    relatedPagesText: draft.relatedPages.join("\n"),
    content: draft.content,
    notes: draft.notes || "",
  };
}

function splitText(value: string, separators: RegExp) {
  return value
    .split(separators)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminPage() {
  const [adminToken, setAdminToken] = useState("");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestContent, setIngestContent] = useState("");
  const [ingestModelId, setIngestModelId] = useState<ChatModelId>(DEFAULT_CHAT_MODEL_ID);
  const [submittingIngest, setSubmittingIngest] = useState(false);
  const [draftEditors, setDraftEditors] = useState<Record<string, DraftEditorState>>({});
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [linting, setLinting] = useState(false);
  const [lintResult, setLintResult] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
    if (storedToken) {
      setAdminToken(storedToken);
    }
  }, []);

  const draftCount = overview?.drafts.filter((draft) => draft.status === "draft").length || 0;

  const apiRequest = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
        ...(init?.headers || {}),
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "请求失败");
    }

    return payload as T;
  }, [adminToken]);

  const loadOverview = useCallback(async () => {
    if (!adminToken.trim()) {
      setError("请先填写管理员 token。");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await apiRequest<OverviewPayload>("/api/wiki/overview");
      setOverview(payload);
      setDraftEditors(
        payload.drafts.reduce<Record<string, DraftEditorState>>((result, draft) => {
          result[draft.id] = buildDraftEditorState(draft);
          return result;
        }, {})
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "读取 Wiki 管理数据失败。");
    } finally {
      setLoading(false);
    }
  }, [adminToken, apiRequest]);

  useEffect(() => {
    if (!adminToken.trim()) return;
    void loadOverview();
  }, [adminToken, loadOverview]);

  const activeDrafts = useMemo(
    () => overview?.drafts.filter((draft) => draft.status === "draft") || [],
    [overview]
  );

  function persistToken(nextToken: string) {
    setAdminToken(nextToken);
    if (nextToken.trim()) {
      window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, nextToken.trim());
    } else {
      window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  }

  function updateDraftEditor(draftId: string, patch: Partial<DraftEditorState>) {
    setDraftEditors((prev) => ({
      ...prev,
      [draftId]: {
        ...prev[draftId],
        ...patch,
      },
    }));
  }

  async function submitIngest() {
    if (!ingestContent.trim()) {
      setError("请先填写要进入 Wiki 审核流的资料内容。");
      return;
    }

    setSubmittingIngest(true);
    setError(null);

    try {
      await apiRequest("/api/wiki/ingest", {
        method: "POST",
        body: JSON.stringify({
          title: ingestTitle.trim(),
          content: ingestContent.trim(),
          modelId: ingestModelId,
        }),
      });

      setIngestTitle("");
      setIngestContent("");
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "提交资料失败。");
    } finally {
      setSubmittingIngest(false);
    }
  }

  async function submitDraftAction(draftId: string, action: "save" | "approve" | "reject") {
    const editor = draftEditors[draftId];
    if (!editor) return;

    setSavingDraftId(draftId);
    setError(null);

    try {
      await apiRequest(`/api/wiki/drafts/${draftId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          title: editor.title,
          category: editor.category,
          summary: editor.summary,
          roles: splitText(editor.rolesText, /[、,，/]/u),
          sourceIds: splitText(editor.sourceIdsText, /[,\s，/]+/u),
          relatedPages: splitText(editor.relatedPagesText, /[\n,，]+/u),
          content: editor.content,
          notes: editor.notes,
        }),
      });

      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "更新草稿失败。");
    } finally {
      setSavingDraftId(null);
    }
  }

  async function approveAllDrafts() {
    if (activeDrafts.length === 0 || bulkApproving) return;

    const confirmed = window.confirm(
      `将批量审核通过并发布当前 ${activeDrafts.length} 条草稿。这个操作会把它们写入正式 Wiki，是否继续？`
    );
    if (!confirmed) return;

    setBulkApproving(true);
    setError(null);

    try {
      await apiRequest<{ approvedCount: number }>("/api/wiki/drafts/bulk-approve", {
        method: "POST",
        body: JSON.stringify({
          drafts: activeDrafts.map((draft) => {
            const editor = draftEditors[draft.id] || buildDraftEditorState(draft);
            return {
              draftId: draft.id,
              title: editor.title,
              category: editor.category,
              summary: editor.summary,
              roles: splitText(editor.rolesText, /[、,，/]/u),
              sourceIds: splitText(editor.sourceIdsText, /[,\s，/]+/u),
              relatedPages: splitText(editor.relatedPagesText, /[\n,，]+/u),
              content: editor.content,
              notes: editor.notes,
            };
          }),
        }),
      });

      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "批量通过草稿失败。");
    } finally {
      setBulkApproving(false);
    }
  }

  async function runLint() {
    setLinting(true);
    setLintResult(null);

    try {
      const payload = await apiRequest<{
        stats: {
          publishedPages: number;
          brokenLinkCount: number;
          isolatedPageCount: number;
          stalePageCount: number;
        };
        brokenLinks: string[];
        isolatedPages: string[];
        stalePages: string[];
      }>("/api/wiki/lint", {
        method: "POST",
      });

      setLintResult(
        [
          `已发布页面：${payload.stats.publishedPages}`,
          `断链：${payload.stats.brokenLinkCount}`,
          payload.brokenLinks.length > 0 ? `断链详情：${payload.brokenLinks.join("；")}` : "断链详情：无",
          `孤立页面：${payload.stats.isolatedPageCount}`,
          payload.isolatedPages.length > 0 ? `孤立页面详情：${payload.isolatedPages.join("、")}` : "孤立页面详情：无",
          `疑似过期页面：${payload.stats.stalePageCount}`,
          payload.stalePages.length > 0 ? `过期页面详情：${payload.stalePages.join("、")}` : "过期页面详情：无",
        ].join("\n")
      );
    } catch (requestError) {
      setLintResult(requestError instanceof Error ? requestError.message : "执行 lint 失败。");
    } finally {
      setLinting(false);
    }
  }

  return (
    <div className="h-screen overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="editorial-kicker">Wiki Control Room</div>
            <h1 className="display-face mt-3 text-4xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
              知识审核与发布台
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
              这里管理的是正式 Wiki，不是即时聊天资料。新资料先进入 draft，审核通过后才会发布到正式页面。
            </p>
          </div>

          <Link
            href="/"
            className="rounded-full border px-4 py-2.5 text-sm"
            style={{
              borderColor: "var(--surface-outline-strong)",
              background: "var(--subtle-surface)",
              color: "var(--color-sidebar-text-bright)",
            }}
          >
            返回聊天
          </Link>
        </div>

        <section className="panel-surface rounded-[28px] px-5 py-5 md:px-7">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                Admin Auth
              </div>
              <label className="mt-3 block text-sm" style={{ color: "var(--color-ink-soft)" }}>
                在 `.env` 中配置 `WIKI_ADMIN_TOKEN` 后，把 token 填在这里。token 只保存在当前浏览器会话里。
              </label>
              <input
                value={adminToken}
                onChange={(event) => persistToken(event.target.value)}
                placeholder="输入管理员 token"
                className="mt-3 w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                style={{
                  borderColor: "var(--surface-outline-strong)",
                  background: "var(--surface-command)",
                  color: "var(--color-sidebar-text-bright)",
                }}
              />
            </div>
            <button
              onClick={() => void loadOverview()}
              disabled={loading || !adminToken.trim()}
              className="rounded-full px-4 py-2.5 text-sm font-medium disabled:cursor-default"
              style={{
                background: "var(--brand-badge)",
                color: "var(--brand-badge-text)",
                opacity: loading || !adminToken.trim() ? 0.6 : 1,
              }}
            >
              {loading ? "加载中..." : "刷新管理数据"}
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["已发布页面", String(overview?.stats.publishedPages || 0)],
            ["待审核草稿", String(draftCount)],
            ["原始资料", String(overview?.stats.rawSourceCount || 0)],
            ["最近发布时间", overview?.stats.lastPublishedAt ? formatDate(overview.stats.lastPublishedAt) : "—"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="soft-panel rounded-[24px] px-5 py-5"
            >
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                {label}
              </div>
              <div className="mt-3 text-2xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                {value}
              </div>
            </div>
          ))}
        </section>

        {error ? (
          <div className="rounded-[22px] border px-4 py-4 text-sm" style={{ borderColor: "rgba(248, 113, 113, 0.35)", color: "#fecaca", background: "rgba(127, 29, 29, 0.18)" }}>
            {error}
          </div>
        ) : null}

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

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                  Draft Queue
                </div>
                <h2 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                  待审核草稿
                </h2>
              </div>
              <span className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
                {activeDrafts.length} 条
              </span>
            </div>

            {activeDrafts.length > 0 ? (
              <div className="flex justify-end">
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
              </div>
            ) : null}

            {activeDrafts.length === 0 ? (
              <div className="soft-panel rounded-[24px] px-5 py-6 text-sm" style={{ color: "var(--color-ink-soft)" }}>
                目前没有待审核的 Wiki 草稿。
              </div>
            ) : (
              activeDrafts.map((draft) => {
                const editor = draftEditors[draft.id] || buildDraftEditorState(draft);

                return (
                  <article key={draft.id} className="panel-surface rounded-[28px] px-5 py-5 md:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                          Draft · {draft.id}
                        </div>
                        <div className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
                          来源：{draft.sourceId} · 更新时间：{formatDate(draft.updatedAt)}
                        </div>
                      </div>
                      <div
                        className="rounded-full px-3 py-1 text-[11px]"
                        style={{
                          background: "var(--chip-soft)",
                          color: "var(--color-amber-deep)",
                        }}
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
                          onChange={(event) =>
                            updateDraftEditor(draft.id, { category: event.target.value as WikiCategory })
                          }
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
              })
            )}
          </div>

          <div className="space-y-4">
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
            </section>

            <section className="panel-surface rounded-[28px] px-5 py-5 md:px-6">
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                Published Pages
              </div>
              <h2 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
                已发布页面
              </h2>
              <div className="mt-4 space-y-3">
                {(overview?.pages || []).slice(0, 24).map((page) => (
                  <div
                    key={page.id}
                    className="relative z-[1] rounded-[20px] border px-4 py-4"
                    style={{
                      borderColor: "var(--surface-outline)",
                      background: "var(--muted-surface)",
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium" style={{ color: "var(--color-sidebar-text-bright)" }}>
                          {page.title}
                        </div>
                        <div className="mt-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                          {page.id}
                        </div>
                      </div>
                      <div
                        className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em]"
                        style={{
                          background: "var(--chip-soft)",
                          color: "var(--color-amber-deep)",
                        }}
                      >
                        {getWikiCategoryLabel(page.category)}
                      </div>
                    </div>
                    <div className="mt-3 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                      {page.summary}
                    </div>
                    <div className="mt-3 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                      更新时间：{formatDate(page.updatedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
