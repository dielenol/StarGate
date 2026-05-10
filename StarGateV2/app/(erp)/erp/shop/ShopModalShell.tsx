"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

import ShopItemIcon from "./ShopItemIcon";

import styles from "./ShopModal.module.css";

/**
 * 편의점 BuyModal / ConsumeModal 공용 쉘.
 *
 * 책임:
 * - overlay (rgba) + 코너 틱 dialog 프레임 + 헤더(아이콘/이름/슬러그) 렌더
 * - focus trap + ESC 닫기 + overlay click 닫기 (DiffPreviewModal 패턴 압축본)
 *
 * 본문/푸터는 children + footer 슬롯으로 분리해 두 모달이 다른 입력 UI를 가져갈 수 있게 한다.
 */

interface Props {
  /**
   * @deprecated 더 이상 emoji string 을 받지 않는다 — slug 기반으로 ShopItemIcon 이 자동 렌더.
   * `false` 명시 시 아이콘 박스 자체 생략 (주식 모달처럼 아이콘이 없는 경우 대응).
   */
  icon?: string | false;
  name: string;
  slug: string;
  ariaLabel: string;
  onClose: () => void;
  isPending: boolean;
  children: ReactNode;
  footer: ReactNode;
}

export default function ShopModalShell({
  icon,
  name,
  slug,
  ariaLabel,
  onClose,
  isPending,
  children,
  footer,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // onClose / isPending 을 ref 로 안정화 — 부모 재렌더 시 focus trap 재실행 방지.
  const onCloseRef = useRef(onClose);
  const isPendingRef = useRef(isPending);
  useEffect(() => {
    onCloseRef.current = onClose;
    isPendingRef.current = isPending;
  }, [onClose, isPending]);

  /**
   * Focus trap + ESC 닫기. mount/unmount 시점에만 등록.
   * (부모 재렌더로 인한 useEffect 재실행을 막아 입력 중 포커스 튕김 방지.)
   */
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    function getFocusableElements(): HTMLElement[] {
      if (!dialogRef.current) return [];
      const selector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(selector),
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPendingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = getFocusableElements();
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    // 초기 포커스 — 첫 input 우선, 없으면 첫 focusable.
    requestAnimationFrame(() => {
      const focusables = getFocusableElements();
      const firstInput = focusables.find(
        (el) => el.tagName === "INPUT",
      );
      (firstInput ?? focusables[0])?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !isPending) {
      onClose();
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
      >
        <span
          className={`${styles.dialog__tick} ${styles["dialog__tick--tl"]}`}
          aria-hidden
        />
        <span
          className={`${styles.dialog__tick} ${styles["dialog__tick--tr"]}`}
          aria-hidden
        />
        <span
          className={`${styles.dialog__tick} ${styles["dialog__tick--bl"]}`}
          aria-hidden
        />
        <span
          className={`${styles.dialog__tick} ${styles["dialog__tick--br"]}`}
          aria-hidden
        />

        <header
          className={`${styles.header}${icon === false ? ` ${styles["header--noIcon"]}` : ""}`}
        >
          {icon === false ? null : (
            <div className={styles.header__icon} aria-hidden>
              <ShopItemIcon slug={slug} size={40} />
            </div>
          )}
          <div className={styles.header__main}>
            <div id={titleId} className={styles.header__name}>
              {name}
            </div>
            <div className={styles.header__slug}>{slug}</div>
          </div>
        </header>

        <div className={styles.body}>{children}</div>

        <footer className={styles.footer}>{footer}</footer>
      </div>
    </div>
  );
}
