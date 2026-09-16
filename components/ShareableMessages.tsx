"use client";

import { useState } from "react";
import type { Message } from "@/lib/types";
import MessageBubble from "./MessageBubble";

export default function ShareableMessages({ conversationId, messages, isStreaming, firstClarificationMessageId, onBeforeShare }: {
  conversationId: string;
  messages: Message[];
  isStreaming: boolean;
  firstClarificationMessageId?: string;
  onBeforeShare: () => Promise<boolean>;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [feedback, setFeedback] = useState("");
  const selectableMessages = messages.filter((message) => message.content.trim());
  const selectedIds = selectableMessages.filter((message) => selected.has(message.id)).map((message) => message.id);
  const buttonClass = "rounded-full border px-4 py-2 text-sm cursor-pointer disabled:cursor-default disabled:opacity-50";
  const buttonStyle = { borderColor: "var(--surface-outline-strong)", background: "var(--subtle-surface)", color: "var(--color-sidebar-text-bright)" };

  async function generateLink() {
    if (busy || isStreaming || !selectedIds.length) return;
    setBusy(true);
    setFeedback("");
    setShareUrl("");
    try {
      if (!await onBeforeShare()) throw new Error("聊天记录尚未保存成功，请稍后重试。");
      const response = await fetch("/api/shares", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, messageIds: selectedIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成链接失败，请重试。");
      if (!/^\/share\/[A-Za-z0-9_-]{43}$/.test(data.path)) throw new Error("分享链接格式无效，请重试。");
      setShareUrl(new URL(data.path, window.location.origin).href);
      setFeedback("分享链接已生成，可复制发送给其他人。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "生成链接失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setFeedback("链接已复制。");
    } catch {
      setFeedback("自动复制失败，请选中链接手动复制。");
    }
  }

  function changeSelection(next: Set<string>) {
    setSelected(next);
    setShareUrl("");
    setFeedback("");
  }

  return (
    <>
      <section className="mb-5 rounded-2xl border p-3 sm:p-4" aria-label="聊天记录分享" style={{ borderColor: "var(--surface-outline)", background: "var(--surface-card)" }}>
        <div className="flex flex-wrap items-center gap-2">
          {selecting ? (
            <>
              <span className="mr-auto text-sm" style={{ color: "var(--color-ink-soft)" }}>已选 {selectedIds.length} 条消息</span>
              <button type="button" className={buttonClass} style={buttonStyle} disabled={busy || isStreaming} onClick={() => changeSelection(selectedIds.length === selectableMessages.length ? new Set() : new Set(selectableMessages.map((message) => message.id)))}>
                {selectedIds.length === selectableMessages.length ? "取消全选" : "全选"}
              </button>
              <button type="button" className={buttonClass} style={buttonStyle} disabled={busy} onClick={() => { setSelecting(false); changeSelection(new Set()); }}>取消</button>
              <button type="button" className={`${buttonClass} metal-pill`} disabled={busy || isStreaming || !selectedIds.length || selectedIds.length > 200} onClick={() => void generateLink()}>{busy ? "正在生成…" : "生成分享链接"}</button>
            </>
          ) : (
            <button type="button" className={buttonClass} style={buttonStyle} disabled={isStreaming || !selectableMessages.length} onClick={() => { setSelecting(true); changeSelection(new Set()); }}>分享聊天记录</button>
          )}
        </div>
        {selecting && <p className="mt-3 text-xs leading-6" style={{ color: "var(--color-ink-muted)" }}>勾选要分享的消息（最多 200 条）。获得链接的人无需登录即可查看所选文字和图片、视频。内部引用详情不会公开。</p>}
        {shareUrl && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input aria-label="分享链接" readOnly value={shareUrl} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" style={buttonStyle} />
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => void copyLink()}>复制链接</button>
            <a className={buttonClass} style={buttonStyle} href={shareUrl} target="_blank" rel="noreferrer">打开分享页</a>
          </div>
        )}
        {feedback && <p role="status" className="mt-2 break-words text-sm" style={{ color: "var(--color-ink-soft)" }}>{feedback}</p>}
      </section>
      {messages.map((message, index) => (
        <div key={message.id} className={selecting ? "flex items-start gap-2 sm:gap-3" : ""}>
          {selecting && <input type="checkbox" aria-label={`选择第 ${index + 1} 条${message.role === "user" ? "用户" : "助手"}消息`} checked={selected.has(message.id)} disabled={busy || isStreaming || !message.content.trim()} onChange={(event) => {
            const next = new Set(selected);
            if (event.target.checked) next.add(message.id); else next.delete(message.id);
            changeSelection(next);
          }} className="mt-5 h-5 w-5 shrink-0 cursor-pointer accent-amber-600" />}
          <div className="min-w-0 flex-1">
            <MessageBubble message={message} isStreaming={isStreaming && index === messages.length - 1 && message.role === "assistant"} showQuestionDiagnosis={message.id === firstClarificationMessageId} />
          </div>
        </div>
      ))}
    </>
  );
}
