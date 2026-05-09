"use client";

import { useId, useMemo, useState } from "react";

import ShopModalShell from "../shop/ShopModalShell";

import shopStyles from "../shop/ShopModal.module.css";

/* ── 상수 ── */

/** tia_bot 동일 — 1회 1~50주. */
const MAX_SHARES_PER_ORDER = 50;

/* ── Props ── */

interface Props {
  stock: {
    ticker: string;
    name: string;
    price: number;
    description?: string;
  };
  balance: number;
  /** 거래 상태 — false 면 모달 안에서도 매수 비활성. M3-A 는 항상 true. */
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (shares: number) => void;
  isPending: boolean;
}

/* ── 컴포넌트 ──
 *
 * BuyModal(편의점) 의 render-time clamp 패턴을 그대로 이식:
 * - rawShares state + clamped derived
 * - useEffect 가 아닌 render-time 파생으로 stale 클램프 (react-hooks/set-state-in-effect 회피)
 * - blockedReason 로 비활성 사유 명시
 */
export default function BuyStockModal({
  stock,
  balance,
  isOpen,
  onClose,
  onConfirm,
  isPending,
}: Props) {
  /* 5. id */
  const inputId = useId();

  /* 11. 파생 — 잔액 기준 매수 가능 최대 주식 수. */
  const affordableMax = useMemo(() => {
    if (stock.price <= 0) return 0;
    return Math.floor(balance / stock.price);
  }, [balance, stock.price]);

  /* 11. 파생 — 1회 주문 한도(50) 와 잔액 한도 중 작은 값. */
  const maxShares = useMemo(() => {
    return Math.max(0, Math.min(MAX_SHARES_PER_ORDER, affordableMax));
  }, [affordableMax]);

  /* 10. 로컬 — 사용자 입력 raw shares. */
  const [rawShares, setRawShares] = useState<number>(1);

  /* 11. 파생 — render-time clamp.
   * 백그라운드 invalidate 로 maxShares 가 줄어도 UI 즉시 클램프.
   */
  const shares = Math.max(1, Math.min(rawShares, Math.max(1, maxShares)));

  /* 14. 핸들러 */
  // raw 값만 저장 — clamp 는 render-time 한 곳에서만 (위 `shares` 파생).
  // handleSharesChange 에서 또 clamp 하면 동일 로직이 두 곳에 분산되므로 분리 유지.
  function handleSharesChange(value: number) {
    if (!Number.isFinite(value)) {
      setRawShares(1);
      return;
    }
    setRawShares(Math.floor(value));
  }

  function handleSubmit() {
    if (shares < 1 || shares > maxShares) return;
    onConfirm(shares);
  }

  /* 11. 파생 — 미리보기 값. */
  const totalPrice = stock.price * shares;
  const balanceAfter = balance - totalPrice;

  // 비활성 사유
  const blockedReason = !isOpen
    ? "거래가 정지되었습니다."
    : maxShares < 1
      ? "잔액 부족 또는 매수 불가."
      : null;

  const submitDisabled =
    isPending || maxShares < 1 || blockedReason !== null;

  return (
    <ShopModalShell
      name={stock.name}
      slug={stock.ticker}
      ariaLabel={`${stock.name} 매수`}
      onClose={onClose}
      isPending={isPending}
      footer={
        <>
          <button
            type="button"
            className={shopStyles.cancelBtn}
            onClick={onClose}
            disabled={isPending}
          >
            취소
          </button>
          <button
            type="button"
            className={shopStyles.submitBtn}
            onClick={handleSubmit}
            disabled={submitDisabled}
            aria-busy={isPending}
          >
            {isPending ? "매수 중" : "매수 확정"}
          </button>
        </>
      }
    >
      {stock.description ? (
        <div className={shopStyles.effect}>{stock.description}</div>
      ) : null}

      <div className={shopStyles.statsRow}>
        <div className={shopStyles.stat}>
          <span className={shopStyles.stat__label}>현재가</span>
          <span
            className={`${shopStyles.stat__value} ${shopStyles["stat__value--gold"]}`}
          >
            ¤ {stock.price.toLocaleString()}
          </span>
        </div>
        <div className={shopStyles.stat}>
          <span className={shopStyles.stat__label}>현재 잔액</span>
          <span
            className={`${shopStyles.stat__value} ${shopStyles["stat__value--gold"]}`}
          >
            ¤ {balance.toLocaleString()}
          </span>
        </div>
        <div className={shopStyles.stat}>
          <span className={shopStyles.stat__label}>1회 한도</span>
          <span className={shopStyles.stat__value}>{MAX_SHARES_PER_ORDER}</span>
        </div>
        <div className={shopStyles.stat}>
          <span className={shopStyles.stat__label}>매수 가능</span>
          <span
            className={[
              shopStyles.stat__value,
              maxShares < 1 ? shopStyles["stat__value--danger"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {maxShares}
          </span>
        </div>
      </div>

      <div className={shopStyles.qtyBlock}>
        <label htmlFor={inputId} className={shopStyles.qtyLabel}>
          <span>수량</span>
          <span className={shopStyles.qtyLabel__hint}>
            1 ~ {Math.max(1, maxShares)}
          </span>
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(1, maxShares)}
          step={1}
          className={shopStyles.qtyInput}
          value={shares}
          onChange={(e) => handleSharesChange(Number(e.target.value))}
          disabled={isPending || maxShares < 1}
        />
      </div>

      <div className={shopStyles.preview}>
        <div className={shopStyles.preview__row}>
          <span className={shopStyles.preview__label}>총액</span>
          <span
            className={`${shopStyles.preview__value} ${shopStyles["preview__value--gold"]}`}
          >
            ¤ {totalPrice.toLocaleString()}
          </span>
        </div>
        <div className={shopStyles.preview__row}>
          <span className={shopStyles.preview__label}>매수 후 잔액</span>
          <span
            className={[
              shopStyles.preview__value,
              balanceAfter < 0 ? shopStyles["preview__value--danger"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            ¤ {balanceAfter.toLocaleString()}
          </span>
        </div>
      </div>

      {blockedReason ? (
        <div className={shopStyles.notice} role="alert">
          {blockedReason}
        </div>
      ) : null}
    </ShopModalShell>
  );
}
