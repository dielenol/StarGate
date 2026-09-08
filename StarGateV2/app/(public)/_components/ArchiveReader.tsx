"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevronDown } from "@/components/icons";
import styles from "./ArchiveReader.module.css";

type ReaderItem = { id: string; label: string };

export default function ArchiveReader({ items, children }: { items: readonly ReaderItem[]; children: ReactNode }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const [expanded, setExpanded] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const position = Math.max(0, items.findIndex(item => item.id === active));

  useEffect(() => {
    let frame = 0;
    const sections = items.map(item => document.getElementById(item.id));
    function update() {
      frame = 0;
      if (!readerRef.current) return;
      const headerHeight = parseFloat(getComputedStyle(readerRef.current).getPropertyValue("--public-header-height")) || 88;
      const offset = headerHeight + (window.matchMedia("(max-width: 1000px)").matches ? 100 : 40);
      let current = items[0]?.id ?? "";
      sections.forEach((section, index) => {
        if (section && section.getBoundingClientRect().top <= offset) current = items[index].id;
      });
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = items.at(-1)?.id ?? current;
      }
      setActive(current);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [items]);

  function select(id: string) {
    setActive(id);
    setExpanded(false);
    // Keep keyboard focus in the document after the mobile index collapses.
    requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
  }

  return (
    <div ref={readerRef} className={styles.reader}>
      <aside className={styles.reader__aside} aria-label="문서 탐색">
        <div className={styles.reader__heading}><span>IN THIS DOCUMENT</span><span>{String(items.length).padStart(2, "0")}</span></div>
        <button type="button" className={styles.reader__toggle} aria-expanded={expanded} aria-controls="archive-document-index" onClick={() => setExpanded(value => !value)}>
          <span><span className={styles.reader__toggleLabel}>목차</span>{items[position]?.label}</span><IconChevronDown aria-hidden />
        </button>
        <nav id="archive-document-index" className={styles.reader__index} data-expanded={expanded} aria-label="문서 목차">
          <ol>{items.map((item, index) => (
            <li key={item.id}><a href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined} onClick={() => select(item.id)}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{item.label}
            </a></li>
          ))}</ol>
        </nav>
        <p className={styles.reader__position}><span>현재 열람 위치</span><strong>{String(position + 1).padStart(2, "0")} <span>/ {String(items.length).padStart(2, "0")}</span></strong></p>
      </aside>
      <div className={styles.reader__content}>{children}</div>
    </div>
  );
}
