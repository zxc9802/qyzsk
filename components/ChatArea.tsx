"use client";

import { useRef, useEffect } from "react";
import { AnswerMode } from "@/lib/answer-modes";
import { ChatModelId } from "@/lib/chat-models";
import { ConversationFile, Message } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import EmptyState from "./EmptyState";
import InputBar from "./InputBar";

interface ChatAreaProps {
  messages: Message[];
  files: ConversationFile[];
  isStreaming: boolean;
  onSend: (message: string) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onToggleFile: (fileId: string, nextActive: boolean) => void;
  onDeleteFile: (fileId: string) => void;
  selectedModelId: ChatModelId;
  onModelChange: (modelId: ChatModelId) => void;
  selectedAnswerMode: AnswerMode;
  onAnswerModeChange: (mode: AnswerMode) => void;
  roleName: string;
  onRoleClick: () => void;
  isUploading: boolean;
  uploadStatus?: string | null;
}

export default function ChatArea({
  messages,
  files,
  isStreaming,
  onSend,
  onUpload,
  onToggleFile,
  onDeleteFile,
  selectedModelId,
  onModelChange,
  selectedAnswerMode,
  onAnswerModeChange,
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
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Top Bar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3"
        style={{ borderBottom: "1px solid var(--color-border-light)" }}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            {isEmpty ? "新对话" : messages[0]?.content.slice(0, 30) + (messages[0]?.content.length > 30 ? "..." : "")}
          </h2>
        </div>
        <button
          onClick={onRoleClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer"
          style={{
            background: "var(--color-amber-glow)",
            color: "var(--color-amber-deep)",
            border: "1px solid rgba(212, 148, 76, 0.2)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(212, 148, 76, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--color-amber-glow)";
          }}
        >
          <span>{roleName}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2.5 3.5L5 6.5L7.5 3.5" />
          </svg>
        </button>
      </div>

      {/* Messages or Empty State */}
      {isEmpty ? (
        <EmptyState onQuestionClick={onSend} />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-5xl mx-auto">
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

      {/* Input */}
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
        disabled={isStreaming}
        isUploading={isUploading}
        uploadStatus={uploadStatus}
      />
    </div>
  );
}
