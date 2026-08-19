/**
 * 종목별 예약 시나리오 타임라인.
 *
 * 공시(stock_disclosures)와 기업행동(stock_corporate_actions)은 서로 다른 컬렉션에
 * 저장되지만 운영자 입장에서는 "이 종목에 앞으로 무슨 일이 순서대로 일어나는가"라는
 * 하나의 흐름이다. 여기서 두 소스를 회차 시각 순으로 합치고 예상 가격 경로를 계산한다.
 *
 * 실제 가격 확정은 worker 의 회차 엔진이 단독 소유한다. 이 모듈의 결과는 운영 화면
 * 미리보기 전용이며 어떤 쓰기 경로에도 사용하지 않는다.
 */

import { normalizeStockPrice } from "@stargate/core/domain/stock-pricing";

import type { StockCorporateActionItem } from "../../hooks/queries/useAdminStockMarketQuery";
import type { StockDisclosureItem } from "../../hooks/queries/useStockDisclosuresQuery";

export type ScenarioTimelineSource = "DISCLOSURE" | "CORPORATE_ACTION";

export interface ScenarioTimelineEvent {
  id: string;
  source: ScenarioTimelineSource;
  /** 이벤트가 반영되는 시각(ISO). 정렬 기준. */
  at: string;
  label: string;
  detail?: string;
  /** 가격에 적용되는 변동률. 구조적 변경(분할·증자)은 별도 필드로 표현한다. */
  changePercent?: number;
  /** 액면분할·유상증자처럼 주식 수가 변하는 이벤트. */
  structural: boolean;
  /** 이 이벤트까지 반영했을 때의 예상 가격. */
  projectedPrice: number;
  status: string;
  actionType?: StockCorporateActionItem["type"];
  canCancel: boolean;
  /** 시장 전체 공시가 이 종목에 적용된 경우. */
  marketWide: boolean;
}

export interface ScenarioTimeline {
  ticker: string;
  currentPrice: number;
  finalPrice: number;
  /** 현재가 대비 최종 예상 변동률(%). */
  totalChangePercent: number;
  events: ScenarioTimelineEvent[];
}

const ACTIVE_DISCLOSURE_STATUSES = new Set(["SCHEDULED", "DRAFT"]);
const ACTIVE_ACTION_STATUSES = new Set([
  "SCHEDULED",
  "HALTED",
  "SNAPSHOTTED",
  "PROCESSING",
]);

const ACTION_LABEL: Record<StockCorporateActionItem["type"], string> = {
  DIVIDEND: "배당",
  SPLIT: "액면분할",
  RIGHTS_OFFERING: "유상증자",
};

function resolveDisclosureChange(
  disclosure: StockDisclosureItem,
  ticker: string,
): { changePercent?: number; structural: boolean; marketWide: boolean } | null {
  const effects = disclosure.effects ?? [];
  // 종목 지정 효과가 시장 전체 효과보다 우선한다.
  const tickerEffect = effects.find(
    (effect) => effect.scope === "TICKER" && effect.ticker === ticker,
  );
  if (tickerEffect) {
    return {
      changePercent: tickerEffect.changePercent,
      structural: tickerEffect.structural,
      marketWide: false,
    };
  }
  const marketEffect = effects.find((effect) => effect.scope === "MARKET");
  if (marketEffect) {
    return {
      changePercent: marketEffect.changePercent,
      structural: marketEffect.structural,
      marketWide: true,
    };
  }
  // 효과가 없는 정보 전용 공시도 흐름에는 남긴다.
  if (disclosure.scope === "MARKET") {
    return { structural: false, marketWide: true };
  }
  return disclosure.tickers.includes(ticker)
    ? { structural: false, marketWide: false }
    : null;
}

function applyDisclosure(price: number, changePercent?: number): number {
  if (changePercent === undefined) return price;
  return normalizeStockPrice(price * (1 + changePercent / 100));
}

function applyCorporateAction(
  price: number,
  action: StockCorporateActionItem,
): number {
  switch (action.type) {
    case "SPLIT": {
      const ratio = action.ratio;
      if (!ratio || ratio <= 0) return price;
      return normalizeStockPrice(price / ratio);
    }
    case "RIGHTS_OFFERING": {
      const percent = action.priceAdjustmentPercent;
      if (percent === undefined) return price;
      return normalizeStockPrice(price * (1 + percent / 100));
    }
    case "DIVIDEND": {
      // 배당락은 주당 배당금만큼 기준가가 내려간다.
      const perShare = action.perShare;
      if (!perShare) return price;
      return normalizeStockPrice(price - perShare);
    }
    default:
      return price;
  }
}

/**
 * 기업행동의 가격 반영 시각. 유상증자는 발표(거래정지) 시점이 아니라 실행 시점에
 * 기준가가 조정되므로 executeAt 을 쓴다.
 */
function corporateActionAt(action: StockCorporateActionItem): string {
  return action.executeAt;
}

export function buildScenarioTimeline(input: {
  ticker: string;
  currentPrice: number;
  disclosures: readonly StockDisclosureItem[];
  corporateActions: readonly StockCorporateActionItem[];
  /** 이 시각 이후의 예약만 흐름에 넣는다. */
  now: Date;
}): ScenarioTimeline {
  const { ticker, currentPrice, disclosures, corporateActions, now } = input;
  const threshold = now.getTime();

  type Pending = Omit<ScenarioTimelineEvent, "projectedPrice"> & {
    action?: StockCorporateActionItem;
  };
  const pending: Pending[] = [];

  for (const disclosure of disclosures) {
    if (!ACTIVE_DISCLOSURE_STATUSES.has(disclosure.status)) continue;
    const publishAt = new Date(disclosure.publishAt).getTime();
    if (!Number.isFinite(publishAt) || publishAt < threshold) continue;
    const resolved = resolveDisclosureChange(disclosure, ticker);
    if (!resolved) continue;
    pending.push({
      id: disclosure.id,
      source: "DISCLOSURE",
      at: disclosure.publishAt,
      label: disclosure.headline ?? "제한 공시",
      detail: disclosure.body,
      changePercent: resolved.changePercent,
      structural: resolved.structural,
      status: disclosure.status,
      canCancel: disclosure.canCancel,
      marketWide: resolved.marketWide,
    });
  }

  for (const action of corporateActions) {
    if (action.ticker !== ticker) continue;
    if (!ACTIVE_ACTION_STATUSES.has(action.status)) continue;
    const at = corporateActionAt(action);
    const executeAt = new Date(at).getTime();
    if (!Number.isFinite(executeAt) || executeAt < threshold) continue;
    pending.push({
      id: action.id,
      source: "CORPORATE_ACTION",
      at,
      label: ACTION_LABEL[action.type],
      detail: action.reason,
      changePercent:
        action.type === "RIGHTS_OFFERING"
          ? action.priceAdjustmentPercent
          : undefined,
      structural: action.type !== "DIVIDEND",
      status: action.status,
      actionType: action.type,
      canCancel: action.status === "SCHEDULED" || action.status === "HALTED",
      marketWide: false,
      action,
    });
  }

  pending.sort((left, right) => {
    const diff = new Date(left.at).getTime() - new Date(right.at).getTime();
    if (diff !== 0) return diff;
    // 같은 회차에서는 기업행동(구조 변경)이 먼저 반영되고 공시가 뒤따른다.
    if (left.source !== right.source) {
      return left.source === "CORPORATE_ACTION" ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });

  let price = normalizeStockPrice(currentPrice);
  const events: ScenarioTimelineEvent[] = pending.map((item) => {
    const { action, ...rest } = item;
    price = action
      ? applyCorporateAction(price, action)
      : applyDisclosure(price, item.changePercent);
    return { ...rest, projectedPrice: price };
  });

  const base = normalizeStockPrice(currentPrice);
  return {
    ticker,
    currentPrice: base,
    finalPrice: price,
    totalChangePercent: base > 0 ? ((price - base) / base) * 100 : 0,
    events,
  };
}
