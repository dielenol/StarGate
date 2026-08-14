import type {
  StockFlowSignal,
  StockMarketState,
} from "@stargate/shared-db/types";

import type {
  StockMarketStateItem,
  StockOrderFlowSignal,
} from "@/hooks/queries/useStocksQuery";
import { isNovexV2Enabled, isStockMarketEnabled } from "@/lib/stocks/market";

const PRICE_SLOT_HOURS = [9, 13, 18, 23] as const;
const KST_OFFSET = "+09:00";

interface KstParts {
  date: string;
  hour: number;
  minute: number;
}

function getKstParts(now: Date): KstParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function atKst(date: string, hour: number, minute = 0): Date {
  return new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${KST_OFFSET}`,
  );
}

function addKstDays(date: string, days: number): string {
  const utc = new Date(`${date}T12:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function marketWindow(now: Date): {
  date: string;
  opensAt: Date;
  closesAt: Date;
  withinTradingHours: boolean;
} {
  const kst = getKstParts(now);
  const opensAt = atKst(kst.date, 9);
  const closesAt = atKst(kst.date, 23);
  return {
    date: kst.date,
    opensAt,
    closesAt,
    withinTradingHours:
      now.getTime() >= opensAt.getTime() && now.getTime() < closesAt.getTime(),
  };
}

function nextMarketOpen(now: Date): Date {
  const window = marketWindow(now);
  if (now.getTime() < window.opensAt.getTime()) return window.opensAt;
  return atKst(addKstDays(window.date, 1), 9);
}

function nextLegacySlot(now: Date): Date {
  const kst = getKstParts(now);
  const currentMinutes = kst.hour * 60 + kst.minute;
  const nextHour = PRICE_SLOT_HOURS.find(
    (hour) => hour * 60 > currentMinutes,
  );
  if (nextHour !== undefined) return atKst(kst.date, nextHour);
  return atKst(addKstDays(kst.date, 1), PRICE_SLOT_HOURS[0]);
}

function stockSlotKey(value: Date): string {
  const parts = getKstParts(value);
  return `${parts.date} ${String(parts.hour).padStart(2, "0")}:${String(
    parts.minute,
  ).padStart(2, "0")}`;
}

function nextStockSlot(value: Date): Date {
  const parts = getKstParts(value);
  const nextHour = PRICE_SLOT_HOURS.find((hour) => hour > parts.hour);
  if (nextHour !== undefined) return atKst(parts.date, nextHour);
  return atKst(addKstDays(parts.date, 1), PRICE_SLOT_HOURS[0]);
}

function pendingStockSlotKeys(nextSlotAt: Date | undefined, now: Date): string[] {
  if (!nextSlotAt || nextSlotAt.getTime() > now.getTime()) return [];
  const slots: string[] = [];
  let cursor = nextSlotAt;
  for (let guard = 0; guard < 16 && cursor.getTime() <= now.getTime(); guard += 1) {
    slots.push(stockSlotKey(cursor));
    cursor = nextStockSlot(cursor);
  }
  return slots;
}

export function buildLegacyStockMarketState(now = new Date()): StockMarketStateItem {
  const kst = getKstParts(now);
  const opensAt = atKst(kst.date, 9);
  const closesAt = atKst(kst.date, 23);
  const globallyEnabled = isStockMarketEnabled();
  return {
    status: globallyEnabled ? "OPEN" : "CLOSED",
    reason: !globallyEnabled
      ? "운영자가 주식 거래를 일시 중지했습니다."
      : "기존 시장 엔진으로 거래 중입니다.",
    asOf: now.toISOString(),
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    nextPriceSlotAt: nextLegacySlot(now).toISOString(),
    delayed: false,
    pendingSlotKeys: [],
    earlyCloseAt: null,
  };
}

export function serializeStockMarketState(
  state: StockMarketState | null,
  now = new Date(),
): StockMarketStateItem {
  if (!isNovexV2Enabled()) return buildLegacyStockMarketState(now);
  if (!state) {
    const window = marketWindow(now);
    const openingPending = window.withinTradingHours;
    const opensAt = openingPending ? window.opensAt : nextMarketOpen(now);
    return {
      status: openingPending ? "OPENING_PENDING" : "CLOSED",
      reason: openingPending
        ? "09시 가격 회차 확정을 기다리고 있습니다."
        : "정규 거래 시간 밖이라 폐장 상태입니다.",
      asOf: now.toISOString(),
      opensAt: opensAt.toISOString(),
      closesAt: (openingPending
        ? window.closesAt
        : atKst(getKstParts(opensAt).date, 23)
      ).toISOString(),
      nextPriceSlotAt: opensAt.toISOString(),
      delayed: openingPending,
      pendingSlotKeys: openingPending
        ? [`${window.date} 09:00`]
        : [],
      earlyCloseAt: null,
    };
  }
  const pendingSlotKeys = pendingStockSlotKeys(state.nextSlotAt, now);
  const delayed = state.delayed || pendingSlotKeys.length > 0;
  const opensAt =
    state.status === "CLOSED"
      ? state.nextSlotAt && state.nextSlotAt.getTime() > now.getTime()
        ? state.nextSlotAt
        : nextMarketOpen(now)
      : state.opensAt;
  return {
    status: state.status,
    reason:
      state.status === "OPEN"
        ? delayed
          ? "직전 가격으로 거래 중이며 지연 회차를 복구하고 있습니다."
          : "정규 거래 시간입니다."
        : state.status === "OPENING_PENDING"
          ? "09시 가격 회차 확정을 기다리고 있습니다."
          : state.closureReason === "REGULAR_SESSION"
            ? "정규 세션 일정에 따라 조기 폐장했습니다."
            : state.closureReason === "REGULAR_SESSION_FALLBACK"
              ? "정규 세션 일정 확인 경고로 18시에 폐장했습니다."
              : state.closureReason === "GM_EXCEPTION"
                ? "운영 예외에 따라 폐장했습니다."
                : "정규 폐장 상태입니다.",
    asOf: now.toISOString(),
    opensAt: opensAt.toISOString(),
    closesAt: state.closesAt.toISOString(),
    nextPriceSlotAt: state.nextSlotAt?.toISOString() ?? null,
    delayed,
    pendingSlotKeys,
    earlyCloseAt:
      state.closureReason === "REGULAR_SESSION" ||
      state.closureReason === "REGULAR_SESSION_FALLBACK" ||
      state.closureReason === "GM_EXCEPTION"
        ? state.closesAt.toISOString()
        : null,
  };
}

export function serializeStockFlowSignal(
  signal: StockFlowSignal | undefined,
): StockOrderFlowSignal | null {
  if (!signal) return null;
  return {
    direction: signal.direction === "NEUTRAL" ? "BALANCED" : signal.direction,
    strength: signal.strength,
    volume: signal.volume,
  };
}
