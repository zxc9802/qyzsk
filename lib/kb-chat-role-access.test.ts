import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseKbChatRole,
  filterVisibleKbChatRoles,
  parseKbChatRoleAccess,
} from "@/lib/kb-chat-role-access";

const ROLES = [
  { id: "product", name: "产品岗" },
  { id: "video", name: "视频岗" },
  { id: "operation", name: "运营岗" },
];

test("missing SSO role payload keeps every knowledge-base role visible", () => {
  const access = parseKbChatRoleAccess(undefined);
  assert.equal(access.mode, "all");
  assert.equal(filterVisibleKbChatRoles(ROLES, access).length, 3);
  assert.equal(canUseKbChatRole(access, "operation"), true);
});

test("selected SSO role payload becomes a strict allowlist", () => {
  const access = parseKbChatRoleAccess({
    mode: "selected",
    roleKeys: ["operation", "unknown", "product"],
  });

  assert.deepEqual(access, {
    mode: "selected",
    roleKeys: ["operation", "product"],
  });
  assert.deepEqual(filterVisibleKbChatRoles(ROLES, access).map((role) => role.id), ["product", "operation"]);
  assert.equal(canUseKbChatRole(access, "video"), false);
});
