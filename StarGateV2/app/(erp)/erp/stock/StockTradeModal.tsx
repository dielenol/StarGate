"use client";

/**
 * 주식 매수/매도 통합 모달.
 *
 * - 상단 탭(매수/매도)으로 같은 종목에 대한 두 액션을 한 모달에서 처리.
 * - holding === 0 이면 매도 탭은 disabled (탭은 보이지만 클릭 불가).
 * - 탭별 입력 state 분리 — 탭 전환 시 reset.
 *
 * BuyStockModal / SellStockModal 의 render-time clamp 패턴을 그대로 흡수.
 */

import { useId, useMemo, useState } from "react";

import ShopModalShell from "../shop/ShopModalShell";

import shopStyles from "../shop/ShopModal.module.css";
import stockStyles from "./StockModal.module.css";

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
  /** 매수 잔액. */
  balance: number;
  /** 매도 가능 보유량. 0 이면 매도 탭 비활성. */
  holding: number;
  /** 매도 시 평단/손익 산출용. 매수 탭만 노출 시 0 도 가능. */
  avgPrice: number;
  isOpen: boolean;
  onClose: () => void;
  onBuy: (shares: number) => void;
  onSell: (shares: number) => void;
  buyPending: boolean;
  sellPending: boolean;
}

/* ── 컴포넌트 ── */

export default function StockTradeModal({
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

  /* 10. 로컬 — 탭 + 탭별 raw shares 분리 */
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

  /* 11. 파생 — 매도 한도 */
  const sellMaxShares = useMemo(() => {
    return Math.max(0, Math.min(MAX_SHARES_PER_ORDER, holding));
  }, [holding]);

  /* 11. 파생 — render-time clamp.
   * 백그라운드 invalidate 로 max 가 줄어도 UI 즉시 클램프.
   */
  const buyShares = Math.max(
    1,
    Math.min(buyRawShares, Math.max(1, buyMaxShares)),
  );
  const sellShares = Math.max(
    1,
    Math.min(sellRawShares, Math.max(1, sellMaxShares)),
  );

  const sellTabDisabled = holding <= 0;

  /* 14. 핸들러 */
  function handleSwitchTab(next: Tab) {
    if (next === "sell" && sellTabDisabled) return;
    // 각 탭의 입력은 분리된 state 로 보존 — 탭을 오가도 입력값 유지 (UX).
    // 잔존 위험은 두 탭이 서로 다른 ticker/holding 을 가리키지 않기 때문에 없음.
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
      ? stockStyles["preview__value--profit"]
      : profitLoss < 0
        ? stockStyles["preview__value--loss"]
        : "";

  /* 11. 파생 — 비활성 사유 + pending 분기 */
  const isPending = buyPending || sellPending;

  const blockedReason = !isOpen
    ? "거래가 정지되었습니다."
    : tab === "buy"
      ? buyMaxShares < 1
        ? "잔액 부족 또는 매수 불가."
        : null
      : sellMaxShares < 1
        ? "매도 가능 수량이 없습니다."
        : null;

  const buyDisabled =
    isPending || buyMaxShares < 1 || tab !== "buy" || blockedReason !== null;
  const sellDisabled =
    isPending ||
    sellMaxShares < 1 ||
    tab !== "sell" ||
    sellTabDisabled ||
    blockedReason !== null;

  /* ── 렌더 ── */

  return (
    <ShopModalShell
      name={name}
      slug={ticker}
      ariaLabel={`${name} ${tab === "buy" ? "매수" : "매도"}`}
      onClose={onClose}
      isPending={isPending}
      footer={
        tab === "buy" ? (
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
              onClick={handleBuySubmit}
              disabled={buyDisabled}
              aria-busy={buyPending}
            >
              {buyPending ? "매수 중" : "매수 확정"}
            </button>
          </>
        ) : (
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
              onClick={handleSellSubmit}
              disabled={sellDisabled}
              aria-busy={sellPending}
            >
              {sellPending ? "매도 중" : "매도 확정"}
            </button>
          </>
        )
      }
    >
      {/* 탭 */}
      <div
        className={stockStyles.tradeTabs}
        role="tablist"
        aria-label="매매 탭"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "buy"}
          className={[
            stockStyles.tradeTab,
            tab === "buy" ? stockStyles["tradeTab--active"] : "",
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
            stockStyles.tradeTab,
            tab === "sell" ? stockStyles["tradeTab--active"] : "",
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

      {/* 매수 탭 */}
      {tab === "buy" ? (
        <>
          {description ? (
            <div className={shopStyles.effect}>{description}</div>
          ) : null}

          <div className={shopStyles.statsRow}>
            <div className={shopStyles.stat}>
              <span className={shopStyles.stat__label}>현재가</span>
              <span
                className={`${shopStyles.stat__value} ${shopStyles["stat__value--gold"]}`}
              >
                ¤ {price.toLocaleString()}
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
              <span className={shopStyles.stat__value}>
                {MAX_SHARES_PER_ORDER}
              </span>
            </div>
            <div className={shopStyles.stat}>
              <span className={shopStyles.stat__label}>매수 가능</span>
              <span
                className={[
                  shopStyles.stat__value,
                  buyMaxShares < 1 ? shopStyles["stat__value--danger"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {buyMaxShares}
              </span>
            </div>
          </div>

          <div className={shopStyles.qtyBlock}>
            <label htmlFor={buyInputId} className={shopStyles.qtyLabel}>
              <span>수량</span>
              <span className={shopStyles.qtyLabel__hint}>
                1 ~ {Math.max(1, buyMaxShares)}
              </span>
            </label>
            <input
              id={buyInputId}
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, buyMaxShares)}
              step={1}
              className={shopStyles.qtyInput}
              value={buyShares}
              onChange={(e) => handleBuySharesChange(Number(e.target.value))}
              disabled={isPending || buyMaxShares < 1}
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
        </>
      ) : (
        /* 매도 탭 */
        <>
          <div className={shopStyles.statsRow}>
            <div className={shopStyles.stat}>
              <span className={shopStyles.stat__label}>현재가</span>
              <span
                className={`${shopStyles.stat__value} ${shopStyles["stat__value--gold"]}`}
              >
                ¤ {price.toLocaleString()}
              </span>
            </div>
            <div className={shopStyles.stat}>
              <span className={shopStyles.stat__label}>평단가</span>
              <span className={shopStyles.stat__value}>
                ¤ {avgPrice.toLocaleString()}
              </span>
            </div>
            <div className={shopStyles.stat}>
              <span className={shopStyles.stat__label}>보유 수량</span>
              <span
                className={`${shopStyles.stat__value} ${shopStyles["stat__value--gold"]}`}
              >
                {holding.toLocaleString()} 주
              </span>
            </div>
            <div className={shopStyles.stat}>
              <span className={shopStyles.stat__label}>1회 한도</span>
              <span className={shopStyles.stat__value}>
                {MAX_SHARES_PER_ORDER}
              </span>
            </div>
          </div>

          <div className={shopStyles.qtyBlock}>
            <label htmlFor={sellInputId} className={shopStyles.qtyLabel}>
              <span>수량</span>
              <span className={shopStyles.qtyLabel__hint}>
                1 ~ {Math.max(1, sellMaxShares)}
              </span>
            </label>
            <input
              id={sellInputId}
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, sellMaxShares)}
              step={1}
              className={shopStyles.qtyInput}
              value={sellShares}
              onChange={(e) => handleSellSharesChange(Number(e.target.value))}
              disabled={isPending || sellMaxShares < 1}
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
        </>
      )}

      {blockedReason ? (
        <div className={shopStyles.notice} role="alert">
          {blockedReason}
        </div>
      ) : null}
    </ShopModalShell>
  );
}
