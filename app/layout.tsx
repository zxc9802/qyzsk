import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "内部业务助手 - 知识库问答",
  description: "基于公司知识库的智能业务问答助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="h-full noise">{children}</body>
    </html>
  );
}
