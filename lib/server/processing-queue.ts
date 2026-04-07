import { processUploadedFile } from "@/lib/server/file-processing";
import {
  ConversationFileRecord,
  FileKind,
  getFileRecord,
} from "@/lib/server/file-store";

const MAX_CONCURRENT_JOBS = 2;
const MAX_VIDEO_JOBS = 1;

type ProcessingJob = {
  conversationId: string;
  fileId: string;
  kind: FileKind;
};

const pendingJobs: ProcessingJob[] = [];
const queuedJobIds = new Set<string>();
const cancelledJobIds = new Set<string>();
const runningJobs = new Map<string, ProcessingJob>();
let runningVideoJobs = 0;
let drainScheduled = false;

function isVideoJob(kind: FileKind): boolean {
  return kind === "video";
}

function canStartJob(kind: FileKind): boolean {
  if (runningJobs.size >= MAX_CONCURRENT_JOBS) return false;
  if (isVideoJob(kind) && runningVideoJobs >= MAX_VIDEO_JOBS) return false;
  return true;
}

function findNextRunnableIndex(): number {
  return pendingJobs.findIndex((job) => canStartJob(job.kind));
}

function scheduleDrain() {
  if (drainScheduled) return;
  drainScheduled = true;

  queueMicrotask(() => {
    drainScheduled = false;
    void drainQueue();
  });
}

async function drainQueue() {
  while (true) {
    const nextIndex = findNextRunnableIndex();
    if (nextIndex === -1) return;

    const [job] = pendingJobs.splice(nextIndex, 1);
    queuedJobIds.delete(job.fileId);

    if (cancelledJobIds.has(job.fileId)) {
      cancelledJobIds.delete(job.fileId);
      continue;
    }

    void runJob(job);
  }
}

async function runJob(job: ProcessingJob) {
  runningJobs.set(job.fileId, job);
  if (isVideoJob(job.kind)) {
    runningVideoJobs += 1;
  }

  try {
    if (cancelledJobIds.has(job.fileId)) return;

    const latestRecord = await getFileRecord(job.conversationId, job.fileId);
    if (!latestRecord || latestRecord.status !== "processing") return;

    await processUploadedFile(latestRecord);
  } catch (error) {
    console.error("Background file processing error:", job.fileId, error);
  } finally {
    runningJobs.delete(job.fileId);
    if (isVideoJob(job.kind)) {
      runningVideoJobs = Math.max(0, runningVideoJobs - 1);
    }
    cancelledJobIds.delete(job.fileId);
    scheduleDrain();
  }
}

async function enqueueRecord(record: ConversationFileRecord | null) {
  if (!record || record.status !== "processing") return;
  if (queuedJobIds.has(record.id) || runningJobs.has(record.id)) return;

  pendingJobs.push({
    conversationId: record.conversationId,
    fileId: record.id,
    kind: record.kind,
  });
  queuedJobIds.add(record.id);
}

export async function enqueueFileProcessingJobs(
  conversationId: string,
  fileIds: string[]
): Promise<void> {
  for (const fileId of fileIds) {
    const record = await getFileRecord(conversationId, fileId);
    await enqueueRecord(record);
  }

  scheduleDrain();
}

export function cancelFileProcessing(fileId: string) {
  cancelledJobIds.add(fileId);

  const nextPendingJobs = pendingJobs.filter((job) => job.fileId !== fileId);
  if (nextPendingJobs.length !== pendingJobs.length) {
    pendingJobs.splice(0, pendingJobs.length, ...nextPendingJobs);
  }

  queuedJobIds.delete(fileId);
  if (!runningJobs.has(fileId)) {
    cancelledJobIds.delete(fileId);
  }
}

export function cancelConversationProcessing(conversationId: string) {
  const removedIds = pendingJobs
    .filter((job) => job.conversationId === conversationId)
    .map((job) => job.fileId);

  if (removedIds.length > 0) {
    const nextPendingJobs = pendingJobs.filter((job) => job.conversationId !== conversationId);
    pendingJobs.splice(0, pendingJobs.length, ...nextPendingJobs);
    removedIds.forEach((fileId) => {
      queuedJobIds.delete(fileId);
    });
  }

  for (const [fileId, job] of runningJobs.entries()) {
    if (job.conversationId === conversationId) {
      cancelledJobIds.add(fileId);
    }
  }
}
