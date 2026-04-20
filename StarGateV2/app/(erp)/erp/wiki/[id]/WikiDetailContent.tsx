"use client";

import { useEffect, useMemo, useRef } from "react";

import styles from "./page.module.css";

interface TocEntry {
  id: string;
  level: 2 | 3 | 4;
  text: string;
}

interface Props {
  html: string;
  toc: TocEntry[];
}

/**
 * 위키 본문 렌더러 (서버에서 생성된 sanitized HTML 삽입 + 클라이언트에서 heading id 주입)
 *
 * `lib/wiki-render.ts` 의 sanitizer 는 id 속성을 허용하지 않으므로,
 * 마운트 직후 heading 요소에 id 를 직접 부여하여 TOC anchor 링크가 동작하게 한다.
 */
export default function WikiDetailContent({ html, toc }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

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
      // html 은 `lib/wiki-render.ts` 의 sanitizeHtml 을 통과한 결과물
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
