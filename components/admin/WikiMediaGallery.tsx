"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/upload-accept";
import type { WikiMediaAsset } from "@/lib/wiki-types";

function mediaUrl(mediaId: string, variant?: "poster") {
  const search = variant ? "?variant=poster" : "";
  return `/api/wiki/media/${encodeURIComponent(mediaId)}${search}`;
}

export default function WikiMediaGallery({ media }: { media?: WikiMediaAsset[] }) {
  const items = media || [];
  const [lightbox, setLightbox] = useState<WikiMediaAsset | null>(null);

  if (items.length === 0) return null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          if (item.kind === "image") {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setLightbox(item)}
                className="overflow-hidden rounded-[18px] border text-left"
                style={{
                  borderColor: "var(--surface-outline)",
                  background: "var(--muted-surface)",
                }}
              >
                <img src={mediaUrl(item.id)} alt={item.name} className="max-h-48 w-full object-contain" />
                <div className="px-3 py-2 text-[12px] leading-6" style={{ color: "var(--color-ink-soft)" }}>
                  {item.name} · {formatBytes(item.size)}
                </div>
              </button>
            );
          }

          if (item.kind === "video") {
            return (
              <figure
                key={item.id}
                className="overflow-hidden rounded-[18px] border"
                style={{
                  borderColor: "var(--surface-outline)",
                  background: "var(--muted-surface)",
                }}
              >
                <video
                  src={mediaUrl(item.id)}
                  poster={mediaUrl(item.id, "poster")}
                  controls
                  className="max-h-56 w-full bg-black"
                />
                <figcaption className="px-3 py-2 text-[12px] leading-6" style={{ color: "var(--color-ink-soft)" }}>
                  {item.name} · {formatBytes(item.size)}
                </figcaption>
              </figure>
            );
          }

          return (
            <a
              key={item.id}
              href={mediaUrl(item.id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--surface-outline)",
                background: "var(--surface-command)",
                color: "var(--color-sidebar-text-bright)",
              }}
            >
              <span className="min-w-0 truncate">{item.name}</span>
              <span className="shrink-0 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                {formatBytes(item.size)}
              </span>
            </a>
          );
        })}
      </div>

      {lightbox ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
        >
          <img src={mediaUrl(lightbox.id)} alt={lightbox.name} className="max-h-full max-w-full object-contain" />
        </button>
      ) : null}
    </>
  );
}
