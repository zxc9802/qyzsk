"use client";

import { useRef, useEffect } from "react";
import { AnswerMode } from "@/lib/answer-modes";
import { ChatModelId } from "@/lib/chat-models";
import { KnowledgeMode } from "@/lib/knowledge-mode";
import { ThemeMode } from "@/lib/theme";
import { ConversationFile, Message } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import EmptyState from "./EmptyState";
import InputBar from "./InputBar";

interface ChatAreaProps {
  messages: Message[];
  files: ConversationFile[];
  isStreaming: boolean;
  isGeneratingReport: boolean;
  canGenerateReport: boolean;
  onSend: (message: string) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onToggleFile: (fileId: string, nextActive: boolean) => void;
  onDeleteFile: (fileId: string) => void;
  onGenerateReport: () => void;
  selectedModelId: ChatModelId;
  onModelChange: (modelId: ChatModelId) => void;
  selectedAnswerMode: AnswerMode;
  onAnswerModeChange: (mode: AnswerMode) => void;
  selectedKnowledgeMode: KnowledgeMode;
  onKnowledgeModeChange: (mode: KnowledgeMode) => void;
  themeMode: ThemeMode;
  onThemeToggle: () => void;
  roleName: string;
  onRoleClick: () => void;
  isUploading: boolean;
  uploadStatus?: string | null;
}

export default function ChatArea({
  messages,
  files,
  isStreaming,
  isGeneratingReport,
  canGenerateReport,
  onSend,
  onUpload,
  onToggleFile,
  onDeleteFile,
  onGenerateReport,
  selectedModelId,
  onModelChange,
  selectedAnswerMode,
  onAnswerModeChange,
  selectedKnowledgeMode,
  onKnowledgeModeChange,
  themeMode,
  onThemeToggle,
  roleName,
  onRoleClick,
  isUploading,
  uploadStatus,
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-x-0 top-0 h-48"
          style={{ background: "linear-gradient(180deg, var(--chat-hero-glow), transparent)" }}
        />
        <div
          className="absolute bottom-[-10%] right-[8%] h-80 w-80 rounded-full blur-3xl"
          style={{ background: "var(--chat-orb-glow)" }}
        />
      </div>

      <div className="relative shrink-0 border-b px-6 py-3 md:px-10 md:py-3.5" style={{ borderColor: "var(--surface-outline)" }}>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onGenerateReport}
            disabled={!canGenerateReport || isGeneratingReport}
            className="rounded-full border px-4 py-2.5 text-sm transition-all duration-150 cursor-pointer disabled:cursor-default"
            style={{
              background: "var(--subtle-surface)",
              borderColor: "var(--surface-outline-strong)",
              color: "var(--color-sidebar-text-bright)",
              opacity: !canGenerateReport || isGeneratingReport ? 0.55 : 1,
            }}
          >
            {isGeneratingReport ? "正在生成报告..." : "生成报告"}
          </button>
          <button
            onClick={onThemeToggle}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all duration-150 cursor-pointer"
            style={{
              background: "var(--toggle-surface)",
              borderColor: "var(--toggle-border)",
              color: "var(--toggle-icon)",
            }}
            title={themeMode === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          >
            {themeMode === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2.8V5.1" />
                <path d="M12 18.9V21.2" />
                <path d="M21.2 12H18.9" />
                <path d="M5.1 12H2.8" />
                <path d="M18.5 5.5L16.8 7.2" />
                <path d="M7.2 16.8L5.5 18.5" />
                <path d="M18.5 18.5L16.8 16.8" />
                <path d="M7.2 7.2L5.5 5.5" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.1 14.3A8.3 8.3 0 0 1 9.7 3.9a.65.65 0 0 0-.83-.83A9.6 9.6 0 1 0 21 15.13a.65.65 0 0 0-.9-.83Z" />
              </svg>
            )}
          </button>
          <button
            onClick={onRoleClick}
            className="metal-pill flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 transition-all duration-150 cursor-pointer"
          >
            <span className="text-sm font-medium">{roleName}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.5 3.5L5 6.5L7.5 3.5" />
            </svg>
          </button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState onQuestionClick={onSend} />
      ) : (
        <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-6 py-6 md:px-10 md:py-8">
          <div className="mx-auto max-w-6xl">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
              />
            ))}
          </div>
        </div>
      )}

      <InputBar
        files={files}
        onSend={onSend}
        onUpload={onUpload}
        onToggleFile={onToggleFile}
        onDeleteFile={onDeleteFile}
        selectedModelId={selectedModelId}
        onModelChange={onModelChange}
        selectedAnswerMode={selectedAnswerMode}
        onAnswerModeChange={onAnswerModeChange}
        selectedKnowledgeMode={selectedKnowledgeMode}
        onKnowledgeModeChange={onKnowledgeModeChange}
        disabled={isStreaming}
        isUploading={isUploading}
        uploadStatus={uploadStatus}
      />
    </div>
  );
}
