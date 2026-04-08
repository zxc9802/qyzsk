"use client";

import { useState, useRef, useEffect } from "react";
import { ANSWER_MODES, AnswerMode } from "@/lib/answer-modes";
import { CHAT_MODELS, ChatModelId } from "@/lib/chat-models";
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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
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

  const footerText = uploadStatus || null;

  return (
    <div className="shrink-0 px-4 pb-2 pt-0 md:px-6 md:pb-3">
      <div className="mx-auto max-w-6xl">
        <ConversationFiles files={files} onToggle={onToggleFile} onDelete={onDeleteFile} />

        <div className="mt-2 flex items-center justify-start gap-3">
          <div className="relative">
            <select
              value={selectedModelId}
              onChange={(e) => onModelChange(e.target.value as ChatModelId)}
              className="command-select pr-9 text-[13px] cursor-pointer"
              title="选择回答模型"
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
          <div className="relative">
            <select
              value={selectedAnswerMode}
              onChange={(e) => onAnswerModeChange(e.target.value as AnswerMode)}
              className="command-select pr-9 text-[13px] cursor-pointer"
              title="选择回答深度"
            >
              {ANSWER_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
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

        <div
          className="mt-1 flex items-end gap-3 rounded-[30px] border px-4 py-4 transition-all duration-200 md:px-5"
          style={{
            background: "var(--surface-command)",
            borderColor: "var(--surface-outline-strong)",
            boxShadow: "var(--card-shadow)",
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
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border transition-all duration-200 cursor-pointer disabled:cursor-default"
            style={{
              background: isUploading
                ? "rgba(214, 161, 99, 0.14)"
                : "var(--subtle-surface)",
              borderColor: "var(--surface-outline-strong)",
              color: isUploading ? "var(--color-amber-deep)" : "var(--color-sidebar-text-bright)",
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

          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="把你的问题、目标或资料分析任务写在这里。"
              disabled={disabled}
              rows={1}
              className="w-full resize-none border-none bg-transparent px-2 py-2 text-[15px] leading-8 outline-none"
              style={{
                color: "var(--color-sidebar-text-bright)",
                maxHeight: "180px",
              }}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] transition-all duration-200 cursor-pointer disabled:cursor-default"
            style={{
              background: text.trim() && !disabled
                ? "var(--brand-badge)"
                : "var(--subtle-surface)",
              color: text.trim() && !disabled ? "var(--brand-badge-text)" : "var(--color-ink-muted)",
              boxShadow: text.trim() && !disabled ? "var(--button-accent-shadow)" : "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 9L15 3L12 15L9 10.5L3 9Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        {footerText ? (
          <p className="mt-2 text-center text-[11px] leading-5" style={{ color: "var(--color-ink-muted)" }}>
            {footerText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
