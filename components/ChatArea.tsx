"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { AnswerMode } from "@/lib/answer-modes";
import { ChatModelId } from "@/lib/chat-models";
import { ThemeMode } from "@/lib/theme";
import { ConversationFile, Message } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import EmptyState from "./EmptyState";
import InputBar from "./InputBar";

interface ChatAreaProps {
  conversationId: string | null;
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
  webSearchEnabled: boolean;
  onWebSearchToggle: (enabled: boolean) => void;
  themeMode: ThemeMode;
  onThemeToggle: () => void;
  roleName: string;
  roleId: string | null;
  onRoleClick: () => void;
  isUploading: boolean;
  uploadStatus?: string | null;
  /**
   * 移动端切换侧边栏抽屉的回调。仅在父组件传入时才会渲染左上角汉堡按钮。
   */
  onToggleSidebar?: () => void;
  mobileSidebarOpen?: boolean;
}

export default function ChatArea({
  conversationId,
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
  webSearchEnabled,
  onWebSearchToggle,
  themeMode,
  onThemeToggle,
  roleName,
  roleId,
  onRoleClick,
  isUploading,
  uploadStatus,
  onToggleSidebar,
  mobileSidebarOpen = false,
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const previousConversationIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || !conversationId) {
      previousConversationIdRef.current = conversationId;
      return;
    }

    if (previousConversationIdRef.current !== conversationId) {
      const savedScrollTop = scrollPositionsRef.current[conversationId];
      container.scrollTop = typeof savedScrollTop === "number" ? savedScrollTop : container.scrollHeight;
    }

    previousConversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || messages.length === 0) {
      return;
    }

    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      scrollPositionsRef.current[conversationId] = container.scrollTop;
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll);

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [conversationId, messages.length]);

  const isEmpty = messages.length === 0;
  const firstClarificationMessageId = messages.find(
    (item) => item.role === "assistant" && item.questionDiagnosis?.mode === "clarify"
  )?.id;

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

      <div className="relative shrink-0 border-b px-3 py-3 sm:px-6 md:px-10 md:py-3.5" style={{ borderColor: "var(--surface-outline)" }}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border md:hidden"
              style={{
                background: "var(--toggle-surface)",
                borderColor: "var(--toggle-border)",
                color: "var(--toggle-icon)",
              }}
              aria-label="打开侧边栏"
              aria-expanded={mobileSidebarOpen}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
                <line x1="3" y1="5" x2="15" y2="5" />
                <line x1="3" y1="9" x2="15" y2="9" />
                <line x1="3" y1="13" x2="15" y2="13" />
              </svg>
            </button>
          )}
          <button
            onClick={onGenerateReport}
            disabled={!canGenerateReport || isGeneratingReport}
            className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm transition-all duration-150 cursor-pointer disabled:cursor-default sm:h-auto sm:w-auto sm:px-4 sm:py-2.5"
            style={{
              background: "var(--subtle-surface)",
              borderColor: "var(--surface-outline-strong)",
              color: "var(--color-sidebar-text-bright)",
              opacity: !canGenerateReport || isGeneratingReport ? 0.55 : 1,
            }}
          >
            <svg className="sm:hidden" width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M5 2.75h5.25L13.5 6v9.25H5z" />
              <path d="M10 2.75V6h3.5M7.25 9h4M7.25 12h3" />
            </svg>
            <span className="hidden sm:inline">{isGeneratingReport ? "正在生成报告..." : "生成报告"}</span>
            <span className="sr-only sm:hidden">{isGeneratingReport ? "正在生成报告" : "生成报告"}</span>
          </button>
          <button
            onClick={onThemeToggle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-150 cursor-pointer sm:h-11 sm:w-11"
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
            className="metal-pill flex min-w-0 max-w-[8.75rem] shrink items-center gap-2 rounded-full px-3 py-2.5 transition-all duration-150 cursor-pointer sm:max-w-none sm:shrink-0 sm:gap-3 sm:px-4"
          >
            <span className="truncate text-sm font-medium">{roleName}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.5 3.5L5 6.5L7.5 3.5" />
            </svg>
          </button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState onQuestionClick={onSend} roleId={roleId} roleName={roleName} />
      ) : (
        <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 md:px-10 md:py-8">
          <div className="mx-auto max-w-6xl">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
                showQuestionDiagnosis={msg.id === firstClarificationMessageId}
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
        webSearchEnabled={webSearchEnabled}
        onWebSearchToggle={onWebSearchToggle}
        disabled={isStreaming}
        isUploading={isUploading}
        uploadStatus={uploadStatus}
      />
    </div>
  );
}
