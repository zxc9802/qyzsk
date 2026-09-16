import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyUsage, mergeUsage, parseTokenUsage, type TokenUsage } from "./openlux-usage-values";
import { isDatabaseConfigured, withDbClient } from "./db";

type UsageEvent = TokenUsage & {
  userId: string; requestId: string; provider: string; model: string;
  status: "pending" | "completed" | "failed" | "interrupted";
  tokenBasis: "reported" | "missing";
  upstreamRequestId?: string | null;
};
const context = new AsyncLocalStorage<string>();

/** Only pass a verified SSO identity or the owner of a server-created job. */
export function withUsageUser<T>(userId: string | undefined, operation: () => T): T {
  return context.run(userId && userId !== "kb-chat-local-dev-user" ? userId : "", operation);
}

export function isOpenLuxUrl(value: string) {
  try { return new URL(value).hostname === "api.openlux.ai"; } catch { return false; }
}

function config() {
  const explicit = process.env.USAGE_MONITOR_URL?.trim();
  const main = process.env.MAIN_APP_URL?.trim().replace(/\/+$/, "");
  const endpoint = explicit ? explicit.replace(/\/api\/internal\/usage-events\/?(?=\?|$)/, "/api/sso/usage") : main ? `${main}/api/sso/usage` : "";
  return { endpoint, secret: process.env.USAGE_MONITOR_INTERNAL_SECRET?.trim(), dir: process.env.USAGE_MONITOR_OUTBOX_DIR?.trim() || path.join(process.cwd(), ".kb-chat-data", "usage-outbox") };
}

let draining: Promise<void> | undefined;
/** Bounded replay, safe across processes because the main ledger deduplicates request IDs. */
export async function drainUsageOutbox() {
  if (draining) return draining;
  const { endpoint, secret, dir } = config();
  if (!endpoint || !secret) return;
  draining = (async () => {
    const database = isDatabaseConfigured();
    const records: { id: string; body?: string }[] = database
      ? await withDbClient(async client => (await client.query<{ id: string; body: string }>("SELECT id, payload::text AS body FROM kb_chat_usage_outbox ORDER BY created_at_ms, id LIMIT 20")).rows)
      : await (async () => {
        await fs.mkdir(dir, { recursive: true });
        return (await fs.readdir(dir)).filter(f => /^[0-9a-f-]+\.json$/.test(f)).sort().slice(0, 20).map(id => ({ id }));
      })();
    const deadline = Date.now() + 8000;
    for (const item of records) {
      if (Date.now() >= deadline) break;
      try {
        const body = item.body ?? await fs.readFile(path.join(dir, item.id), "utf8");
        const response = await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json", "x-usage-tool": "kb-chat", "x-usage-secret": secret },
          body, signal: AbortSignal.timeout(Math.min(4000, Math.max(1, deadline - Date.now()))),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.success !== true) break;
        if (database) await withDbClient(client => client.query("DELETE FROM kb_chat_usage_outbox WHERE id = $1", [item.id]));
        else await fs.unlink(path.join(dir, item.id)).catch(() => {});
      } catch { break; }
    }
  })().finally(() => { draining = undefined; });
  return draining;
}

async function record(event: UsageEvent) {
  try {
    const { dir } = config();
    // Unique revision files avoid a late pending writer overwriting a completed revision.
    const id = `${Date.now()}-${randomUUID()}`;
    if (isDatabaseConfigured()) {
      await withDbClient(client => client.query("INSERT INTO kb_chat_usage_outbox (id, payload, created_at_ms) VALUES ($1, $2::jsonb, $3)", [id, JSON.stringify(event), Date.now()]));
    } else {
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${id}.json`);
      await fs.writeFile(`${file}.tmp`, JSON.stringify(event), { mode: 0o600 });
      await fs.rename(`${file}.tmp`, file);
    }
    await drainUsageOutbox();
  } catch { console.error("[usage-monitor] unable to persist or deliver usage metadata"); }
}

/** Observe each real model request; no model routing or content is persisted. */
export async function usageFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const userId = context.getStore();
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const settings = config();
  if (!userId || !isOpenLuxUrl(url.href) || !settings.endpoint || !settings.secret) return fetch(input, init);
  let body: Record<string, unknown> = {};
  if (typeof init?.body === "string") { try { body = JSON.parse(init.body); } catch { /* Non-JSON request. */ } }
  const model = (typeof body.model === "string" ? body.model : decodeURIComponent(url.pathname.match(/\/models\/([^/:]+)/)?.[1] ?? "unknown")).replace(/^models\//, "");
  const event: UsageEvent = { ...emptyUsage(), userId, requestId: randomUUID(), provider: url.hostname, model, status: "pending", tokenBasis: "missing" };
  await record(event);
  if (body.stream === true && url.pathname.endsWith("/chat/completions")) {
    init = { ...init, body: JSON.stringify({ ...body, stream_options: { ...(body.stream_options as object ?? {}), include_usage: true } }) };
  }
  let response: Response;
  try { response = await fetch(input, init); }
  catch (error) { await record({ ...event, status: "failed" }); throw error; }
  event.upstreamRequestId = response.headers.get("x-request-id");
  let failed = false;
  let incomplete = false;
  let upstreamPending = response.status === 202;
  let terminal = false;
  let finalized = false;
  const finish = async (status: UsageEvent["status"]) => {
    if (finalized) return;
    finalized = true;
    await record({ ...event, status });
  };
  const observe = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(observe); return; }
    Object.assign(event, mergeUsage(event, parseTokenUsage(value)));
    if ((url.pathname.endsWith("/embeddings") || model.includes("embedding")) && event.inputTokens !== null && event.outputTokens === null) event.outputTokens = 0;
    if (event.inputTokens !== null && event.outputTokens !== null) event.totalTokens = event.inputTokens + event.outputTokens;
    event.tokenBasis = event.inputTokens !== null || event.outputTokens !== null || event.totalTokens !== null ? "reported" : "missing";
    const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const nested = data.response && typeof data.response === "object" ? data.response as Record<string, unknown> : {};
    const status = String(data.status ?? nested.status ?? "");
    if (data.error || nested.error || ["error", "response.failed"].includes(String(data.type)) || ["failed", "error"].includes(status)) failed = true;
    if (data.type === "response.incomplete" || ["incomplete", "cancelled", "canceled"].includes(status)) incomplete = true;
    if (["pending", "queued", "in_progress", "processing"].includes(status)) upstreamPending = true;
    if (["message_stop", "response.completed", "response.failed", "response.incomplete"].includes(String(data.type))) terminal = true;
  };
  if (!response.body) { await finish(!response.ok ? "failed" : upstreamPending ? "pending" : "completed"); return response; }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    let bytes: ArrayBuffer;
    try { bytes = await response.arrayBuffer(); }
    catch (error) { await finish("interrupted"); throw error; }
    try { observe(JSON.parse(new TextDecoder().decode(bytes))); } catch { /* Token usage unavailable. */ }
    await finish(!response.ok || failed ? "failed" : incomplete ? "interrupted" : upstreamPending ? "pending" : "completed");
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const consume = (chunk: string) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") terminal = true;
      else { try { observe(JSON.parse(data)); } catch { /* Malformed provider packet. */ } }
    }
    if (pending.length > 2_000_000) pending = "";
  };
  return new Response(new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const part = await reader.read();
        if (part.done) {
          consume(decoder.decode() + "\n");
          await finish(!response.ok || failed ? "failed" : terminal && !incomplete ? "completed" : "interrupted");
          controller.close();
        } else { consume(decoder.decode(part.value, { stream: true })); controller.enqueue(part.value); }
      } catch (error) { await finish("interrupted"); controller.error(error); }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { await finish(failed ? "failed" : terminal && !incomplete ? "completed" : "interrupted"); } },
  }), { status: response.status, statusText: response.statusText, headers: response.headers });
}
