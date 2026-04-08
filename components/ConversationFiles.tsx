"use client";

import { ConversationFile } from "@/lib/types";

interface ConversationFilesProps {
  files: ConversationFile[];
  onToggle: (fileId: string, nextActive: boolean) => void;
  onDelete: (fileId: string) => void;
}

function statusLabel(file: ConversationFile): string {
  if (file.status === "processing") return "解析中";
  if (file.status === "failed") return "失败";
  return file.active ? "参考中" : "未参考";
}

function fileBadge(file: ConversationFile): string {
  const extension = file.metadata.extension?.replace(/^\./, "").toUpperCase();
  if (extension) return extension;
  if (file.kind === "document") return "DOC";
  if (file.kind === "image") return "IMG";
  return "VID";
}

export default function ConversationFiles({
  files,
  onToggle,
  onDelete,
}: ConversationFilesProps) {
  if (files.length === 0) return null;

  const orderedFiles = [...files].sort((left, right) => {
    const leftScore =
      (left.active ? 4 : 0) +
      (left.status === "processing" ? 3 : 0) +
      (left.status === "failed" ? 1 : 0);
    const rightScore =
      (right.active ? 4 : 0) +
      (right.status === "processing" ? 3 : 0) +
      (right.status === "failed" ? 1 : 0);

    if (leftScore !== rightScore) return rightScore - leftScore;
    return right.updatedAt - left.updatedAt;
  });

  return (
    <div className="space-y-2 max-h-[136px] overflow-y-auto pr-1">
      {orderedFiles.map((file) => {
        const isReady = file.status === "ready";
        return (
          <div
            key={file.id}
            className="flex items-center gap-3 rounded-[20px] border px-3 py-2.5 transition-all duration-150"
            style={{
              background: file.active
                ? "var(--file-row-active)"
                : "var(--file-row-surface)",
              borderColor: file.active ? "var(--surface-outline-accent-strong)" : "var(--surface-outline)",
              opacity: file.status === "ready" ? 1 : 0.82,
            }}
          >
            <button
              type="button"
              onClick={() => onToggle(file.id, !file.active)}
              disabled={!isReady}
              className="min-w-0 flex flex-1 items-center gap-3 text-left cursor-pointer disabled:cursor-default"
              title={isReady ? (file.active ? "点按移出当前参考" : "点按加入当前参考") : statusLabel(file)}
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span
                  className="absolute inline-flex h-full w-full rounded-full"
                  style={{
                    background: file.status === "processing"
                      ? "rgba(214, 161, 99, 0.28)"
                      : file.status === "failed"
                        ? "rgba(248, 113, 113, 0.22)"
                        : file.active
                          ? "rgba(214, 161, 99, 0.22)"
                          : "rgba(141, 164, 201, 0.18)",
                  }}
                />
                <span
                  className="relative inline-flex h-2.5 w-2.5 rounded-full"
                  style={{
                    background: file.status === "failed"
                      ? "#f87171"
                      : file.status === "processing"
                        ? "var(--color-amber)"
                        : file.active
                          ? "var(--color-amber-deep)"
                          : "var(--color-ink-muted)",
                  }}
                />
              </span>

              <span
                className="inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em]"
                style={{
                  borderColor: "var(--surface-outline-accent)",
                  color: "var(--color-amber-soft)",
                  background: "var(--chip-soft)",
                }}
              >
                {fileBadge(file)}
              </span>

              <span className="min-w-0 flex-1 overflow-hidden">
                <span
                  className="block whitespace-nowrap overflow-x-auto text-sm leading-6"
                  style={{ color: "var(--color-sidebar-text-bright)" }}
                >
                  {file.name}
                </span>
              </span>

              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-[10px]"
                style={{
                  color: file.status === "failed"
                    ? "#fecaca"
                    : file.active
                      ? "var(--color-amber-deep)"
                      : "var(--color-ink-muted)",
                  background: file.status === "failed"
                    ? "rgba(127, 29, 29, 0.24)"
                    : file.active
                      ? "var(--chip-soft)"
                      : "var(--subtle-surface)",
                }}
              >
                {statusLabel(file)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onDelete(file.id)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-150 cursor-pointer"
              style={{
                borderColor: "var(--surface-outline)",
                color: "var(--color-ink-muted)",
                background: "var(--subtle-surface)",
              }}
              title="删除文件"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.5 2.5L9.5 9.5" />
                <path d="M9.5 2.5L2.5 9.5" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
