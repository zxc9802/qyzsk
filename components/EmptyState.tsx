"use client";

import { EXAMPLE_QUESTIONS } from "@/lib/types";

interface EmptyStateProps {
  onQuestionClick: (question: string) => void;
}

const CAPABILITY_NOTES = [
  "基于内部知识库、方法论和当前会话资料回答。",
  "支持先诊断问题，再拆成可执行动作。",
  "适合产品判断、内容策略、运营诊断和复盘落地。",
];

export default function EmptyState({ onQuestionClick }: EmptyStateProps) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(300px,0.72fr)]">
          <section className="panel-surface rounded-[34px] px-7 py-8 md:px-10 md:py-10 animate-fade-up">
            <div className="editorial-kicker mb-5">Editorial Command Deck</div>
            <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div
                  className="mb-5 inline-flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-[24px] border"
                  style={{
                    background: "var(--pill-surface)",
                    borderColor: "var(--surface-outline-accent)",
                    boxShadow: "var(--brand-badge-shadow)",
                  }}
                >
                  <span className="text-3xl">✦</span>
                </div>
                <h1 className="display-face text-[2.55rem] font-semibold leading-[1.08] md:text-[3.35rem]" style={{ color: "var(--color-sidebar-text-bright)" }}>
                  把模糊问题，
                  <br />
                  改写成可执行判断。
                </h1>
                <p className="mt-5 max-w-2xl text-[15px] leading-8" style={{ color: "var(--color-ink-soft)" }}>
                  这里不是一个普通聊天框。我们把业务问题、文档资料、方法论和行动建议收进同一个工作台里，让回答更像策略讨论，而不是泛泛建议。
                </p>
              </div>

              <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-[25rem] lg:grid-cols-1">
                {[
                  ["Knowledge-backed", "知识库驱动"],
                  ["File-aware", "支持资料与多模态参考"],
                  ["Action-first", "先结论，再下一步"],
                ].map(([title, desc]) => (
                  <div
                    key={title}
                    className="rounded-[22px] border px-4 py-4"
                    style={{
                      background: "var(--muted-surface)",
                      borderColor: "var(--surface-outline)",
                    }}
                  >
                    <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: "var(--color-amber-soft)" }}>
                      {title}
                    </div>
                    <div className="mt-2 text-sm" style={{ color: "var(--color-sidebar-text-bright)" }}>
                      {desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="soft-panel rounded-[30px] px-6 py-7 animate-fade-up" style={{ animationDelay: "0.06s", opacity: 0 }}>
            <div className="editorial-kicker mb-5">Desk Notes</div>
            <h2 className="display-face text-2xl font-semibold" style={{ color: "var(--color-sidebar-text-bright)" }}>
              这张工作台适合什么问题
            </h2>
            <div className="mt-5 space-y-3">
              {CAPABILITY_NOTES.map((note, index) => (
                <div
                  key={note}
                  className="rounded-[18px] border px-4 py-3"
                  style={{
                    background: "var(--muted-surface)",
                    borderColor: "var(--surface-outline)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                      style={{
                        background: "var(--chip-soft)",
                        color: "var(--color-amber-deep)",
                      }}
                    >
                      {index + 1}
                    </span>
                    <p className="text-[13px] leading-6" style={{ color: "var(--color-ink-soft)" }}>
                      {note}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <section className="mt-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="editorial-kicker">Suggested Prompts</div>
            <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
              可以直接拿这些问题开一轮策略讨论
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {EXAMPLE_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => onQuestionClick(q.question)}
                className="group animate-fade-up text-left rounded-[26px] border px-5 py-5 transition-all duration-200 cursor-pointer"
                style={{
                  animationDelay: `${i * 0.06}s`,
                  opacity: 0,
                  background: "var(--surface-card)",
                  borderColor: "var(--surface-outline)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="text-2xl">{q.icon}</span>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em]"
                    style={{
                      borderColor: "var(--surface-outline-accent)",
                      color: "var(--color-amber-soft)",
                      background: "var(--chip-soft)",
                    }}
                  >
                    Try
                  </span>
                </div>
                <div className="text-lg font-medium leading-7 transition-colors duration-200 group-hover:text-[var(--color-amber-deep)]" style={{ color: "var(--color-sidebar-text-bright)" }}>
                  {q.title}
                </div>
                <p className="mt-3 text-sm leading-7" style={{ color: "var(--color-ink-soft)" }}>
                  {q.desc}
                </p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
