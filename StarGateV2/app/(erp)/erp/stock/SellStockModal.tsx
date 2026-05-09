"use client";

import { useId, useMemo, useState } from "react";

import ShopModalShell from "../shop/ShopModalShell";

import shopStyles from "../shop/ShopModal.module.css";
import stockStyles from "./StockModal.module.css";

/* ── 상수 ── */

/** tia_bot 동일 — 1회 1~50주 (매수와 동일한 한도). */
const MAX_SHARES_PER_ORDER = 50;

/* ── Props ── */

interface Props {
  holding: {
    ticker: string;
    name: string;
    shares: number;
    avgPrice: number;
    currentPrice: number;
  };
  /** 거래 상태 — false 면 모달 안에서도 매도 비활성. M3-A 는 항상 true. */
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (shares: number) => void;
  isPending: boolean;
}

/* ── 컴포넌트 ──
 *
 * BuyStockModal 과 동일한 render-time clamp 패턴.
 * 차이점:
 * - maxShares = min(50, holding.shares) — 잔액 가드 불필요(매도는 잔액 증가)
 * - 미리보기 = 총수령액 + 평가손익 + 손익률 (color-coded)
 * - submit 버튼은 위험 톤(submitBtn--danger)
 */
export default function SellStockModal({
  holding,
  isOpen,
  onClose,
  onConfirm,
  isPending,
}: Props) {
  /* 5. id */
  const inputId = useId();

  /* 11. 파생 — 1회 한도(50) 와 보유량 중 작은 값. */
  const maxShares = useMemo(() => {
    return Math.max(0, Math.min(MAX_SHARES_PER_ORDER, holding.shares));
  }, [holding.shares]);

  /* 10. 로컬 — 사용자 입력 raw shares. */
  const [rawShares, setRawShares] = useState<number>(1);

  /* 11. 파생 — render-time clamp.
   * 백그라운드 invalidate 로 holding.shares 가 줄어도 UI 즉시 클램프.
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
  const totalReceive = holding.currentPrice * shares;
  const profitLoss = (holding.currentPrice - holding.avgPrice) * shares;
  // avgPrice > 0 가드 — 0 또는 음수면 % 산출 불가.
  const profitPercent =
    holding.avgPrice > 0
      ? ((holding.currentPrice - holding.avgPrice) / holding.avgPrice) * 100
      : 0;

  // 손익 색상 모디파이어
  const profitMod =
    profitLoss > 0
      ? stockStyles["preview__value--profit"]
      : profitLoss < 0
        ? stockStyles["preview__value--loss"]
        : "";

  // 비활성 사유
  const blockedReason = !isOpen
    ? "거래가 정지되었습니다."
    : maxShares < 1
      ? "매도 가능 수량이 없습니다."
      : null;

  const submitDisabled =
    isPending || maxShares < 1 || blockedReason !== null;

  return (
    <ShopModalShell
      name={holding.name}
      slug={holding.ticker}
      ariaLabel={`${holding.name} 매도`}
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
            className={`${shopStyles.submitBtn} ${shopStyles["submitBtn--danger"]}`}
            onClick={handleSubmit}
            disabled={submitDisabled}
            aria-busy={isPending}
          >
            {isPending ? "매도 중" : "매도 확정"}
          </button>
        </>
      }
    >
      <div className={shopStyles.statsRow}>
        <div className={shopStyles.stat}>
          <span className={shopStyles.stat__label}>현재가</span>
          <span
            className={`${shopStyles.stat__value} ${shopStyles["stat__value--gold"]}`}
          >
            ¤ {holding.currentPrice.toLocaleString()}
          </span>
        </div>
        <div className={shopStyles.stat}>
          <span className={shopStyles.stat__label}>평단가</span>
          <span className={shopStyles.stat__value}>
            ¤ {holding.avgPrice.toLocaleString()}
          </span>
        </div>
        <div className={shopStyles.stat}>
          <span className={shopStyles.stat__label}>보유 수량</span>
          <span
            className={`${shopStyles.stat__value} ${shopStyles["stat__value--gold"]}`}
          >
            {holding.shares.toLocaleString()} 주
          </span>
        </div>
        <div className={shopStyles.stat}>
          <span className={shopStyles.stat__label}>1회 한도</span>
          <span className={shopStyles.stat__value}>{MAX_SHARES_PER_ORDER}</span>
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
          <span className={shopStyles.preview__label}>총수령액</span>
          <span
            className={`${shopStyles.preview__value} ${shopStyles["preview__value--gold"]}`}
          >
            ¤ {totalReceive.toLocaleString()}
          </span>
        </div>
        <div className={shopStyles.preview__row}>
          <span className={shopStyles.preview__label}>평가손익</span>
          <span
            className={[shopStyles.preview__value, profitMod]
              .filter(Boolean)
              .join(" ")}
          >
            {profitLoss > 0 ? "+" : ""}
            {profitLoss.toLocaleString()}
          </span>
        </div>
        <div className={shopStyles.preview__row}>
          <span className={shopStyles.preview__label}>손익률</span>
          <span
            className={[shopStyles.preview__value, profitMod]
              .filter(Boolean)
              .join(" ")}
          >
            {profitPercent > 0 ? "+" : ""}
            {profitPercent.toFixed(2)}%
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
