"use client";

import { Conversation } from "@/lib/types";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  currentModelLabel: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export default function Sidebar({
  conversations,
  activeId,
  currentModelLabel,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className="flex flex-col h-full w-[280px] shrink-0"
      style={{ background: "var(--color-sidebar)" }}>

      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold"
            style={{ background: "var(--color-amber)", color: "#fff" }}>
            K
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
              内部业务助手
            </div>
            <div className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>
              Knowledge Base
            </div>
          </div>
        </div>
      </div>

      {/* New Chat Button */}
      <div className="px-4 pb-4">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer"
          style={{
            border: "1px dashed rgba(200, 205, 212, 0.3)",
            color: "var(--color-sidebar-text)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-sidebar-hover)";
            e.currentTarget.style.borderColor = "var(--color-amber)";
            e.currentTarget.style.color = "var(--color-sidebar-text-bright)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "rgba(200, 205, 212, 0.3)";
            e.currentTarget.style.color = "var(--color-sidebar-text)";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
          新对话
        </button>
      </div>

      {/* Divider */}
      <div className="mx-4 mb-2" style={{ borderTop: "1px solid rgba(200, 205, 212, 0.1)" }} />

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto sidebar-scroll px-3 pb-3">
        {sorted.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>
              还没有对话记录
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {sorted.map((convo) => {
              const isActive = convo.id === activeId;
              return (
                <div
                  key={convo.id}
                  className="group flex items-center rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-150"
                  style={{
                    background: isActive ? "var(--color-sidebar-active)" : "transparent",
                  }}
                  onClick={() => onSelect(convo.id)}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--color-sidebar-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{
                      color: isActive ? "var(--color-sidebar-text-bright)" : "var(--color-sidebar-text)",
                      fontWeight: isActive ? 500 : 400,
                    }}>
                      {convo.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(200, 205, 212, 0.5)" }}>
                      {convo.messages.length} 条消息
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(convo.id); }}
                    className="opacity-0 group-hover:opacity-100 shrink-0 ml-2 p-1 rounded transition-opacity cursor-pointer"
                    style={{ color: "var(--color-sidebar-text)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-sidebar-text)"; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="3" y1="3" x2="11" y2="11" />
                      <line x1="11" y1="3" x2="3" y2="11" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(200, 205, 212, 0.1)" }}>
        <div className="flex items-center gap-2 px-2">
          <div className="w-2 h-2 rounded-full" style={{ background: "#4ade80" }} />
          <span className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>
            {currentModelLabel} · 在线
          </span>
        </div>
      </div>
    </aside>
  );
}
