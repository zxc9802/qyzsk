"use client";

import { useEffect, useMemo, useState } from "react";
import { extractApiErrorMessage, readJsonSafely, redirectToMainAppIfNeeded } from "@/lib/client/api-response";

export type AppViewer = {
  id: string;
  account?: string;
  nickname?: string;
  role?: string;
  groupName?: string;
};

type SessionResponsePayload = {
  success?: boolean;
  data?: {
    requiresSso?: boolean;
    session?: {
      user?: Record<string, unknown>;
      expiresAt?: string;
    } | null;
  };
  error?: string;
  message?: string;
  redirectUrl?: string;
};

function normalizeViewer(user: Record<string, unknown> | undefined): AppViewer | null {
  if (!user) return null;

  const id = typeof user.id === "string" ? user.id.trim() : "";
  if (!id) return null;

  const viewer: AppViewer = { id };
  const account = typeof user.account === "string"
    ? user.account.trim()
    : typeof user.email === "string"
      ? user.email.trim()
      : "";
  if (account) viewer.account = account;

  const nickname = typeof user.nickname === "string" ? user.nickname.trim() : "";
  if (nickname) viewer.nickname = nickname;

  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role) viewer.role = role;

  const groupName = typeof user.groupName === "string" ? user.groupName.trim() : "";
  if (groupName) viewer.groupName = groupName;

  return viewer;
}

export function useAppViewer() {
  const [viewer, setViewer] = useState<AppViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/session", {
          method: "GET",
          cache: "no-store",
        });
        const payload = await readJsonSafely<SessionResponsePayload>(response);
        if (redirectToMainAppIfNeeded(response, payload)) {
          return;
        }

        if (!response.ok) {
          throw new Error(extractApiErrorMessage(payload, "读取当前登录状态失败"));
        }

        if (cancelled) return;
        setViewer(normalizeViewer(payload?.data?.session?.user));
      } catch (requestError) {
        if (cancelled) return;
        setError(requestError instanceof Error ? requestError.message : "读取当前登录状态失败");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      viewer,
      loading,
      error,
      isAdmin: viewer?.role === "admin",
    }),
    [error, loading, viewer]
  );
}
