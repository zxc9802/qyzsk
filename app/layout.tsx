import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaInstaller from "@/components/PwaInstaller";

export const metadata: Metadata = {
  title: "内部业务助手 - 知识库问答",
  description: "基于公司知识库的智能业务问答助手",
  applicationName: "内部业务助手",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "内部业务助手",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
  },
};

/**
 * themeColor 决定 PWA 顶栏和浏览器地址栏的着色。
 * viewportFit=cover 让刘海屏内容延伸到屏幕边缘，再配合 globals.css 的
 * env(safe-area-inset-*) 做安全区适配。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#07101b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="h-full noise">
        {children}
        <PwaInstaller />
      </body>
    </html>
  );
}
