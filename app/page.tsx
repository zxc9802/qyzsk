"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_ANSWER_MODE, isAnswerMode, type AnswerMode } from "@/lib/answer-modes";
import type { ChatStatePayload } from "@/lib/chat-state";
import { DEFAULT_CHAT_MODEL_ID, isChatModelId, type ChatModelId } from "@/lib/chat-models";
import { DEFAULT_KNOWLEDGE_MODE } from "@/lib/knowledge-mode";
import { DEFAULT_THEME_MODE, isThemeMode, type ThemeMode } from "@/lib/theme";
import { Conversation, ConversationFile, Message } from "@/lib/types";
import { ConversationReport } from "@/lib/report";
import { sanitizeAssistantOutput } from "@/lib/sanitize-assistant-output";
import { extractApiErrorMessage, readJsonSafely, redirectToMainAppIfNeeded } from "@/lib/client/api-response";
import {
  createConversation, addMessage, updateLastAssistantMessage, deleteConversation,
  generateId,
} from "@/lib/storage";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import RoleSelector from "@/components/RoleSelector";
import ReportPreviewModal from "@/components/ReportPreviewModal";

type FileMap = Record<string, ConversationFile[]>;
type UploadFlagMap = Record<string, boolean>;
type UploadStatusMap = Record<string, string | null>;
type StateResponsePayload = {
  success?: boolean;
  data?: ChatStatePayload;
  error?: string;
  message?: string;
  redirectUrl?: string;
};

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
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [stateReady, setStateReady] = useState(false);
  const [conversationFiles, setConversationFiles] = useState<FileMap>({});
  const [uploadingByConversation, setUploadingByConversation] = useState<UploadFlagMap>({});
  const [uploadStatusByConversation, setUploadStatusByConversation] = useState<UploadStatusMap>({});
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<ConversationReport | null>(null);

  const persistState = useCallback(async (payload: ChatStatePayload) => {
    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          clientUpdatedAt: Date.now(),
        }),
      });

      const data = await readJsonSafely<StateResponsePayload>(response);
      if (redirectToMainAppIfNeeded(response, data)) {
        return;
      }

      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data, "保存聊天状态失败"));
      }
    } catch (error) {
      console.error("State save error:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapState() {
      try {
        const response = await fetch("/api/state", {
          method: "GET",
          cache: "no-store",
        });
        const data = await readJsonSafely<StateResponsePayload>(response);

        if (redirectToMainAppIfNeeded(response, data)) {
          return;
        }

        if (!response.ok) {
          throw new Error(extractApiErrorMessage(data, "无法读取聊天状态"));
        }

        if (cancelled) return;

        const state = data?.data;
        const settings = state?.settings || null;
        const loadedConversations = state?.conversations || [];
        const loadedActiveId = state?.activeId && loadedConversations.some((conversation) => conversation.id === state.activeId)
          ? state.activeId
          : loadedConversations[0]?.id ?? null;

        setConversations(loadedConversations);
        setActiveId(loadedActiveId);
        setConversationFiles({});
        setUploadingByConversation({});
        setUploadStatusByConversation({});
        setStateReady(true);

        if (settings) {
          setRole(settings.role);
          setRoleName(settings.roleName);
          if (settings.chatModelId && isChatModelId(settings.chatModelId)) {
            setSelectedModelId(settings.chatModelId);
          }
          if (settings.answerMode && isAnswerMode(settings.answerMode)) {
            setSelectedAnswerMode(settings.answerMode);
          }
          if (settings.themeMode && isThemeMode(settings.themeMode)) {
            setThemeMode(settings.themeMode);
          }
          setShowRoleModal(false);
        } else {
          setRole(null);
          setRoleName("选择岗位");
          setSelectedModelId(DEFAULT_CHAT_MODEL_ID);
          setSelectedAnswerMode(DEFAULT_ANSWER_MODE);
          setThemeMode(DEFAULT_THEME_MODE);
          setShowRoleModal(true);
        }
      } catch (error) {
        console.error("State bootstrap error:", error);
        if (!cancelled) {
          setShowRoleModal(true);
        }
      } finally {
        if (!cancelled) {
          setMounted(true);
        }
      }
    }

    void bootstrapState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mounted || !stateReady) return;
    document.documentElement.dataset.theme = themeMode;
  }, [mounted, stateReady, themeMode]);

  useEffect(() => {
    if (!mounted || !stateReady) return;

    const timeoutId = window.setTimeout(() => {
      const persistedActiveId = activeId && conversations.some((conversation) => conversation.id === activeId)
        ? activeId
        : conversations[0]?.id ?? null;

      void persistState({
        conversations,
        activeId: persistedActiveId,
        settings: role
          ? {
              role,
              roleName,
              chatModelId: selectedModelId,
              answerMode: selectedAnswerMode,
              knowledgeMode: DEFAULT_KNOWLEDGE_MODE,
              themeMode,
            }
          : null,
      });
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeId,
    conversations,
    mounted,
    persistState,
    role,
    roleName,
    selectedAnswerMode,
    selectedModelId,
    stateReady,
    themeMode,
  ]);

  const activeConvo = conversations.find((c) => c.id === activeId) || null;
  const activeFiles = activeId ? conversationFiles[activeId] || [] : [];
  const isUploading = activeId ? Boolean(uploadingByConversation[activeId]) : false;
  const uploadStatus = activeId ? uploadStatusByConversation[activeId] || null : null;

  useEffect(() => {
    setActiveReport(null);
    setReportError(null);
    setIsReportModalOpen(false);
  }, [activeId]);

  const fetchConversationFiles = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(`/api/files?conversationId=${encodeURIComponent(conversationId)}`);
      const data = await readJsonSafely<{ files?: ConversationFile[]; error?: string; message?: string; redirectUrl?: string }>(response);
      if (redirectToMainAppIfNeeded(response, data)) {
        return;
      }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data, "无法读取资料列表"));
      }
      const files = (data?.files || []) as ConversationFile[];
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

      const data = await readJsonSafely<{ files?: ConversationFile[]; error?: string; message?: string; redirectUrl?: string }>(response);
      if (redirectToMainAppIfNeeded(response, data)) {
        return;
      }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data, "上传失败"));
      }

      const updatedFiles = (data?.files || []) as ConversationFile[];
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

      const data = await readJsonSafely<{ files?: ConversationFile[]; error?: string; message?: string; redirectUrl?: string }>(response);
      if (redirectToMainAppIfNeeded(response, data)) {
        return;
      }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data, "更新文件状态失败"));
      }

      setConversationFiles((prev) => ({ ...prev, [activeId]: data?.files || [] }));
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

      const data = await readJsonSafely<{ files?: ConversationFile[]; error?: string; message?: string; redirectUrl?: string }>(response);
      if (redirectToMainAppIfNeeded(response, data)) {
        return;
      }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data, "删除文件失败"));
      }

      const updatedFiles = (data?.files || []) as ConversationFile[];
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
          knowledgeMode: DEFAULT_KNOWLEDGE_MODE,
        }),
      });

      if (!response.ok) {
        const errorPayload = await readJsonSafely(response);
        if (redirectToMainAppIfNeeded(response, errorPayload)) {
          return;
        }
        throw new Error(extractApiErrorMessage(errorPayload, "请求失败"));
      }

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
                if (Array.isArray(parsed.sourceHits)) {
                  setConversations((prev) =>
                    updateLastAssistantMessage(prev, conversationId, {
                      sourceHits: parsed.sourceHits,
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

  const handleGenerateReport = useCallback(async () => {
    if (!activeConvo || isGeneratingReport || isStreaming) return;

    setIsReportModalOpen(true);
    setIsGeneratingReport(true);
    setReportError(null);

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvo.id,
          conversationTitle: activeConvo.title,
          messages: activeConvo.messages,
          roleId: role || "new",
          roleName,
          modelId: selectedModelId,
          answerMode: selectedAnswerMode,
        }),
      });

      const data = await readJsonSafely<{ report?: ConversationReport; error?: string; message?: string; redirectUrl?: string }>(response);
      if (redirectToMainAppIfNeeded(response, data)) {
        return;
      }
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(data, "生成报告失败"));
      }

      setActiveReport(data?.report as ConversationReport);
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成报告失败，请稍后再试。";
      setReportError(message);
    } finally {
      setIsGeneratingReport(false);
    }
  }, [activeConvo, isGeneratingReport, isStreaming, role, roleName, selectedModelId, selectedAnswerMode]);

  if (!mounted) {
    return (
      <div className="relative h-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(214,161,99,0.16), transparent 28%), radial-gradient(circle at bottom right, rgba(59,94,142,0.24), transparent 34%)",
          }}
        />
        <div className="relative flex h-full items-center justify-center px-4">
          <div className="panel-surface flex items-center gap-4 rounded-[26px] px-6 py-5">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-[16px] text-base font-semibold"
              style={{
                background: "var(--brand-badge)",
                color: "var(--brand-badge-text)",
              }}
            >
              K
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                Initializing Workspace
              </div>
              <span className="mt-1 block text-sm" style={{ color: "var(--color-ink-soft)" }}>
                正在调度知识库与会话上下文...
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-16%] h-[28rem] w-[28rem] rounded-full blur-3xl" style={{ background: "var(--shell-orb-a)" }} />
        <div className="absolute right-[-8%] top-[8%] h-[34rem] w-[34rem] rounded-full blur-3xl" style={{ background: "var(--shell-orb-b)" }} />
        <div className="absolute bottom-[-18%] left-[28%] h-[30rem] w-[30rem] rounded-full blur-3xl" style={{ background: "var(--shell-orb-c)" }} />
      </div>

      <div className="relative h-full p-3 md:p-4">
        <div
          className="panel-surface flex h-full overflow-hidden rounded-[34px]"
          style={{
            background: "var(--shell-surface)",
            backdropFilter: "blur(22px)",
          }}
        >
          <Sidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelectConversation}
            onNew={handleNewConversation}
            onDelete={handleDeleteConversation}
          />
          <ChatArea
            messages={activeConvo?.messages || []}
            files={activeFiles}
            isStreaming={isStreaming}
            isGeneratingReport={isGeneratingReport}
            canGenerateReport={Boolean(activeConvo && activeConvo.messages.length > 0)}
            onSend={handleSend}
            onUpload={handleUpload}
            onToggleFile={handleToggleFile}
            onDeleteFile={handleDeleteFile}
            onGenerateReport={handleGenerateReport}
            selectedModelId={selectedModelId}
            onModelChange={setSelectedModelId}
            selectedAnswerMode={selectedAnswerMode}
            onAnswerModeChange={setSelectedAnswerMode}
            themeMode={themeMode}
            onThemeToggle={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
            roleName={roleName}
            onRoleClick={() => setShowRoleModal(true)}
            isUploading={isUploading}
            uploadStatus={uploadStatus}
          />
        </div>
      </div>
      {showRoleModal && <RoleSelector onSelect={handleRoleSelect} />}
      <ReportPreviewModal
        open={isReportModalOpen}
        report={activeReport}
        loading={isGeneratingReport}
        error={reportError}
        onClose={() => setIsReportModalOpen(false)}
        onRetry={handleGenerateReport}
      />
    </div>
  );
}
