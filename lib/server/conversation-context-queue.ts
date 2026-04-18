import {
  createConversationContextKey,
  evaluateAndPersistConversationContext,
  getCompressionRetryDelayMs,
  patchConversationContextState,
  type CompressionJobPayload,
} from "@/lib/server/conversation-context";

const MAX_CONCURRENT_CONTEXT_JOBS = 1;

const pendingJobs = new Map<string, CompressionJobPayload>();
const runningJobs = new Set<string>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
let drainScheduled = false;

function clearRetryTimer(key: string) {
  const timer = retryTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  retryTimers.delete(key);
}

function scheduleDrain() {
  if (drainScheduled) return;
  drainScheduled = true;

  queueMicrotask(() => {
    drainScheduled = false;
    void drainQueue();
  });
}

function getRunnableJobs() {
  return Array.from(pendingJobs.values()).slice(0, Math.max(0, MAX_CONCURRENT_CONTEXT_JOBS - runningJobs.size));
}

async function markQueued(payload: CompressionJobPayload, lastError?: string, nextRetryAtMs?: number) {
  await patchConversationContextState(payload.userId, payload.conversationId, {
    modelId: payload.modelId,
    taskStatus: "queued",
    attempt: {
      retryCount: payload.retryCount ?? 0,
      lastError,
      nextRetryAtMs,
    },
  });
}

async function markRunning(payload: CompressionJobPayload) {
  await patchConversationContextState(payload.userId, payload.conversationId, {
    modelId: payload.modelId,
    taskStatus: "running",
    attempt: {
      retryCount: payload.retryCount ?? 0,
      lastAttemptAtMs: Date.now(),
      nextRetryAtMs: undefined,
    },
  });
}

async function markFailed(payload: CompressionJobPayload, errorMessage: string) {
  await patchConversationContextState(payload.userId, payload.conversationId, {
    modelId: payload.modelId,
    taskStatus: "failed",
    attempt: {
      retryCount: payload.retryCount ?? 0,
      lastError: errorMessage,
      nextRetryAtMs: undefined,
      lastAttemptAtMs: Date.now(),
    },
  });
}

async function scheduleRetry(payload: CompressionJobPayload, errorMessage: string) {
  const nextRetryCount = (payload.retryCount ?? 0) + 1;
  const delayMs = getCompressionRetryDelayMs(nextRetryCount);
  const nextRetryAtMs = Date.now() + delayMs;
  const key = createConversationContextKey(payload.userId, payload.conversationId);

  await markQueued(
    {
      ...payload,
      trigger: "retry",
      retryCount: nextRetryCount,
    },
    errorMessage,
    nextRetryAtMs
  );

  clearRetryTimer(key);
  retryTimers.set(
    key,
    setTimeout(() => {
      retryTimers.delete(key);
      void enqueueConversationCompressionJob({
        ...payload,
        trigger: "retry",
        retryCount: nextRetryCount,
        requestedAtMs: Date.now(),
      });
    }, delayMs)
  );
}

async function runJob(payload: CompressionJobPayload) {
  const key = createConversationContextKey(payload.userId, payload.conversationId);
  runningJobs.add(key);
  pendingJobs.delete(key);

  try {
    await markRunning(payload);
    await evaluateAndPersistConversationContext({
      userId: payload.userId,
      conversationId: payload.conversationId,
      modelId: payload.modelId,
      forceTier: payload.forceTier,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "会话压缩失败。";
    console.error("Conversation compression job error:", key, error);

    if ((payload.retryCount ?? 0) < 5) {
      await scheduleRetry(payload, errorMessage);
    } else {
      await markFailed(payload, errorMessage);
    }
  } finally {
    runningJobs.delete(key);
    if (pendingJobs.size > 0) {
      scheduleDrain();
    }
  }
}

async function drainQueue() {
  while (runningJobs.size < MAX_CONCURRENT_CONTEXT_JOBS && pendingJobs.size > 0) {
    const nextJob = getRunnableJobs()[0];
    if (!nextJob) return;
    void runJob(nextJob);
  }
}

export async function enqueueConversationCompressionJob(payload: CompressionJobPayload) {
  const key = createConversationContextKey(payload.userId, payload.conversationId);
  clearRetryTimer(key);
  pendingJobs.set(key, payload);
  if (!runningJobs.has(key)) {
    await markQueued(payload);
  }
  scheduleDrain();
}

export function cancelConversationCompressionJob(userId: string, conversationId: string) {
  const key = createConversationContextKey(userId, conversationId);
  clearRetryTimer(key);
  pendingJobs.delete(key);
}
