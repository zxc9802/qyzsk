"use client";

import Link from "next/link";
import { Conversation } from "@/lib/types";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside
      className="relative flex h-full w-[308px] shrink-0 flex-col overflow-hidden border-r"
      style={{
        background: "var(--surface-sidebar)",
        borderColor: "var(--surface-outline)",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-12%] top-[-8%] h-52 w-52 rounded-full blur-3xl" style={{ background: "var(--sidebar-orb-a)" }} />
        <div className="absolute bottom-[-12%] right-[-6%] h-64 w-64 rounded-full blur-3xl" style={{ background: "var(--sidebar-orb-b)" }} />
      </div>

      <div className="relative px-6 pt-5 pb-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] text-lg font-semibold"
            style={{
              background: "var(--brand-badge)",
              color: "var(--brand-badge-text)",
              boxShadow: "var(--brand-badge-shadow)",
            }}
          >
            K
          </div>
          <div className="min-w-0">
            <div className="display-face text-[1.6rem] font-semibold leading-none" style={{ color: "var(--color-sidebar-text-bright)" }}>
              内部业务助手
            </div>
          </div>
        </div>
      </div>

      <div className="relative px-4 pb-5">
        <button
          onClick={onNew}
          className="group w-full overflow-hidden rounded-[22px] border px-4 py-4 text-left transition-all duration-200 cursor-pointer"
            style={{
              background: "var(--file-row-active)",
              borderColor: "var(--surface-outline-accent-strong)",
              boxShadow: "inset 0 1px 0 var(--surface-outline)",
            }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.26em]" style={{ color: "var(--color-amber-soft)" }}>
                New Dossier
              </div>
              <div className="mt-1 text-sm font-medium" style={{ color: "var(--color-sidebar-text-bright)" }}>
                发起新对话
              </div>
            </div>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full border transition-transform duration-200 group-hover:scale-105"
              style={{
                borderColor: "var(--surface-outline-accent-strong)",
                background: "var(--subtle-surface)",
                color: "var(--color-amber-deep)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="8" y1="3" x2="8" y2="13" />
                <line x1="3" y1="8" x2="13" y2="8" />
              </svg>
            </div>
          </div>
        </button>
      </div>

      <div className="relative px-5 pb-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.26em]" style={{ color: "var(--color-sidebar-text)" }}>
            会话档案
          </span>
          <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
            {sorted.length}
          </span>
        </div>
      </div>

      <div className="sidebar-scroll relative flex-1 overflow-y-auto px-3 pb-4">
        {sorted.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm" style={{ color: "var(--color-sidebar-text)" }}>
            暂时还没有会话，先新建一个任务简报。
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((convo) => {
              const isActive = convo.id === activeId;
              return (
                <div
                  key={convo.id}
                  className="group relative overflow-hidden rounded-[22px] border px-4 py-3.5 transition-all duration-200 cursor-pointer"
                  style={{
                    background: isActive
                      ? "var(--file-row-active)"
                      : "var(--file-row-surface)",
                    borderColor: isActive ? "var(--surface-outline-accent-strong)" : "var(--surface-outline)",
                    boxShadow: isActive ? "var(--card-shadow)" : "none",
                  }}
                  onClick={() => onSelect(convo.id)}
                >
                  <div
                    className="pointer-events-none absolute inset-y-4 left-0 w-px"
                    style={{
                      background: isActive
                        ? "linear-gradient(180deg, transparent, rgba(214, 161, 99, 0.95), transparent)"
                        : "transparent",
                    }}
                  />
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm leading-6"
                        style={{
                          color: isActive ? "var(--color-sidebar-text-bright)" : "var(--color-sidebar-text)",
                          fontWeight: isActive ? 500 : 400,
                        }}
                      >
                        {convo.title}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: isActive ? "var(--color-amber)" : "var(--color-ink-muted)" }} />
                        <span>{convo.messages.length} 条消息</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(convo.id);
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border opacity-0 transition-all duration-200 group-hover:opacity-100 cursor-pointer"
                      style={{
                        borderColor: "var(--surface-outline-strong)",
                        color: "var(--color-sidebar-text)",
                        background: "var(--subtle-surface)",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2.5 2.5L9.5 9.5" />
                        <path d="M9.5 2.5L2.5 9.5" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative border-t px-4 py-4" style={{ borderColor: "var(--surface-outline)" }}>
        <Link
          href="/admin"
          className="block rounded-[18px] border px-4 py-3 text-sm transition-all duration-150"
          style={{
            borderColor: "var(--surface-outline-strong)",
            background: "var(--subtle-surface)",
            color: "var(--color-sidebar-text-bright)",
          }}
        >
          打开知识审核台
        </Link>
      </div>

    </aside>
  );
}
