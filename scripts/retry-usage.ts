import { drainUsageOutbox } from "../lib/server/openlux-reporting";

await drainUsageOutbox();
await globalThis.__kbChatDbPool?.end();
console.log("已尝试补报一批记录；未确认接收的记录继续保留在队列。");
