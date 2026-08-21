import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canUseKbChatRole,
  filterExampleQuestionsByRole,
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

test("suggested prompts only include the selected knowledge-base role", () => {
  const questions = [
    { roleId: "product", title: "这个产品能做吗？" },
    { roleId: "operation", title: "店铺不出单怎么办？" },
    { roleId: "product", title: "防晒项目怎么切入？" },
  ];

  assert.deepEqual(
    filterExampleQuestionsByRole(questions, "product").map((item) => item.title),
    ["这个产品能做吗？", "防晒项目怎么切入？"],
  );
  assert.deepEqual(filterExampleQuestionsByRole(questions, null), []);
});

test("each knowledge-base role has tagged example questions", async () => {
  const source = await readFile(new URL("./types.ts", import.meta.url), "utf8");
  for (const roleId of ["product", "video", "operation", "bd", "live", "management", "tech", "new"]) {
    assert.match(source, new RegExp(`roleId: "${roleId}"`));
  }
  assert.match(source, /roleId: "product"[\s\S]*这个产品能做吗？/);
  assert.match(source, /roleId: "operation"[\s\S]*店铺不出单怎么办？/);
});
