import type {
  StockDisclosure,
  StockDisclosureEffect,
  StockMarketCalendarException,
  StockMarketClosureReason,
  StockPrice,
  StockSeasonPerformance,
} from "@stargate/shared-db/types";
import type { CreateStockDisclosureInput } from "@stargate/shared-db";

import type { StockPriceDirection } from "./stock-events.js";
import { normalizeStockPrice } from "./stock-pricing.js";

export const NOVEX_SLOT_HOURS = [9, 13, 18, 23] as const;
export const NOVEX_REGULAR_SESSION_ANCHOR = "2026-08-23";
export const NOVEX_REGULAR_SESSION_TITLE = "노부스 오르도 - 정규 세션";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseKstDate(date: string, hour = 0, minute = 0): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`);
}

export function novexKstDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function novexSlotKey(date: string, hour: number): string {
  return `${date} ${String(hour).padStart(2, "0")}:00`;
}

export function parseNovexSlotKey(slotKey: string): Date {
  return new Date(`${slotKey.replace(" ", "T")}:00+09:00`);
}

export function latestDueNovexSlot(now: Date): string | null {
  const date = novexKstDate(now);
  for (const hour of [...NOVEX_SLOT_HOURS].reverse()) {
    if (now.getTime() >= parseKstDate(date, hour).getTime()) {
      return novexSlotKey(date, hour);
    }
  }
  return null;
}

export function nextNovexSlotAfter(slotKey: string): string {
  const current = parseNovexSlotKey(slotKey);
  const date = novexKstDate(current);
  const hour = current.getUTCHours() + 9 >= 24 ? current.getUTCHours() - 15 : current.getUTCHours() + 9;
  const index = NOVEX_SLOT_HOURS.indexOf(hour as (typeof NOVEX_SLOT_HOURS)[number]);
  if (index >= 0 && index < NOVEX_SLOT_HOURS.length - 1) {
    return novexSlotKey(date, NOVEX_SLOT_HOURS[index + 1]!);
  }
  const tomorrow = novexKstDate(new Date(parseKstDate(date).getTime() + DAY_MS));
  return novexSlotKey(tomorrow, 9);
}

export function nextNovexMarketActionAt(
  slotKey: string,
  closeAfterRound: boolean,
): Date {
  if (!closeAfterRound) return parseNovexSlotKey(nextNovexSlotAfter(slotKey));
  const date = novexKstDate(parseNovexSlotKey(slotKey));
  const tomorrow = novexKstDate(new Date(parseKstDate(date).getTime() + DAY_MS));
  return parseKstDate(tomorrow, 9);
}

export function enumerateNovexSlotsAfter(
  previousSlotKey: string | undefined,
  targetSlotKey: string,
): string[] {
  if (!previousSlotKey) {
    const targetAt = parseNovexSlotKey(targetSlotKey);
    const targetDate = novexKstDate(targetAt);
    return NOVEX_SLOT_HOURS
      .map((hour) => novexSlotKey(targetDate, hour))
      .filter((slotKey) =>
        parseNovexSlotKey(slotKey).getTime() <= targetAt.getTime(),
      );
  }
  const slots: string[] = [];
  let cursor = nextNovexSlotAfter(previousSlotKey);
  for (let guard = 0; guard < 128; guard += 1) {
    if (parseNovexSlotKey(cursor).getTime() > parseNovexSlotKey(targetSlotKey).getTime()) break;
    slots.push(cursor);
    if (cursor === targetSlotKey) break;
    cursor = nextNovexSlotAfter(cursor);
  }
  return slots;
}

export function isNovexRegularSessionDate(kstDate: string): boolean {
  const anchor = parseKstDate(NOVEX_REGULAR_SESSION_ANCHOR).getTime();
  const target = parseKstDate(kstDate).getTime();
  const days = Math.round((target - anchor) / DAY_MS);
  return days >= 0 && days % 14 === 0;
}

export function novexSeasonDateRangeForStart(
  kstStartDate: string,
): { startsOn: string; endsOn: string } | null {
  const start = parseKstDate(kstStartDate);
  const previous = novexKstDate(new Date(start.getTime() - DAY_MS));
  if (!isNovexRegularSessionDate(previous)) return null;
  return {
    startsOn: kstStartDate,
    endsOn: novexKstDate(new Date(start.getTime() + 13 * DAY_MS)),
  };
}

export interface ResolveNovexWindowInput {
  kstDate: string;
  regularSessionStarts: Date[];
  exception?: StockMarketCalendarException | null;
}
export interface NovexTradingWindow {
  opensAt: Date;
  closesAt: Date;
  closureReason: StockMarketClosureReason;
  warning?: "REGULAR_SESSION_MISSING" | "REGULAR_SESSION_AMBIGUOUS";
}

export function resolveNovexTradingWindow(input: ResolveNovexWindowInput): NovexTradingWindow {
  const opensAt = parseKstDate(input.kstDate, 9);
  const dailyClose = parseKstDate(input.kstDate, 23);
  if (input.exception?.mode === "CANCEL_EARLY_CLOSE") {
    return { opensAt, closesAt: dailyClose, closureReason: "DAILY_CLOSE" };
  }
  if (input.exception?.mode === "EARLY_CLOSE" && input.exception.closeAt) {
    return { opensAt, closesAt: input.exception.closeAt, closureReason: "GM_EXCEPTION" };
  }
  if (!isNovexRegularSessionDate(input.kstDate)) {
    return { opensAt, closesAt: dailyClose, closureReason: "DAILY_CLOSE" };
  }
  if (input.regularSessionStarts.length === 1) {
    return { opensAt, closesAt: input.regularSessionStarts[0]!, closureReason: "REGULAR_SESSION" };
  }
  return {
    opensAt,
    closesAt: parseKstDate(input.kstDate, 18),
    closureReason: "REGULAR_SESSION_FALLBACK",
    warning: input.regularSessionStarts.length === 0
      ? "REGULAR_SESSION_MISSING"
      : "REGULAR_SESSION_AMBIGUOUS",
  };
}

/** 조기 폐장 시각과 같거나 뒤인 가격 회차는 다음 개장 회차로 이월한다. */
export function shouldDeferNovexRoundForEarlyClose(
  slotKey: string,
  closesAt: Date,
): boolean {
  const slotAt = parseNovexSlotKey(slotKey);
  const dailyClose = parseKstDate(slotKey.slice(0, 10), 23);
  return (
    closesAt.getTime() < dailyClose.getTime() &&
    slotAt.getTime() >= closesAt.getTime()
  );
}

export interface NovexPriceContributions {
  price: number;
  referencePrice: number;
  basePercent: number;
  flowPercent: number;
  disclosurePercent: number;
  finalPercent: number;
  eventTier: "routine" | "scenario" | "shock";
  eventText: string;
  cooldownUntil?: Date;
  cooldownReason?: string;
  pendingBasePercent: number;
  consumeFlow: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function effectForTicker(disclosure: StockDisclosure | undefined, ticker: string): StockDisclosureEffect | undefined {
  if (!disclosure) return undefined;
  return disclosure.effects.find((effect) => effect.scope === "TICKER" && effect.ticker === ticker)
    ?? disclosure.effects.find((effect) => effect.scope === "MARKET");
}

/** 적정가 회귀+0중심 잡음, 수급, 공시 기여를 명시적으로 분리한다. */
export function calculateNovexPrice(input: {
  current: StockPrice;
  flowPercent: number;
  disclosure?: StockDisclosure;
  /** 병합 공시 중 구조적 효과만 합산한 소수 비율. */
  structuralDisclosurePercent?: number;
  random: () => number;
  now: Date;
}): NovexPriceContributions {
  const reference = input.current.referencePrice ?? input.current.price;
  const reversion = ((reference - input.current.price) / Math.max(input.current.price, 0.01)) * 0.12;
  const noise = (input.random() - 0.5) * 0.06;
  const basePercent = clamp(reversion + noise, -0.05, 0.05);
  const carriedBase = input.current.pendingBasePercent ?? 0;
  const effect = effectForTicker(input.disclosure, input.current.ticker);
  const disclosurePercent = (effect?.changePercent ?? 0) / 100;
  const exactPriceOverride =
    (input.disclosure?.source === "GM" ||
      input.disclosure?.source === "CORPORATE_ACTION") &&
    input.disclosure.kind === "PRICE" &&
    effect?.changePercent !== undefined;

  let finalPercent: number;
  let pendingBasePercent = 0;
  let consumeFlow = true;
  if (exactPriceOverride) {
    finalPercent = clamp(disclosurePercent, -0.5, 0.75);
    pendingBasePercent = clamp(carriedBase + basePercent, -0.08, 0.08);
    consumeFlow = false;
  } else {
    const requested = carriedBase + basePercent + input.flowPercent + disclosurePercent;
    const cap = input.disclosure?.shock ? 0.2 : input.disclosure?.kind === "PRICE" ? 0.12 : 0.08;
    finalPercent = clamp(requested, -cap, cap);
  }

  const price = normalizeStockPrice(input.current.price * (1 + finalPercent));
  const referenceChangePercent =
    input.structuralDisclosurePercent ??
    (effect?.structural ? disclosurePercent : 0);
  const referencePrice = referenceChangePercent !== 0
    ? normalizeStockPrice(reference * (1 + referenceChangePercent))
    : reference;
  const cooling = Math.abs(finalPercent) >= 0.12 || input.disclosure?.forceCooldown === true;
  const cooldownUntil = cooling ? new Date(input.now.getTime() + 10 * 60 * 1000) : undefined;
  const eventTier = Math.abs(finalPercent) >= 0.12 ? "shock" : input.disclosure ? "scenario" : "routine";
  const signed = `${finalPercent >= 0 ? "+" : ""}${(finalPercent * 100).toFixed(2)}%`;
  return {
    price,
    referencePrice,
    basePercent: exactPriceOverride ? 0 : basePercent + carriedBase,
    flowPercent: exactPriceOverride ? 0 : input.flowPercent,
    disclosurePercent: exactPriceOverride ? finalPercent : disclosurePercent,
    finalPercent,
    eventTier,
    eventText: input.disclosure ? `${input.disclosure.title} ${signed}` : `정기 변동 ${signed}`,
    cooldownUntil,
    cooldownReason: cooling ? (input.disclosure?.forceCooldown ? "GM_FORCE_COOLDOWN" : "VOLATILITY_12_PERCENT") : undefined,
    pendingBasePercent,
    consumeFlow,
  };
}

export interface AutoDisclosureTemplate {
  id: string;
  title: string;
  body: string;
  structural: boolean;
  scope: "MARKET" | "TICKER";
  /** 문안 서사와 가격 방향을 강제로 일치시킨다. 부호를 따로 굴리지 않는다. */
  direction: StockPriceDirection;
}

// 문안이 호재/악재를 이미 단정하므로 방향은 템플릿이 소유한다. TICKER 6종 : MARKET
// 2종 = 3:1 비율과 상승 4종 : 하락 4종 균형을 유지한 상태로만 항목을 늘린다.
export const NOVEX_AUTO_DISCLOSURE_TEMPLATES: readonly AutoDisclosureTemplate[] = [
  { id: "contract-win", title: "대형 공급 계약 체결", body: "주요 공급 계약이 확정되었습니다.", structural: true, scope: "TICKER", direction: "up" },
  { id: "capacity-expansion", title: "증설 투자안 승인", body: "생산 능력 확대 투자안이 이사회를 통과했습니다.", structural: true, scope: "TICKER", direction: "up" },
  { id: "guidance-raise", title: "분기 실적 전망 상향", body: "자체 실적 전망치가 상향 조정되었습니다.", structural: false, scope: "TICKER", direction: "up" },
  { id: "contract-loss", title: "주요 공급 계약 해지", body: "장기 공급 계약 한 건이 해지되었습니다.", structural: true, scope: "TICKER", direction: "down" },
  { id: "production-delay", title: "생산 일정 지연", body: "핵심 생산 일정에 차질이 발생했습니다.", structural: false, scope: "TICKER", direction: "down" },
  { id: "regulatory-review", title: "규제기관 검토 착수", body: "관련 사업에 대한 규제 검토가 시작되었습니다.", structural: false, scope: "TICKER", direction: "down" },
  { id: "sector-demand-up", title: "산업 수요 전망 상향", body: "시장 수요 전망이 상향 조정되었습니다.", structural: true, scope: "MARKET", direction: "up" },
  { id: "sector-demand-down", title: "산업 수요 전망 하향", body: "시장 수요 전망이 하향 조정되었습니다.", structural: true, scope: "MARKET", direction: "down" },
] as const;

export function rollNovexAutoDisclosureCount(random: () => number): number {
  const roll = random();
  if (roll < 0.2) return 0;
  if (roll < 0.55) return 1;
  if (roll < 0.8) return 2;
  if (roll < 0.95) return 3;
  return 4;
}

export function buildNovexAutoDisclosureQueue(input: {
  kstDate: string;
  tickers: readonly string[];
  existingCount?: number;
  existingShockCount?: number;
  slotHours?: readonly (typeof NOVEX_SLOT_HOURS)[number][];
  random: () => number;
  now: Date;
}): CreateStockDisclosureInput[] {
  const remaining = Math.max(
    0,
    4 - Math.max(0, input.existingCount ?? 0),
  );
  const count = Math.min(remaining, rollNovexAutoDisclosureCount(input.random));
  const results: CreateStockDisclosureInput[] = [];
  const slotHours = input.slotHours ?? NOVEX_SLOT_HOURS;
  if (slotHours.length === 0) return results;
  let bigUsed = (input.existingShockCount ?? 0) > 0;
  const occupied = new Map<string, Set<string>>();
  for (let attempt = 0; results.length < count && attempt < 100; attempt += 1) {
    const template = NOVEX_AUTO_DISCLOSURE_TEMPLATES[
      Math.floor(input.random() * NOVEX_AUTO_DISCLOSURE_TEMPLATES.length)
    ]!;
    const big: boolean = !bigUsed && input.random() < 0.2;
    const magnitude = big
      ? 8 + input.random() * 12
      : 3 + input.random() * 4;
    const sign = template.direction === "up" ? 1 : -1;
    const hour = slotHours[Math.floor(input.random() * slotHours.length)]!;
    const ticker = template.scope === "TICKER"
      ? input.tickers[Math.floor(input.random() * input.tickers.length)]!
      : undefined;
    const slotKey = novexSlotKey(input.kstDate, hour);
    const slotOccupied = occupied.get(slotKey) ?? new Set<string>();
    const targetKey = template.scope === "MARKET" ? "MARKET" : ticker!;
    const conflicts = slotOccupied.has(targetKey);
    if (conflicts) continue;
    slotOccupied.add(targetKey);
    occupied.set(slotKey, slotOccupied);
    if (big) bigUsed = true;
    const index = results.length;
    results.push({
      id: `stock-disclosure:auto:${input.kstDate}:${index}`,
      title: template.title,
      body: template.body,
      kind: "PRICE",
      status: "SCHEDULED",
      source: "AUTO",
      effects: [{
        scope: template.scope,
        ticker,
        changePercent: Math.round(sign * magnitude * 100) / 100,
        structural: template.structural,
      }],
      publishAt: parseNovexSlotKey(slotKey),
      slotKey,
      shock: big,
      templateId: template.id,
      createdById: "system:novex-auto-news",
      now: input.now,
    });
  }
  return results;
}

export function modifiedDietzReturn(input: {
  openingValue: number;
  closingValue: number;
  flows: Array<{ amount: number; weight: number }>;
}): number {
  const netFlows = input.flows.reduce((sum, flow) => sum + flow.amount, 0);
  const weightedFlows = input.flows.reduce((sum, flow) => sum + flow.amount * clamp(flow.weight, 0, 1), 0);
  const denominator = input.openingValue + weightedFlows;
  if (Math.abs(denominator) < 1e-9) return 0;
  return (input.closingValue - input.openingValue - netFlows) / denominator;
}

export function linkPeriodicReturns(returns: readonly number[]): number {
  return returns.reduce((value, periodReturn) => value * (1 + periodReturn), 1) - 1;
}

export interface NovexSeasonParticipantInput {
  characterId: string;
  codename: string;
  investedValue: number;
  buyCount: number;
  exposureSlots: number;
  periods: Array<{
    openingValue: number;
    closingValue: number;
    flows: Array<{ amount: number; weight: number }>;
  }>;
}

export function calculateNovexSeasonPerformance(
  seasonId: string,
  participants: readonly NovexSeasonParticipantInput[],
  now = new Date(),
): StockSeasonPerformance[] {
  const rows: StockSeasonPerformance[] = participants.map((participant) => {
    const linkedReturn = linkPeriodicReturns(
      participant.periods.map((period) => modifiedDietzReturn(period)),
    );
    const eligible =
      participant.investedValue >= 50 &&
      participant.buyCount >= 1 &&
      participant.exposureSlots >= 8 &&
      (participant.periods.at(-1)?.closingValue ?? 0) > 0;
    return {
      _id: `stock-season-performance:${seasonId}:${participant.characterId}`,
      seasonId,
      characterId: participant.characterId,
      codename: participant.codename,
      linkedReturn,
      investedValue: participant.investedValue,
      buyCount: participant.buyCount,
      exposureSlots: participant.exposureSlots,
      eligible,
      updatedAt: now,
    };
  });
  const ranked = rows
    .filter((row) => row.eligible)
    .sort((a, b) => b.linkedReturn - a.linkedReturn || a.codename.localeCompare(b.codename, "ko"));
  ranked.forEach((row, index) => {
    row.rank = index + 1;
    if (index < 3) row.badge = `NOVEX 시즌 ${index + 1}위`;
    if (index === 0) row.title = "NOVEX 시즌 챔피언";
  });
  return rows;
}

/** splitFactor 이후의 과거 점들을 현재 주식 단위로 보정한다. */
export function adjustNovexHistoryForSplits<T extends {
  price: number;
  splitFactor?: number;
  capitalIncreaseFactor?: number;
}>(
  rows: readonly T[],
): Array<T & {
  adjustedPrice: number;
  cumulativeSplitFactor: number;
  cumulativeCapitalIncreaseFactor: number;
}> {
  let cumulativeSplit = 1;
  let cumulativeCapitalIncrease = 1;
  const adjusted = new Array<T & {
    adjustedPrice: number;
    cumulativeSplitFactor: number;
    cumulativeCapitalIncreaseFactor: number;
  }>(rows.length);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    adjusted[index] = {
      ...row,
      adjustedPrice:
        row.price / (cumulativeSplit * cumulativeCapitalIncrease),
      cumulativeSplitFactor: cumulativeSplit,
      cumulativeCapitalIncreaseFactor: cumulativeCapitalIncrease,
    };
    if (row.splitFactor) cumulativeSplit *= row.splitFactor;
    if (row.capitalIncreaseFactor) {
      cumulativeCapitalIncrease *= row.capitalIncreaseFactor;
    }
  }
  return adjusted;
}

export function normalizeNovexPositionForSplits(input: {
  shares: number;
  price: number;
  cumulativeSplitFactor: number;
}): { shares: number; price: number; marketValue: number } {
  const factor = Math.max(1, input.cumulativeSplitFactor);
  const shares = input.shares * factor;
  const price = input.price / factor;
  return { shares, price, marketValue: shares * price };
}
