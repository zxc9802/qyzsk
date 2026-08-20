"use client";

import { useEffect, useRef, useState } from "react";
import {
  UPLOAD_FILE_ACCEPT,
  UPLOAD_FILE_ACCEPT_LABEL,
  formatBytes,
  inferAcceptedUploadKind,
  partitionUploadFiles,
} from "@/lib/upload-accept";

interface KnowledgeFilePickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export default function KnowledgeFilePicker({
  files,
  onChange,
  disabled = false,
}: KnowledgeFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextPreviews: Record<string, string> = {};
    files.forEach((file, index) => {
      if (inferAcceptedUploadKind(file.name) === "image") {
        nextPreviews[`${file.name}-${file.size}-${index}`] = URL.createObjectURL(file);
      }
    });
    setPreviews(nextPreviews);
    return () => {
      Object.values(nextPreviews).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  function addFiles(nextFiles: File[]) {
    const { accepted, rejected } = partitionUploadFiles(nextFiles);
    setPickerError(rejected.length > 0 ? rejected.join("\n") : null);
    if (accepted.length === 0) return;
    onChange([...files, ...accepted]);
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={UPLOAD_FILE_ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (disabled) return;
          addFiles(Array.from(event.dataTransfer.files || []));
        }}
        className="w-full rounded-[18px] border px-4 py-5 text-left text-sm disabled:cursor-default"
        style={{
          borderColor: dragActive ? "var(--surface-outline-accent-strong)" : "var(--surface-outline-strong)",
          background: dragActive ? "var(--file-row-active)" : "var(--subtle-surface)",
          color: "var(--color-sidebar-text-bright)",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {dragActive ? "松开即可上传" : "拖入文档、图片或视频，也可以点这里选择"}
        <span className="mt-1 block text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          支持 {UPLOAD_FILE_ACCEPT_LABEL}。文档 100MB、图片 20MB、视频 500MB。
        </span>
      </button>
      {pickerError ? (
        <div className="rounded-[16px] px-3 py-2 text-[12px] leading-6" style={{ color: "#fecaca", background: "rgba(127, 29, 29, 0.18)" }}>
          {pickerError}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((file, index) => {
            const previewKey = `${file.name}-${file.size}-${index}`;
            const previewUrl = previews[previewKey];
            const kind = inferAcceptedUploadKind(file.name);
            return (
              <div
                key={previewKey}
                className="flex items-center justify-between gap-3 rounded-[16px] border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--surface-outline)",
                  background: "var(--surface-command)",
                  color: "var(--color-sidebar-text-bright)",
                }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {previewUrl ? (
                    <img src={previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-[10px] object-cover" />
                  ) : (
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] text-[10px] uppercase"
                      style={{ background: "var(--chip-soft)", color: "var(--color-amber-deep)" }}
                    >
                      {kind === "video" ? "VID" : "DOC"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate">{file.name}</div>
                    <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                      {formatBytes(file.size)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
                  disabled={disabled}
                  className="shrink-0 text-[11px]"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  移除
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
