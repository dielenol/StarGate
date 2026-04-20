"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { hasRole } from "@/lib/auth/rbac";

import type { NavGroup, NavItem } from "@/components/erp/nav-config";
import { NAV_GROUPS } from "@/components/erp/nav-config";

import styles from "./CommandK.module.css";

interface FlatEntry {
  groupKey: string;
  groupLabel: string;
  item: NavItem;
}

export default function CommandK() {
  const router = useRouter();
  const { data: session } = useSession();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const role = session?.user?.role;

  const visibleGroups = useMemo<NavGroup[]>(() => {
    return NAV_GROUPS.filter(
      (group) =>
        !group.minRole || (role ? hasRole(role, group.minRole) : false),
    )
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            !item.minRole || (role ? hasRole(role, item.minRole) : false),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [role]);

  const filteredGroups = useMemo<NavGroup[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleGroups;

    return visibleGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = [item.label, item.keywords ?? ""]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [visibleGroups, query]);

  const flatEntries = useMemo<FlatEntry[]>(() => {
    return filteredGroups.flatMap((group) =>
      group.items.map((item) => ({
        groupKey: group.key,
        groupLabel: group.label,
        item,
      })),
    );
  }, [filteredGroups]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  // 외부 트리거 이벤트 수신
  useEffect(() => {
    function handleOpenEvent() {
      open();
    }

    window.addEventListener("no:cmdk-open", handleOpenEvent);
    return () => {
      window.removeEventListener("no:cmdk-open", handleOpenEvent);
    };
  }, [open]);

  // 전역 단축키: Cmd/Ctrl+K / Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      if (!isOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, close]);

  // 열릴 때 input 포커스
  useEffect(() => {
    if (isOpen) {
      // 렌더 다음 프레임에 포커스
      const raf = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  // activeIndex 변경 시 활성 행을 뷰포트 안으로 스크롤
  useEffect(() => {
    if (!isOpen) return;
    rowRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  // 필터링으로 목록 길이가 바뀌면 ref 배열을 맞춰 자른다 (스테일 참조 방지)
  useEffect(() => {
    rowRefs.current.length = flatEntries.length;
  }, [flatEntries.length]);

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setActiveIndex(0);
  }

  function handleSelect(entry: FlatEntry) {
    if (!entry.item.href) return;
    router.push(entry.item.href);
    close();
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) =>
        flatEntries.length === 0 ? 0 : (prev + 1) % flatEntries.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) =>
        flatEntries.length === 0
          ? 0
          : (prev - 1 + flatEntries.length) % flatEntries.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = flatEntries[activeIndex];
      if (entry) handleSelect(entry);
    }
  }

  function handleMaskClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className={[styles.mask, styles["mask--open"]].join(" ")}
      onClick={handleMaskClick}
      role="presentation"
    >
      <div
        className={styles.box}
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
        onKeyDown={handleListKeyDown}
      >
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          onChange={handleQueryChange}
          placeholder="⌕  메뉴 · 캐릭터 · 위키 · 세션 검색"
          aria-label="명령 팔레트 입력"
        />

        <div className={styles.list}>
          {filteredGroups.length === 0 ? (
            <div className={styles.empty}>일치하는 항목이 없습니다</div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.key}>
                <div className={styles.section}>{group.label}</div>
                {group.items.map((item) => {
                  const flatIdx = flatEntries.findIndex(
                    (entry) =>
                      entry.groupKey === group.key &&
                      entry.item.label === item.label,
                  );
                  const active = flatIdx === activeIndex;
                  const disabled = item.href === null;
                  const Icon = item.icon;

                  return (
                    <button
                      key={`${group.key}-${item.label}`}
                      ref={(el) => {
                        if (flatIdx >= 0) rowRefs.current[flatIdx] = el;
                      }}
                      type="button"
                      className={[
                        styles.row,
                        active ? styles["row--active"] : "",
                        disabled ? styles["row--disabled"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() =>
                        handleSelect({
                          groupKey: group.key,
                          groupLabel: group.label,
                          item,
                        })
                      }
                      onMouseEnter={() => {
                        if (flatIdx >= 0) setActiveIndex(flatIdx);
                      }}
                      disabled={disabled}
                      aria-disabled={disabled}
                    >
                      <span className={styles.row__label}>
                        <span className={styles.row__icon} aria-hidden>
                          <Icon />
                        </span>
                        {item.label}
                      </span>
                      <span className={styles.row__kind}>
                        {disabled ? "준비중" : "menu"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
