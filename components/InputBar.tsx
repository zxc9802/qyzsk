"use client";

import { useState, useRef, useEffect } from "react";
import { ANSWER_MODES, AnswerMode, getAnswerModeOption } from "@/lib/answer-modes";
import { CHAT_MODELS, ChatModelId, getChatModelOption } from "@/lib/chat-models";
import { ConversationFile } from "@/lib/types";
import ConversationFiles from "./ConversationFiles";

interface InputBarProps {
  files: ConversationFile[];
  onSend: (message: string) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onToggleFile: (fileId: string, nextActive: boolean) => void;
  onDeleteFile: (fileId: string) => void;
  selectedModelId: ChatModelId;
  onModelChange: (modelId: ChatModelId) => void;
  selectedAnswerMode: AnswerMode;
  onAnswerModeChange: (mode: AnswerMode) => void;
  disabled?: boolean;
  isUploading?: boolean;
  uploadStatus?: string | null;
}

export default function InputBar({
  files,
  onSend,
  onUpload,
  onToggleFile,
  onDeleteFile,
  selectedModelId,
  onModelChange,
  selectedAnswerMode,
  onAnswerModeChange,
  disabled = false,
  isUploading = false,
  uploadStatus,
}: InputBarProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentModel = getChatModelOption(selectedModelId);
  const currentAnswerMode = getAnswerModeOption(selectedAnswerMode);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePickFiles = () => {
    if (disabled || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await onUpload(files);
    }
    e.target.value = "";
  };

  return (
    <div className="shrink-0 px-6 pb-5 pt-3"
      style={{ background: "linear-gradient(to top, var(--color-surface) 80%, transparent)" }}>
      <div className="max-w-5xl mx-auto">
        <ConversationFiles files={files} onToggle={onToggleFile} onDelete={onDeleteFile} />
        <div className="mt-2 mb-2 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-4 min-w-0 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] shrink-0" style={{ color: "var(--color-ink-muted)" }}>
                回答模式
              </span>
              <div className="relative min-w-0">
                <select
                  value={selectedAnswerMode}
                  onChange={(e) => onAnswerModeChange(e.target.value as AnswerMode)}
                  disabled={disabled}
                  className="appearance-none rounded-lg pl-3 pr-7 py-1.5 text-xs outline-none cursor-pointer disabled:cursor-default"
                  style={{
                    background: "var(--color-surface-raised)",
                    color: "var(--color-ink)",
                    border: "1px solid var(--color-border-light)",
                  }}
                >
                  {ANSWER_MODES.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  <path d="M2.5 3.5L5 6.5L7.5 3.5" />
                </svg>
              </div>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] shrink-0" style={{ color: "var(--color-ink-muted)" }}>
                回答模型
              </span>
              <div className="relative min-w-0">
                <select
                  value={selectedModelId}
                  onChange={(e) => onModelChange(e.target.value as ChatModelId)}
                  disabled={disabled}
                  className="appearance-none rounded-lg pl-3 pr-7 py-1.5 text-xs outline-none cursor-pointer disabled:cursor-default"
                  style={{
                    background: "var(--color-surface-raised)",
                    color: "var(--color-ink)",
                    border: "1px solid var(--color-border-light)",
                  }}
                >
                  {CHAT_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  <path d="M2.5 3.5L5 6.5L7.5 3.5" />
                </svg>
              </div>
            </div>
          </div>
          <span className="text-[11px] truncate" style={{ color: "var(--color-ink-muted)" }}>
            {currentAnswerMode.description} · {currentModel.description}
          </span>
        </div>

        <div className="flex items-end gap-3 p-3 rounded-2xl transition-all duration-200"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            marginTop: files.length > 0 ? "8px" : "0",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-amber-soft)";
            e.currentTarget.style.boxShadow = "0 2px 12px rgba(212, 148, 76, 0.1)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.mp4,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={handlePickFiles}
            disabled={disabled || isUploading}
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer"
            style={{
              background: "var(--color-surface-sunken)",
              color: isUploading ? "var(--color-amber-deep)" : "var(--color-ink-soft)",
              opacity: disabled ? 0.6 : 1,
            }}
            title="上传 PDF、Word、MP4、PNG、JPG"
          >
            {isUploading ? (
              <span className="text-[11px] font-semibold">...</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12V3.5" />
                <path d="M5.75 6.75L9 3.5L12.25 6.75" />
                <path d="M3.5 12.5V13.25C3.5 14.2165 4.2835 15 5.25 15H12.75C13.7165 15 14.5 14.2165 14.5 13.25V12.5" />
              </svg>
            )}
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，直接问就好..."
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm leading-relaxed px-2 py-1.5"
            style={{
              color: "var(--color-ink)",
              maxHeight: "160px",
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer"
            style={{
              background: text.trim() && !disabled ? "var(--color-amber)" : "var(--color-border-light)",
              color: text.trim() && !disabled ? "#fff" : "var(--color-ink-muted)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 9L15 3L12 15L9 10.5L3 9Z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <p className="text-center mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {uploadStatus || "支持 PDF / Word / MP4 / PNG / JPG。按 Enter 发送，Shift+Enter 换行。"}
        </p>
      </div>
    </div>
  );
}
