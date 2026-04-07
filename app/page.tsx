"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_ANSWER_MODE, isAnswerMode, type AnswerMode } from "@/lib/answer-modes";
import { DEFAULT_CHAT_MODEL_ID, getChatModelOption, isChatModelId, type ChatModelId } from "@/lib/chat-models";
import { Conversation, ConversationFile, Message } from "@/lib/types";
import { sanitizeAssistantOutput } from "@/lib/sanitize-assistant-output";
import {
  getSettings, saveSettings,
  getConversations, saveConversations,
  getActiveId, saveActiveId,
  createConversation, addMessage, updateLastAssistantMessage, deleteConversation,
  generateId,
} from "@/lib/storage";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import RoleSelector from "@/components/RoleSelector";

type FileMap = Record<string, ConversationFile[]>;
type UploadFlagMap = Record<string, boolean>;
type UploadStatusMap = Record<string, string | null>;

function hasProcessingFiles(files: ConversationFile[]): boolean {
  return files.some((file) => file.status === "processing");
}

function buildUploadStatus(files: ConversationFile[]): string | null {
  const processingCount = files.filter((file) => file.status === "processing").length;
  const failedCount = files.filter((file) => file.status === "failed").length;
  const readyCount = files.filter((file) => file.status === "ready").length;

  if (processingCount > 0) {
    return `文件已上传，后台正在解析 ${processingCount} 个文件...`;
  }

  if (failedCount > 0 && readyCount > 0) {
    return `${readyCount} 个文件可用，${failedCount} 个处理失败。`;
  }

  if (failedCount > 0) {
    return `${failedCount} 个文件处理失败，请重试。`;
  }

  return null;
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string>("选择岗位");
  const [selectedModelId, setSelectedModelId] = useState<ChatModelId>(DEFAULT_CHAT_MODEL_ID);
  const [selectedAnswerMode, setSelectedAnswerMode] = useState<AnswerMode>(DEFAULT_ANSWER_MODE);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [conversationFiles, setConversationFiles] = useState<FileMap>({});
  const [uploadingByConversation, setUploadingByConversation] = useState<UploadFlagMap>({});
  const [uploadStatusByConversation, setUploadStatusByConversation] = useState<UploadStatusMap>({});

  useEffect(() => {
    const settings = getSettings();
    const convos = getConversations();
    const savedActiveId = getActiveId();

    if (settings) {
      setRole(settings.role);
      setRoleName(settings.roleName);
      if (settings.chatModelId && isChatModelId(settings.chatModelId)) {
        setSelectedModelId(settings.chatModelId);
      }
      if (settings.answerMode && isAnswerMode(settings.answerMode)) {
        setSelectedAnswerMode(settings.answerMode);
      }
    } else {
      setShowRoleModal(true);
    }

    setConversations(convos);
    if (savedActiveId && convos.some((c) => c.id === savedActiveId)) {
      setActiveId(savedActiveId);
    } else if (convos.length > 0) {
      setActiveId(convos[0].id);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && role) {
      saveSettings({
        role,
        roleName,
        chatModelId: selectedModelId,
        answerMode: selectedAnswerMode,
      });
    }
  }, [mounted, role, roleName, selectedModelId, selectedAnswerMode]);

  useEffect(() => {
    if (mounted) saveConversations(conversations);
  }, [conversations, mounted]);

  useEffect(() => {
    if (mounted && activeId) saveActiveId(activeId);
  }, [activeId, mounted]);

  const activeConvo = conversations.find((c) => c.id === activeId) || null;
  const activeFiles = activeId ? conversationFiles[activeId] || [] : [];
  const isUploading = activeId ? Boolean(uploadingByConversation[activeId]) : false;
  const uploadStatus = activeId ? uploadStatusByConversation[activeId] || null : null;

  const fetchConversationFiles = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(`/api/files?conversationId=${encodeURIComponent(conversationId)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "无法读取资料列表");
      }
      const files = (data.files || []) as ConversationFile[];
      setConversationFiles((prev) => ({ ...prev, [conversationId]: files }));
      setUploadStatusByConversation((prev) => ({
        ...prev,
        [conversationId]: buildUploadStatus(files),
      }));
    } catch (error) {
      console.error("File list error:", error);
    }
  }, []);

  useEffect(() => {
    if (!mounted || !activeId) return;
    void fetchConversationFiles(activeId);
  }, [mounted, activeId, fetchConversationFiles]);

  useEffect(() => {
    if (!mounted) return;

    const processingConversationIds = Object.entries(conversationFiles)
      .filter(([, files]) => hasProcessingFiles(files))
      .map(([conversationId]) => conversationId);

    if (processingConversationIds.length === 0) return;

    const intervalId = window.setInterval(() => {
      processingConversationIds.forEach((conversationId) => {
        void fetchConversationFiles(conversationId);
      });
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [mounted, conversationFiles, fetchConversationFiles]);

  const ensureConversationContext = useCallback(() => {
    let nextActiveId = activeId;
    let nextConversations = conversations;

    if (!nextActiveId) {
      const convo = createConversation();
      nextConversations = [convo, ...nextConversations];
      nextActiveId = convo.id;
      setConversations(nextConversations);
      setActiveId(convo.id);
    }

    return {
      conversationId: nextActiveId!,
      conversationList: nextConversations,
    };
  }, [activeId, conversations]);

  const handleRoleSelect = (roleId: string, name: string) => {
    setRole(roleId);
    setRoleName(name);
    setShowRoleModal(false);
  };

  const handleNewConversation = () => {
    const convo = createConversation();
    setConversations((prev) => [convo, ...prev]);
    setActiveId(convo.id);
  };

  const handleSelectConversation = (id: string) => {
    setActiveId(id);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const updated = deleteConversation(prev, id);
      if (id === activeId) {
        setActiveId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });

    setConversationFiles((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setUploadingByConversation((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setUploadStatusByConversation((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    void fetch(`/api/files?conversationId=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch((error) => {
      console.error("Conversation cleanup error:", error);
    });
  };

  const handleUpload = useCallback(async (files: File[]) => {
    const { conversationId } = ensureConversationContext();

    setUploadingByConversation((prev) => ({ ...prev, [conversationId]: true }));
    setUploadStatusByConversation((prev) => ({
      ...prev,
      [conversationId]: `正在上传 ${files.length} 个文件...`,
    }));

    try {
      const formData = new FormData();
      formData.append("conversationId", conversationId);
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "上传失败");
      }

      const updatedFiles = (data.files || []) as ConversationFile[];
      setConversationFiles((prev) => ({ ...prev, [conversationId]: updatedFiles }));
      setUploadStatusByConversation((prev) => ({
        ...prev,
        [conversationId]: buildUploadStatus(updatedFiles),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "文件上传失败";
      setUploadStatusByConversation((prev) => ({ ...prev, [conversationId]: message }));
    } finally {
      setUploadingByConversation((prev) => ({ ...prev, [conversationId]: false }));
    }
  }, [ensureConversationContext]);

  const handleToggleFile = useCallback(async (fileId: string, nextActive: boolean) => {
    if (!activeId) return;

    try {
      const response = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          fileId,
          active: nextActive,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "更新文件状态失败");
      }

      setConversationFiles((prev) => ({ ...prev, [activeId]: data.files || [] }));
      setUploadStatusByConversation((prev) => ({
        ...prev,
        [activeId]: nextActive ? "文件已加入当前参考范围。" : "文件已移出当前参考范围。",
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新文件状态失败";
      setUploadStatusByConversation((prev) => ({ ...prev, [activeId]: message }));
    }
  }, [activeId]);

  const handleDeleteFile = useCallback(async (fileId: string) => {
    if (!activeId) return;

    try {
      const response = await fetch(
        `/api/files?conversationId=${encodeURIComponent(activeId)}&fileId=${encodeURIComponent(fileId)}`,
        { method: "DELETE" }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "删除文件失败");
      }

      const updatedFiles = (data.files || []) as ConversationFile[];
      setConversationFiles((prev) => ({ ...prev, [activeId]: updatedFiles }));
      setUploadStatusByConversation((prev) => ({
        ...prev,
        [activeId]: buildUploadStatus(updatedFiles) || "文件已删除。",
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除文件失败";
      setUploadStatusByConversation((prev) => ({ ...prev, [activeId]: message }));
    }
  }, [activeId]);

  const handleSend = useCallback(async (text: string) => {
    if (isStreaming) return;

    const { conversationId, conversationList } = ensureConversationContext();
    let currentConvos = conversationList;

    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    currentConvos = addMessage(currentConvos, conversationId, userMsg);

    const assistantMsg: Message = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      modelId: selectedModelId,
    };
    currentConvos = addMessage(currentConvos, conversationId, assistantMsg);
    setConversations(currentConvos);
    setIsStreaming(true);

    try {
      const convo = currentConvos.find((c) => c.id === conversationId);
      const history = (convo?.messages || [])
        .filter((m) => m.content)
        .slice(0, -1)
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: m.content,
          questionDiagnosis: m.questionDiagnosis,
        }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: text,
          role: role || "new",
          history,
          modelId: selectedModelId,
          answerMode: selectedAnswerMode,
        }),
      });

      if (!response.ok) throw new Error("API error");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.questionDiagnosis) {
                  setConversations((prev) =>
                    updateLastAssistantMessage(prev, conversationId, {
                      questionDiagnosis: parsed.questionDiagnosis,
                      modelId: parsed.questionDiagnosis.mode === "answer" ? selectedModelId : undefined,
                    })
                  );
                }
                if (Array.isArray(parsed.kbHits)) {
                  setConversations((prev) =>
                    updateLastAssistantMessage(prev, conversationId, {
                      kbHits: parsed.kbHits,
                    })
                  );
                }
                if (parsed.content) {
                  accumulated += parsed.content;
                  const sanitized = sanitizeAssistantOutput(accumulated);
                  setConversations((prev) =>
                    updateLastAssistantMessage(prev, conversationId, {
                      content: sanitized,
                    })
                  );
                }
              } catch {
                // Skip incomplete JSON chunks.
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setConversations((prev) =>
        updateLastAssistantMessage(
          prev,
          conversationId,
          { content: "抱歉，请求出现问题，请稍后再试。" }
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [ensureConversationContext, isStreaming, role, selectedModelId, selectedAnswerMode]);

  if (!mounted) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: "var(--color-amber)", color: "#fff" }}>K</div>
          <span className="text-sm" style={{ color: "var(--color-ink-muted)" }}>加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        currentModelLabel={getChatModelOption(selectedModelId).shortLabel}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
      />
      <ChatArea
        messages={activeConvo?.messages || []}
        files={activeFiles}
        isStreaming={isStreaming}
        onSend={handleSend}
        onUpload={handleUpload}
        onToggleFile={handleToggleFile}
        onDeleteFile={handleDeleteFile}
        selectedModelId={selectedModelId}
        onModelChange={setSelectedModelId}
        selectedAnswerMode={selectedAnswerMode}
        onAnswerModeChange={setSelectedAnswerMode}
        roleName={roleName}
        onRoleClick={() => setShowRoleModal(true)}
        isUploading={isUploading}
        uploadStatus={uploadStatus}
      />
      {showRoleModal && (
        <RoleSelector onSelect={handleRoleSelect} />
      )}
    </div>
  );
}
