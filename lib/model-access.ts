import { CHAT_MODELS, type ChatModelId } from "./chat-models";

/** Missing permissions never grant a member access. Only trusted session roles may grant all. */
export function allowedModelIds(user: Record<string, unknown> | null | undefined): ChatModelId[] {
  if (user?.role === "admin") return CHAT_MODELS.map(model => model.id);
  const access = user?.modelAccess as { sites?: { siteKey?: string; mode?: string; modelKeys?: unknown }[] } | undefined;
  const site = Array.isArray(access?.sites) ? access.sites.find(site => site?.siteKey === "kb-chat" && site.mode === "selected") : undefined;
  return CHAT_MODELS.filter(model => Array.isArray(site?.modelKeys) && site.modelKeys.includes(model.id)).map(model => model.id);
}
