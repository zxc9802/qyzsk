"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * PWA 安装引导 + Service Worker 注册。
 *
 * - 自动注册 /sw.js，并在新版本到达时提示用户刷新
 * - 监听 beforeinstallprompt 事件，把原生安装弹窗缓存下来供 UI 触发
 * - iOS Safari 没有该事件，对未安装用户显示「分享 → 添加到主屏幕」的引导
 * - 已安装（display-mode: standalone 或 iOS standalone 标志）则整段不渲染
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function detectIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const classicIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  const desktopModeIPad = /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
  return classicIOS || desktopModeIPad;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const viaMedia = window.matchMedia?.("(display-mode: standalone)").matches;
  const viaNavigator = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(viaMedia || viaNavigator);
}

export default function PwaInstaller() {
  const [mounted, setMounted] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [showIosTip, setShowIosTip] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setMounted(true);
    setIosDevice(detectIosDevice());
    setInstalled(isStandaloneDisplay());
    setInstallDismissed(window.sessionStorage.getItem("kb-pwa-install-dismissed") === "1");
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        if (cancelled) return;

        const handleUpdate = () => {
          if (registration.waiting) {
            setUpdateAvailable(true);
          }
        };

        handleUpdate();

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        });
      } catch (err) {
        console.warn("[pwa] service worker 注册失败:", err);
      }
    }

    register();

    return () => {
      cancelled = true;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const handler = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setInstallable(true);
    };
    const installedHandler = () => {
      setInstalled(true);
      setInstallable(false);
      deferredPrompt.current = null;
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [mounted]);

  const triggerInstall = useCallback(async () => {
    const promptEvent = deferredPrompt.current;
    if (!promptEvent) {
      if (iosDevice) setShowIosTip(true);
      return;
    }
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (err) {
      console.warn("[pwa] 触发安装弹窗失败:", err);
    } finally {
      deferredPrompt.current = null;
      setInstallable(false);
    }
  }, [iosDevice]);

  const applyUpdate = useCallback(() => {
    if (typeof navigator === "undefined") return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg?.waiting) return;

      let reloading = false;
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        },
        { once: true }
      );
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    });
  }, []);

  const dismissInstall = useCallback(() => {
    window.sessionStorage.setItem("kb-pwa-install-dismissed", "1");
    setInstallDismissed(true);
  }, []);

  const showFloating = useMemo(
    () => mounted && !installed && !installDismissed && (installable || iosDevice),
    [installDismissed, installed, installable, iosDevice, mounted]
  );

  if (!mounted) return null;

  return (
    <>
      {updateAvailable && (
        <button
          type="button"
          onClick={applyUpdate}
          className="fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-lg"
          style={{
            background: "var(--brand-badge, linear-gradient(145deg, #d6a163, #a26b2b))",
            color: "#10151f",
            top: "calc(0.75rem + env(safe-area-inset-top, 0))",
          }}
        >
          新版本已就绪 · 点击刷新
        </button>
      )}

      {showFloating && (
        <div
          className="fixed right-3 z-50 flex items-center rounded-full border shadow-xl backdrop-blur-md md:hidden"
          style={{
            top: "calc(4.75rem + env(safe-area-inset-top, 0))",
            background: "rgba(8, 18, 31, 0.88)",
            borderColor: "var(--surface-outline-accent, rgba(214,161,99,0.22))",
            color: "var(--color-sidebar-text-bright, #f4f8ff)",
          }}
        >
          <button
            type="button"
            onClick={triggerInstall}
            className="flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md text-xs font-semibold"
              style={{
                background: "linear-gradient(145deg, #d6a163, #a26b2b)",
                color: "#10151f",
              }}
              aria-hidden
            >
              K
            </span>
            <span>{iosDevice ? "添加到主屏幕" : "安装到桌面"}</span>
          </button>
          <button
            type="button"
            onClick={dismissInstall}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            aria-label="关闭安装提示"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M3 3L11 11" />
              <path d="M11 3L3 11" />
            </svg>
          </button>
        </div>
      )}

      {showIosTip && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center px-4 pb-6"
          style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0))" }}
          onClick={() => setShowIosTip(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl border p-5 text-center shadow-2xl"
            style={{
              background: "var(--surface-panel, rgba(14,22,35,0.95))",
              borderColor: "var(--surface-outline, rgba(255,255,255,0.08))",
              color: "var(--color-ink, #edf3ff)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold" style={{ color: "var(--color-sidebar-text-bright, #f4f8ff)" }}>
              把助手装到主屏幕
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft, #bac6da)" }}>
              在 Safari 浏览器中点击底部的「分享」按钮 ⬆️，然后选择「添加到主屏幕」即可；如果当前不是 Safari，请先在 Safari 中打开本页。
            </p>
            <button
              type="button"
              onClick={() => setShowIosTip(false)}
              className="mt-4 min-h-11 rounded-full px-4 py-2 text-sm font-semibold"
              style={{
                background: "linear-gradient(145deg, #d6a163, #a26b2b)",
                color: "#10151f",
              }}
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
}
