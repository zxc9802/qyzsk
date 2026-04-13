import { promises as fs } from "fs";
import path from "path";
import type { ConversationReport } from "@/lib/report";
import { isDatabaseConfigured, withDbClient } from "@/lib/server/db";
import { STORAGE_ROOT } from "@/lib/server/file-store";

type ReportCacheRow = {
  report_json: unknown;
};

type LocalReportCacheRecord = {
  fingerprint: string;
  report: ConversationReport;
  createdAtMs: number;
  updatedAtMs: number;
};

function sanitizeSegment(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  return sanitized || "default";
}

function localReportCacheDir(userId: string, conversationId: string) {
  return path.join(
    STORAGE_ROOT,
    "users",
    sanitizeSegment(userId),
    "conversations",
    sanitizeSegment(conversationId),
    "report-cache"
  );
}

function localReportCachePath(userId: string, conversationId: string, fingerprint: string) {
  return path.join(localReportCacheDir(userId, conversationId), `${sanitizeSegment(fingerprint)}.json`);
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function normalizeReport(value: unknown): ConversationReport | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ConversationReport>;
  if (
    typeof candidate.reportTitle !== "string" ||
    typeof candidate.conversationId !== "string" ||
    typeof candidate.conversationTitle !== "string" ||
    typeof candidate.generatedAt !== "number" ||
    !candidate.executiveSummary ||
    !candidate.problemDefinition ||
    !Array.isArray(candidate.keyJudgments) ||
    !Array.isArray(candidate.analysisDimensions) ||
    !Array.isArray(candidate.actionPlan)
  ) {
    return null;
  }

  return candidate as ConversationReport;
}

async function readLocalCachedReport(
  userId: string,
  conversationId: string,
  fingerprint: string
): Promise<ConversationReport | null> {
  try {
    const raw = await fs.readFile(localReportCachePath(userId, conversationId, fingerprint), "utf8");
    const parsed = JSON.parse(raw) as LocalReportCacheRecord;
    return normalizeReport(parsed.report);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") return null;
    throw error;
  }
}

async function writeLocalCachedReport(
  userId: string,
  conversationId: string,
  fingerprint: string,
  report: ConversationReport
) {
  const filePath = localReportCachePath(userId, conversationId, fingerprint);
  const now = Date.now();
  await writeJson(filePath, {
    fingerprint,
    report,
    createdAtMs: now,
    updatedAtMs: now,
  } satisfies LocalReportCacheRecord);
}

export async function getCachedConversationReport(options: {
  userId: string;
  conversationId: string;
  fingerprint: string;
}): Promise<ConversationReport | null> {
  if (!isDatabaseConfigured()) {
    return readLocalCachedReport(options.userId, options.conversationId, options.fingerprint);
  }

  return withDbClient(async (client) => {
    const result = await client.query<ReportCacheRow>(
      `
        SELECT report_json
        FROM kb_chat_report_cache
        WHERE user_id = $1 AND conversation_id = $2 AND fingerprint = $3
        LIMIT 1
      `,
      [options.userId, options.conversationId, options.fingerprint]
    );

    return normalizeReport(result.rows[0]?.report_json);
  });
}

export async function saveCachedConversationReport(options: {
  userId: string;
  conversationId: string;
  fingerprint: string;
  report: ConversationReport;
}): Promise<void> {
  if (!isDatabaseConfigured()) {
    await writeLocalCachedReport(
      options.userId,
      options.conversationId,
      options.fingerprint,
      options.report
    );
    return;
  }

  await withDbClient(async (client) => {
    const now = Date.now();
    await client.query(
      `
        INSERT INTO kb_chat_report_cache (
          user_id,
          conversation_id,
          fingerprint,
          report_json,
          created_at_ms,
          updated_at_ms
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $5)
        ON CONFLICT (user_id, conversation_id, fingerprint)
        DO UPDATE SET
          report_json = EXCLUDED.report_json,
          updated_at_ms = EXCLUDED.updated_at_ms
      `,
      [
        options.userId,
        options.conversationId,
        options.fingerprint,
        JSON.stringify(options.report),
        now,
      ]
    );
  });
}
