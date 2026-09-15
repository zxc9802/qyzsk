export default function ShareNotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center" style={{ color: "var(--color-sidebar-text-bright)" }}>
      <h1 className="text-2xl font-semibold">分享链接无效或已失效</h1>
      <p style={{ color: "var(--color-ink-muted)" }}>请检查链接是否完整，或联系分享者重新生成。</p>
    </main>
  );
}
