"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  type CreditsResponse,
  useCredits,
} from "@/hooks/queries/useCreditsQuery";
import {
  useBuyStock,
  useSellStock,
} from "@/hooks/mutations/useStocksMutation";
import {
  StocksApiError,
  type StockHistoryResponse,
  type StockHoldingItem,
  type StockHoldingsResponse,
  type StockPriceItem,
  type StockPricesResponse,
  type StocksErrorCode,
  useStockHistory,
  useStockHoldings,
  useStockPrices,
} from "@/hooks/queries/useStocksQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import BuyStockModal from "./BuyStockModal";
import SellStockModal from "./SellStockModal";

import styles from "./page.module.css";

/* ── 상수 ── */

/** 서버 에러 코드 → 한국어 사용자 메시지. */
const ERROR_MESSAGE: Record<StocksErrorCode, string> = {
  NO_MAIN_CHARACTER: "메인 AGENT 캐릭터가 등록되지 않았습니다.",
  MAIN_CHARACTER_INTEGRITY:
    "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의하세요.",
  PRICE_NOT_FOUND: "종목 시세를 찾을 수 없습니다.",
  INSUFFICIENT_BALANCE: "잔액이 부족합니다.",
  INSUFFICIENT_SHARES: "보유 주식이 부족합니다.",
  REFUND_FAILED:
    "매수 실패 + 자동 환불 실패. 운영자(GM)에게 문의해 잔액 정정을 요청하세요.",
  HOLDING_FAILED_REFUNDED:
    "매수에 실패했습니다. 차감된 잔액은 자동 환불되었습니다.",
  SELL_LEDGER_FAILED_RESTORED:
    "매도에 실패했습니다. 차감된 보유량은 자동 복구되었습니다.",
  RESTORE_FAILED:
    "매도 실패 + 보유량 복구 실패. 운영자(GM)에게 문의해 보유량 정정을 요청하세요.",
};

/** 등락 방향 — 카드/차트/포지션에서 동일 분기. */
type Direction = "up" | "down" | "flat";

const ARROW: Record<Direction, string> = {
  up: "▲",
  down: "▼",
  flat: "·",
};

function priceDirection(price: number, prev: number): Direction {
  if (price > prev) return "up";
  if (price < prev) return "down";
  return "flat";
}

function profitDirection(profit: number): Direction {
  if (profit > 0) return "up";
  if (profit < 0) return "down";
  return "flat";
}

function describeStocksError(err: unknown): string {
  if (err instanceof StocksApiError) {
    if (err.code) return ERROR_MESSAGE[err.code] ?? err.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류가 발생했습니다.";
}

/* ── 모달 상태 ── */

type ModalState =
  | { kind: "buy"; ticker: string }
  | { kind: "sell"; ticker: string }
  | null;

/* ── 차트 데이터 타입 ── */

interface ChartPoint {
  ts: string;
  price: number;
  eventText: string;
  source: "scheduled" | "trade" | "gm-event";
}

/* ── Props ── */

interface Props {
  initialPrices: StockPricesResponse;
  initialHoldings: StockHoldingsResponse;
  initialHistory: StockHistoryResponse;
  initialHistoryTicker: string;
  mainCharacter: { id: string; codename: string } | null;
  initialBalance: number;
  initialCredits: CreditsResponse | undefined;
  mainCharacterError: string | null;
}

/* ── KST 라벨 포맷팅 (차트 X축) ── */

const KST_LABEL_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
});
const KST_FULL_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatChartDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return KST_LABEL_FORMATTER.format(d);
}

function formatTooltipDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return KST_FULL_FORMATTER.format(d);
}

/* ── 컴포넌트 ── */

export default function StockClient({
  initialPrices,
  initialHoldings,
  initialHistory,
  initialHistoryTicker,
  mainCharacter,
  initialBalance,
  initialCredits,
  mainCharacterError,
}: Props) {
  /* 6. 쿼리 */
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const holdingsQuery = useStockHoldings({ initialData: initialHoldings });
  const creditsQuery = useCredits({ initialData: initialCredits });

  const buyMutation = useBuyStock();
  const sellMutation = useSellStock();

  /* 10. 로컬 상태 */
  const [selectedTicker, setSelectedTicker] = useState<string>(
    initialHistoryTicker,
  );
  const [modal, setModal] = useState<ModalState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // selectedTicker 가 초기값과 같을 때만 initialData 시드 (다른 ticker 는 fetch).
  const historyQuery = useStockHistory(selectedTicker, {
    initialData:
      selectedTicker === initialHistoryTicker ? initialHistory : undefined,
  });

  /* 11. 파생 */
  const prices = pricesQuery.data ?? initialPrices;
  const holdings = holdingsQuery.data ?? initialHoldings;
  const history = historyQuery.data ?? { items: [] };

  // 잔액: useCredits 응답이 도착하면 그것을, 아니면 초기 props.
  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const priceByTicker = useMemo(() => {
    const map = new Map<string, StockPriceItem>();
    for (const item of prices.items) map.set(item.ticker, item);
    return map;
  }, [prices.items]);

  const holdingByTicker = useMemo(() => {
    const map = new Map<string, StockHoldingItem>();
    for (const item of holdings.items) map.set(item.ticker, item);
    return map;
  }, [holdings.items]);

  const selectedPrice: StockPriceItem | undefined =
    priceByTicker.get(selectedTicker);

  // 모달 대상 — shared-db 의 buyHolding/sellHolding 함수와의 셰도잉 회피.
  const buyTarget: StockPriceItem | undefined =
    modal?.kind === "buy" ? priceByTicker.get(modal.ticker) : undefined;
  const sellTarget: StockHoldingItem | undefined =
    modal?.kind === "sell" ? holdingByTicker.get(modal.ticker) : undefined;

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  // M3-A: 거래 정지 토글 없음. M3-B 에 도입 시 isOpen 으로 분기.
  const isOpen = true;
  const canTrade = hasMainCharacter && isOpen;

  /* 14. 핸들러 */
  function handleSelectTicker(ticker: string) {
    setSelectedTicker(ticker);
  }

  function handleBuyClick(ticker: string) {
    if (!canTrade) return;
    setErrorMessage(null);
    setModal({ kind: "buy", ticker });
  }

  function handleSellClick(ticker: string) {
    if (!canTrade) return;
    setErrorMessage(null);
    setModal({ kind: "sell", ticker });
  }

  function closeModal() {
    setModal(null);
  }

  function handleBuyConfirm(shares: number) {
    if (!buyTarget) return;
    buyMutation.mutate(
      { ticker: buyTarget.ticker, shares },
      {
        onSuccess: () => {
          setModal(null);
          setErrorMessage(null);
        },
        onError: (err) => {
          setErrorMessage(describeStocksError(err));
        },
      },
    );
  }

  function handleSellConfirm(shares: number) {
    if (!sellTarget) return;
    sellMutation.mutate(
      { ticker: sellTarget.ticker, shares },
      {
        onSuccess: () => {
          setModal(null);
          setErrorMessage(null);
        },
        onError: (err) => {
          setErrorMessage(describeStocksError(err));
        },
      },
    );
  }

  /* ── 차트 데이터 ── */

  const chartData: ChartPoint[] = useMemo(() => {
    return history.items.map((row) => ({
      ts: row.createdAt,
      price: row.price,
      eventText: row.eventText ?? "",
      source: row.source,
    }));
  }, [history.items]);

  /* ── 렌더 ── */

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "STOCK" },
        ]}
        title="주식"
        right={<Tag tone="gold">거래 가능</Tag>}
      />

      {/* ── 헤더 패널: 캐릭터 + 잔액 ── */}
      <Box variant="gold" className={styles.header}>
        <div className={styles.header__main}>
          <Eyebrow>{hasMainCharacter ? "메인 AGENT" : "캐릭터"}</Eyebrow>
          <div className={styles.header__codename}>
            {mainCharacter?.codename ?? "메인 AGENT 미등록"}
          </div>
        </div>
        <div className={styles.header__balance}>
          <Eyebrow>WALLET</Eyebrow>
          <div className={styles.header__balanceNum}>
            ¤ {balance.toLocaleString()}
          </div>
        </div>
        <div className={styles.header__status}>
          <Eyebrow>MARKET</Eyebrow>
          <div className={styles.header__statusText}>
            24시간 거래 · 즉시 체결
          </div>
        </div>
      </Box>

      {/* 메인 캐릭터 미등록 / 정합성 위반 안내 */}
      {!hasMainCharacter ? (
        <Box className={styles.notice}>
          {mainCharacterError ? (
            <>
              <strong className={styles.notice__strong}>⚠ 정합성 위반</strong>
              {": "}
              {mainCharacterError}
              <br />
              운영자(GM)에게 문의하세요. 시세·차트는 열람만 가능합니다.
            </>
          ) : (
            <>
              메인 AGENT 캐릭터가 없어 매수·매도할 수 없습니다. 캐릭터 등록 후
              다시 확인하세요. 시세·차트는 열람만 가능합니다.
            </>
          )}
        </Box>
      ) : null}

      {/* 에러 배너 (mutation 실패) */}
      {errorMessage ? (
        <Box className={styles.errorBanner} role="alert">
          <strong className={styles.notice__strong}>⚠</strong> {errorMessage}
          <button
            type="button"
            className={styles.errorBanner__dismiss}
            onClick={() => setErrorMessage(null)}
            aria-label="에러 메시지 닫기"
          >
            ✕
          </button>
        </Box>
      ) : null}

      {/* ── 종목 리스트 + 차트 (좌우 2단; 모바일 위/아래) ── */}
      <div className={styles.layout}>
        {/* 좌 — 종목 카드 그리드 */}
        <div className={styles.stockList}>
          <div className={styles.stockGrid}>
            {prices.items.map((item) => {
              const isActive = item.ticker === selectedTicker;
              const direction = priceDirection(item.price, item.prevPrice);
              const changeMod =
                direction === "up"
                  ? styles["stockCard__change--up"]
                  : direction === "down"
                    ? styles["stockCard__change--down"]
                    : "";
              return (
                <div
                  key={item.ticker}
                  className={[
                    styles.stockCard,
                    isActive ? styles["stockCard--active"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* P1-2: 카드 상단(정보) 영역 — 차트 선택 button. */}
                  <button
                    type="button"
                    className={styles.stockCard__select}
                    onClick={() => handleSelectTicker(item.ticker)}
                    aria-pressed={isActive}
                    aria-label={`${item.name} 차트 보기`}
                  >
                    <div className={styles.stockCard__head}>
                      <span className={styles.stockCard__ticker}>
                        {item.ticker}
                      </span>
                      <span className={styles.stockCard__name}>
                        {item.name}
                      </span>
                    </div>
                    <div className={styles.stockCard__priceRow}>
                      <span className={styles.stockCard__price}>
                        ¤ {item.price.toLocaleString()}
                      </span>
                      <span
                        className={[styles.stockCard__change, changeMod]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {ARROW[direction]} {item.changePercent.toFixed(2)}%
                      </span>
                    </div>
                    {item.eventText ? (
                      <div
                        className={styles.stockCard__event}
                        title={item.eventText}
                      >
                        {item.eventText}
                      </div>
                    ) : null}
                  </button>
                  {/* P1-2: 매수 button — 형제 노드로 분리. */}
                  <button
                    type="button"
                    className={styles.stockCard__buyBtn}
                    onClick={() => handleBuyClick(item.ticker)}
                    disabled={!canTrade}
                  >
                    {!hasMainCharacter ? "매수 불가" : "매수"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 우 — 차트 패널 */}
        <Box className={styles.chartPanel}>
          <div className={styles.chartPanel__head}>
            <div className={styles.chartPanel__title}>
              <span className={styles.chartPanel__ticker}>
                {selectedPrice?.ticker ?? selectedTicker}
              </span>
              <span className={styles.chartPanel__name}>
                {selectedPrice?.name ?? ""}
              </span>
            </div>
            {selectedPrice ? (
              (() => {
                const dir = priceDirection(
                  selectedPrice.price,
                  selectedPrice.prevPrice,
                );
                const changeMod =
                  dir === "up"
                    ? styles["chartPanel__change--up"]
                    : dir === "down"
                      ? styles["chartPanel__change--down"]
                      : "";
                return (
                  <div className={styles.chartPanel__priceRow}>
                    <span className={styles.chartPanel__price}>
                      ¤ {selectedPrice.price.toLocaleString()}
                    </span>
                    <span
                      className={[styles.chartPanel__change, changeMod]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {ARROW[dir]} {selectedPrice.changePercent.toFixed(2)}%
                    </span>
                  </div>
                );
              })()
            ) : null}
          </div>

          {chartData.length === 0 ? (
            <div className={styles.chartPanel__placeholder}>
              히스토리 없음 — 첫 매매 또는 GM 개입 후 기록됩니다.
            </div>
          ) : (
            <div className={styles.chartPanel__chart}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 12, right: 16, bottom: 8, left: 4 }}
                >
                  <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="ts"
                    tickFormatter={formatChartDate}
                    stroke="var(--ink-3)"
                    tick={{ fill: "var(--ink-2)", fontSize: 14 }}
                    minTickGap={28}
                  />
                  <YAxis
                    stroke="var(--ink-3)"
                    tick={{ fill: "var(--ink-2)", fontSize: 14 }}
                    tickFormatter={(v) =>
                      typeof v === "number" ? v.toLocaleString() : String(v)
                    }
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-2)",
                      border: "1px solid var(--line-strong)",
                      color: "var(--ink-0)",
                      fontSize: 14,
                    }}
                    labelFormatter={(label) =>
                      typeof label === "string"
                        ? formatTooltipDate(label)
                        : String(label)
                    }
                    formatter={(value, _name, payload) => {
                      const point = payload?.payload as ChartPoint | undefined;
                      const v =
                        typeof value === "number"
                          ? `¤ ${value.toLocaleString()}`
                          : String(value);
                      return point?.eventText
                        ? [`${v} · ${point.eventText}`, "가격"]
                        : [v, "가격"];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="var(--gold)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "var(--gold)", stroke: "var(--gold)" }}
                    activeDot={{ r: 4, fill: "var(--gold)" }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {selectedPrice?.description ? (
            <div className={styles.chartPanel__description}>
              {selectedPrice.description}
            </div>
          ) : null}
        </Box>
      </div>

      {/* ── 보유 포지션 패널 ── */}
      {hasMainCharacter ? (
        <Box className={styles.holdingsPanel}>
          <PanelTitle
            right={
              <span className={styles.holdingsPanel__count}>
                {holdings.items.length} 종
              </span>
            }
          >
            MY PORTFOLIO
          </PanelTitle>
          {holdings.items.length === 0 ? (
            <div className={styles.empty}>보유 종목이 없습니다.</div>
          ) : (
            <div
              className={styles.holdingsTable}
              role="table"
              aria-label="보유 포지션 테이블"
            >
              <div
                className={`${styles.holdingsRow} ${styles["holdingsRow--head"]}`}
                role="row"
              >
                <span>종목</span>
                <span className={styles.holdingsRow__num}>보유</span>
                <span className={styles.holdingsRow__num}>평단</span>
                <span className={styles.holdingsRow__num}>현재가</span>
                <span className={styles.holdingsRow__num}>평가금</span>
                <span className={styles.holdingsRow__num}>손익</span>
                <span className={styles.holdingsRow__num}>손익%</span>
                <span />
              </div>
              {holdings.items.map((h) => {
                const dir = profitDirection(h.profitLoss);
                const profitMod =
                  dir === "up"
                    ? styles["holdingsRow__profit--up"]
                    : dir === "down"
                      ? styles["holdingsRow__profit--down"]
                      : "";
                return (
                  <div
                    key={h.ticker}
                    className={styles.holdingsRow}
                    role="row"
                  >
                    <span className={styles.holdingsRow__name}>
                      <span className={styles.holdingsRow__ticker}>
                        {h.ticker}
                      </span>
                      <span className={styles.holdingsRow__title}>
                        {h.name}
                      </span>
                    </span>
                    <span className={styles.holdingsRow__num}>
                      {h.shares.toLocaleString()}
                    </span>
                    <span className={styles.holdingsRow__num}>
                      ¤ {h.avgPrice.toLocaleString()}
                    </span>
                    <span className={styles.holdingsRow__num}>
                      ¤ {h.currentPrice.toLocaleString()}
                    </span>
                    <span className={styles.holdingsRow__num}>
                      ¤ {h.evaluation.toLocaleString()}
                    </span>
                    <span
                      className={[styles.holdingsRow__num, profitMod]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {h.profitLoss > 0 ? "+" : ""}
                      {h.profitLoss.toLocaleString()}
                    </span>
                    <span
                      className={[styles.holdingsRow__num, profitMod]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {h.profitPercent > 0 ? "+" : ""}
                      {h.profitPercent.toFixed(2)}%
                    </span>
                    <span className={styles.holdingsRow__action}>
                      <button
                        type="button"
                        className={styles.holdingsRow__sellBtn}
                        onClick={() => handleSellClick(h.ticker)}
                        disabled={!canTrade}
                      >
                        매도
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Box>
      ) : null}

      {/* ── 모달 ── */}
      {buyTarget ? (
        <BuyStockModal
          stock={{
            ticker: buyTarget.ticker,
            name: buyTarget.name,
            price: buyTarget.price,
            description: buyTarget.description,
          }}
          balance={balance}
          isOpen={isOpen}
          onClose={closeModal}
          onConfirm={handleBuyConfirm}
          isPending={buyMutation.isPending}
        />
      ) : null}

      {sellTarget ? (
        <SellStockModal
          holding={{
            ticker: sellTarget.ticker,
            name: sellTarget.name,
            shares: sellTarget.shares,
            avgPrice: sellTarget.avgPrice,
            currentPrice: sellTarget.currentPrice,
          }}
          isOpen={isOpen}
          onClose={closeModal}
          onConfirm={handleSellConfirm}
          isPending={sellMutation.isPending}
        />
      ) : null}
    </>
  );
}
