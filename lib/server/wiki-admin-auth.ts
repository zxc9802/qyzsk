import {
  AppSessionUnauthorizedError,
  appSessionErrorResponse,
  assertAppUserSession,
} from "@/lib/server/app-session";

export class WikiAdminAccessError extends Error {
  status: number;

  constructor(message = "当前账号不是管理员，无法访问知识管理后台。", status = 403) {
    super(message);
    this.name = "WikiAdminAccessError";
    this.status = status;
  }
}

export async function assertWikiAdminAccess(request: Pick<Request, "url" | "headers">) {
  const session = await assertAppUserSession(request);
  if (session.user?.role === "admin") {
    return session;
  }

  throw new WikiAdminAccessError();
}

export function wikiAdminAuthErrorResponse(error: unknown, request: Pick<Request, "url">) {
  if (error instanceof AppSessionUnauthorizedError) {
    return appSessionErrorResponse(error, request);
  }

  if (error instanceof WikiAdminAccessError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Wiki 管理权限校验失败。" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
