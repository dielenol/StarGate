/**
 * Markdown -> HTML (경량 정규식 기반)
 *
 * 외부 라이브러리 없이 제목/볼드/이탤릭/수평선/줄바꿈만 처리한다.
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

  // **bold**
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // *italic*
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");

  return result;
}

export function renderMarkdown(content: string): string {
  if (!content) return "";

  const lines = content.split("\n");
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 수평선: ---
    if (/^-{3,}\s*$/.test(line)) {
      htmlParts.push("<hr />");
      i++;
      continue;
    }

    // 제목: ### h4, ## h3, # h2
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length + 1; // # -> h2, ## -> h3, ### -> h4
      const text = processInline(headingMatch[2]);
      htmlParts.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // 빈 줄 -> 문단 구분 (연속 빈 줄 무시)
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 일반 텍스트: 연속 줄을 하나의 문단으로
    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^#{1,3}\s/.test(lines[i]) && !/^-{3,}\s*$/.test(lines[i])) {
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
  const ALLOWED_TAGS = /^(h[2-4]|p|br|hr|strong|em)$/;
  // self-closing 허용 태그
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tag) => {
    return ALLOWED_TAGS.test(tag.toLowerCase()) ? match : escapeHtml(match);
  });
}
