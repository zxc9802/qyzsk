export const UPLOAD_FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.gif";
export const UPLOAD_FILE_ACCEPT_LABEL = "PDF、Word、TXT、Markdown、PNG、JPG、WEBP、GIF、MP4、WEBM、MOV";

export type UploadKind = "document" | "image" | "video";

export const FILE_LIMITS: Record<UploadKind, number> = {
  document: 100 * 1024 * 1024,
  image: 20 * 1024 * 1024,
  video: 500 * 1024 * 1024,
};

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function inferAcceptedUploadKind(fileName: string): UploadKind | null {
  const extension = `.${fileName.split(".").pop()?.toLowerCase() || ""}`;
  if ([".pdf", ".doc", ".docx", ".txt", ".md"].includes(extension)) return "document";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) return "image";
  if ([".mp4", ".webm", ".mov"].includes(extension)) return "video";
  return null;
}

export function inspectUploadFile(file: File): { ok: true; kind: UploadKind } | { ok: false; error: string } {
  const kind = inferAcceptedUploadKind(file.name);
  if (!kind) {
    return {
      ok: false,
      error: `暂不支持 ${file.name}。当前支持 ${UPLOAD_FILE_ACCEPT_LABEL}。`,
    };
  }

  if (file.size > FILE_LIMITS[kind]) {
    const label = kind === "video" ? "视频" : kind === "image" ? "图片" : "文档";
    return {
      ok: false,
      error: `${file.name} 太大了。当前${label}上限是 ${formatBytes(FILE_LIMITS[kind])}。`,
    };
  }

  return { ok: true, kind };
}

export function partitionUploadFiles(files: File[]) {
  const accepted: File[] = [];
  const rejected: string[] = [];

  for (const file of files) {
    const inspected = inspectUploadFile(file);
    if (inspected.ok) {
      accepted.push(file);
    } else {
      rejected.push(inspected.error);
    }
  }

  return { accepted, rejected };
}

export function filterAcceptedFiles(files: File[], accept = UPLOAD_FILE_ACCEPT): File[] {
  const allowed = new Set(
    accept
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );

  return files.filter((file) => {
    const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
    return allowed.has(extension);
  });
}

export function collectDroppedFiles(dataTransfer: DataTransfer | null, accept = UPLOAD_FILE_ACCEPT): File[] {
  return filterAcceptedFiles(Array.from(dataTransfer?.files || []), accept);
}
