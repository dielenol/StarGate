/**
 * Markdown -> HTML (경량 정규식 기반)
 *
 * 외부 라이브러리 없이 위키 본문에서 쓰는 안전한 subset만 처리한다.
 */

export type MarkdownLinkKind = "wiki" | "catalog" | "personnel" | "report";

export interface MarkdownLinkTarget {
  explicitKeywords?: Array<string | null | undefined>;
  href: string;
  keywords: Array<string | null | undefined>;
  kind: MarkdownLinkKind;
  priority?: number;
  title?: string;
}

export interface RenderMarkdownOptions {
  links?: MarkdownLinkTarget[];
  maxAutoLinksPerTarget?: number;
  maxAutoLinksTotal?: number;
}

interface AutoLinkEntry {
  href: string;
  keyword: string;
  kind: MarkdownLinkKind;
  priority: number;
  title?: string;
}

interface InlineContext {
  entries: AutoLinkEntry[];
  explicitMap: Map<string, AutoLinkEntry>;
  linkedByHref: Map<string, number>;
  maxAutoLinksPerTarget: number;
  maxAutoLinksTotal: number;
  totalAutoLinks: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeLinkKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSafeInternalHref(href: string): boolean {
  return /^\/erp\/[A-Za-z0-9/_:%?&=+.,#-]+$/u.test(href);
}

function createAnchor(labelHtml: string, entry: AutoLinkEntry): string {
  const title = entry.title ? ` title="${escapeHtml(entry.title)}"` : "";
  return `<a href="${escapeHtml(entry.href)}" data-link-kind="${entry.kind}"${title}>${labelHtml}</a>`;
}

function linkKindAliases(kind: string): string[] {
  switch (kind) {
    case "wiki":
      return ["wiki", "위키"];
    case "catalog":
      return ["catalog", "item", "카탈로그"];
    case "personnel":
      return ["personnel", "dossier", "신원조회", "인물"];
    case "report":
      return ["report", "operation", "작전보고서", "보고서"];
    default:
      return [kind];
  }
}

function shouldReplaceEntry(
  current: AutoLinkEntry | undefined,
  next: AutoLinkEntry,
): boolean {
  return (
    !current ||
    next.priority > current.priority ||
    (next.priority === current.priority &&
      next.keyword.length > current.keyword.length)
  );
}

function setExplicitEntry(
  explicitMap: Map<string, AutoLinkEntry>,
  key: string,
  entry: AutoLinkEntry,
): void {
  if (shouldReplaceEntry(explicitMap.get(key), entry)) {
    explicitMap.set(key, entry);
  }
}

function addExplicitKeyword(
  explicitMap: Map<string, AutoLinkEntry>,
  target: MarkdownLinkTarget,
  rawKeyword: string | null | undefined,
  priority: number,
): void {
  const keyword = rawKeyword?.trim();
  if (!keyword) return;

  const key = normalizeLinkKey(keyword);
  if (!key) return;

  const entry: AutoLinkEntry = {
    href: target.href,
    keyword,
    kind: target.kind,
    priority,
    title: target.title,
  };

  for (const kindAlias of linkKindAliases(target.kind)) {
    setExplicitEntry(explicitMap, `${kindAlias}:${key}`, entry);
  }
  setExplicitEntry(explicitMap, key, entry);
}

function buildInlineContext(options?: RenderMarkdownOptions): InlineContext {
  const byKeyword = new Map<string, AutoLinkEntry>();
  const explicitMap = new Map<string, AutoLinkEntry>();

  for (const target of options?.links ?? []) {
    if (!isSafeInternalHref(target.href)) continue;
    const priority = target.priority ?? 0;
    for (const rawKeyword of target.keywords) {
      const keyword = rawKeyword?.trim();
      if (!keyword) continue;

      const key = normalizeLinkKey(keyword);
      if (!key) continue;

      const entry: AutoLinkEntry = {
        href: target.href,
        keyword,
        kind: target.kind,
        priority,
        title: target.title,
      };
      const existing = byKeyword.get(key);
      if (shouldReplaceEntry(existing, entry)) {
        byKeyword.set(key, entry);
      }

      addExplicitKeyword(explicitMap, target, keyword, priority);
    }

    for (const rawKeyword of target.explicitKeywords ?? []) {
      addExplicitKeyword(explicitMap, target, rawKeyword, priority);
    }
  }

  return {
    entries: [...byKeyword.values()].sort((left, right) => {
      if (right.keyword.length !== left.keyword.length) {
        return right.keyword.length - left.keyword.length;
      }
      if (right.priority !== left.priority) return right.priority - left.priority;
      return left.keyword.localeCompare(right.keyword, "ko");
    }),
    explicitMap,
    linkedByHref: new Map(),
    maxAutoLinksPerTarget: options?.maxAutoLinksPerTarget ?? 2,
    maxAutoLinksTotal: options?.maxAutoLinksTotal ?? 48,
    totalAutoLinks: 0,
  };
}

function explicitLinkEntry(rawKey: string, context: InlineContext): AutoLinkEntry | null {
  const normalized = normalizeLinkKey(rawKey);
  const qualified = normalized.match(/^([a-z가-힣]+):(.+)$/iu);
  if (qualified) {
    const kind = normalizeLinkKey(qualified[1]);
    const key = normalizeLinkKey(qualified[2]);
    return context.explicitMap.get(`${kind}:${key}`) ?? null;
  }

  return context.explicitMap.get(normalized) ?? null;
}

function protectHtml(html: string, tokens: string[]): string {
  const token = `\uE000${tokens.length}\uE001`;
  tokens.push(html);
  return token;
}

function restoreProtectedHtml(value: string, tokens: string[]): string {
  return value.replace(/\uE000(\d+)\uE001/g, (match, index) => {
    return tokens[Number(index)] ?? match;
  });
}

function applyExplicitLinks(text: string, context: InlineContext, tokens: string[]): string {
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (match, rawKey, rawLabel) => {
    const entry = explicitLinkEntry(rawKey, context);
    if (!entry) return match;

    const label = String(rawLabel ?? rawKey).trim();
    if (!label) return match;
    return protectHtml(createAnchor(label, entry), tokens);
  });
}

function isAsciiBoundarySensitive(keyword: string): boolean {
  return /^[A-Za-z0-9_-]+$/u.test(keyword);
}

function isWordLike(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}_-]/u.test(value));
}

function canLinkMatch(
  text: string,
  matchIndex: number,
  matchValue: string,
  keyword: string,
): boolean {
  if (!isAsciiBoundarySensitive(keyword)) return true;

  const before = matchIndex > 0 ? text[matchIndex - 1] : undefined;
  const afterIndex = matchIndex + matchValue.length;
  const after = afterIndex < text.length ? text[afterIndex] : undefined;
  return !isWordLike(before) && !isWordLike(after);
}

function applyAutoLinks(text: string, context: InlineContext, tokens: string[]): string {
  let result = text;

  for (const entry of context.entries) {
    if (context.totalAutoLinks >= context.maxAutoLinksTotal) break;
    if ((context.linkedByHref.get(entry.href) ?? 0) >= context.maxAutoLinksPerTarget) {
      continue;
    }

    const keywordHtml = escapeHtml(entry.keyword);
    const pattern = new RegExp(escapeRegExp(keywordHtml), "giu");

    result = result.replace(pattern, (match, offset, source) => {
      if (context.totalAutoLinks >= context.maxAutoLinksTotal) return match;
      if ((context.linkedByHref.get(entry.href) ?? 0) >= context.maxAutoLinksPerTarget) {
        return match;
      }
      if (!canLinkMatch(source, offset, match, keywordHtml)) return match;

      context.linkedByHref.set(entry.href, (context.linkedByHref.get(entry.href) ?? 0) + 1);
      context.totalAutoLinks += 1;
      return protectHtml(createAnchor(match, entry), tokens);
    });
  }

  return result;
}

function processTextSegment(segment: string, context?: InlineContext): string {
  let result = escapeHtml(segment);
  const tokens: string[] = [];

  if (context) {
    result = applyExplicitLinks(result, context, tokens);
    result = applyAutoLinks(result, context, tokens);
  }


  // **bold**
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // *italic*
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");

  return restoreProtectedHtml(result, tokens);
}

function processInline(line: string, context?: InlineContext): string {
  const parts = line.split(/(`[^`]+`)/g);

  return parts
    .map((part) => {
      if (/^`[^`]+`$/u.test(part)) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return processTextSegment(part, context);
    })
    .join("");
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
  context?: InlineContext,
): { html: string; nextIndex: number } {
  const tag = ordered ? "ol" : "ul";
  const items: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const text = listItemText(lines[i], ordered);
    if (text) {
      items.push(`<li>${processInline(text, context)}</li>`);
      i++;
      continue;
    }

    if (
      lines[i].trim() === "" &&
      i + 1 < lines.length &&
      listItemText(lines[i + 1], ordered)
    ) {
      i++;
      continue;
    }

    break;
  }

  return {
    html: `<${tag}>${items.join("")}</${tag}>`,
    nextIndex: i,
  };
}

function renderBlockquote(
  lines: string[],
  startIndex: number,
  context?: InlineContext,
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
    .map((line) => `<p>${processInline(line, context)}</p>`);

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
  context?: InlineContext,
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
    .map((cell) => `<th>${processInline(cell, context)}</th>`)
    .join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = headers.map((_, index) => row[index] ?? "");
      return `<tr>${cells
        .map((cell) => `<td>${processInline(cell, context)}</td>`)
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

export function renderMarkdown(content: string, options?: RenderMarkdownOptions): string {
  if (!content) return "";

  const inlineContext = buildInlineContext(options);
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
      const rendered = renderTable(lines, i, inlineContext);
      htmlParts.push(rendered.html);
      i = rendered.nextIndex;
      continue;
    }

    if (isUnorderedListItem(line)) {
      const rendered = renderList(lines, i, false, inlineContext);
      htmlParts.push(rendered.html);
      i = rendered.nextIndex;
      continue;
    }

    if (isOrderedListItem(line)) {
      const rendered = renderList(lines, i, true, inlineContext);
      htmlParts.push(rendered.html);
      i = rendered.nextIndex;
      continue;
    }

    if (isBlockquote(line)) {
      const rendered = renderBlockquote(lines, i, inlineContext);
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
      paragraphLines.push(processInline(lines[i], inlineContext));
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
    /^(h[2-4]|p|br|hr|strong|em|code|a|figure|figcaption|img|ul|ol|li|blockquote|table|thead|tbody|tr|th|td)$/;
  // self-closing 허용 태그
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tag) => {
    return ALLOWED_TAGS.test(tag.toLowerCase()) ? match : escapeHtml(match);
  });
}
