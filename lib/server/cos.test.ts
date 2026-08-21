import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationFilePosterKey,
  conversationFileSourceKey,
  cosKeyPrefix,
  getCosConfig,
  isCosConfigured,
  joinPublicCosUrl,
  sanitizeCosKeyPart,
  shouldStoreOnCos,
  wikiMediaPosterKey,
  wikiMediaSourceKey,
} from "./cos";

const COS_ENV_KEYS = [
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
  "COS_BUCKET",
  "COS_REGION",
  "COS_PUBLIC_BASE_URL",
  "COS_SIGN_EXPIRES",
  "COS_KEY_PREFIX",
  "COS_OBJECT_ACL",
] as const;

function withCosEnv(env: Partial<Record<string, string>>, run: () => void) {
  const previous = Object.fromEntries(COS_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of COS_ENV_KEYS) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const key of COS_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("COS stays disabled until the four required env vars are set", () => {
  withCosEnv({}, () => {
    assert.equal(isCosConfigured(), false);
    assert.equal(getCosConfig(), null);
    assert.equal(shouldStoreOnCos("image"), false);
    assert.equal(shouldStoreOnCos("video"), false);
  });

  withCosEnv(
    {
      COS_SECRET_ID: "AKIDxxx",
      COS_SECRET_KEY: "secret",
      COS_BUCKET: "kb-chat-1250000000",
    },
    () => {
      assert.equal(isCosConfigured(), false);
    }
  );

  withCosEnv(
    {
      COS_SECRET_ID: "AKIDxxx",
      COS_SECRET_KEY: "secret",
      COS_BUCKET: "kb-chat-1250000000",
      COS_REGION: "ap-guangzhou",
      COS_PUBLIC_BASE_URL: "https://cdn.example.com/",
      COS_SIGN_EXPIRES: "120",
      COS_KEY_PREFIX: "/media/",
    },
    () => {
      assert.equal(isCosConfigured(), true);
      assert.deepEqual(getCosConfig(), {
        secretId: "AKIDxxx",
        secretKey: "secret",
        bucket: "kb-chat-1250000000",
        region: "ap-guangzhou",
        publicBaseUrl: "https://cdn.example.com",
        signExpires: 120,
        keyPrefix: "media",
        objectAcl: undefined,
      });
      assert.equal(shouldStoreOnCos("image"), true);
      assert.equal(shouldStoreOnCos("video"), true);
      assert.equal(shouldStoreOnCos("document"), false);
    }
  );
});

test("COS object keys stay under the configured prefix and drop unsafe characters", () => {
  withCosEnv({ COS_KEY_PREFIX: "kb-prod" }, () => {
    assert.equal(cosKeyPrefix(), "kb-prod");
    assert.equal(sanitizeCosKeyPart("bad name!.png"), "badname.png");
    assert.equal(wikiMediaSourceKey("media_1", "source.png"), "kb-prod/wiki/media/media_1/source.png");
    assert.equal(wikiMediaPosterKey("media_1"), "kb-prod/wiki/media/media_1/poster.jpg");
    assert.equal(
      conversationFileSourceKey("user/1", "conv-2", "file-3", "source.mp4"),
      "kb-prod/conversations/user1/conv-2/file-3/source.mp4"
    );
    assert.equal(
      conversationFilePosterKey("user/1", "conv-2", "file-3"),
      "kb-prod/conversations/user1/conv-2/file-3/poster.jpg"
    );
  });
});

test("public COS URLs join the CDN host and object key", () => {
  assert.equal(
    joinPublicCosUrl("https://cdn.example.com/", "/kb-chat/wiki/media/a/source.png"),
    "https://cdn.example.com/kb-chat/wiki/media/a/source.png"
  );
});
