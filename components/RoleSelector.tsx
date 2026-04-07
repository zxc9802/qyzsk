"use client";

import { ROLES } from "@/lib/types";

interface RoleSelectorProps {
  onSelect: (roleId: string, roleName: string) => void;
}

export default function RoleSelector({ onSelect }: RoleSelectorProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop"
      style={{ background: "rgba(26, 35, 50, 0.7)", backdropFilter: "blur(8px)" }}>
      <div className="animate-modal w-full max-w-lg mx-4 rounded-2xl p-8"
        style={{ background: "var(--color-surface-raised)", boxShadow: "0 25px 60px rgba(0,0,0,0.15)" }}>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4"
            style={{ background: "var(--color-amber-glow)" }}>
            <span className="text-2xl">👋</span>
          </div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--color-ink)" }}>
            欢迎使用内部业务助手
          </h2>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            选择你的岗位，我会调整回答的侧重点
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => onSelect(role.id, role.name)}
              className="group relative text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:scale-[1.02]"
              style={{
                borderColor: "var(--color-border-light)",
                background: "var(--color-surface)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-amber)";
                e.currentTarget.style.background = "var(--color-amber-glow)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-light)";
                e.currentTarget.style.background = "var(--color-surface)";
              }}
            >
              <span className="text-xl block mb-1">{role.icon}</span>
              <span className="text-sm font-semibold block" style={{ color: "var(--color-ink)" }}>
                {role.name}
              </span>
              <span className="text-xs block mt-0.5" style={{ color: "var(--color-ink-muted)" }}>
                {role.desc}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
