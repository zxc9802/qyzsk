import assert from "node:assert/strict";
import test from "node:test";
import type { ChatStatePayload } from "@/lib/chat-state";
import {
  getLegacyChatState,
  mergeConversationsByUpdatedAt,
} from "@/lib/storage";

function createStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));

  return {
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  } as Storage;
}

function withWindowStorage<T>(storage: Storage, callback: () => T) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });

  try {
    return callback();
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

test("getLegacyChatState reads the old browser localStorage payload", () => {
  const legacyState: ChatStatePayload = {
    conversations: [
      {
        id: "legacy-1",
        title: "旧对话",
        messages: [
          {
            id: "message-1",
            role: "user",
            content: "旧问题",
            timestamp: 1,
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    activeId: "legacy-1",
    settings: {
      role: "new",
      roleName: "新员工",
      themeMode: "dark",
    },
  };
  const storage = createStorage({
    "kb-chat-conversations": JSON.stringify(legacyState.conversations),
    "kb-chat-active": legacyState.activeId!,
    "kb-chat-settings": JSON.stringify(legacyState.settings),
  });

  const result = withWindowStorage(storage, () => getLegacyChatState());

  assert.deepEqual(result, legacyState);
});

test("mergeConversationsByUpdatedAt keeps newer server records and restores missing legacy records", () => {
  const merged = mergeConversationsByUpdatedAt(
    [
      {
        id: "same",
        title: "服务器新版",
        messages: [],
        createdAt: 1,
        updatedAt: 10,
      },
    ],
    [
      {
        id: "same",
        title: "浏览器旧版",
        messages: [],
        createdAt: 1,
        updatedAt: 5,
      },
      {
        id: "legacy-only",
        title: "只在浏览器",
        messages: [],
        createdAt: 2,
        updatedAt: 8,
      },
    ]
  );

  assert.deepEqual(merged.map((conversation) => conversation.id), ["same", "legacy-only"]);
  assert.equal(merged[0].title, "服务器新版");
  assert.equal(merged[1].title, "只在浏览器");
});
