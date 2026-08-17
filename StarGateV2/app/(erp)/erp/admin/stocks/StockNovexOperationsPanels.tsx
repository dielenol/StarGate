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
  type: "DIVIDEND" | "SPLIT" | "RIGHTS_OFFERING";
  status: string;
  ticker: string;
  executeAt: string;
  perShare?: number;
  ratio?: number;
  announceAt?: string;
  reason?: string;
  priceAdjustmentPercent?: number;
  cancelledOpenTradeCount?: number;
  failedAt?: string;
  failureReason?: string;
  remainingDisclosuresCancelledAt?: string;
  remainingDisclosuresCancelledCount?: number;
};
type Feedback = { tone: "success" | "error"; text: string } | null;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKstDateTimeLocal(date = new Date()) {
  return new Date(date.getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 16);
}

function parseKstDateTimeLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}:00+09:00`);
  if (
    Number.isNaN(parsed.getTime()) ||
    toKstDateTimeLocal(parsed) !== value
  ) {
    return null;
  }
  return parsed;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatKstDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function corporateStatusLabel(status: string) {
  return {
    SCHEDULED: "예약",
    HALTED: "거래정지",
    COMPLETED: "완료",
    CANCELLED: "취소",
    ERROR: "오류",
  }[status] ?? status;
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
  const [publishAt, setPublishAt] = useState(toKstDateTimeLocal());
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
  const [actionType, setActionType] = useState<
    "DIVIDEND" | "SPLIT" | "RIGHTS_OFFERING"
  >("DIVIDEND");
  const [actionAt, setActionAt] = useState(toKstDateTimeLocal());
  const [announceAt, setAnnounceAt] = useState(toKstDateTimeLocal());
  const [perShare, setPerShare] = useState("");
  const [ratio, setRatio] = useState("2");
  const [rightsReason, setRightsReason] = useState("");
  const [priceAdjustmentPercent, setPriceAdjustmentPercent] = useState("0");
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
  const selectedStock = stocks.find((stock) => stock.ticker === ticker);
  const rightsFactor = Number(ratio);
  const rightsAdjustment = Number(priceAdjustmentPercent);
  const rightsMechanicalRawPrice =
    selectedStock && Number.isInteger(rightsFactor) && rightsFactor > 0
      ? selectedStock.price / rightsFactor
      : null;
  const rightsMechanicalPrice =
    rightsMechanicalRawPrice !== null
      ? Math.round(rightsMechanicalRawPrice * 100) / 100
      : null;
  const rightsFinalRawPrice =
    rightsMechanicalRawPrice !== null && Number.isFinite(rightsAdjustment)
      ? rightsMechanicalRawPrice * (1 + rightsAdjustment / 100)
      : null;
  const rightsFinalPrice =
    rightsFinalRawPrice !== null
      ? Math.round(rightsFinalRawPrice * 100) / 100
      : null;
  const rightsPriceUnsafe =
    rightsMechanicalRawPrice !== null &&
    rightsFinalRawPrice !== null &&
    (rightsMechanicalRawPrice < 0.01 || rightsFinalRawPrice < 0.01);

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
    const scheduledPublishAt =
      disclosureStatus === "SCHEDULED"
        ? parseKstDateTimeLocal(publishAt)
        : null;
    if (
      !headline.trim() ||
      (disclosureStatus === "SCHEDULED" && !scheduledPublishAt) ||
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
        ? { publishAt: scheduledPublishAt!.toISOString() }
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
    setPublishAt(toKstDateTimeLocal(new Date(item.publishAt)));
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
        : Number(ratio);
    const executionDate = parseKstDateTimeLocal(actionAt);
    const announcementDate =
      actionType === "RIGHTS_OFFERING"
        ? parseKstDateTimeLocal(announceAt)
        : null;
    if (
      !ticker ||
      !executionDate ||
      !Number.isFinite(value) ||
      value <= 0 ||
      (actionType !== "DIVIDEND" &&
        (!Number.isInteger(value) || value < 2 || value > 10)) ||
      (actionType === "RIGHTS_OFFERING" &&
        (!announcementDate ||
          !rightsReason.trim() ||
          !Number.isFinite(Number(priceAdjustmentPercent)) ||
          Number(priceAdjustmentPercent) < -50 ||
          Number(priceAdjustmentPercent) > 75 ||
          rightsPriceUnsafe ||
          announcementDate.getTime() >= executionDate.getTime()))
    ) {
      setFeedback({ tone: "error", text: "기업행동 예약 값을 확인하세요." });
      return;
    }
    const payload = {
      type: actionType,
      ticker,
      executeAt: executionDate.toISOString(),
      ...(actionType === "DIVIDEND" ? { perShare: value } : { ratio: value }),
      ...(actionType === "RIGHTS_OFFERING"
        ? {
            announceAt: announcementDate!.toISOString(),
            reason: rightsReason.trim(),
            priceAdjustmentPercent: Number(priceAdjustmentPercent),
          }
        : {}),
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
    const abortsActiveRightsOffering =
      item.type === "RIGHTS_OFFERING" && item.status === "HALTED";
    const cancelsRemainingDisclosures =
      item.type === "RIGHTS_OFFERING" && item.status === "COMPLETED";
    if (
      !window.confirm(
        abortsActiveRightsOffering
          ? `${item.ticker} 유상증자를 중단하고 거래를 재개할까요? 예정된 증자는 실행되지 않습니다.`
          : cancelsRemainingDisclosures
            ? `${item.ticker} 유상증자는 되돌리지 않고 아직 공개되지 않은 연계 후속 공시만 모두 취소할까요?`
            : `${item.ticker} ${item.type === "DIVIDEND" ? "배당" : item.type === "SPLIT" ? "분할" : "유상증자"} 예약을 취소할까요?`,
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
          finish(
            cancelOpRef,
            operation.key,
            abortsActiveRightsOffering
              ? "유상증자를 중단하고 거래를 재개했습니다."
              : cancelsRemainingDisclosures
                ? "미공개 연계 후속 공시를 모두 취소했습니다."
              : "기업행동 예약을 취소했습니다.",
          ),
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
              <span>공개 시각 (KST)</span>
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
                      {item.status} · {formatKstDateTime(item.publishAt)} KST
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
          <span>배당 · 액면분할 · 유상증자</span>
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
              <option value="RIGHTS_OFFERING">유상증자</option>
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
            <span>
              {actionType === "RIGHTS_OFFERING"
                ? "증자 실행 · 거래재개 (KST)"
                : "실행 시각 (KST)"}
            </span>
            <input
              type="datetime-local"
              value={actionAt}
              onChange={(event) => setActionAt(event.target.value)}
            />
          </label>
          {actionType === "RIGHTS_OFFERING" ? (
            <label>
              <span>발표 · 거래정지 시작 (KST)</span>
              <input
                type="datetime-local"
                value={announceAt}
                onChange={(event) => setAnnounceAt(event.target.value)}
              />
            </label>
          ) : null}
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
              <span>
                {actionType === "RIGHTS_OFFERING"
                  ? "총 주식 수 배수"
                  : "분할 비율"}
              </span>
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
          {actionType === "RIGHTS_OFFERING" ? (
            <>
              <label>
                <span>유증 사유</span>
                <input
                  value={rightsReason}
                  maxLength={500}
                  onChange={(event) => setRightsReason(event.target.value)}
                  placeholder="투자 재원 확보, 경영난 자금조달 등"
                />
              </label>
              <label>
                <span>실행 회차 추가 가격조정률 (%)</span>
                <input
                  type="number"
                  min="-50"
                  max="75"
                  step="0.01"
                  value={priceAdjustmentPercent}
                  onChange={(event) =>
                    setPriceAdjustmentPercent(event.target.value)
                  }
                />
              </label>
              <p className={styles.opsHint}>
                {rightsMechanicalPrice !== null && rightsFinalPrice !== null
                  ? `현재 ¤${selectedStock?.price.toLocaleString()} → 주식 수 ${rightsFactor}배 반영 후 ¤${rightsMechanicalPrice.toLocaleString()} → 사유 조정 ${rightsAdjustment >= 0 ? "+" : ""}${rightsAdjustment}% 후 약 ¤${rightsFinalPrice.toLocaleString()}`
                  : "배수와 가격조정률을 입력하면 실행 가격을 미리 확인할 수 있습니다."}
                {rightsPriceUnsafe
                  ? " · 센트 하한보다 낮아 예약할 수 없습니다."
                  : Math.abs(rightsAdjustment) >= 12
                  ? " · 실행 직후 10분 자동냉각이 적용됩니다."
                  : ""}
              </p>
            </>
          ) : null}
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
                  : item.type === "SPLIT"
                    ? `${item.ratio ?? 0}:1`
                    : `총 주식 ${item.ratio ?? 0}배 · ${item.priceAdjustmentPercent ?? 0}%`}
              </strong>
              <span>
                {corporateStatusLabel(item.status)} · {item.announceAt
                  ? `${formatKstDateTime(item.announceAt)} KST 정지 → `
                  : ""}{formatKstDateTime(item.executeAt)} KST
              </span>
              {item.type === "RIGHTS_OFFERING" ? (
                <span>
                  {item.reason}
                  {item.cancelledOpenTradeCount !== undefined
                    ? ` · 발표 시 OPEN 거래 ${item.cancelledOpenTradeCount}건 자동 취소`
                    : ""}
                </span>
              ) : null}
              {item.status === "ERROR" && item.failureReason ? (
                <span>
                  실행 차단: {item.failureReason}
                  {item.failedAt
                    ? ` · ${formatKstDateTime(item.failedAt)} KST`
                    : ""}
                </span>
              ) : null}
              {item.remainingDisclosuresCancelledAt ? (
                <span>
                  연계 후속 공시 {item.remainingDisclosuresCancelledCount ?? 0}건 취소 · {formatKstDateTime(item.remainingDisclosuresCancelledAt)} KST
                </span>
              ) : null}
              {item.status === "SCHEDULED" ||
              item.status === "HALTED" ||
              (item.type === "RIGHTS_OFFERING" &&
                item.status === "COMPLETED" &&
                !item.remainingDisclosuresCancelledAt) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => cancelCorporateActionWithConfirm(item)}
                >
                  {item.status === "COMPLETED" ? "후속 공시 취소" : "취소"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <p className={styles.opsHint}>
          유상증자 이후 호재 폭등은 실행 이후 회차에 공시 센터의 PRICE 공시로
          별도 예약하세요.
        </p>
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
