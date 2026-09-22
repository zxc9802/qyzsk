import assert from "node:assert/strict";
import test from "node:test";
import { readSseData } from "@/lib/sse";

test("SSE parsing preserves JSON and Chinese split across byte boundaries", async () => {
  const bytes = new TextEncoder().encode(': heartbeat\r\n\r\nevent: message\r\ndata: {"content":"你好"}\r\n\r\ndata: first\r\ndata: second\r\n\r\ndata: [DONE]\r\n\r\n');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events = [];
  for await (const event of readSseData(body)) events.push(event);
  assert.deepEqual(events, ['{"content":"你好"}', 'first\nsecond', '[DONE]']);
});

test("stopping SSE consumption cancels the upstream reader", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: first\n\n')); },
    cancel() { cancelled = true; },
  });
  for await (const event of readSseData(body)) {
    assert.equal(event, "first");
    break;
  }
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});
