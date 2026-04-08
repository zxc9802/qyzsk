import { headers } from "next/headers";

const ADMIN_TOKEN_HEADER = "x-admin-token";

export async function assertWikiAdminAccess() {
  const expectedToken = process.env.WIKI_ADMIN_TOKEN?.trim();
  if (!expectedToken) {
    throw new Error("WIKI_ADMIN_TOKEN 未配置，暂时不能访问 Wiki 管理接口。");
  }

  const headerStore = await headers();
  const providedToken = headerStore.get(ADMIN_TOKEN_HEADER)?.trim();

  if (!providedToken || providedToken !== expectedToken) {
    throw new Error("Wiki 管理权限校验失败。");
  }
}

export function wikiAdminAuthErrorResponse(message: string, status = 401) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
