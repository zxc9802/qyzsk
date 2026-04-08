import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildClearedSessionCookie,
  buildMainAppEntryUrl,
  buildSessionCookie,
  exchangeMainAppSsoTicket,
  isHtmlDocumentRequest,
  isMainAppSsoRequired,
  readAppSession,
  resolveRequestedMainAppUrl,
  shouldBypassSso,
} from "@/lib/server/app-session";

export async function proxy(request: NextRequest) {
  if (!isMainAppSsoRequired()) {
    return NextResponse.next();
  }

  const { pathname, searchParams } = request.nextUrl;

  if (shouldBypassSso(pathname)) {
    return NextResponse.next();
  }

  const session = readAppSession(request);
  if (pathname.startsWith("/api/")) {
    if (session) {
      return NextResponse.next();
    }

    return NextResponse.json(
      {
        success: false,
        message: "请先从主官网登录后再进入该机器人。",
        redirectUrl: buildMainAppEntryUrl(resolveRequestedMainAppUrl(request)),
      },
      { status: 401 }
    );
  }

  if (!isHtmlDocumentRequest(request, pathname)) {
    return NextResponse.next();
  }

  if (session) {
    return NextResponse.next();
  }

  const requestedMainAppUrl = resolveRequestedMainAppUrl(request);
  const ticket = searchParams.get("ticket")?.trim();

  if (!ticket) {
    return NextResponse.redirect(buildMainAppEntryUrl(requestedMainAppUrl), 302);
  }

  try {
    const exchangeResult = await exchangeMainAppSsoTicket(ticket, requestedMainAppUrl);
    const redirectUrl = new URL(exchangeResult.redirectPath, request.url);
    redirectUrl.searchParams.delete("ticket");
    redirectUrl.searchParams.delete("mainApp");

    const response = NextResponse.redirect(redirectUrl, 302);
    response.cookies.set(
      buildSessionCookie({
        token: exchangeResult.token,
        user: exchangeResult.user,
        mainAppUrl: requestedMainAppUrl,
      })
    );
    return response;
  } catch (error) {
    console.error("[kb-chat-sso] Ticket exchange failed:", error);

    const response = NextResponse.redirect(buildMainAppEntryUrl(requestedMainAppUrl), 302);
    response.cookies.set(buildClearedSessionCookie());
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[^/]+$).*)",
  ],
};
