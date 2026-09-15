import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MessageBubble from "@/components/MessageBubble";
import { getChatShare } from "@/lib/server/chat-share-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "聊天分享 · 起芽知识库",
  description: "查看对方分享的聊天记录",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function SharedChatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await getChatShare(token);
  if (!share) notFound();
  return (
    <main className="h-full overflow-y-auto px-3 py-8 sm:px-6" style={{ background: "var(--app-background)", color: "var(--color-sidebar-text-bright)" }}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 border-b pb-5" style={{ borderColor: "var(--surface-outline)" }}>
          <p className="mb-2 text-sm" style={{ color: "var(--color-amber)" }}>起芽知识库</p>
          <h1 className="text-2xl font-semibold">聊天分享</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--color-ink-muted)" }}>共 {share.messages.length} 条消息 · 此页面为分享时的内容快照</p>
        </header>
        {share.messages.map((message) => <MessageBubble key={message.id} message={message} />)}
      </div>
    </main>
  );
}
