/**
 * Markdown -> HTML (경량 정규식 기반)
 *
 * 외부 라이브러리 없이 위키 본문에서 쓰는 안전한 subset만 처리한다.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function processInline(line: string): string {
  let result = escapeHtml(line);

  // `inline code`
  result = result.replace(/`([^`]+?)`/g, "<code>$1</code>");

  // **bold**
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // *italic*
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");

  return result;
}

function normalizeImageSrc(src: string): string | null {
  const trimmed = src.trim();
  if (trimmed.includes("..")) return null;
  if (!/^\/assets\/[A-Za-z0-9/_ .%()-]+\.(webp|png|jpe?g|gif|avif)$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function renderImage(line: string): string | null {
  const imageMatch = line.match(/^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/);
  if (!imageMatch) return null;

  const src = normalizeImageSrc(imageMatch[2]);
  if (!src) return null;

  const alt = escapeHtml(imageMatch[1].trim());
  const caption = escapeHtml((imageMatch[3] ?? imageMatch[1]).trim());
  const captionHtml = caption ? `<figcaption>${caption}</figcaption>` : "";

  return `<figure><img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" decoding="async" />${captionHtml}</figure>`;
}

function isHorizontalRule(line: string): boolean {
  return /^-{3,}\s*$/.test(line.trim());
}

function isHeading(line: string): boolean {
  return /^#{1,4}\s+/.test(line);
}

function markdownHeadingLevel(marker: string): 2 | 3 | 4 {
  if (marker.length <= 2) return 2;
  if (marker.length === 3) return 3;
  return 4;
}

function isUnorderedListItem(line: string): boolean {
  return /^\s*(?:[-*]\s+\S+|-\S+)/.test(line);
}

function isOrderedListItem(line: string): boolean {
  return /^\s*\d+[.)]\s*\S+/.test(line);
}

function isBlockquote(line: string): boolean {
  return /^\s*>\s?/.test(line);
}

function listItemText(line: string, ordered: boolean): string | null {
  if (!ordered) {
    const match =
      line.match(/^\s*[-*]\s+(.+)$/) ?? line.match(/^\s*-(\S.+)$/);
    return match?.[1]?.trim() ?? null;
  }

  const match = line.match(/^\s*\d+[.)]\s*(.+)$/);
  return match?.[1]?.trim() ?? null;
}

function renderList(
  lines: string[],
  startIndex: number,
  ordered: boolean,
): { html: string; nextIndex: number } {
  const tag = ordered ? "ol" : "ul";
  const items: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const text = listItemText(lines[i], ordered);
    if (!text) break;
    items.push(`<li>${processInline(text)}</li>`);
    i++;
  }

  return {
    html: `<${tag}>${items.join("")}</${tag}>`,
    nextIndex: i,
  };
}

function renderBlockquote(
  lines: string[],
  startIndex: number,
): { html: string; nextIndex: number } {
  const quoteLines: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const match = lines[i].match(/^\s*>\s?(.*)$/);
    if (!match) break;
    quoteLines.push(match[1].trim());
    i++;
  }

  const parts = quoteLines
    .filter((line) => line.length > 0)
    .map((line) => `<p>${processInline(line)}</p>`);

  return {
    html: `<blockquote>${parts.join("")}</blockquote>`,
    nextIndex: i,
  };
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableCells(line);
  return (
    cells.length >= 2 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
  );
}

function isTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) return false;
  if (!lines[index].includes("|")) return false;
  if (!isTableSeparator(lines[index + 1])) return false;
  return splitTableCells(lines[index]).length >= 2;
}

function renderTable(
  lines: string[],
  startIndex: number,
): { html: string; nextIndex: number } {
  const headers = splitTableCells(lines[startIndex]);
  const rows: string[][] = [];
  let i = startIndex + 2;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || !line.includes("|")) break;
    if (
      isHeading(line) ||
      isHorizontalRule(line) ||
      renderImage(line.trim()) ||
      isUnorderedListItem(line) ||
      isOrderedListItem(line) ||
      isBlockquote(line)
    ) {
      break;
    }
    rows.push(splitTableCells(line));
    i++;
  }

  const headerHtml = headers
    .map((cell) => `<th>${processInline(cell)}</th>`)
    .join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = headers.map((_, index) => row[index] ?? "");
      return `<tr>${cells
        .map((cell) => `<td>${processInline(cell)}</td>`)
        .join("")}</tr>`;
    })
    .join("");

  return {
    html: `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`,
    nextIndex: i,
  };
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index];
  return (
    isHeading(line) ||
    isHorizontalRule(line) ||
    Boolean(renderImage(line.trim())) ||
    isUnorderedListItem(line) ||
    isOrderedListItem(line) ||
    isBlockquote(line) ||
    isTableStart(lines, index)
  );
}

export function renderMarkdown(content: string): string {
  if (!content) return "";

  const lines = content.split("\n");
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const imageHtml = renderImage(line.trim());
    if (imageHtml) {
      htmlParts.push(imageHtml);
      i++;
      continue;
    }

    // 수평선: ---
    if (isHorizontalRule(line)) {
      htmlParts.push("<hr />");
      i++;
      continue;
    }

    // 제목: #/## -> h2, ### -> h3, #### -> h4
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = markdownHeadingLevel(headingMatch[1]);
      const text = processInline(headingMatch[2]);
      htmlParts.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const rendered = renderTable(lines, i);
      htmlParts.push(rendered.html);
      i = rendered.nextIndex;
      continue;
    }

    if (isUnorderedListItem(line)) {
      const rendered = renderList(lines, i, false);
      htmlParts.push(rendered.html);
      i = rendered.nextIndex;
      continue;
    }

    if (isOrderedListItem(line)) {
      const rendered = renderList(lines, i, true);
      htmlParts.push(rendered.html);
      i = rendered.nextIndex;
      continue;
    }

    if (isBlockquote(line)) {
      const rendered = renderBlockquote(lines, i);
      htmlParts.push(rendered.html);
      i = rendered.nextIndex;
      continue;
    }

    // 빈 줄 -> 문단 구분 (연속 빈 줄 무시)
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 일반 텍스트: 연속 줄을 하나의 문단으로
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !startsBlock(lines, i)
    ) {
      paragraphLines.push(processInline(lines[i]));
      i++;
    }

    if (paragraphLines.length > 0) {
      htmlParts.push(`<p>${paragraphLines.join("<br />")}</p>`);
    }
  }

  return sanitizeHtml(htmlParts.join(""));
}

/** 허용된 HTML 태그만 남기고 나머지 제거 */
function sanitizeHtml(html: string): string {
  const ALLOWED_TAGS =
    /^(h[2-4]|p|br|hr|strong|em|code|figure|figcaption|img|ul|ol|li|blockquote|table|thead|tbody|tr|th|td)$/;
  // self-closing 허용 태그
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tag) => {
    return ALLOWED_TAGS.test(tag.toLowerCase()) ? match : escapeHtml(match);
  });
}
