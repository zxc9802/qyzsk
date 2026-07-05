import type { RetrievalSourceHit } from "@/lib/types";

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(text: string): string {
  return escapeHtmlText(text).replace(/"/g, "&quot;");
}

function normalizeCitationHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
  }
}

function findMatchingWebHit(candidate: string, webHits: RetrievalSourceHit[]): RetrievalSourceHit | undefined {
  const normalizedCandidate = normalizeCitationHost(candidate);
  if (!normalizedCandidate) return undefined;

  return webHits.find((hit) => {
    const hitHost = normalizeCitationHost(hit.siteName || hit.url || "");
    return Boolean(hitHost) && hitHost === normalizedCandidate;
  });
}

function buildInlineCitationHtml(hit: RetrievalSourceHit, label?: string): string {
  const displayLabel = (label?.trim() || hit.siteName || hit.title || "来源").trim();
  const href = escapeHtmlAttr(hit.url || "#");
  const title = escapeHtmlAttr(hit.title);

  return `<a href="${href}" target="_blank" rel="noreferrer" class="inline-citation-badge" title="${title}"><span class="inline-citation-icon" aria-hidden="true">↗</span><span class="inline-citation-label">${escapeHtmlText(displayLabel)}</span></a>`;
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && splitMarkdownTableRow(trimmed).length >= 2;
}

function isMarkdownTableDivider(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function normalizeTableCells(cells: string[], columnCount: number): string[] {
  if (cells.length >= columnCount) return cells;
  return [...cells, ...Array.from({ length: columnCount - cells.length }, () => "")];
}

function renderMarkdownTable(headerCells: string[], bodyRows: string[][]): string {
  const columnCount = Math.max(headerCells.length, ...bodyRows.map((row) => row.length));
  const headers = normalizeTableCells(headerCells, columnCount)
    .map((cell) => `<th>${cell}</th>`)
    .join("");
  const rows = bodyRows
    .map((row) => {
      const cells = normalizeTableCells(row, columnCount)
        .map((cell) => `<td>${cell}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<div class="markdown-table-scroll"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderMarkdownTables(html: string): string {
  const lines = html.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];

    if (nextLine !== undefined && isMarkdownTableRow(line) && isMarkdownTableDivider(nextLine)) {
      const headerCells = splitMarkdownTableRow(line);
      const bodyRows: string[][] = [];
      index += 2;

      while (index < lines.length && isMarkdownTableRow(lines[index])) {
        bodyRows.push(splitMarkdownTableRow(lines[index]));
        index += 1;
      }

      output.push("", renderMarkdownTable(headerCells, bodyRows), "");
      index -= 1;
      continue;
    }

    output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function parseMessageMarkdown(
  text: string,
  webHits: RetrievalSourceHit[] = [],
  usedWebHitIds?: Set<string>
): string {
  const placeholders: string[] = [];
  const storePlaceholder = (value: string) => {
    const token = `__HTML_PLACEHOLDER_${placeholders.length}__`;
    placeholders.push(value);
    return token;
  };
  const trackWebHit = (hit?: RetrievalSourceHit) => {
    if (hit) {
      usedWebHitIds?.add(hit.id);
    }
  };

  let html = text
    .replace(
      /[（(]\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*[)）]/g,
      (_, label: string, url: string) => {
        const hit = findMatchingWebHit(url, webHits);
        if (!hit) return storePlaceholder(
          `<a href="${escapeHtmlAttr(url)}" target="_blank" rel="noreferrer" class="inline-source-link">${escapeHtmlText(label)}</a>`
        );
        trackWebHit(hit);
        return storePlaceholder(buildInlineCitationHtml(hit, label));
      }
    )
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label: string, url: string) => {
      const hit = findMatchingWebHit(url, webHits);
      if (!hit) {
        return storePlaceholder(
          `<a href="${escapeHtmlAttr(url)}" target="_blank" rel="noreferrer" class="inline-source-link">${escapeHtmlText(label)}</a>`
        );
      }

      trackWebHit(hit);
      return storePlaceholder(buildInlineCitationHtml(hit, label));
    })
    .replace(/[（(]\s*([a-z0-9.-]+\.[a-z]{2,})\s*[)）]/gi, (match, host: string) => {
      const hit = findMatchingWebHit(host, webHits);
      if (!hit) return match;

      trackWebHit(hit);
      return storePlaceholder(buildInlineCitationHtml(hit, host));
    });

  html = escapeHtmlText(html);

  html = html.replace(/^---$/gm, "<hr />");
  html = html.replace(/^#{1,6}\s*(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  html = html.replace(/^[*\-] (.+)$/gm, '<li class="md-ul">$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-ol">$1</li>');
  html = html.replace(/((?:<li class="md-ul">.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(/((?:<li class="md-ol">.*<\/li>\n?)+)/g, "<ol>$1</ol>");
  html = html.replace(/ class="md-ul"/g, "").replace(/ class="md-ol"/g, "");

  html = renderMarkdownTables(html);

  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;

  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/<p>\s*(<h3>)/g, "$1");
  html = html.replace(/(<\/h3>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ol>)/g, "$1");
  html = html.replace(/(<\/ol>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<blockquote>)/g, "$1");
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<hr \/>)/g, "$1");
  html = html.replace(/(<hr \/>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<div class="markdown-table-scroll">[\s\S]*?<\/div>)\s*<\/p>/g, "$1");

  placeholders.forEach((placeholder, index) => {
    html = html.replaceAll(`__HTML_PLACEHOLDER_${index}__`, placeholder);
  });

  return html;
}
