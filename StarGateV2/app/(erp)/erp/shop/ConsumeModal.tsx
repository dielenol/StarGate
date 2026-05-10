"use client";

import { useId, useState } from "react";

import ShopModalShell from "./ShopModalShell";

import styles from "./ShopModal.module.css";

/* ── Props ── */

interface Props {
  item: {
    slug: string;
    name: string;
    icon: string;
    effect: string;
  };
  inventoryQuantity: number;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
  isPending: boolean;
}

/* ── 컴포넌트 ──
 *
 * D7 — 수량 입력 N개 차감만. 일괄 비우기 단일 버튼 금지 → strict input only.
 * 영업시간 무관 (보유 아이템 사용은 24/7).
 */
export default function ConsumeModal({
  item,
  inventoryQuantity,
  onClose,
  onConfirm,
  isPending,
}: Props) {
  const inputId = useId();

  // 보유량으로 max 클램프 — D7 가드.
  const [rawQuantity, setRawQuantity] = useState<number>(1);

  // 파생 — 백그라운드 invalidate 로 inventoryQuantity 가 줄면 stale 클램프.
  // useEffect 가 아닌 render-time 파생 (react-hooks/set-state-in-effect 회피).
  const quantity = Math.max(
    1,
    Math.min(rawQuantity, Math.max(1, inventoryQuantity)),
  );

  function handleQuantityChange(value: number) {
    if (!Number.isFinite(value)) {
      setRawQuantity(1);
      return;
    }
    const clamped = Math.max(
      1,
      Math.min(inventoryQuantity, Math.floor(value)),
    );
    setRawQuantity(clamped);
  }

  function handleSubmit() {
    if (quantity < 1 || quantity > inventoryQuantity) return;
    onConfirm(quantity);
  }

  const submitDisabled =
    isPending || inventoryQuantity < 1 || quantity > inventoryQuantity;
  const remaining = inventoryQuantity - quantity;

  return (
    <ShopModalShell
      name={item.name}
      slug={item.slug}
      ariaLabel={`${item.name} 사용/폐기`}
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
            className={`${styles.submitBtn} ${styles["submitBtn--danger"]}`}
            onClick={handleSubmit}
            disabled={submitDisabled}
            aria-busy={isPending}
          >
            {isPending ? "처리 중" : "사용 / 폐기"}
          </button>
        </>
      }
    >
      <div className={styles.effect}>{item.effect}</div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.stat__label}>현재 보유</span>
          <span
            className={`${styles.stat__value} ${styles["stat__value--gold"]}`}
          >
            {inventoryQuantity}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.stat__label}>사용 후 잔량</span>
          <span
            className={[
              styles.stat__value,
              remaining <= 0 ? styles["stat__value--danger"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {Math.max(0, remaining)}
          </span>
        </div>
      </div>

      <div className={styles.qtyBlock}>
        <label htmlFor={inputId} className={styles.qtyLabel}>
          <span>사용 수량</span>
          <span className={styles.qtyLabel__hint}>
            1 ~ {Math.max(1, inventoryQuantity)}
          </span>
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(1, inventoryQuantity)}
          step={1}
          className={styles.qtyInput}
          value={quantity}
          onChange={(e) => handleQuantityChange(Number(e.target.value))}
          disabled={isPending || inventoryQuantity < 1}
        />
      </div>

      <div className={styles.notice}>
        사용 후에는 되돌릴 수 없습니다. 차감된 수량은 인벤토리에서 즉시
        제거됩니다.
      </div>
    </ShopModalShell>
  );
}
