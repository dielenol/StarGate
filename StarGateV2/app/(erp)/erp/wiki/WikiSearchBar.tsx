"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import styles from "./page.module.css";

const DEBOUNCE_MS = 500;

export default function WikiSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.trim()) {
        params.set("q", next.trim());
        params.delete("category");
      } else {
        params.delete("q");
      }

      router.push(`/erp/wiki?${params.toString()}`);
    }, DEBOUNCE_MS);
  }

  return (
    <div className={styles.wiki__search}>
      <input
        aria-label="위키 문서 검색"
        className={styles.wiki__searchInput}
        onChange={handleChange}
        placeholder="문서 검색..."
        type="search"
        value={value}
      />
    </div>
  );
}
