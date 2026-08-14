"use client";

import { useRef, useState } from "react";

import {
  useCancelStockCorporateAction,
  useDeleteStockCalendarException,
  useRecoverStockMarketSlot,
  useScheduleStockCorporateAction,
  useUpsertStockCalendarException,
} from "@/hooks/mutations/useAdminStockMarketMutation";
import {
  useCancelStockDisclosure,
  useCreateStockDisclosure,
  useUpdateStockDisclosure,
} from "@/hooks/mutations/useStockDisclosuresMutation";
import {
  useAdminStockCalendar,
  useAdminStockCorporateActions,
} from "@/hooks/queries/useAdminStockMarketQuery";
import { useAdminStockDisclosures } from "@/hooks/queries/useStockDisclosuresQuery";
import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
  type RetainedIdempotencyOperation,
} from "@/lib/query/idempotency";

import styles from "./page.module.css";

interface StockOption {
  ticker: string;
  name: string;
  price: number;
}
type DisclosureStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED";
type DisclosureKind = "INFO" | "PRICE";
type DisclosureScope = "MARKET" | "TICKERS";
type Effect = {
  scope: "MARKET" | "TICKER";
  ticker?: string;
  changePercent?: number;
  structural: boolean;
};
type Disclosure = {
  id: string;
  status: DisclosureStatus | "CANCELLED";
  kind?: DisclosureKind;
  scope: DisclosureScope;
  tickers: string[];
  publishAt: string;
  headline?: string;
  body?: string;
  effects?: Effect[];
  canEdit: boolean;
  canCancel: boolean;
};
type CalendarItem = {
  id: string;
  kstDate: string;
  mode: "EARLY_CLOSE" | "NORMAL_HOURS";
  closeAt: string | null;
  reason: string;
  updatedAt: string;
};
type Corporate = {
  id: string;
  type: "DIVIDEND" | "SPLIT";
  status: string;
  ticker: string;
  executeAt: string;
  perShare?: number;
  ratio?: number;
};
type Feedback = { tone: "success" | "error"; text: string } | null;

function toDateTimeLocal(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function StockNovexOperationsPanels({
  stocks,
}: {
  stocks: StockOption[];
}) {
  const disclosuresQuery = useAdminStockDisclosures();
  const calendarQuery = useAdminStockCalendar();
  const actionsQuery = useAdminStockCorporateActions();
  const createDisclosure = useCreateStockDisclosure();
  const updateDisclosure = useUpdateStockDisclosure();
  const cancelDisclosure = useCancelStockDisclosure();
  const upsertCalendar = useUpsertStockCalendarException();
  const deleteCalendar = useDeleteStockCalendarException();
  const scheduleAction = useScheduleStockCorporateAction();
  const cancelAction = useCancelStockCorporateAction();
  const recover = useRecoverStockMarketSlot();

  const disclosureOpRef = useRef<RetainedIdempotencyOperation | null>(null);
  const calendarOpRef = useRef<RetainedIdempotencyOperation | null>(null);
  const corporateOpRef = useRef<RetainedIdempotencyOperation | null>(null);
  const cancelOpRef = useRef<RetainedIdempotencyOperation | null>(null);
  const recoveryOpRef = useRef<RetainedIdempotencyOperation | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [ticker, setTicker] = useState(stocks[0]?.ticker ?? "");
  const [disclosureTickers, setDisclosureTickers] = useState<string[]>(
    stocks[0]?.ticker ? [stocks[0].ticker] : [],
  );
  const [tickerPercents, setTickerPercents] = useState<Record<string, string>>(
    {},
  );
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [publishAt, setPublishAt] = useState(toDateTimeLocal());
  const [disclosureStatus, setDisclosureStatus] =
    useState<DisclosureStatus>("SCHEDULED");
  const [kind, setKind] = useState<DisclosureKind>("INFO");
  const [scope, setScope] = useState<DisclosureScope>("TICKERS");
  const [percent, setPercent] = useState("");
  const [structural, setStructural] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [mode, setMode] = useState<"EARLY_CLOSE" | "NORMAL_HOURS">(
    "EARLY_CLOSE",
  );
  const [closeAt, setCloseAt] = useState("18:00");
  const [calendarReason, setCalendarReason] = useState("");
  const [actionType, setActionType] = useState<"DIVIDEND" | "SPLIT">(
    "DIVIDEND",
  );
  const [actionAt, setActionAt] = useState(toDateTimeLocal());
  const [perShare, setPerShare] = useState("");
  const [ratio, setRatio] = useState("2");
  const [slotKey, setSlotKey] = useState("");

  const disclosures = (disclosuresQuery.data?.items ?? []) as Disclosure[];
  const calendar = (calendarQuery.data?.items ?? []) as CalendarItem[];
  const actions = (actionsQuery.data?.items ?? []) as Corporate[];
  const busy =
    createDisclosure.isPending ||
    updateDisclosure.isPending ||
    cancelDisclosure.isPending ||
    upsertCalendar.isPending ||
    deleteCalendar.isPending ||
    scheduleAction.isPending ||
    cancelAction.isPending ||
    recover.isPending;

  function finish(
    operationRef: React.MutableRefObject<RetainedIdempotencyOperation | null>,
    key: string,
    text: string,
  ) {
    operationRef.current = clearRetainedIdempotencyOperation(
      operationRef.current,
      key,
    );
    setFeedback({ tone: "success", text });
  }

  function selectKind(next: DisclosureKind) {
    setKind(next);
    if (next === "PRICE" && disclosureStatus === "PUBLISHED") {
      setDisclosureStatus("SCHEDULED");
    }
  }

  function toggleDisclosureTicker(nextTicker: string) {
    setDisclosureTickers((current) =>
      current.includes(nextTicker)
        ? current.filter((item) => item !== nextTicker)
        : [...current, nextTicker].sort(),
    );
  }

  function submitDisclosure() {
    const changePercent = Number.parseFloat(percent);
    const isPrice = kind === "PRICE";
    const tickerOverrideEffects =
      isPrice && scope === "MARKET"
        ? disclosureTickers.map((selectedTicker) => ({
            ticker: selectedTicker,
            changePercent: Number.parseFloat(
              tickerPercents[selectedTicker] ?? "",
            ),
          }))
        : [];
    if (
      !headline.trim() ||
      (disclosureStatus === "SCHEDULED" && !publishAt) ||
      (scope === "TICKERS" && disclosureTickers.length === 0) ||
      (isPrice &&
        (!Number.isFinite(changePercent) ||
          changePercent < -50 ||
          changePercent > 75)) ||
      tickerOverrideEffects.some(
        (effect) =>
          !Number.isFinite(effect.changePercent) ||
          effect.changePercent < -50 ||
          effect.changePercent > 75,
      )
    ) {
      setFeedback({
        tone: "error",
        text: "공시 상태와 가격 효과 입력값을 확인하세요.",
      });
      return;
    }
    const payload = {
      status: disclosureStatus,
      kind,
      scope,
      tickers: disclosureTickers,
      ...(disclosureStatus === "SCHEDULED"
        ? { publishAt: new Date(publishAt).toISOString() }
        : {}),
      headline: headline.trim(),
      body: body.trim(),
      effects: isPrice
        ? scope === "MARKET"
          ? [
              {
                scope: "MARKET" as const,
                changePercent,
                structural,
              },
              ...tickerOverrideEffects.map((effect) => ({
                scope: "TICKER" as const,
                ticker: effect.ticker,
                changePercent: effect.changePercent,
                structural,
              })),
            ]
          : disclosureTickers.map((selectedTicker) => ({
              scope: "TICKER" as const,
              ticker: selectedTicker,
              changePercent,
              structural,
            }))
        : [],
      forceCooldown: false,
    };
    const fingerprint = JSON.stringify({ editingId, ...payload });
    const operation = retainIdempotencyOperation(
      disclosureOpRef.current,
      editingId ? "stock-disclosure-update" : "stock-disclosure-create",
      fingerprint,
    );
    disclosureOpRef.current = operation;
    const callbacks = {
      onSuccess: () => {
        finish(
          disclosureOpRef,
          operation.key,
          editingId ? "공시를 수정했습니다." : "공시를 저장했습니다.",
        );
        setEditingId(null);
      },
      onError: (error: unknown) =>
        setFeedback({
          tone: "error",
          text: errorText(error, "공시 저장에 실패했습니다."),
        }),
    };
    if (editingId) {
      updateDisclosure.mutate(
        { operationId: operation.key, id: editingId, ...payload },
        callbacks,
      );
    } else {
      createDisclosure.mutate(
        { operationId: operation.key, ...payload },
        callbacks,
      );
    }
  }

  function beginEdit(item: Disclosure) {
    setEditingId(item.id);
    setHeadline(item.headline ?? "");
    setBody(item.body ?? "");
    setPublishAt(toDateTimeLocal(new Date(item.publishAt)));
    setDisclosureStatus(item.status === "CANCELLED" ? "DRAFT" : item.status);
    setKind(item.kind ?? "INFO");
    setScope(item.scope);
    setDisclosureTickers(item.tickers);
    const effect =
      item.effects?.find((candidate) => candidate.scope === "MARKET") ??
      item.effects?.[0];
    setPercent(
      typeof effect?.changePercent === "number"
        ? String(effect.changePercent)
        : "",
    );
    setTickerPercents(
      Object.fromEntries(
        (item.effects ?? [])
          .filter(
            (candidate) =>
              candidate.scope === "TICKER" &&
              candidate.ticker &&
              typeof candidate.changePercent === "number",
          )
          .map((candidate) => [
            candidate.ticker!,
            String(candidate.changePercent),
          ]),
      ),
    );
    setStructural(effect?.structural ?? false);
    setFeedback(null);
  }

  function cancelDisclosureWithConfirm(item: Disclosure) {
    if (!window.confirm(`“${item.headline ?? "제목 없음"}” 공시를 취소할까요?`))
      return;
    const operation = retainIdempotencyOperation(
      cancelOpRef.current,
      "stock-disclosure-cancel",
      item.id,
    );
    cancelOpRef.current = operation;
    cancelDisclosure.mutate(
      { operationId: operation.key, id: item.id },
      {
        onSuccess: () =>
          finish(cancelOpRef, operation.key, "공시를 취소했습니다."),
        onError: (error) =>
          setFeedback({
            tone: "error",
            text: errorText(error, "공시 취소에 실패했습니다."),
          }),
      },
    );
  }

  function saveCalendar() {
    if (!date || !calendarReason.trim()) {
      setFeedback({ tone: "error", text: "날짜와 예외 사유를 입력하세요." });
      return;
    }
    const payload = {
      kstDate: date,
      mode,
      closeAt: mode === "EARLY_CLOSE" ? closeAt : null,
      reason: calendarReason.trim(),
    };
    const operation = retainIdempotencyOperation(
      calendarOpRef.current,
      "stock-calendar-upsert",
      JSON.stringify(payload),
    );
    calendarOpRef.current = operation;
    upsertCalendar.mutate(
      { operationId: operation.key, ...payload },
      {
        onSuccess: () =>
          finish(
            calendarOpRef,
            operation.key,
            "시장 캘린더 예외를 저장했습니다.",
          ),
        onError: (error) =>
          setFeedback({
            tone: "error",
            text: errorText(error, "캘린더 저장에 실패했습니다."),
          }),
      },
    );
  }

  function deleteCalendarWithConfirm(item: CalendarItem) {
    if (!window.confirm(`${item.kstDate} 시장 예외를 삭제할까요?`)) return;
    const operation = retainIdempotencyOperation(
      cancelOpRef.current,
      "stock-calendar-delete",
      item.kstDate,
    );
    cancelOpRef.current = operation;
    deleteCalendar.mutate(
      { operationId: operation.key, kstDate: item.kstDate },
      {
        onSuccess: () =>
          finish(cancelOpRef, operation.key, "시장 예외를 삭제했습니다."),
        onError: (error) =>
          setFeedback({
            tone: "error",
            text: errorText(error, "시장 예외 삭제에 실패했습니다."),
          }),
      },
    );
  }

  function scheduleCorporateAction() {
    const value =
      actionType === "DIVIDEND"
        ? Number.parseFloat(perShare)
        : Number.parseInt(ratio, 10);
    if (
      !ticker ||
      !actionAt ||
      !Number.isFinite(value) ||
      value <= 0 ||
      (actionType === "SPLIT" &&
        (!Number.isInteger(value) || value < 2 || value > 10))
    ) {
      setFeedback({ tone: "error", text: "기업행동 예약 값을 확인하세요." });
      return;
    }
    const payload = {
      type: actionType,
      ticker,
      executeAt: new Date(actionAt).toISOString(),
      ...(actionType === "DIVIDEND" ? { perShare: value } : { ratio: value }),
    };
    const operation = retainIdempotencyOperation(
      corporateOpRef.current,
      "stock-corporate-action-schedule",
      JSON.stringify(payload),
    );
    corporateOpRef.current = operation;
    scheduleAction.mutate(
      { operationId: operation.key, ...payload },
      {
        onSuccess: () =>
          finish(corporateOpRef, operation.key, "기업행동을 예약했습니다."),
        onError: (error) =>
          setFeedback({
            tone: "error",
            text: errorText(error, "기업행동 예약에 실패했습니다."),
          }),
      },
    );
  }

  function cancelCorporateActionWithConfirm(item: Corporate) {
    if (
      !window.confirm(
        `${item.ticker} ${item.type === "DIVIDEND" ? "배당" : "분할"} 예약을 취소할까요?`,
      )
    )
      return;
    const operation = retainIdempotencyOperation(
      cancelOpRef.current,
      "stock-corporate-action-cancel",
      item.id,
    );
    cancelOpRef.current = operation;
    cancelAction.mutate(
      { operationId: operation.key, id: item.id },
      {
        onSuccess: () =>
          finish(cancelOpRef, operation.key, "기업행동 예약을 취소했습니다."),
        onError: (error) =>
          setFeedback({
            tone: "error",
            text: errorText(error, "기업행동 취소에 실패했습니다."),
          }),
      },
    );
  }

  function recoverWithConfirm() {
    const normalizedSlotKey = slotKey.trim();
    if (
      !normalizedSlotKey ||
      !window.confirm(
        `${normalizedSlotKey} 회차를 복구할까요? 밀린 회차는 병합될 수 있습니다.`,
      )
    )
      return;
    const operation = retainIdempotencyOperation(
      recoveryOpRef.current,
      "stock-market-slot-recover",
      normalizedSlotKey,
    );
    recoveryOpRef.current = operation;
    recover.mutate(
      { operationId: operation.key, slotKey: normalizedSlotKey },
      {
        onSuccess: () =>
          finish(
            recoveryOpRef,
            operation.key,
            "지연 회차 복구를 요청했습니다.",
          ),
        onError: (error) =>
          setFeedback({
            tone: "error",
            text: errorText(error, "회차 복구에 실패했습니다."),
          }),
      },
    );
  }

  return (
    <div className={styles.novexOps}>
      {feedback ? (
        <div
          className={feedback.tone === "error" ? styles.error : styles.message}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </div>
      ) : null}
      <section className={styles.panel}>
        <div className={styles.panel__head}>
          <span>공시 센터</span>
          <span>{disclosures.length}건</span>
        </div>
        <div className={styles.novexForm}>
          <label>
            <span>공시 상태</span>
            <select
              value={disclosureStatus}
              onChange={(event) =>
                setDisclosureStatus(event.target.value as DisclosureStatus)
              }
            >
              <option value="DRAFT">초안</option>
              <option value="SCHEDULED">예약 공개</option>
              <option value="PUBLISHED" disabled={kind === "PRICE"}>
                정보 즉시공개
              </option>
            </select>
          </label>
          {disclosureStatus === "SCHEDULED" ? (
            <label>
              <span>공개 시각</span>
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(event) => setPublishAt(event.target.value)}
              />
            </label>
          ) : null}
          <label>
            <span>공시 제목</span>
            <input
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              maxLength={120}
              placeholder="플레이어 공개 제목"
            />
          </label>
          <label>
            <span>대상</span>
            <select
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as DisclosureScope)
              }
            >
              <option value="TICKERS">개별 종목</option>
              <option value="MARKET">시장 전체</option>
            </select>
          </label>
          {scope === "TICKERS" || kind === "PRICE" ? (
            <fieldset className={styles.tickerEffects}>
              <legend>
                {scope === "MARKET"
                  ? "개별 종목 우선 효과"
                  : "대상 종목 (복수 선택)"}
              </legend>
              {stocks.map((stock) => {
                const selected = disclosureTickers.includes(stock.ticker);
                return (
                  <div key={stock.ticker}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleDisclosureTicker(stock.ticker)}
                      />
                      {stock.ticker} · {stock.name}
                    </label>
                    {scope === "MARKET" && selected ? (
                      <input
                        type="number"
                        min="-50"
                        max="75"
                        step="0.01"
                        aria-label={`${stock.ticker} 개별 등락률`}
                        value={tickerPercents[stock.ticker] ?? ""}
                        onChange={(event) =>
                          setTickerPercents((current) => ({
                            ...current,
                            [stock.ticker]: event.target.value,
                          }))
                        }
                        placeholder="개별 %"
                      />
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          ) : null}
          <label>
            <span>공시 유형</span>
            <select
              value={kind}
              onChange={(event) =>
                selectKind(event.target.value as DisclosureKind)
              }
            >
              <option value="INFO">정보 전용</option>
              <option value="PRICE">가격 연동 (예약만)</option>
            </select>
          </label>
          {kind === "PRICE" ? (
            <>
              <label>
                <span>정확한 등락률</span>
                <input
                  type="number"
                  min="-50"
                  max="75"
                  step="0.01"
                  value={percent}
                  onChange={(event) => setPercent(event.target.value)}
                />
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={structural}
                  onChange={(event) => setStructural(event.target.checked)}
                />
                구조적 효과(현재가·적정가)
              </label>
            </>
          ) : null}
          <label>
            <span>본문</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={2000}
            />
          </label>
          <button
            type="button"
            className={styles.submit}
            disabled={busy}
            onClick={submitDisclosure}
          >
            {editingId
              ? "공시 수정 저장"
              : disclosureStatus === "PUBLISHED"
                ? "정보 즉시공개"
                : "공시 저장"}
          </button>
          {editingId ? (
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => setEditingId(null)}
            >
              수정 취소
            </button>
          ) : null}
        </div>
        <div className={styles.novexList}>
          {disclosuresQuery.isPending
            ? "공시를 불러오는 중입니다."
            : disclosures.length === 0
              ? "등록된 공시가 없습니다."
              : disclosures.map((item) => (
                  <div key={item.id}>
                    <strong>{item.headline ?? "제목 없음"}</strong>
                    <span>
                      {item.status} · {item.publishAt}
                    </span>
                    {item.canEdit ? (
                      <button
                        type="button"
                        onClick={() => beginEdit(item)}
                        disabled={busy}
                      >
                        편집
                      </button>
                    ) : null}
                    {item.canCancel ? (
                      <button
                        type="button"
                        onClick={() => cancelDisclosureWithConfirm(item)}
                        disabled={busy}
                      >
                        취소
                      </button>
                    ) : null}
                  </div>
                ))}
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panel__head}>
          <span>시장 캘린더 예외</span>
          <span>{calendar.length}건</span>
        </div>
        <div className={styles.novexForm}>
          <label>
            <span>날짜</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            <span>운영</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
            >
              <option value="EARLY_CLOSE">조기 폐장</option>
              <option value="NORMAL_HOURS">정규 시간</option>
            </select>
          </label>
          {mode === "EARLY_CLOSE" ? (
            <label>
              <span>폐장 시각</span>
              <input
                type="time"
                value={closeAt}
                onChange={(event) => setCloseAt(event.target.value)}
              />
            </label>
          ) : null}
          <label>
            <span>사유</span>
            <input
              value={calendarReason}
              onChange={(event) => setCalendarReason(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={styles.submit}
            disabled={busy}
            onClick={saveCalendar}
          >
            예외 저장
          </button>
        </div>
        <div className={styles.novexList}>
          {calendar.map((item) => (
            <div key={item.id}>
              <strong>
                {item.kstDate} ·{" "}
                {item.mode === "EARLY_CLOSE"
                  ? `${item.closeAt} 폐장`
                  : "정규 시간"}
              </strong>
              <span>{item.reason}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => deleteCalendarWithConfirm(item)}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panel__head}>
          <span>배당 · 액면분할</span>
          <span>{actions.length}건</span>
        </div>
        <div className={styles.novexForm}>
          <label>
            <span>유형</span>
            <select
              value={actionType}
              onChange={(event) =>
                setActionType(event.target.value as typeof actionType)
              }
            >
              <option value="DIVIDEND">배당</option>
              <option value="SPLIT">정방향 분할</option>
            </select>
          </label>
          <label>
            <span>종목</span>
            <select
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
            >
              {stocks.map((stock) => (
                <option key={stock.ticker} value={stock.ticker}>
                  {stock.ticker}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>실행 시각</span>
            <input
              type="datetime-local"
              value={actionAt}
              onChange={(event) => setActionAt(event.target.value)}
            />
          </label>
          {actionType === "DIVIDEND" ? (
            <label>
              <span>주당 배당액</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={perShare}
                onChange={(event) => setPerShare(event.target.value)}
              />
            </label>
          ) : (
            <label>
              <span>분할 비율</span>
              <input
                type="number"
                min="2"
                max="10"
                step="1"
                value={ratio}
                onChange={(event) => setRatio(event.target.value)}
              />
            </label>
          )}
          <button
            type="button"
            className={styles.submit}
            disabled={busy}
            onClick={scheduleCorporateAction}
          >
            예약
          </button>
        </div>
        <div className={styles.novexList}>
          {actions.map((item) => (
            <div key={item.id}>
              <strong>
                {item.ticker} ·{" "}
                {item.type === "DIVIDEND"
                  ? `주당 ${item.perShare ?? 0}`
                  : `${item.ratio ?? 0}:1`}
              </strong>
              <span>
                {item.status} · {item.executeAt}
              </span>
              {item.status === "SCHEDULED" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => cancelCorporateActionWithConfirm(item)}
                >
                  취소
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panel__head}>
          <span>지연 회차 복구</span>
          <span>운영자 전용</span>
        </div>
        <div className={styles.novexForm}>
          <label>
            <span>회차 키</span>
            <input
              value={slotKey}
              onChange={(event) => setSlotKey(event.target.value)}
              placeholder="YYYY-MM-DD HH:mm"
            />
          </label>
          <button
            type="button"
            className={styles.submit}
            disabled={busy || !slotKey.trim()}
            onClick={recoverWithConfirm}
          >
            복구 실행
          </button>
        </div>
        <p className={styles.opsHint}>
          다음 회차 전 지연 실행하고, 여러 회차가 밀렸다면 한 회차로 병합됩니다.
        </p>
      </section>
    </div>
  );
}
