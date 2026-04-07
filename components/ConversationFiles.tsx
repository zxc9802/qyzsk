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
    <div className="space-y-1.5 max-h-[112px] overflow-y-auto pr-1">
      {orderedFiles.map((file) => (
        <div
          key={file.id}
          className="w-full flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs transition-all duration-150"
          style={{
            background: file.active ? "var(--color-amber-glow)" : "rgba(255,255,255,0.72)",
            border: file.active
              ? "1px solid rgba(212, 148, 76, 0.24)"
              : "1px solid var(--color-border-light)",
            opacity: file.status === "ready" ? 1 : 0.8,
          }}
        >
          <button
            type="button"
            onClick={() => onToggle(file.id, !file.active)}
            disabled={file.status !== "ready"}
            className="min-w-0 flex-1 flex items-center gap-3 px-1 py-1 cursor-pointer disabled:cursor-default"
            title={file.status === "ready"
              ? `${file.active ? "点按移出当前参考" : "点按加入当前参考"}`
              : statusLabel(file)}
          >
            <span
              className="shrink-0 w-1.5 h-1.5 rounded-full"
              style={{
                background: file.status === "failed"
                  ? "#dc2626"
                  : file.status === "processing"
                    ? "var(--color-amber)"
                    : file.active
                      ? "var(--color-amber-deep)"
                      : "var(--color-ink-muted)",
              }}
            />
            <span
              className="min-w-0 flex-1 text-left whitespace-nowrap overflow-x-auto"
              style={{ color: "var(--color-ink)" }}
            >
              {file.name}
            </span>
            <span
              className="shrink-0 text-[11px]"
              style={{
                color: file.status === "failed"
                  ? "#b91c1c"
                  : file.active
                    ? "var(--color-amber-deep)"
                    : "var(--color-ink-muted)",
              }}
            >
              {statusLabel(file)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(file.id)}
            className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-all duration-150"
            style={{
              color: "var(--color-ink-muted)",
              background: "transparent",
            }}
            title="删除文件"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(220, 38, 38, 0.08)";
              e.currentTarget.style.color = "#b91c1c";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--color-ink-muted)";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.5 2.5L9.5 9.5" />
              <path d="M9.5 2.5L2.5 9.5" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
