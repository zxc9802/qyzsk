import { after, NextRequest } from "next/server";
import { DEFAULT_CHAT_MODEL_ID } from "@/lib/chat-models";
import {
  appSessionErrorResponse,
  assertAppUserSession,
} from "@/lib/server/app-session";
import {
  getUserChatState,
  saveUserChatState,
} from "@/lib/server/chat-state-store";
import {
  deleteConversationContextState,
} from "@/lib/server/conversation-context";
import {
  enqueueConversationCompressionJob,
} from "@/lib/server/conversation-context-queue";
import { deleteConversationFiles } from "@/lib/server/file-store";
import { cancelConversationProcessing } from "@/lib/server/processing-queue";

export const runtime = "nodejs";

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: NextRequest) {
  try {
    let userId = "";
    try {
      ({ userId } = await assertAppUserSession(req));
    } catch (error) {
      return appSessionErrorResponse(error, req);
    }

    const state = await getUserChatState(userId);

    return createJsonResponse(
      {
        success: true,
        data: state,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error("State GET error:", error);
    }
    return createJsonResponse({ success: false, error: "读取聊天状态失败。" }, 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    let userId = "";
    try {
      ({ userId } = await assertAppUserSession(req));
    } catch (error) {
      return appSessionErrorResponse(error, req);
    }

    const body = await req.json();
    const result = await saveUserChatState(userId, body);

    const cleanupResults = await Promise.allSettled(
      result.deletedConversationIds.map(async (conversationId) => {
        cancelConversationProcessing(userId, conversationId);
        await Promise.all([
          deleteConversationFiles(userId, conversationId),
          deleteConversationContextState(userId, conversationId),
        ]);
      })
    );
    cleanupResults.forEach((cleanupResult) => {
      if (cleanupResult.status === "rejected") {
        console.error("Deleted conversation cleanup error:", cleanupResult.reason);
      }
    });

    if (result.state.activeId) {
      const modelId = result.state.settings?.chatModelId || DEFAULT_CHAT_MODEL_ID;
      after(async () => {
        try {
          await enqueueConversationCompressionJob({
            userId,
            conversationId: result.state.activeId!,
            modelId,
            trigger: "state_save",
            requestedAtMs: Date.now(),
          });
        } catch (error) {
          console.error("Conversation compression enqueue error:", error);
        }
      });
    }

    return createJsonResponse(
      {
        success: true,
        data: result.state,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error("State PUT error:", error);
    }
    return createJsonResponse({ success: false, error: "保存聊天状态失败。" }, 500);
  }
}
