import type {
  StockCorporateAction,
  StockMarketCalendarException,
} from "@stargate/shared-db/types";

import type {
  StockCalendarExceptionItem,
  StockCorporateActionItem,
} from "@/hooks/queries/useAdminStockMarketQuery";

function formatKstDateTime(value: Date): { date: string; time: string } {
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
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function toStockSlotKey(value: Date, expectedHour: 9 | 23): string | null {
  const kst = formatKstDateTime(value);
  return kst.time === `${String(expectedHour).padStart(2, "0")}:00`
    ? `${kst.date} ${kst.time}`
    : null;
}

export function nextKstOpenSlot(recordAt: Date): string {
  const kst = formatKstDateTime(recordAt);
  const noonUtc = new Date(`${kst.date}T12:00:00Z`);
  noonUtc.setUTCDate(noonUtc.getUTCDate() + 1);
  return `${noonUtc.toISOString().slice(0, 10)} 09:00`;
}

export function serializeStockCalendarException(
  item: StockMarketCalendarException,
): StockCalendarExceptionItem {
  return {
    id: item._id,
    kstDate: item.kstDate,
    mode:
      item.mode === "CANCEL_EARLY_CLOSE" ? "NORMAL_HOURS" : "EARLY_CLOSE",
    closeAt: item.closeAt?.toISOString() ?? null,
    reason: item.reason ?? "운영 예외",
    updatedAt: item.updatedAt.toISOString(),
  };
}

function slotKeyToIso(slotKey: string): string {
  return new Date(`${slotKey.replace(" ", "T")}:00+09:00`).toISOString();
}

export function serializeStockCorporateAction(
  item: StockCorporateAction,
): StockCorporateActionItem {
  if (item.type === "DIVIDEND") {
    return {
      id: item._id,
      type: item.type,
      status: item.status,
      ticker: item.ticker,
      executeAt: slotKeyToIso(item.recordSlotKey),
      perShare: item.amountPerShare,
      recordAt: slotKeyToIso(item.recordSlotKey),
    };
  }
  return {
    id: item._id,
    type: item.type,
    status: item.status,
    ticker: item.ticker,
    executeAt: slotKeyToIso(item.executeSlotKey),
    ratio: item.factor,
  };
}
