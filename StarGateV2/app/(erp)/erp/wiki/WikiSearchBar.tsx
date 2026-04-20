"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import Input from "@/components/ui/Input/Input";

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
    <Input
      aria-label="위키 문서 검색"
      onChange={handleChange}
      placeholder="제목 · 내용 · 태그 검색"
      type="search"
      value={value}
    />
  );
}
