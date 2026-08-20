"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { CHAT_MODELS, DEFAULT_WIKI_DRAFT_MODEL_ID, type ChatModelId } from "@/lib/chat-models";
import { extractApiErrorMessage, readJsonSafely, redirectToMainAppIfNeeded } from "@/lib/client/api-response";
import { postFormData } from "@/lib/client/upload-form";
import { inspectUploadFile } from "@/lib/upload-accept";
import { buildSeeAlsoRelations, formatWikiRelationsText, parseWikiRelationsText } from "@/lib/wiki-relations";
import type { WikiCategory, WikiDraft, WikiPage, WikiSourceRecord, WikiSourceStatus, WikiStats } from "@/lib/wiki-types";

export type OverviewPayload = {
  stats: WikiStats;
  drafts: WikiDraft[];
  sources: WikiSourceRecord[];
  pages: WikiPage[];
};

export type DraftEditorState = {
  title: string;
  category: WikiCategory;
  summary: string;
  rolesText: string;
  sourceIdsText: string;
  relatedPagesText: string;
  relationsText: string;
  content: string;
  notes: string;
};

export function formatSourceStatusLabel(status: WikiSourceStatus) {
  if (status === "processing") return "处理中";
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已驳回";
  if (status === "failed") return "处理失败";
  return "待处理";
}

export const SOURCE_STATUS_GROUPS: WikiSourceStatus[] = [
  "processing",
  "failed",
  "drafted",
  "approved",
  "rejected",
];

export function formatDate(value?: string | null) {
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

export function buildDraftEditorState(draft: WikiDraft): DraftEditorState {
  return {
    title: draft.title,
    category: draft.category,
    summary: draft.summary,
    rolesText: draft.roles.join("、"),
    sourceIdsText: draft.sourceIds.join(", "),
    relatedPagesText: draft.relatedPages.join("\n"),
    relationsText: formatWikiRelationsText(
      draft.relations.length > 0 ? draft.relations : buildSeeAlsoRelations(draft.relatedPages)
    ),
    content: draft.content,
    notes: draft.notes || "",
  };
}

export function splitText(value: string, separators: RegExp) {
  return value
    .split(separators)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveEditorRelations(editor: Pick<DraftEditorState, "relationsText" | "relatedPagesText">) {
  const typedRelations = parseWikiRelationsText(editor.relationsText);
  if (typedRelations.length > 0) {
    return typedRelations;
  }

  return buildSeeAlsoRelations(splitText(editor.relatedPagesText, /[\n,，]+/u));
}

export function useWikiAdminOverview() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestContent, setIngestContent] = useState("");
  const [ingestFiles, setIngestFiles] = useState<File[]>([]);
  const [ingestModelId, setIngestModelId] = useState<ChatModelId>(DEFAULT_WIKI_DRAFT_MODEL_ID);
  const [submittingIngest, setSubmittingIngest] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<number | null>(null);
  const [ingestNotice, setIngestNotice] = useState<string | null>(null);
  const [draftEditors, setDraftEditors] = useState<Record<string, DraftEditorState>>({});
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [linting, setLinting] = useState(false);
  const [lintResult, setLintResult] = useState<string | null>(null);

  const draftCount = overview?.drafts.filter((draft) => draft.status === "draft").length || 0;

  const apiRequest = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });

      const payload = await readJsonSafely<T & { error?: string; message?: string; redirectUrl?: string }>(response);
      if (redirectToMainAppIfNeeded(response, payload)) {
        throw new Error("登录已失效，正在返回主站...");
      }

      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload, "请求失败"));
      }

      return payload as T;
    },
    []
  );

  const loadOverview = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const payload = await apiRequest<OverviewPayload>("/api/wiki/overview");
      setOverview(payload);
      setDraftEditors((previous) => {
        if (options?.silent) {
          const next = { ...previous };
          payload.drafts.forEach((draft) => {
            if (!next[draft.id]) next[draft.id] = buildDraftEditorState(draft);
          });
          return next;
        }

        return payload.drafts.reduce<Record<string, DraftEditorState>>((result, draft) => {
          result[draft.id] = buildDraftEditorState(draft);
          return result;
        }, {});
      });
    } catch (requestError) {
      if (!options?.silent) {
        setError(requestError instanceof Error ? requestError.message : "读取 Wiki 管理数据失败。");
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const hasProcessingSources = Boolean(overview?.sources.some((source) => source.status === "processing"));

  useEffect(() => {
    if (!hasProcessingSources) return;
    const intervalId = window.setInterval(() => {
      void loadOverview({ silent: true });
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [hasProcessingSources, loadOverview]);

  const activeDrafts = useMemo(
    () => overview?.drafts.filter((draft) => draft.status === "draft") || [],
    [overview]
  );

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
    if (!ingestContent.trim() && ingestFiles.length === 0) {
      setError("请先填写资料内容，或上传文档、图片、视频。");
      return;
    }

    const rejected = ingestFiles.map(inspectUploadFile).filter((item) => !item.ok);
    if (rejected.length > 0) {
      setError(rejected.map((item) => (!item.ok ? item.error : "")).join("\n"));
      return;
    }

    setSubmittingIngest(true);
    setIngestProgress(ingestFiles.length > 0 ? 0 : null);
    setError(null);
    setIngestNotice(null);

    try {
      const formData = new FormData();
      formData.append("title", ingestTitle.trim());
      formData.append("content", ingestContent.trim());
      formData.append("modelId", ingestModelId);
      ingestFiles.forEach((file) => formData.append("files", file));

      const payload = await postFormData<{ message?: string }> ({
        url: "/api/wiki/ingest",
        formData,
        onProgress: ingestFiles.length > 0 ? setIngestProgress : undefined,
      });

      setIngestTitle("");
      setIngestContent("");
      setIngestFiles([]);
      setIngestNotice(payload.message || "资料已提交，正在后台处理。");
      await loadOverview({ silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "提交资料失败。");
    } finally {
      setSubmittingIngest(false);
      setIngestProgress(null);
    }
  }

  async function deleteDraft(draftId: string) {
    const draft = overview?.drafts.find((item) => item.id === draftId);
    const confirmed = window.confirm(
      `确定删除草稿「${draft?.title || draftId}」？此操作不可恢复。`
    );
    if (!confirmed) return;

    setSavingDraftId(draftId);
    setError(null);

    try {
      await apiRequest(`/api/wiki/drafts/${draftId}`, {
        method: "DELETE",
      });
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除草稿失败。");
    } finally {
      setSavingDraftId(null);
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
          relations: resolveEditorRelations(editor),
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
              relations: resolveEditorRelations(editor),
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
          oneWayRelationCount?: number;
        };
        brokenLinks: string[];
        isolatedPages: string[];
        stalePages: string[];
        oneWayRelations?: string[];
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
          `单向关系：${payload.stats.oneWayRelationCount || 0}`,
          payload.oneWayRelations && payload.oneWayRelations.length > 0
            ? `单向关系详情：${payload.oneWayRelations.join("；")}`
            : "单向关系详情：无",
        ].join("\n")
      );
    } catch (requestError) {
      setLintResult(requestError instanceof Error ? requestError.message : "执行 lint 失败。");
    } finally {
      setLinting(false);
    }
  }

  return {
    overview,
    loading,
    error,
    setError,
    loadOverview,
    ingestTitle,
    setIngestTitle,
    ingestContent,
    setIngestContent,
    ingestFiles,
    setIngestFiles,
    ingestModelId,
    setIngestModelId,
    submittingIngest,
    ingestProgress,
    ingestNotice,
    submitIngest,
    draftEditors,
    updateDraftEditor,
    savingDraftId,
    submitDraftAction,
    deleteDraft,
    bulkApproving,
    approveAllDrafts,
    linting,
    lintResult,
    runLint,
    activeDrafts,
    draftCount,
    publishedPages: overview?.pages || [],
    stats: overview?.stats || null,
    sources: overview?.sources || [],
  };
}

export function AdminErrorBanner({ error }: { error?: string | null }) {
  if (!error) return null;

  return (
    <div
      className="rounded-[22px] border px-4 py-4 text-sm"
      style={{ borderColor: "rgba(248, 113, 113, 0.35)", color: "#fecaca", background: "rgba(127, 29, 29, 0.18)" }}
    >
      {error}
    </div>
  );
}

export function AdminStatsGrid(props: {
  publishedPages: number;
  draftCount: number;
  rawSourceCount: number;
  lastPublishedAt?: string | null;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-4">
      {[
        ["已发布页面", String(props.publishedPages || 0)],
        ["待审核草稿", String(props.draftCount || 0)],
        ["KB 原始资料", String(props.rawSourceCount || 0)],
        ["最近发布时间", props.lastPublishedAt ? formatDate(props.lastPublishedAt) : "—"],
      ].map(([label, value]) => (
        <div key={label} className="soft-panel rounded-[24px] px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
            {label}
          </div>
          <div className="mt-3 text-2xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
            {value}
          </div>
        </div>
      ))}
    </section>
  );
}

export function AdminSearchInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      className="w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
      style={{
        borderColor: "var(--surface-outline-strong)",
        background: "var(--surface-command)",
        color: "var(--color-sidebar-text-bright)",
      }}
    />
  );
}

export function useDeferredSearchValue(value: string) {
  return useDeferredValue(value.trim().toLowerCase());
}

export function AdminPageHeader(props: {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="editorial-kicker">Wiki Control Room</div>
        <h1 className="display-face mt-3 text-4xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
          {props.title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
          {props.description}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {props.extra}
        {props.backHref ? (
          <a
            href={props.backHref}
            className="rounded-full border px-4 py-2.5 text-sm"
            style={{
              borderColor: "var(--surface-outline-strong)",
              background: "var(--subtle-surface)",
              color: "var(--color-sidebar-text-bright)",
            }}
          >
            {props.backLabel || "返回"}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export { CHAT_MODELS };
