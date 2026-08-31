import type { MetadataRoute } from "next";

/**
 * 内部业务助手 PWA 清单。
 * Next.js 会自动在 <head> 里注入 <link rel="manifest" href="/manifest.webmanifest" />。
 * 配合 public/sw.js、app/layout.tsx 的 viewport 与 appleWebApp 元数据使用。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "内部业务助手",
    short_name: "业务助手",
    description: "基于公司知识库的智能业务问答助手",
    lang: "zh-CN",
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    background_color: "#050913",
    theme_color: "#07101b",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
