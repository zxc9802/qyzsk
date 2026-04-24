import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

async function importChatStateStoreModule() {
  const modulePath = pathToFileURL(path.join(REPO_ROOT, "lib/server/chat-state-store.ts")).href;
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
    return;
  }

  Object.defineProperty(process.env, "NODE_ENV", {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

async function withProductionFileState<T>(callback: () => Promise<T>) {
  const previousCwd = process.cwd();
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kb-chat-state-store-"));

  process.chdir(tempDir);
  setNodeEnv("production");
  delete process.env.DATABASE_URL;

  try {
    return await callback();
  } finally {
    process.chdir(previousCwd);
    setNodeEnv(previousNodeEnv);

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
}

test("uses the file state store in production when DATABASE_URL is not configured", async () => {
  await withProductionFileState(async () => {
    const { getUserChatState, saveUserChatState } = await importChatStateStoreModule();

    const initialState = await getUserChatState("prod-user");
    assert.deepEqual(initialState, {
      conversations: [],
      activeId: null,
      settings: null,
    });

    await saveUserChatState("prod-user", {
      conversations: [
        {
          id: "c1",
          title: "线上测试",
          messages: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      activeId: "c1",
      settings: {
        role: "new",
        roleName: "新员工",
        chatModelId: "gemini-3.1-pro-preview",
        answerMode: "deep",
        knowledgeMode: "wiki_first",
        themeMode: "dark",
        webSearchEnabled: true,
      },
      clientUpdatedAt: 2,
    });

    const savedState = await getUserChatState("prod-user");
    assert.equal(savedState.activeId, "c1");
    assert.equal(savedState.conversations.length, 1);
    assert.equal(savedState.settings?.themeMode, "dark");
    assert.equal(savedState.settings?.chatModelId, "gemini-3.1-pro-preview");
    assert.equal(savedState.settings?.webSearchEnabled, true);
  });
});
