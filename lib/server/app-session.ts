import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_MAIN_APP_ENTRY_PATH = "/bot/kb-chat";
const DEFAULT_MAIN_APP_SSO_EXCHANGE_PATH = "/api/kb-chat-sso/exchange";
const DEFAULT_SESSION_COOKIE_NAME = "kb_chat_session";
const DEFAULT_SESSION_TTL_MINUTES = 720;
const DEFAULT_UNAUTHORIZED_MESSAGE = "请先从主官网登录后再进入该机器人。";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export type AppSessionUser = Record<string, unknown>;

export type AppSession = {
  token: string;
  user: AppSessionUser;
  mainAppUrl: string;
  expiresAt: number;
};

type AppSessionCookieInput = Pick<AppSession, "token" | "user" | "mainAppUrl">;

type AppSessionExchangeResult = {
  token: string;
  user: AppSessionUser;
  redirectPath: string;
};

export class AppSessionUnauthorizedError extends Error {
  redirectUrl: string;
  status: number;

  constructor(redirectUrl: string, message = DEFAULT_UNAUTHORIZED_MESSAGE) {
    super(message);
    this.name = "AppSessionUnauthorizedError";
    this.redirectUrl = redirectUrl;
    this.status = 401;
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function readBooleanEnv(value: string | undefined, fallbackValue: boolean) {
  if (!value) return fallbackValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function stripTrailingSlash(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function normalizePath(value: string | undefined, fallbackValue: string) {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith("/")) {
    return fallbackValue;
  }
  return trimmed;
}

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getConfiguredMainAppUrl() {
  const mainAppUrl = stripTrailingSlash(process.env.MAIN_APP_URL || "");
  if (mainAppUrl) {
    return mainAppUrl;
  }

  if (isMainAppSsoRequired()) {
    throw new Error("MAIN_APP_URL 未配置，开启主站 SSO 时必须提供主官网地址。");
  }

  return "";
}

function getSessionSecret() {
  const candidates = [
    process.env.KB_CHAT_SESSION_SECRET,
    process.env.KB_CHAT_SSO_SECRET,
    process.env.VIDEO_SITE_SESSION_SECRET,
  ];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  if (!isProductionRuntime()) {
    return "kb-chat-dev-session-secret";
  }

  throw new Error("KB_CHAT_SESSION_SECRET 未配置，开启主站 SSO 后必须提供会话签名密钥。");
}

function getSessionTtlMinutes() {
  const value = Number(process.env.KB_CHAT_SESSION_TTL_MINUTES || DEFAULT_SESSION_TTL_MINUTES);
  if (!Number.isFinite(value)) {
    return DEFAULT_SESSION_TTL_MINUTES;
  }
  return Math.max(5, Math.floor(value));
}

function getSessionTtlMs() {
  return getSessionTtlMinutes() * 60 * 1000;
}

function parseCookieHeader(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, item) => {
      const index = item.indexOf("=");
      if (index <= 0) return cookies;
      const key = item.slice(0, index).trim();
      const value = item.slice(index + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function normalizeRedirectPath(value: unknown) {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  return trimmed;
}

function sanitizeMainAppUrl(value: string | null) {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const requested = new URL(candidate);
    if (!["http:", "https:"].includes(requested.protocol)) {
      return null;
    }

    const configuredMainAppUrl = getConfiguredMainAppUrl();
    if (configuredMainAppUrl) {
      const configured = new URL(configuredMainAppUrl);
      if (requested.origin === configured.origin) {
        return stripTrailingSlash(requested.origin);
      }
    }

    if (!isProductionRuntime() && LOCAL_HOSTNAMES.has(requested.hostname)) {
      return stripTrailingSlash(requested.origin);
    }
  } catch {
    return null;
  }

  return null;
}

function signSessionPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function isMainAppSsoRequired() {
  return readBooleanEnv(process.env.REQUIRE_MAIN_APP_SSO, isProductionRuntime());
}

export function getMainAppEntryPath() {
  return normalizePath(
    process.env.MAIN_APP_KB_CHAT_ENTRY_PATH || process.env.MAIN_APP_BOT_ENTRY_PATH,
    DEFAULT_MAIN_APP_ENTRY_PATH
  );
}

export function getMainAppSsoExchangePath() {
  return normalizePath(
    process.env.MAIN_APP_KB_CHAT_SSO_EXCHANGE_PATH || process.env.MAIN_APP_SSO_EXCHANGE_PATH,
    DEFAULT_MAIN_APP_SSO_EXCHANGE_PATH
  );
}

export function getSessionCookieName() {
  return process.env.KB_CHAT_SESSION_COOKIE_NAME?.trim()
    || process.env.VIDEO_SITE_SESSION_COOKIE_NAME?.trim()
    || DEFAULT_SESSION_COOKIE_NAME;
}

export function buildMainAppEntryUrl(baseUrl?: string) {
  const resolvedBaseUrl = stripTrailingSlash(baseUrl || getConfiguredMainAppUrl());
  if (!resolvedBaseUrl) {
    throw new Error("MAIN_APP_URL 未配置，无法构建主站回跳地址。");
  }

  return `${resolvedBaseUrl}${getMainAppEntryPath()}`;
}

export function resolveRequestedMainAppUrl(request: Pick<Request, "url">) {
  const url = new URL(request.url);
  return sanitizeMainAppUrl(url.searchParams.get("mainApp")) || getConfiguredMainAppUrl();
}

export function readAppSession(request: Pick<Request, "headers">) {
  const cookies = parseCookieHeader(request.headers.get("cookie") || "");
  const rawValue = cookies[getSessionCookieName()];
  if (!rawValue) return null;

  const [payload, signature] = rawValue.split(".", 2);
  if (!payload || !signature) return null;

  const expectedSignature = signSessionPayload(payload);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const providedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AppSession;
    if (!parsed?.user || !parsed.token || typeof parsed.expiresAt !== "number") {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function assertAppSession(request: Pick<Request, "url" | "headers">) {
  if (!isMainAppSsoRequired()) {
    return null;
  }

  const session = readAppSession(request);
  if (session) {
    return session;
  }

  throw new AppSessionUnauthorizedError(buildMainAppEntryUrl(resolveRequestedMainAppUrl(request)));
}

export function appSessionErrorResponse(error: unknown, request: Pick<Request, "url">) {
  if (error instanceof AppSessionUnauthorizedError) {
    return createJsonResponse(
      {
        success: false,
        message: error.message,
        redirectUrl: error.redirectUrl,
      },
      error.status
    );
  }

  return createJsonResponse(
    {
      success: false,
      message: DEFAULT_UNAUTHORIZED_MESSAGE,
      redirectUrl: buildMainAppEntryUrl(resolveRequestedMainAppUrl(request)),
    },
    401
  );
}

export function buildSessionCookie(session: AppSessionCookieInput) {
  const expiresAt = Date.now() + getSessionTtlMs();
  const payload = Buffer.from(
    JSON.stringify({
      token: session.token,
      user: session.user,
      mainAppUrl: session.mainAppUrl,
      expiresAt,
    }),
    "utf8"
  ).toString("base64url");
  const signature = signSessionPayload(payload);

  return {
    name: getSessionCookieName(),
    value: `${payload}.${signature}`,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProductionRuntime(),
    path: "/",
    maxAge: Math.floor(getSessionTtlMs() / 1000),
    expires: new Date(expiresAt),
  };
}

export function buildClearedSessionCookie() {
  return {
    name: getSessionCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProductionRuntime(),
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

export function shouldBypassSso(pathname: string) {
  return pathname === "/api/health";
}

export function isHtmlDocumentRequest(request: Pick<Request, "method" | "headers">, pathname: string) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  if (pathname.startsWith("/api/")) {
    return false;
  }

  const accept = request.headers.get("accept") || "";
  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

export async function exchangeMainAppSsoTicket(ticket: string, baseUrl?: string): Promise<AppSessionExchangeResult> {
  const resolvedBaseUrl = stripTrailingSlash(baseUrl || getConfiguredMainAppUrl());
  if (!resolvedBaseUrl) {
    throw new Error("MAIN_APP_URL 未配置，无法交换 SSO ticket。");
  }

  const response = await fetch(`${resolvedBaseUrl}${getMainAppSsoExchangePath()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ticket }),
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string"
      ? payload
      : typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.error === "string"
          ? payload.error
          : "SSO ticket 交换失败。";
    throw new Error(message);
  }

  const data = typeof payload === "object" && payload && "data" in payload ? payload.data : payload;
  const token = typeof data?.token === "string" ? data.token.trim() : "";
  const user = typeof data?.user === "object" && data.user ? (data.user as AppSessionUser) : null;

  if (!token || !user) {
    throw new Error("主站返回的 SSO 数据缺少 token 或 user。");
  }

  return {
    token,
    user,
    redirectPath: normalizeRedirectPath(data?.redirectPath),
  };
}

export function buildPublicSessionData(session: AppSession) {
  return {
    user: session.user,
    mainAppUrl: session.mainAppUrl,
    expiresAt: new Date(session.expiresAt).toISOString(),
  };
}
