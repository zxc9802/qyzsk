import assert from "node:assert/strict";
import test from "node:test";

import { parseMessageMarkdown } from "@/lib/client/message-markdown";

test("parseMessageMarkdown renders pipe tables as HTML tables", () => {
  const html = parseMessageMarkdown([
    "字段说明：",
    "",
    "| 字段名称 | 说明 | 示例 |",
    "|---|---|---|",
    "| 日期 | 统计日期 | 2026/07/01 |",
    "| GMV | 昨日成交额 | 1200 |",
  ].join("\n"));

  assert.match(html, /<table>/);
  assert.match(html, /<thead><tr><th>字段名称<\/th><th>说明<\/th><th>示例<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody><tr><td>日期<\/td><td>统计日期<\/td><td>2026\/07\/01<\/td><\/tr>/);
  assert.doesNotMatch(html, /\|---\|---\|---\|/);
});
