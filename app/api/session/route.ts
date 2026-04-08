import { NextRequest } from "next/server";
import {
  appSessionErrorResponse,
  assertAppSession,
  buildPublicSessionData,
  isMainAppSsoRequired,
  readAppSession,
} from "@/lib/server/app-session";

export const runtime = "nodejs";

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: NextRequest) {
  if (!isMainAppSsoRequired()) {
    const session = readAppSession(req);
    return createJsonResponse(
      {
        success: true,
        data: {
          requiresSso: false,
          session: session ? buildPublicSessionData(session) : null,
        },
      },
      200
    );
  }

  try {
    const session = await assertAppSession(req);

    return createJsonResponse(
      {
        success: true,
        data: {
          requiresSso: true,
          session: session ? buildPublicSessionData(session) : null,
        },
      },
      200
    );
  } catch (error) {
    return appSessionErrorResponse(error, req);
  }
}
