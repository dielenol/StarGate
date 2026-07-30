"use client";

import { useEffect, useMemo, useRef } from "react";

import { useInternalLinkPendingNavigation } from "@/components/erp/NavPending/useInternalLinkPendingNavigation";
import { useWikiPage } from "@/hooks/queries/useWikiQuery";
import type { WikiPageClient } from "@/types/wiki";
import type { MarkdownLinkTarget } from "@/lib/wiki-render";
import { renderMarkdown } from "@/lib/wiki-render";

import { wikiArticleContent } from "../wiki-display";

import styles from "./page.module.css";

interface TocEntry {
  id: string;
  level: 2 | 3 | 4;
  text: string;
}

interface Props {
  initialPage: WikiPageClient;
  links: MarkdownLinkTarget[];
}

function extractToc(content: string): TocEntry[] {
  if (!content) return [];
  const entries: TocEntry[] = [];
  let counter = 0;
  for (const line of content.split("\n")) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (!match) continue;
    const level = (
      match[1].length <= 2 ? 2 : match[1].length === 3 ? 3 : 4
    ) as 2 | 3 | 4;
    const text = match[2]
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .trim();
    entries.push({ id: `wiki-h-${counter}`, level, text });
    counter += 1;
  }
  return entries;
}

/**
 * 위키 본문 렌더러 (서버에서 생성된 sanitized HTML 삽입 + 클라이언트에서 heading id 주입)
 *
 * `lib/wiki-render.ts` 의 sanitizer 는 id 속성을 허용하지 않으므로,
 * 마운트 직후 heading 요소에 id 를 직접 부여하여 TOC anchor 링크가 동작하게 한다.
 */
export default function WikiDetailContent({ initialPage, links }: Props) {
  const { data: page = initialPage } = useWikiPage(initialPage._id, {
    initialData: initialPage,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleInternalLinkClick = useInternalLinkPendingNavigation();
  const articleContent = useMemo(
    () => wikiArticleContent(page.content, page.title),
    [page.content, page.title],
  );
  const toc = useMemo(() => extractToc(articleContent), [articleContent]);
  const html = useMemo(
    () =>
      renderMarkdown(articleContent, {
        links,
        maxAutoLinksPerTarget: 2,
        maxAutoLinksTotal: 48,
      }),
    [articleContent, links],
  );

  const tocIdMap = useMemo(() => {
    const map = new Map<string, { id: string; level: number }[]>();
    for (const entry of toc) {
      const key = `h${entry.level}:${entry.text}`;
      const list = map.get(key) ?? [];
      list.push({ id: entry.id, level: entry.level });
      map.set(key, list);
    }
    return map;
  }, [toc]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // 각 heading 태그를 순회하며 TOC 의 id 를 순서대로 부여
    const counter = new Map<string, number>();
    const headings = root.querySelectorAll("h2, h3, h4");
    for (const el of Array.from(headings)) {
      const level = Number(el.tagName.substring(1));
      const text = el.textContent?.trim() ?? "";
      const key = `h${level}:${text}`;
      const list = tocIdMap.get(key);
      if (!list || list.length === 0) continue;
      const idx = counter.get(key) ?? 0;
      const match = list[idx];
      if (match) {
        el.setAttribute("id", match.id);
        counter.set(key, idx + 1);
      }
    }
  }, [html, tocIdMap]);

  return (
    <div
      ref={rootRef}
      className={styles.content}
      onClick={handleInternalLinkClick}
      // html 은 `lib/wiki-render.ts` 의 sanitizeHtml 을 통과한 결과물
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
