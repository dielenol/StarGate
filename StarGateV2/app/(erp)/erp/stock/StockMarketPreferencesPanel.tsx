"use client";

import { useRef, useState } from "react";

import {
  useMigrateStockMarketPreferences,
  useUpdateStockMarketPreferences,
} from "@/hooks/mutations/useStockMarketPreferencesMutation";
import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
  type RetainedIdempotencyOperation,
} from "@/lib/query/idempotency";

import styles from "./page.module.css";

type AlertKind = "BELOW_PRICE" | "MOVE_PERCENT" | "DISCLOSURE";
type Alert = {
  id: string;
  ticker: string;
  kind: AlertKind;
  threshold?: number;
  enabled: boolean;
};
type Feedback = { tone: "success" | "error"; text: string } | null;

interface Props {
  ticker: string;
}

const LABEL: Record<AlertKind, string> = {
  BELOW_PRICE: "목표가 하향 돌파",
  MOVE_PERCENT: "회차 등락",
  DISCLOSURE: "공시 공개",
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "설정을 저장하지 못했습니다.";
}

export default function StockMarketPreferencesPanel({ ticker }: Props) {
  // 마이그레이션 훅이 이미 query observer를 갖고 있으므로 별도 preferences query를 만들지 않는다.
  const { query: preferences, migration } = useMigrateStockMarketPreferences();
  const mutation = useUpdateStockMarketPreferences();
  const operationRef = useRef<RetainedIdempotencyOperation | null>(null);
  const [below, setBelow] = useState("");
  const [move, setMove] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const data = preferences.data;
  const alerts = (data?.alerts ?? []) as Alert[];
  const relevant = alerts.filter(
    (alert) => alert.ticker === ticker && alert.enabled,
  );
  const watched = data?.watchlist.includes(ticker) ?? false;
  const pending =
    preferences.isPending || migration.isPending || mutation.isPending;

  function save(nextAlerts: Alert[], nextWatchlist = data?.watchlist ?? []) {
    const payload = { alerts: nextAlerts, watchlist: nextWatchlist };
    const operation = retainIdempotencyOperation(
      operationRef.current,
      "stock-market-preferences-update",
      JSON.stringify(payload),
    );
    operationRef.current = operation;
    setFeedback(null);
    mutation.mutate(
      { operationId: operation.key, ...payload },
      {
        onSuccess: () => {
          operationRef.current = clearRetainedIdempotencyOperation(
            operationRef.current,
            operation.key,
          );
          setFeedback({ tone: "success", text: "시장 설정을 저장했습니다." });
        },
        onError: (error) =>
          setFeedback({ tone: "error", text: errorText(error) }),
      },
    );
  }

  function toggleWatch() {
    const current = data?.watchlist ?? [];
    save(
      alerts,
      watched
        ? current.filter((item) => item !== ticker)
        : [...current, ticker],
    );
  }

  function add(kind: AlertKind, raw?: string) {
    const threshold = raw ? Number.parseFloat(raw) : undefined;
    if (
      raw &&
      (!Number.isFinite(threshold) || threshold === undefined || threshold <= 0)
    ) {
      setFeedback({ tone: "error", text: "알림 기준값은 0보다 커야 합니다." });
      return;
    }
    const existing = alerts.find(
      (alert) => alert.ticker === ticker && alert.kind === kind,
    );
    save([
      ...alerts.filter(
        (alert) => !(alert.ticker === ticker && alert.kind === kind),
      ),
      {
        id: existing?.id ?? crypto.randomUUID(),
        ticker,
        kind,
        threshold,
        enabled: true,
      },
    ]);
    if (kind === "BELOW_PRICE") setBelow("");
    if (kind === "MOVE_PERCENT") setMove("");
  }

  return (
    <section
      className={styles.preferences}
      aria-labelledby="stock-preferences-title"
    >
      <div className={styles.preferences__head}>
        <div>
          <span>MY MARKET SETTINGS</span>
          <h2 id="stock-preferences-title">관심·알림</h2>
        </div>
        <button type="button" onClick={toggleWatch} disabled={pending}>
          {watched ? "관심 해제" : "관심 등록"}
        </button>
      </div>
      {preferences.isPending || migration.isPending ? (
        <p>설정을 불러오는 중입니다.</p>
      ) : preferences.isError || migration.isError ? (
        <p role="alert">설정을 불러오지 못했습니다.</p>
      ) : (
        <>
          <div className={styles.preferences__actions}>
            <label>
              <span>목표가</span>
              <input
                value={below}
                onChange={(event) => setBelow(event.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="이하"
              />
              <button
                type="button"
                onClick={() => add("BELOW_PRICE", below)}
                disabled={pending}
              >
                추가
              </button>
            </label>
            <label>
              <span>등락률</span>
              <input
                value={move}
                onChange={(event) => setMove(event.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="절대값 %"
              />
              <button
                type="button"
                onClick={() => add("MOVE_PERCENT", move)}
                disabled={pending}
              >
                추가
              </button>
            </label>
            <button
              type="button"
              className={styles.preferences__disclosure}
              onClick={() => add("DISCLOSURE")}
              disabled={pending}
            >
              공시 알림 추가
            </button>
          </div>
          {relevant.length === 0 ? (
            <p>등록된 서버 알림이 없습니다.</p>
          ) : (
            <ul className={styles.preferences__list}>
              {relevant.map((alert) => (
                <li key={alert.id}>
                  <span>
                    {LABEL[alert.kind]}
                    {typeof alert.threshold === "number"
                      ? ` · ${alert.threshold}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      save(alerts.filter((item) => item.id !== alert.id))
                    }
                    disabled={pending}
                  >
                    해제
                  </button>
                </li>
              ))}
            </ul>
          )}
          {feedback ? (
            <p
              className={
                feedback.tone === "error"
                  ? styles.preferences__error
                  : styles.preferences__success
              }
              role={feedback.tone === "error" ? "alert" : "status"}
            >
              {feedback.text}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
