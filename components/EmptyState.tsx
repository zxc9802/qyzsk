"use client";

import { EXAMPLE_QUESTIONS } from "@/lib/types";

interface EmptyStateProps {
  onQuestionClick: (question: string) => void;
}

export default function EmptyState({ onQuestionClick }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
      {/* Welcome */}
      <div className="text-center mb-10 animate-fade-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 shadow-sm"
          style={{ background: "linear-gradient(135deg, var(--color-amber-glow), var(--color-surface-raised))", border: "1px solid var(--color-border-light)" }}>
          <span className="text-3xl">💡</span>
        </div>
        <h1 className="text-2xl font-semibold mb-2" style={{ color: "var(--color-ink)" }}>
          你好，我是公司业务助手
        </h1>
        <p className="text-sm max-w-md mx-auto leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          有问题直接问，我会引导你问得更准、想得更全。<br />
          回答基于公司内部方法论和知识库。
        </p>
      </div>

      {/* Example Cards */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-4xl">
        {EXAMPLE_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => onQuestionClick(q.question)}
            className="animate-fade-up text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer hover:scale-[1.02]"
            style={{
              animationDelay: `${i * 0.06}s`,
              opacity: 0,
              background: "var(--color-surface-raised)",
              borderColor: "var(--color-border-light)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-amber-soft)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(212, 148, 76, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-light)";
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
            }}
          >
            <span className="text-lg block mb-2">{q.icon}</span>
            <span className="text-sm font-semibold block mb-1" style={{ color: "var(--color-ink)" }}>
              {q.title}
            </span>
            <span className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              {q.desc}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
