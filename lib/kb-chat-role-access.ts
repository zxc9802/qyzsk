export type KbChatRoleAccess = {
  mode: "all" | "selected";
  roleKeys: string[];
};

export const KB_CHAT_ROLE_IDS = [
  "product",
  "video",
  "operation",
  "bd",
  "live",
  "management",
  "tech",
  "new",
] as const;

const ROLE_ID_SET = new Set<string>(KB_CHAT_ROLE_IDS);

export const DEFAULT_KB_CHAT_ROLE_ACCESS: KbChatRoleAccess = {
  mode: "all",
  roleKeys: [],
};

export function parseKbChatRoleAccess(value: unknown): KbChatRoleAccess {
  if (!value || typeof value !== "object") {
    return DEFAULT_KB_CHAT_ROLE_ACCESS;
  }

  const record = value as { mode?: unknown; roleKeys?: unknown };
  const roleKeys = Array.isArray(record.roleKeys)
    ? [...new Set(record.roleKeys.filter((item): item is string => typeof item === "string" && ROLE_ID_SET.has(item)))]
    : [];

  if (record.mode === "selected") {
    return { mode: "selected", roleKeys };
  }

  return DEFAULT_KB_CHAT_ROLE_ACCESS;
}

export function filterVisibleKbChatRoles<T extends { id: string }>(
  roles: readonly T[],
  access: KbChatRoleAccess | undefined,
): T[] {
  if (!access || access.mode === "all") {
    return [...roles];
  }
  return roles.filter((role) => access.roleKeys.includes(role.id));
}

export function canUseKbChatRole(access: KbChatRoleAccess | undefined, roleId: string) {
  if (!ROLE_ID_SET.has(roleId)) return false;
  if (!access || access.mode === "all") return true;
  return access.roleKeys.includes(roleId);
}
