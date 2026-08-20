import assert from "node:assert/strict";
import test from "node:test";
import { filterAcceptedFiles, inspectUploadFile, partitionUploadFiles } from "@/lib/upload-accept";

test("filterAcceptedFiles keeps supported documents, images, and videos", () => {
  const files = [
    new File(["a"], "复盘.docx"),
    new File(["b"], "后台.png"),
    new File(["c"], "讲解.mp4"),
    new File(["d"], "notes.exe"),
  ];

  assert.deepEqual(
    filterAcceptedFiles(files).map((file) => file.name),
    ["复盘.docx", "后台.png", "讲解.mp4"]
  );
});

test("inspectUploadFile rejects unsupported and oversized files before upload", () => {
  const unsupported = inspectUploadFile(new File(["x"], "virus.exe"));
  assert.equal(unsupported.ok, false);

  const oversized = inspectUploadFile(new File([new Uint8Array(21 * 1024 * 1024)], "huge.png"));
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.match(oversized.error, /太大了/);
  }

  const ok = inspectUploadFile(new File(["ok"], "note.txt"));
  assert.deepEqual(ok, { ok: true, kind: "document" });
});

test("partitionUploadFiles keeps valid files and reports rejects", () => {
  const { accepted, rejected } = partitionUploadFiles([
    new File(["ok"], "note.txt"),
    new File(["x"], "bad.exe"),
  ]);
  assert.deepEqual(accepted.map((file) => file.name), ["note.txt"]);
  assert.equal(rejected.length, 1);
});
