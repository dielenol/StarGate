"use client";

import { useId, useMemo, useState } from "react";

import type { ShopCatalogEntry } from "@/hooks/queries/useShopQuery";

import ShopModalShell from "./ShopModalShell";

import styles from "./ShopModal.module.css";

/* ── 상수 ── */

/** tia_bot 동일 — 1회 1~9개. */
const MAX_QUANTITY_PER_ORDER = 9;

/* ── Props ── */

interface Props {
  item: ShopCatalogEntry;
  balance: number;
  /** 영업 상태 — false 면 모달 안에서도 구매 비활성. */
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
  isPending: boolean;
}

/* ── 컴포넌트 ── */

export default function BuyModal({
  item,
  balance,
  isOpen,
  onClose,
  onConfirm,
  isPending,
}: Props) {
  /* 5. id */
  const inputId = useId();

  /* 11. 파생 — 가능한 최대 수량: min(재고, 9, 잔액/가격) */
  const affordableMax = useMemo(() => {
    if (item.price <= 0) return 0;
    return Math.floor(balance / item.price);
  }, [balance, item.price]);

  const maxQuantity = useMemo(() => {
    return Math.max(
      0,
      Math.min(item.stock, MAX_QUANTITY_PER_ORDER, affordableMax),
    );
  }, [item.stock, affordableMax]);

  /* 10. 로컬 — 사용자 입력 raw quantity (max 가 0 이면 1, 사용 시 비활성). */
  const [rawQuantity, setRawQuantity] = useState<number>(1);

  /* 11. 파생 — 백그라운드 invalidate 로 maxQuantity 가 줄면 stale 클램프.
   * useEffect 가 아닌 render-time 파생 (react-hooks/set-state-in-effect 회피).
   * 사용자 입력은 rawQuantity 에 저장하고, 실제 표시/제출은 quantity (clamped) 사용.
   */
  const quantity = Math.max(
    1,
    Math.min(rawQuantity, Math.max(1, maxQuantity)),
  );

  /* 14. 핸들러 */
  function handleQuantityChange(value: number) {
    if (!Number.isFinite(value)) {
      setRawQuantity(1);
      return;
    }
    const clamped = Math.max(1, Math.min(maxQuantity, Math.floor(value)));
    setRawQuantity(clamped);
  }

  function handleSubmit() {
    if (quantity < 1 || quantity > maxQuantity) return;
    onConfirm(quantity);
  }

  /* 11. 파생 — 미리보기 값 (clamped quantity 기반). */
  const totalPrice = item.price * quantity;
  const balanceAfter = balance - totalPrice;

  // 비활성 사유
  const blockedReason = !isOpen
    ? "영업 시간이 아닙니다 (06:00~20:00·일요일 마감)."
    : item.stock <= 0
      ? "재고가 부족합니다."
      : affordableMax < 1
        ? "잔액이 부족합니다."
        : null;

  const submitDisabled =
    isPending || maxQuantity < 1 || blockedReason !== null;

  return (
    <ShopModalShell
      name={item.name}
      slug={item.slug}
      ariaLabel={`${item.name} 구매`}
      onClose={onClose}
      isPending={isPending}
      footer={
        <>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={isPending}
          >
            취소
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={submitDisabled}
            aria-busy={isPending}
          >
            {isPending ? "구매 중" : "구매 확정"}
          </button>
        </>
      }
    >
      <div className={styles.effect}>{item.effect}</div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.stat__label}>가격</span>
          <span
            className={`${styles.stat__value} ${styles["stat__value--gold"]}`}
          >
            ¤ {item.price.toLocaleString()}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.stat__label}>재고</span>
          <span
            className={[
              styles.stat__value,
              item.stock <= 0 ? styles["stat__value--danger"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {item.stock}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.stat__label}>현재 잔액</span>
          <span
            className={`${styles.stat__value} ${styles["stat__value--gold"]}`}
          >
            ¤ {balance.toLocaleString()}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.stat__label}>구매 가능 (1회)</span>
          <span
            className={[
              styles.stat__value,
              maxQuantity < 1 ? styles["stat__value--danger"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {maxQuantity}
          </span>
        </div>
      </div>

      <div className={styles.qtyBlock}>
        <label htmlFor={inputId} className={styles.qtyLabel}>
          <span>수량</span>
          <span className={styles.qtyLabel__hint}>
            1 ~ {Math.max(1, maxQuantity)}
          </span>
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(1, maxQuantity)}
          step={1}
          className={styles.qtyInput}
          value={quantity}
          onChange={(e) => handleQuantityChange(Number(e.target.value))}
          disabled={isPending || maxQuantity < 1}
        />
      </div>

      <div className={styles.preview}>
        <div className={styles.preview__row}>
          <span className={styles.preview__label}>총액</span>
          <span
            className={`${styles.preview__value} ${styles["preview__value--gold"]}`}
          >
            ¤ {totalPrice.toLocaleString()}
          </span>
        </div>
        <div className={styles.preview__row}>
          <span className={styles.preview__label}>구매 후 잔액</span>
          <span
            className={[
              styles.preview__value,
              balanceAfter < 0 ? styles["preview__value--danger"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            ¤ {balanceAfter.toLocaleString()}
          </span>
        </div>
      </div>

      {blockedReason ? (
        <div className={styles.notice} role="alert">
          {blockedReason}
        </div>
      ) : null}
    </ShopModalShell>
  );
}
