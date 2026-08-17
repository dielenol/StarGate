import type {
  StockDisclosure,
  StockDisclosureEffect,
  StockCompanyProfileUpdate,
} from "@stargate/shared-db/types";

import type { StockDisclosureItem } from "@/hooks/queries/useStockDisclosuresQuery";
import { findStockByTicker } from "@/lib/stocks/catalog";

export const STOCK_DISCLOSURE_TITLE_MAX_LENGTH = 120;
export const STOCK_DISCLOSURE_BODY_MAX_LENGTH = 2_000;
export const STOCK_DISCLOSURE_MIN_CHANGE_PERCENT = -50;
export const STOCK_DISCLOSURE_MAX_CHANGE_PERCENT = 75;

export interface StockDisclosurePayload {
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED";
  kind: "INFO" | "PRICE";
  scope: "MARKET" | "TICKERS";
  tickers: string[];
  publishAt?: Date;
  slotKey?: string;
  headline: string;
  body: string;
  effects: StockDisclosureEffect[];
  forceCooldown: boolean;
  companyProfileUpdate?: StockCompanyProfileUpdate;
}

function toKstSlotKey(value: Date): string | null {
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
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (![9, 13, 18, 23].includes(hour) || minute !== 0) return null;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function normalizeTickers(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const tickers = Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  if (tickers.some((ticker) => !findStockByTicker(ticker))) return null;
  return tickers;
}

function readFinitePercent(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 100) / 100;
}

function normalizeCompanyProfileUpdate(
  value: unknown,
): StockCompanyProfileUpdate | null | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") return null;
  const majorShareholders = (value as Record<string, unknown>)
    .majorShareholders;
  if (
    !Array.isArray(majorShareholders) ||
    majorShareholders.length < 1 ||
    majorShareholders.length > 10
  ) {
    return null;
  }
  const seen = new Set<string>();
  let totalStake = 0;
  const normalized: StockCompanyProfileUpdate["majorShareholders"] = [];
  for (const raw of majorShareholders) {
    if (!raw || typeof raw !== "object") return null;
    const shareholder = raw as Record<string, unknown>;
    const name = typeof shareholder.name === "string"
      ? shareholder.name.trim()
      : "";
    const stakePercent = readFinitePercent(shareholder.stakePercent);
    const note = typeof shareholder.note === "string"
      ? shareholder.note.trim()
      : undefined;
    if (
      name.length < 1 ||
      name.length > 100 ||
      seen.has(name) ||
      stakePercent === undefined ||
      !Number.isFinite(stakePercent) ||
      stakePercent <= 0 ||
      stakePercent > 100 ||
      (note !== undefined && note.length > 300)
    ) {
      return null;
    }
    seen.add(name);
    totalStake += stakePercent;
    normalized.push({
      name,
      stakePercent,
      ...(note ? { note } : {}),
    });
  }
  if (Math.round(totalStake * 100) / 100 > 100) return null;
  return { majorShareholders: normalized };
}

function buildEffects(input: {
  kind: "INFO" | "PRICE";
  scope: "MARKET" | "TICKERS";
  tickers: string[];
  effects: unknown;
}): StockDisclosureEffect[] | null {
  const rawEffects = Array.isArray(input.effects) ? input.effects : [];
  if (input.kind === "INFO") {
    return input.scope === "MARKET"
      ? [{ scope: "MARKET", structural: false }]
      : input.tickers.map((ticker) => ({
          scope: "TICKER" as const,
          ticker,
          structural: false,
        }));
  }

  const effects: StockDisclosureEffect[] = [];
  const seen = new Set<string>();
  for (const raw of rawEffects) {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    const scope = value.scope;
    const ticker =
      typeof value.ticker === "string"
        ? value.ticker.trim().toUpperCase()
        : undefined;
    const changePercent = readFinitePercent(value.changePercent);
    if (
      (scope !== "MARKET" && scope !== "TICKER") ||
      changePercent === undefined ||
      !Number.isFinite(changePercent) ||
      changePercent < STOCK_DISCLOSURE_MIN_CHANGE_PERCENT ||
      changePercent > STOCK_DISCLOSURE_MAX_CHANGE_PERCENT
    ) {
      return null;
    }
    if (scope === "TICKER" && (!ticker || !input.tickers.includes(ticker))) {
      return null;
    }
    if (scope === "MARKET" && input.scope !== "MARKET") return null;
    const key = scope === "MARKET" ? "MARKET" : `TICKER:${ticker}`;
    if (seen.has(key)) return null;
    seen.add(key);
    effects.push({
      scope,
      ...(ticker ? { ticker } : {}),
      changePercent,
      structural: value.structural === true,
    });
  }
  if (effects.length === 0) return null;
  if (
    input.scope === "MARKET" &&
    !effects.some((effect) => effect.scope === "MARKET")
  ) {
    return null;
  }
  if (
    input.scope === "TICKERS" &&
    input.tickers.some(
      (ticker) =>
        !effects.some(
          (effect) => effect.scope === "TICKER" && effect.ticker === ticker,
        ),
    )
  ) {
    return null;
  }
  return effects;
}

export function parseStockDisclosurePayload(
  value: unknown,
): { ok: true; value: StockDisclosurePayload } | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "요청 본문이 올바르지 않습니다." };
  }
  const input = value as Record<string, unknown>;
  const status = input.status;
  const kind = input.kind;
  const scope = input.scope;
  if (
    status !== "DRAFT" &&
    status !== "SCHEDULED" &&
    status !== "PUBLISHED"
  ) {
    return { ok: false, error: "공시 상태가 올바르지 않습니다." };
  }
  if (kind !== "INFO" && kind !== "PRICE") {
    return { ok: false, error: "공시 유형이 올바르지 않습니다." };
  }
  if (status === "PUBLISHED" && kind !== "INFO") {
    return {
      ok: false,
      error: "즉시 공개는 정보 전용 공시만 지원합니다.",
    };
  }
  if (scope !== "MARKET" && scope !== "TICKERS") {
    return { ok: false, error: "공시 대상이 올바르지 않습니다." };
  }
  const tickers = normalizeTickers(input.tickers);
  if (!tickers || (scope === "TICKERS" && tickers.length === 0)) {
    return { ok: false, error: "공시 대상 종목이 올바르지 않습니다." };
  }
  const headline =
    typeof input.headline === "string" ? input.headline.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (
    headline.length < 1 ||
    headline.length > STOCK_DISCLOSURE_TITLE_MAX_LENGTH
  ) {
    return {
      ok: false,
      error: `공시 제목은 1~${STOCK_DISCLOSURE_TITLE_MAX_LENGTH}자여야 합니다.`,
    };
  }
  if (body.length > STOCK_DISCLOSURE_BODY_MAX_LENGTH) {
    return {
      ok: false,
      error: `공시 본문은 ${STOCK_DISCLOSURE_BODY_MAX_LENGTH}자 이하여야 합니다.`,
    };
  }
  const publishAt =
    typeof input.publishAt === "string" && input.publishAt.trim()
      ? new Date(input.publishAt)
      : undefined;
  if (publishAt && Number.isNaN(publishAt.getTime())) {
    return { ok: false, error: "공개 시각이 올바르지 않습니다." };
  }
  if (status === "SCHEDULED" && !publishAt) {
    return { ok: false, error: "예약 공시에는 공개 시각이 필요합니다." };
  }
  const slotKey = publishAt ? toKstSlotKey(publishAt) : undefined;
  if (status === "SCHEDULED" && !slotKey) {
    return {
      ok: false,
      error: "예약 공시는 09·13·18·23시 가격 회차에만 공개할 수 있습니다.",
    };
  }
  const effects = buildEffects({ kind, scope, tickers, effects: input.effects });
  if (!effects) {
    return { ok: false, error: "공시 가격 효과가 올바르지 않습니다." };
  }
  const companyProfileUpdate = normalizeCompanyProfileUpdate(
    input.companyProfileUpdate,
  );
  if (
    companyProfileUpdate === null ||
    (companyProfileUpdate !== undefined &&
      (kind !== "PRICE" || scope !== "TICKERS" || tickers.length !== 1))
  ) {
    return {
      ok: false,
      error:
        "주요주주 갱신은 단일 종목 PRICE 공시에 이름·지분율·메모로 입력해야 합니다.",
    };
  }
  return {
    ok: true,
    value: {
      status,
      kind,
      scope,
      tickers,
      ...(publishAt ? { publishAt } : {}),
      ...(slotKey ? { slotKey } : {}),
      headline,
      body,
      effects,
      forceCooldown: input.forceCooldown === true,
      ...(companyProfileUpdate ? { companyProfileUpdate } : {}),
    },
  };
}

function disclosureTarget(disclosure: StockDisclosure): {
  scope: "MARKET" | "TICKERS";
  tickers: string[];
} {
  const scope = disclosure.effects.some((effect) => effect.scope === "MARKET")
    ? "MARKET"
    : "TICKERS";
  const tickers = Array.from(
    new Set(
      disclosure.effects
        .map((effect) => effect.ticker)
        .filter((ticker): ticker is string => Boolean(ticker)),
    ),
  ).sort();
  return { scope, tickers };
}

export function serializeStockDisclosure(
  disclosure: StockDisclosure,
  options: { admin: boolean },
): StockDisclosureItem {
  const published = disclosure.status === "PUBLISHED";
  const target = disclosureTarget(disclosure);
  const publishAt =
    disclosure.publishAt ??
    disclosure.publishedAt ??
    disclosure.createdAt;
  const beforeCutoff =
    disclosure.status === "DRAFT" ||
    (disclosure.status === "SCHEDULED" &&
      disclosure.publishAt !== undefined &&
      disclosure.publishAt.getTime() > Date.now());
  return {
    id: disclosure._id,
    status: disclosure.status,
    ...(options.admin || published ? { kind: disclosure.kind } : {}),
    ...target,
    publishAt: publishAt.toISOString(),
    ...(options.admin || published
      ? {
          headline: disclosure.title,
          body: disclosure.body,
          effects: disclosure.effects,
          ...(disclosure.companyProfileUpdate
            ? { companyProfileUpdate: disclosure.companyProfileUpdate }
            : {}),
        }
      : {}),
    ...(options.admin ? { createdBy: disclosure.createdById } : {}),
    canEdit: options.admin && beforeCutoff,
    canCancel: options.admin && beforeCutoff,
  };
}
