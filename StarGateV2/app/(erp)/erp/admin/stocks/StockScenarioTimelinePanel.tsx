"use client";

import { useMemo, useRef, useState } from "react";

import DropdownSelect from "@/components/ui/DropdownSelect/DropdownSelect";
import type { DropdownSelectOption } from "@/components/ui/DropdownSelect/DropdownSelect";

import { useCancelStockCorporateAction } from "@/hooks/mutations/useAdminStockMarketMutation";
import { useCancelStockDisclosure } from "@/hooks/mutations/useStockDisclosuresMutation";
import { useAdminStockCorporateActions } from "@/hooks/queries/useAdminStockMarketQuery";
import { useAdminStockDisclosures } from "@/hooks/queries/useStockDisclosuresQuery";
import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
  type RetainedIdempotencyOperation,
} from "@/lib/query/idempotency";
import { formatStockValue } from "@/lib/stocks/pricing";
import {
  buildScenarioTimeline,
  type ScenarioTimelineEvent,
} from "@/lib/stocks/scenario-timeline";

import styles from "./scenario-timeline.module.css";

interface StockOption {
  ticker: string;
  name: string;
  price: number;
}

interface Props {
  stocks: StockOption[];
}

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatSlot(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return KST_FORMATTER.format(date);
}

function signedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function eventBadge(event: ScenarioTimelineEvent): string {
  if (event.source === "CORPORATE_ACTION") return event.label;
  return event.marketWide ? "시장 공시" : "종목 공시";
}

export default function StockScenarioTimelinePanel({ stocks }: Props) {
  const [ticker, setTicker] = useState(stocks[0]?.ticker ?? "");
  const [feedback, setFeedback] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const cancelOpRef = useRef<RetainedIdempotencyOperation | null>(null);

  const disclosuresQuery = useAdminStockDisclosures();
  const actionsQuery = useAdminStockCorporateActions();
  const cancelDisclosure = useCancelStockDisclosure();
  const cancelAction = useCancelStockCorporateAction();

  const tickerOptions = useMemo<readonly DropdownSelectOption<string>[]>(
    () =>
      stocks.map((stock) => ({
        value: stock.ticker,
        label: `${stock.name} (${stock.ticker})`,
      })),
    [stocks],
  );

  const selected = stocks.find((stock) => stock.ticker === ticker);

  // 예약 흐름은 조회 시각 기준으로 계산한다. 회차 확정은 worker 가 단독 소유하므로
  // 여기 값은 운영 미리보기일 뿐이다.
  const timeline = useMemo(() => {
    if (!selected) return null;
    return buildScenarioTimeline({
      ticker: selected.ticker,
      currentPrice: selected.price,
      disclosures: disclosuresQuery.data?.items ?? [],
      corporateActions: actionsQuery.data?.items ?? [],
      now: new Date(),
    });
  }, [selected, disclosuresQuery.data, actionsQuery.data]);

  const busy = cancelDisclosure.isPending || cancelAction.isPending;

  function finish(key: string, text: string) {
    clearRetainedIdempotencyOperation(cancelOpRef.current, key);
    cancelOpRef.current = null;
    setFeedback({ tone: "ok", text });
  }

  function cancelEvent(event: ScenarioTimelineEvent) {
    const label = event.source === "CORPORATE_ACTION" ? event.label : "공시";
    if (!window.confirm(`“${event.label}” ${label} 예약을 취소할까요?`)) return;

    const scope =
      event.source === "CORPORATE_ACTION"
        ? "stock-corporate-action-cancel"
        : "stock-disclosure-cancel";
    const operation = retainIdempotencyOperation(
      cancelOpRef.current,
      scope,
      event.id,
    );
    cancelOpRef.current = operation;

    const callbacks = {
      onSuccess: () => finish(operation.key, "예약을 취소했습니다."),
      onError: () =>
        setFeedback({ tone: "error", text: "예약 취소에 실패했습니다." }),
    };
    if (event.source === "CORPORATE_ACTION") {
      cancelAction.mutate({ operationId: operation.key, id: event.id }, callbacks);
    } else {
      cancelDisclosure.mutate(
        { operationId: operation.key, id: event.id },
        callbacks,
      );
    }
  }

  const loading = disclosuresQuery.isLoading || actionsQuery.isLoading;

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div>
          <span className={styles.title}>시나리오 흐름</span>
          <p className={styles.hint}>
            선택한 종목에 예약된 공시와 기업행동을 회차 순서로 쌓아 보여줍니다.
            가격은 예상값이며 실제 확정은 worker 회차 엔진이 수행합니다.
          </p>
        </div>
        <div className={styles.tickerPicker}>
          <DropdownSelect
            ariaLabel="시나리오 대상 종목"
            value={ticker}
            onChange={setTicker}
            options={tickerOptions}
          />
        </div>
      </div>

      {feedback ? (
        <p
          className={
            feedback.tone === "ok" ? styles.feedbackOk : styles.feedbackError
          }
          role="status"
        >
          {feedback.text}
        </p>
      ) : null}

      {loading ? (
        <p className={styles.empty}>예약 정보를 불러오는 중입니다.</p>
      ) : !timeline ? (
        <p className={styles.empty}>종목을 선택하세요.</p>
      ) : timeline.events.length === 0 ? (
        <p className={styles.empty}>
          {timeline.ticker}에 예약된 공시·기업행동이 없습니다.
        </p>
      ) : (
        <>
          <div className={styles.summary}>
            <div>
              <span>현재가</span>
              <strong>¤ {formatStockValue(timeline.currentPrice)}</strong>
            </div>
            <div>
              <span>예상 최종가</span>
              <strong>¤ {formatStockValue(timeline.finalPrice)}</strong>
            </div>
            <div>
              <span>누적 변동</span>
              <strong
                className={
                  timeline.totalChangePercent >= 0 ? styles.up : styles.down
                }
              >
                {signedPercent(timeline.totalChangePercent)}
              </strong>
            </div>
            <div>
              <span>예약 건수</span>
              <strong>{timeline.events.length}건</strong>
            </div>
          </div>

          <ol className={styles.stack}>
            {timeline.events.map((event, index) => (
              <li key={`${event.source}:${event.id}`} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.step}>{index + 1}</span>
                  <span className={styles.slot}>{formatSlot(event.at)}</span>
                  <span
                    className={
                      event.source === "CORPORATE_ACTION"
                        ? styles.badgeAction
                        : styles.badgeDisclosure
                    }
                  >
                    {eventBadge(event)}
                  </span>
                  {event.structural ? (
                    <span className={styles.badgeStructural}>구조 변경</span>
                  ) : null}
                  <span className={styles.status}>{event.status}</span>
                </div>
                <p className={styles.label}>{event.label}</p>
                {event.detail ? (
                  <p className={styles.detail}>{event.detail}</p>
                ) : null}
                <div className={styles.cardFoot}>
                  <span>
                    {event.changePercent === undefined
                      ? "가격 변동 없음"
                      : signedPercent(event.changePercent)}
                  </span>
                  <strong>→ ¤ {formatStockValue(event.projectedPrice)}</strong>
                  {event.canCancel ? (
                    <button
                      type="button"
                      className={styles.cancelBtn}
                      onClick={() => cancelEvent(event)}
                      disabled={busy}
                    >
                      취소
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
