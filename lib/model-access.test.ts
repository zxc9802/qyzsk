import test from "node:test";
import assert from "node:assert/strict";
import { allowedModelIds } from "@/lib/model-access";
import { CHAT_MODELS } from "@/lib/chat-models";
import { assertAppSession, buildSessionCookie } from "@/lib/server/app-session";

test("members see only explicit kb-chat grants; missing or foreign permissions deny all", () => {
  for (const user of [undefined, {}, {role:"member"}, {modelAccess:{sites:[]}}, {modelAccess:{sites:[{siteKey:"main-general",mode:"selected",modelKeys:["yunwu-gpt-5.6"]}]}}]) assert.deepEqual(allowedModelIds(user), []);
  assert.deepEqual(allowedModelIds({modelAccess:{sites:[{siteKey:"kb-chat",mode:"selected",modelKeys:["unknown","yunwu-gpt-5.6"]}]}}), ["yunwu-gpt-5.6"]);
  assert.equal(allowedModelIds({role:"admin"}).length, CHAT_MODELS.length);
});

test("old signed sessions refresh revoked models and cannot use another user's response", async () => {
  const saved={...process.env}; const originalFetch=globalThis.fetch;
  process.env.REQUIRE_MAIN_APP_SSO="true"; process.env.MAIN_APP_URL="https://main.test";process.env.KB_CHAT_SESSION_SECRET="test-only";
  const cookie=buildSessionCookie({token:"test-token",mainAppUrl:"https://main.test",user:{id:"employee",role:"admin"}});
  const request=new Request("https://kb.test/api/session",{headers:{cookie:`${cookie.name}=${cookie.value}`}});
  try {
    globalThis.fetch=async (url, init) => {
      assert.equal(url,"https://main.test/api/auth/me");assert.equal(init?.cache,"no-store");
      return Response.json({data:{id:"employee",role:"member",modelAccess:{sites:[]}}});
    };
    assert.deepEqual(allowedModelIds((await assertAppSession(request))?.user),[]);
    globalThis.fetch=async()=>Response.json({data:{id:"another",role:"admin"}});
    await assert.rejects(assertAppSession(request));
    globalThis.fetch=async()=>{throw Error("offline")};await assert.rejects(assertAppSession(request));
  } finally {globalThis.fetch=originalFetch;for(const key of ["REQUIRE_MAIN_APP_SSO","MAIN_APP_URL","KB_CHAT_SESSION_SECRET"]) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test("GPT-6 requires an explicit knowledge-base grant for members", () => {
  const user = (modelKeys: string[]) => ({ role: "member", modelAccess: { sites: [{ siteKey: "kb-chat", mode: "selected", modelKeys }] } });
  assert.deepEqual(allowedModelIds(user(["yunwu-gpt-6"])), ["yunwu-gpt-6"]);
  assert.equal(allowedModelIds(user(["yunwu-gpt-5.6"])).includes("yunwu-gpt-6"), false);
  assert.ok(allowedModelIds({ role: "admin" }).includes("yunwu-gpt-6"));
});
