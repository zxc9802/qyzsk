"use client";

import { ROLES } from "@/lib/types";

interface RoleSelectorProps {
  onSelect: (roleId: string, roleName: string) => void;
}

const GUIDING_POINTS = [
  "不同岗位会影响回答视角、示例和知识命中偏置。",
  "后面还可以随时切换，不会锁死当前会话。",
  "先选一个最接近你的身份，我们再在对话里继续细化。",
];

export default function RoleSelector({ onSelect }: RoleSelectorProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto px-3 py-3 animate-backdrop md:px-4 md:py-4">
      <div className="absolute inset-0 backdrop-blur-xl" style={{ background: "var(--role-overlay)" }} />
      <div className="relative flex min-h-full items-start justify-center lg:items-center">
        <div className="animate-modal panel-surface relative my-auto w-full max-w-5xl overflow-hidden rounded-[34px] max-h-[calc(100dvh-1.5rem)]">
          <div className="grid min-h-0 lg:grid-cols-[0.88fr_1.12fr]">
            <div
              className="relative min-h-0 overflow-y-auto border-b px-6 py-6 md:px-8 md:py-7 lg:border-b-0 lg:border-r"
              style={{ borderColor: "var(--surface-outline)" }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(circle at top left, rgba(214,161,99,0.14), transparent 45%)" }}
              />
              <div className="relative">
                <div className="editorial-kicker mb-5">Desk Setup</div>
                <div
                  className="mb-5 inline-flex h-[4rem] w-[4rem] items-center justify-center rounded-[22px] border text-[2.15rem]"
                  style={{
                    borderColor: "var(--surface-outline-accent)",
                    background: "var(--pill-surface)",
                    boxShadow: "var(--brand-badge-shadow)",
                  }}
                >
                  ⌘
                </div>
                <h2 className="display-face text-[2.15rem] font-semibold leading-[1.02] md:text-[2.35rem]" style={{ color: "var(--color-sidebar-text-bright)" }}>
                  先定义你的席位，
                  <br />
                  再开始工作。
                </h2>
                <p className="mt-4 max-w-md text-[14px] leading-7 md:text-[15px]" style={{ color: "var(--color-ink-soft)" }}>
                  这个选择不是装饰。它会影响系统优先引用哪类知识、怎样举例、以及回答更偏方法论、执行还是管理视角。
                </p>

                <div className="mt-6 space-y-2.5">
                  {GUIDING_POINTS.map((point, index) => (
                    <div
                      key={point}
                      className="rounded-[18px] border px-4 py-2.5"
                      style={{
                        background: "var(--muted-surface)",
                        borderColor: "var(--surface-outline)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                          style={{
                            background: "var(--chip-soft)",
                            color: "var(--color-amber-deep)",
                          }}
                        >
                          {index + 1}
                        </span>
                        <p className="text-[12px] leading-6 md:text-[13px]" style={{ color: "var(--color-ink-soft)" }}>
                          {point}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-5 py-5 md:px-7 md:py-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                    Role Profile
                  </div>
                  <div className="mt-2 text-sm" style={{ color: "var(--color-ink-soft)" }}>
                    选一个你最常提问时的身份，我们就按这个视角组织回答。
                  </div>
                </div>
              </div>
              <div className="grid gap-2.5 md:grid-cols-2">
                {ROLES.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => onSelect(role.id, role.name)}
                    className="group min-h-[9.75rem] text-left rounded-[22px] border px-4 py-4 transition-all duration-200 cursor-pointer md:min-h-[10rem]"
                    style={{
                      background: "var(--surface-card-alt)",
                      borderColor: "var(--surface-outline)",
                      boxShadow: "var(--card-shadow)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-[16px] border text-[1.7rem] transition-transform duration-200 group-hover:-translate-y-0.5"
                        style={{
                          borderColor: "var(--surface-outline-accent)",
                          background: "var(--chip-soft)",
                        }}
                      >
                        {role.icon}
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.22em]" style={{ color: "var(--color-amber-soft)" }}>
                        Select
                      </span>
                    </div>
                    <div className="mt-3 text-[1.6rem] font-medium leading-none" style={{ color: "var(--color-sidebar-text-bright)" }}>
                      {role.name}
                    </div>
                    <div className="mt-2 text-[13px] leading-6 md:text-sm" style={{ color: "var(--color-ink-soft)" }}>
                      {role.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
