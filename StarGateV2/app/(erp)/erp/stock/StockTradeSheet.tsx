"use client";

/**
 * 주식 매매 풀스크린 시트.
 *
 * - 토스 패턴: 460px 박스 모달 대신 viewport 100% × 100% 풀스크린 sheet.
 *   슬라이드 업 애니메이션, ESC + 좌측 ← 버튼으로 닫기.
 * - 상단 탭 [매수] [매도] — 동일 ticker 두 액션을 한 시트에서.
 *   holding === 0 이면 매도 탭 disabled.
 * - 큰 number input, 큰 가격 표시 (모바일 친화).
 * - footer sticky [매수 확인] / [매도 확인] 버튼 — 매수=gold, 매도=danger.
 *
 * Body scroll lock — open 시 `overflow:hidden`, close 시 복원.
 * Focus 관리 — open 시 첫 input 자동 포커스. 깊은 focus trap 은 모달 sheet 패턴상
 *   사용자 ESC/뒤로 가능성이 충분해 ShopModalShell 의 trap 까지는 적용하지 않는다.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";

import styles from "./StockTradeSheet.module.css";

/* ── 상수 ── */

/** tia_bot 동일 — 1회 1~50주. */
const MAX_SHARES_PER_ORDER = 50;

type Tab = "buy" | "sell";

/* ── Props ── */

interface Props {
  initialTab: Tab;
  ticker: string;
  name: string;
  description?: string;
  price: number;
  balance: number;
  holding: number;
  avgPrice: number;
  isOpen: boolean;
  onClose: () => void;
  onBuy: (shares: number) => void;
  onSell: (shares: number) => void;
  buyPending: boolean;
  sellPending: boolean;
}

/* ── 컴포넌트 ── */

export default function StockTradeSheet({
  initialTab,
  ticker,
  name,
  description,
  price,
  balance,
  holding,
  avgPrice,
  isOpen,
  onClose,
  onBuy,
  onSell,
  buyPending,
  sellPending,
}: Props) {
  /* 5. id */
  const buyInputId = useId();
  const sellInputId = useId();

  /* 5-1. ref — onClose 안정화 */
  const onCloseRef = useRef(onClose);
  const isPendingRef = useRef(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  /* 10. 로컬 — 탭 + 탭별 raw shares */
  const [tab, setTab] = useState<Tab>(initialTab);
  const [buyRawShares, setBuyRawShares] = useState<number>(1);
  const [sellRawShares, setSellRawShares] = useState<number>(1);

  /* 11. 파생 — 매수 한도 */
  const affordableMax = useMemo(() => {
    if (price <= 0) return 0;
    return Math.floor(balance / price);
  }, [balance, price]);

  const buyMaxShares = useMemo(() => {
    return Math.max(0, Math.min(MAX_SHARES_PER_ORDER, affordableMax));
  }, [affordableMax]);

  const sellMaxShares = useMemo(() => {
    return Math.max(0, Math.min(MAX_SHARES_PER_ORDER, holding));
  }, [holding]);

  // render-time clamp — 백그라운드 invalidate 로 max 가 줄어도 즉시 반영.
  const buyShares = Math.max(
    1,
    Math.min(buyRawShares, Math.max(1, buyMaxShares)),
  );
  const sellShares = Math.max(
    1,
    Math.min(sellRawShares, Math.max(1, sellMaxShares)),
  );

  const sellTabDisabled = holding <= 0;
  const isPending = buyPending || sellPending;

  /* 12. effect — onClose / isPending ref 동기화 */
  useEffect(() => {
    onCloseRef.current = onClose;
    isPendingRef.current = isPending;
  }, [onClose, isPending]);

  /* 12. effect — open 시 ESC 닫기 + body scroll lock + 초기 focus */
  useEffect(() => {
    if (!isOpen) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPendingRef.current) {
        e.preventDefault();
        onCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // 초기 focus — 첫 input.
    requestAnimationFrame(() => {
      firstInputRef.current?.focus();
      firstInputRef.current?.select();
    });

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  /* 14. 핸들러 */
  function handleSwitchTab(next: Tab) {
    if (next === "sell" && sellTabDisabled) return;
    setTab(next);
  }

  function handleBuySharesChange(value: number) {
    if (!Number.isFinite(value)) {
      setBuyRawShares(1);
      return;
    }
    setBuyRawShares(Math.floor(value));
  }

  function handleSellSharesChange(value: number) {
    if (!Number.isFinite(value)) {
      setSellRawShares(1);
      return;
    }
    setSellRawShares(Math.floor(value));
  }

  function handleBuySubmit() {
    if (buyShares < 1 || buyShares > buyMaxShares) return;
    onBuy(buyShares);
  }

  function handleSellSubmit() {
    if (sellShares < 1 || sellShares > sellMaxShares) return;
    onSell(sellShares);
  }

  /* 11. 파생 — 매수 미리보기 */
  const totalPrice = price * buyShares;
  const balanceAfter = balance - totalPrice;

  /* 11. 파생 — 매도 미리보기 */
  const totalReceive = price * sellShares;
  const profitLoss = (price - avgPrice) * sellShares;
  const profitPercent =
    avgPrice > 0 ? ((price - avgPrice) / avgPrice) * 100 : 0;
  const profitMod =
    profitLoss > 0
      ? styles["preview__value--profit"]
      : profitLoss < 0
        ? styles["preview__value--loss"]
        : "";

  const blockedReason =
    tab === "buy"
      ? buyMaxShares < 1
        ? "잔액 부족 또는 매수 불가."
        : null
      : sellMaxShares < 1
        ? "매도 가능 수량이 없습니다."
        : null;

  const buyDisabled = isPending || buyMaxShares < 1 || tab !== "buy";
  const sellDisabled =
    isPending || sellMaxShares < 1 || tab !== "sell" || sellTabDisabled;

  if (!isOpen) return null;

  return (
    <div
      className={styles.sheet}
      role="dialog"
      aria-modal="true"
      aria-label={`${name} ${tab === "buy" ? "매수" : "매도"}`}
    >
      <header className={styles.sheet__header}>
        <button
          type="button"
          className={styles.sheet__close}
          onClick={onClose}
          aria-label="닫기"
          disabled={isPending}
        >
          ←
        </button>
        <div className={styles.sheet__titleGroup}>
          <span className={styles.sheet__ticker}>{ticker}</span>
          <span className={styles.sheet__name}>{name}</span>
        </div>
      </header>

      {/* 탭 — 큰 50/50 */}
      <div
        className={styles.sheet__tabs}
        role="tablist"
        aria-label="매매 탭"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "buy"}
          className={[
            styles.sheet__tab,
            tab === "buy" ? styles["sheet__tab--active"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => handleSwitchTab("buy")}
          disabled={isPending}
        >
          매수
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sell"}
          className={[
            styles.sheet__tab,
            tab === "sell" ? styles["sheet__tab--active"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => handleSwitchTab("sell")}
          disabled={isPending || sellTabDisabled}
          title={sellTabDisabled ? "보유 수량이 없습니다." : undefined}
        >
          매도
        </button>
      </div>

      <div className={styles.sheet__body}>
        {/* 큰 가격 표시 (양 탭 공통) */}
        <div className={styles.heroPrice}>
          <span className={styles.heroPrice__label}>
            {tab === "buy" ? "매수가" : "매도가"}
          </span>
          <span className={styles.heroPrice__value}>
            ¤ {price.toLocaleString()}
          </span>
        </div>

        {tab === "buy" ? (
          <>
            {description ? (
              <div className={styles.description}>{description}</div>
            ) : null}

            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.stat__label}>현재 잔액</span>
                <span
                  className={`${styles.stat__value} ${styles["stat__value--gold"]}`}
                >
                  ¤ {balance.toLocaleString()}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.stat__label}>1회 한도</span>
                <span className={styles.stat__value}>
                  {MAX_SHARES_PER_ORDER}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.stat__label}>매수 가능</span>
                <span
                  className={[
                    styles.stat__value,
                    buyMaxShares < 1 ? styles["stat__value--danger"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {buyMaxShares}
                </span>
              </div>
            </div>

            <div className={styles.qtyBlock}>
              <label htmlFor={buyInputId} className={styles.qtyLabel}>
                <span>수량</span>
                <span className={styles.qtyLabel__hint}>
                  1 ~ {Math.max(1, buyMaxShares)}
                </span>
              </label>
              <input
                ref={tab === "buy" ? firstInputRef : null}
                id={buyInputId}
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(1, buyMaxShares)}
                step={1}
                className={styles.qtyInput}
                value={buyShares}
                onChange={(e) => handleBuySharesChange(Number(e.target.value))}
                disabled={isPending || buyMaxShares < 1}
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
                <span className={styles.preview__label}>매수 후 잔액</span>
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
          </>
        ) : (
          <>
            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.stat__label}>평단가</span>
                <span className={styles.stat__value}>
                  ¤ {avgPrice.toLocaleString()}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.stat__label}>보유 수량</span>
                <span
                  className={`${styles.stat__value} ${styles["stat__value--gold"]}`}
                >
                  {holding.toLocaleString()} 주
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.stat__label}>1회 한도</span>
                <span className={styles.stat__value}>
                  {MAX_SHARES_PER_ORDER}
                </span>
              </div>
            </div>

            <div className={styles.qtyBlock}>
              <label htmlFor={sellInputId} className={styles.qtyLabel}>
                <span>수량</span>
                <span className={styles.qtyLabel__hint}>
                  1 ~ {Math.max(1, sellMaxShares)}
                </span>
              </label>
              <input
                ref={tab === "sell" ? firstInputRef : null}
                id={sellInputId}
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(1, sellMaxShares)}
                step={1}
                className={styles.qtyInput}
                value={sellShares}
                onChange={(e) => handleSellSharesChange(Number(e.target.value))}
                disabled={isPending || sellMaxShares < 1}
              />
            </div>

            <div className={styles.preview}>
              <div className={styles.preview__row}>
                <span className={styles.preview__label}>총수령액</span>
                <span
                  className={`${styles.preview__value} ${styles["preview__value--gold"]}`}
                >
                  ¤ {totalReceive.toLocaleString()}
                </span>
              </div>
              <div className={styles.preview__row}>
                <span className={styles.preview__label}>평가손익</span>
                <span
                  className={[styles.preview__value, profitMod]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {profitLoss > 0 ? "+" : ""}
                  {profitLoss.toLocaleString()}
                </span>
              </div>
              <div className={styles.preview__row}>
                <span className={styles.preview__label}>손익률</span>
                <span
                  className={[styles.preview__value, profitMod]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {profitPercent > 0 ? "+" : ""}
                  {profitPercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </>
        )}

        {blockedReason ? (
          <div className={styles.blocked} role="alert">
            {blockedReason}
          </div>
        ) : null}
      </div>

      <footer className={styles.sheet__footer}>
        {tab === "buy" ? (
          <button
            type="button"
            className={`${styles.sheet__submit} ${styles["sheet__submit--buy"]}`}
            onClick={handleBuySubmit}
            disabled={buyDisabled}
            aria-busy={buyPending}
          >
            {buyPending ? "매수 중" : "매수 확인"}
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.sheet__submit} ${styles["sheet__submit--sell"]}`}
            onClick={handleSellSubmit}
            disabled={sellDisabled}
            aria-busy={sellPending}
          >
            {sellPending ? "매도 중" : "매도 확인"}
          </button>
        )}
      </footer>
    </div>
  );
}
