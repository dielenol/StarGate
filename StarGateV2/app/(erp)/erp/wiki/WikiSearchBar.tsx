"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import Input from "@/components/ui/Input/Input";

const DEBOUNCE_MS = 500;

interface WikiSearchBarProps {
  value?: string;
  onSearch?: (query: string) => void;
}

export default function WikiSearchBar({
  value,
  onSearch,
}: WikiSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryValue = value ?? searchParams.get("q") ?? "";
  const [inputValue, setInputValue] = useState(queryValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInputValue(queryValue);
  }, [queryValue]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setInputValue(next);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      if (onSearch) {
        onSearch(next.trim());
        return;
      }

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
      placeholder="제목, 내용, 태그 검색"
      type="search"
      value={inputValue}
    />
  );
}
