import { getFileSegments, listConversationFiles } from "@/lib/server/file-store";

const MAX_FILES_IN_CONTEXT = 3;
const MAX_SEGMENTS_PER_FILE = 2;
const MAX_CONTEXT_CHARS = 9000;
const MAX_FILES_IN_DIAGNOSIS = 2;
const MAX_SEGMENTS_PER_FILE_IN_DIAGNOSIS = 1;
const MAX_DIAGNOSIS_CONTEXT_CHARS = 2800;

export async function buildConversationFileContext(
  conversationId: string,
  query: string
): Promise<string> {
  const activeFiles = (await listConversationFiles(conversationId))
    .filter((file) => file.active && file.status === "ready")
    .slice(0, MAX_FILES_IN_CONTEXT);

  if (activeFiles.length === 0) return "";

  const terms = buildSearchTerms(query);
  const blocks: string[] = [];
  let budget = MAX_CONTEXT_CHARS;

  for (const file of activeFiles) {
    const segments = await getFileSegments(conversationId, file.id);
    const selectedSegments = selectRelevantSegments(segments, terms).slice(0, MAX_SEGMENTS_PER_FILE);

    const lines = [
      `文件名称：${file.name}`,
      `文件类型：${file.kind}`,
      `文件摘要：${file.summary || "暂无摘要。"}`,
    ];

    if (selectedSegments.length > 0) {
      lines.push("相关片段：");
      selectedSegments.forEach((segment) => {
        lines.push(`- ${segment.label}：${trimTo(segment.content, 520)}`);
      });
    }

    const block = lines.join("\n");
    if (block.length > budget) break;
    blocks.push(block);
    budget -= block.length;
  }

  if (blocks.length === 0) return "";

  return `以下是当前会话里用户上传并保持激活的资料摘要。它们只是后台参考资料，不要把内部片段标签原样展示给用户。只有当这些资料和问题有关时再使用。\n\n${blocks.join("\n\n---\n\n")}`;
}

export async function buildConversationFileDiagnosisContext(
  conversationId: string,
  query: string
): Promise<string> {
  const activeFiles = (await listConversationFiles(conversationId))
    .filter((file) => file.active && file.status === "ready")
    .slice(0, MAX_FILES_IN_DIAGNOSIS);

  if (activeFiles.length === 0) return "";

  const terms = buildSearchTerms(query);
  const blocks: string[] = [];
  let budget = MAX_DIAGNOSIS_CONTEXT_CHARS;

  for (const file of activeFiles) {
    const segments = await getFileSegments(conversationId, file.id);
    const selectedSegments = selectRelevantSegments(segments, terms).slice(0, MAX_SEGMENTS_PER_FILE_IN_DIAGNOSIS);
    const lines = [
      `文件名称：${file.name}`,
      `文件类型：${file.kind}`,
      `文件摘要：${trimTo(file.summary || file.excerpt || "暂无摘要。", 900)}`,
    ];

    if (selectedSegments.length > 0) {
      lines.push("最相关片段：");
      selectedSegments.forEach((segment) => {
        lines.push(`- ${segment.label}：${trimTo(segment.content, 320)}`);
      });
    }

    const block = lines.join("\n");
    if (block.length > budget) break;
    blocks.push(block);
    budget -= block.length;
  }

  if (blocks.length === 0) return "";

  return `当前会话已上传并激活的资料如下。既然这些资料已经存在，就不能再把用户当成“没有上传文档/没有给内容”。如果用户说“这个文档”“这份资料”，默认优先指向这些资料。\n\n${blocks.join("\n\n---\n\n")}`;
}

function selectRelevantSegments<T extends { content: string; label: string; segmentType: string }>(
  segments: T[],
  terms: string[]
): T[] {
  return [...segments]
    .map((segment) => ({
      segment,
      score: scoreSegment(`${segment.label}\n${segment.content}`, terms, segment.segmentType),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.segment);
}

function scoreSegment(text: string, terms: string[], segmentType: string): number {
  const normalized = normalize(text);
  let score = segmentType === "summary" ? 1 : 0;

  for (const term of terms) {
    if (!term) continue;
    if (normalized.includes(term)) {
      score += term.length >= 4 ? 5 : 2;
    }
  }

  return score;
}

function buildSearchTerms(query: string): string[] {
  const normalized = normalize(query);
  const terms = new Set<string>();

  normalized
    .split(/[^\p{L}\p{N}\u4e00-\u9fff]+/u)
    .filter((item) => item.length >= 2)
    .forEach((item) => terms.add(item));

  const hanMatches = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  hanMatches.forEach((part) => {
    terms.add(part);
    if (part.length > 2) {
      for (let index = 0; index < part.length - 1; index += 1) {
        terms.add(part.slice(index, index + 2));
      }
    }
  });

  return Array.from(terms).slice(0, 24);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function trimTo(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}
