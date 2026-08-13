"use client";

import { useMemo, useRef, useState } from "react";

import {
  useCancelStockScheduledEvent,
  useCreateStockScheduledEvent,
} from "@/hooks/mutations/useStockScheduledEventsMutation";
import {
  type StockScheduledEventItem,
  useStockScheduledEvents,
} from "@/hooks/queries/useStockScheduledEventsQuery";
import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
  type RetainedIdempotencyOperation,
} from "@/lib/query/idempotency";
import {
  formatStockValue,
  normalizeStockPrice,
} from "@/lib/stocks/pricing";
import {
  getNextStockScheduledEventDate,
  STOCK_SCHEDULED_EVENT_MAX_CHANGE_PERCENT,
  STOCK_SCHEDULED_EVENT_MIN_CHANGE_PERCENT,
  STOCK_SCHEDULED_EVENT_TEXT_MAX_LENGTH,
} from "@/lib/stocks/scheduled-event";

import styles from "./scheduled-events.module.css";

interface StockOption {
  ticker: string;
  name: string;
  price: number;
}

interface Props {
  stocks: StockOption[];
}

const STATUS_LABEL: Record<StockScheduledEventItem["status"], string> = {
  PENDING: "예약됨",
  APPLIED: "적용됨",
  CANCELLED: "취소됨",
  SYSTEM: "시스템 예약",
};

function signedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function StockScheduledEventsPanel({ stocks }: Props) {
  const query = useStockScheduledEvents();
  const createMutation = useCreateStockScheduledEvent();
  const cancelMutation = useCancelStockScheduledEvent();
  const createOperationRef = useRef<RetainedIdempotencyOperation | null>(null);
  const cancelOperationRef = useRef<RetainedIdempotencyOperation | null>(null);

  const [ticker, setTicker] = useState(stocks[0]?.ticker ?? "");
  const [kstDate, setKstDate] = useState(() =>
    getNextStockScheduledEventDate(),
  );
  const [changeInput, setChangeInput] = useState("-10");
  const [eventTier, setEventTier] = useState<"scenario" | "shock">("shock");
  const [eventText, setEventText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = stocks.find((stock) => stock.ticker === ticker);
  const changePercent = Number.parseFloat(changeInput);
  const preview = useMemo(() => {
    if (!selected || !Number.isFinite(changePercent)) return null;
    return normalizeStockPrice(selected.price * (1 + changePercent / 100));
  }, [changePercent, selected]);
  const formValid =
    Boolean(selected) &&
    Boolean(kstDate) &&
    Number.isFinite(changePercent) &&
    changePercent >= STOCK_SCHEDULED_EVENT_MIN_CHANGE_PERCENT &&
    changePercent <= STOCK_SCHEDULED_EVENT_MAX_CHANGE_PERCENT &&
    eventText.trim().length >= 1 &&
    eventText.trim().length <= STOCK_SCHEDULED_EVENT_TEXT_MAX_LENGTH;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formValid) return;
    const payload = {
      ticker,
      kstDate,
      changePercent,
      eventText: eventText.trim(),
      eventTier,
    };
    const operation = retainIdempotencyOperation(
      createOperationRef.current,
      "stock-scheduled-event-create",
      JSON.stringify(payload),
    );
    createOperationRef.current = operation;
    createMutation.mutate(
      { ...payload, operationId: operation.key },
      {
        onSuccess: (response) => {
          createOperationRef.current = clearRetainedIdempotencyOperation(
            createOperationRef.current,
            operation.key,
          );
          setError(null);
          setMessage(
            `${response.item.kstDate} 12:00 · ${response.item.ticker} ${signedPercent(response.item.changePercent)} 예약 완료`,
          );
          setEventText("");
        },
        onError: (mutationError) => {
          setMessage(null);
          setError(mutationError.message);
        },
      },
    );
  }

  function handleCancel(item: StockScheduledEventItem) {
    if (!item.canCancel) return;
    const confirmed = window.confirm(
      `${item.kstDate} ${item.ticker} ${signedPercent(item.changePercent)} 예약을 취소할까요?`,
    );
    if (!confirmed) return;
    const operation = retainIdempotencyOperation(
      cancelOperationRef.current,
      "stock-scheduled-event-cancel",
      item.id,
    );
    cancelOperationRef.current = operation;
    cancelMutation.mutate(
      { eventId: item.id, operationId: operation.key },
      {
        onSuccess: () => {
          cancelOperationRef.current = clearRetainedIdempotencyOperation(
            cancelOperationRef.current,
            operation.key,
          );
          setError(null);
          setMessage(`${item.kstDate} · ${item.ticker} 예약을 취소했습니다.`);
        },
        onError: (mutationError) => {
          setMessage(null);
          setError(mutationError.message);
        },
      },
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="stock-event-title">
      <div className={styles.heading}>
        <div>
          <span>ONE-TIME MARKET EVENT</span>
          <h2 id="stock-event-title">정기 공시 이벤트 예약</h2>
        </div>
        <p>지정일 12:00 KST 정기 틱에서 가격·이력·Discord 공시에 한 번만 반영됩니다.</p>
      </div>

      <div className={styles.grid}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            <span>종목</span>
            <select value={ticker} onChange={(event) => setTicker(event.target.value)}>
              {stocks.map((stock) => (
                <option key={stock.ticker} value={stock.ticker}>
                  {stock.name} ({stock.ticker}) · ¤ {formatStockValue(stock.price)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>정기 공시일</span>
            <input
              type="date"
              min={query.data?.nextTickDate ?? getNextStockScheduledEventDate()}
              value={kstDate}
              onChange={(event) => setKstDate(event.target.value)}
            />
          </label>
          <div className={styles.inlineFields}>
            <label>
              <span>변동률</span>
              <input
                type="number"
                min={STOCK_SCHEDULED_EVENT_MIN_CHANGE_PERCENT}
                max={STOCK_SCHEDULED_EVENT_MAX_CHANGE_PERCENT}
                step="0.01"
                value={changeInput}
                onChange={(event) => setChangeInput(event.target.value)}
              />
            </label>
            <label>
              <span>공시 등급</span>
              <select
                value={eventTier}
                onChange={(event) =>
                  setEventTier(event.target.value as "scenario" | "shock")
                }
              >
                <option value="scenario">시나리오</option>
                <option value="shock">충격</option>
              </select>
            </label>
          </div>
          <label>
            <span>공시 사유</span>
            <textarea
              maxLength={STOCK_SCHEDULED_EVENT_TEXT_MAX_LENGTH}
              value={eventText}
              onChange={(event) => setEventText(event.target.value)}
              placeholder="예: 감독기관 공동 조사 결과 핵심 제품의 원재료 위반 적발"
            />
            <small>
              {eventText.trim().length}/{STOCK_SCHEDULED_EVENT_TEXT_MAX_LENGTH}
            </small>
          </label>
          <div className={styles.preview}>
            <span>현재가</span>
            <strong>¤ {selected ? formatStockValue(selected.price) : "-"}</strong>
            <span>현재가 기준 예상가</span>
            <strong className={changePercent < 0 ? styles.down : styles.up}>
              {preview === null ? "입력 대기" : `¤ ${formatStockValue(preview)}`}
            </strong>
          </div>
          {message ? <div className={styles.message}>{message}</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}
          <button
            type="submit"
            className={styles.submit}
            disabled={!formValid || createMutation.isPending}
          >
            {createMutation.isPending ? "예약 중..." : "일회성 이벤트 예약"}
          </button>
        </form>

        <div className={styles.list}>
          <div className={styles.listHead}>
            <strong>예약·처리 이력</strong>
            <span>{query.data?.items.length ?? 0}건</span>
          </div>
          {query.isPending ? (
            <div className={styles.empty}>예약 이벤트를 불러오는 중입니다.</div>
          ) : query.isError ? (
            <div className={styles.error}>{query.error.message}</div>
          ) : query.data.items.length === 0 ? (
            <div className={styles.empty}>등록된 일회성 이벤트가 없습니다.</div>
          ) : (
            <ul>
              {query.data.items.map((item) => (
                <li key={item.id}>
                  <div className={styles.eventTop}>
                    <span className={styles.ticker}>{item.ticker}</span>
                    <strong className={item.changePercent < 0 ? styles.down : styles.up}>
                      {signedPercent(item.changePercent)}
                    </strong>
                    <span className={styles.status} data-status={item.status}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <time dateTime={item.executeAt}>{item.kstDate} · 12:00 KST</time>
                  <p>{item.eventText}</p>
                  <div className={styles.meta}>
                    <span>{item.source === "built-in" ? "시스템 예약" : item.createdBy}</span>
                    <span>{item.eventTier === "shock" ? "충격" : "시나리오"}</span>
                  </div>
                  {item.canCancel ? (
                    <button
                      type="button"
                      className={styles.cancel}
                      onClick={() => handleCancel(item)}
                      disabled={cancelMutation.isPending}
                    >
                      예약 취소
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
