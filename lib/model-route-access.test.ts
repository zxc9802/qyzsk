import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { allowedModelIds } from "@/lib/model-access";
import * as models from "@/lib/chat-models";

function loadRoute(file: string, user: Record<string, unknown>) {
  const loaded = { exports: {} as { POST: (req: Request) => Promise<Response> } };
  const stubs: Record<string, unknown> = {
    "@/lib/model-access": { allowedModelIds },
    "@/lib/chat-models": models,
    "@/lib/server/app-session": { assertAppUserSession: async () => ({ userId: "member", session: { user }, user }), appSessionErrorResponse: () => Response.json({}, {status:401}) },
    "@/lib/kb-chat-role-access": { parseKbChatRoleAccess: () => ({}), canUseKbChatRole: () => true },
  };
  const compiled = ts.transpileModule(fs.readFileSync(file,"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const forbidden = new Proxy({}, {get: () => () => {throw Error("Downstream operation before authorization");}});
  new Function("require","module","exports",compiled)((name: string) => stubs[name] || forbidden,loaded,loaded.exports);
  return loaded.exports;
}

test("chat and reports deny unauthorized model before persistence or provider calls", async () => {
  const user = {role:"member",modelAccess:{sites:[{siteKey:"kb-chat",mode:"selected",modelKeys:["yunwu-gpt-5.6"]}]}};
  const body = {message:"test",role:"new",conversationId:"test",conversationTitle:"test",messages:[],roleId:"new",roleName:"test",answerMode:"simple",modelId:"gemini-3.1-pro-preview",user:{role:"admin"}};
  const send = (route: ReturnType<typeof loadRoute>, data: unknown) => route.POST(new Request("https://kb.test/api/chat",{method:"POST",body:JSON.stringify(data)}));
  assert.equal((await send(loadRoute("app/api/chat/route.ts",user),body)).status,403);
  assert.equal((await send(loadRoute("app/api/report/route.ts",user),body)).status,403);
  // An allowed chat model does not authorize the report's fixed Gemini model.
  assert.equal((await send(loadRoute("app/api/report/route.ts",user),{...body,modelId:"yunwu-gpt-5.6"})).status,403);
});
