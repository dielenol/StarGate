import { createHash } from "node:crypto";

import {
  nextNovexSlotAfter,
  parseNovexSlotKey,
} from "@stargate/core/domain/novex-market";
import type {
  StockCompanyProfileUpdate,
  StockDisclosureEffect,
  StockMajorShareholder,
} from "@stargate/shared-db";

export const STM_CAPITAL_SCENARIO_ID = "stm-mrbeast-v1" as const;
export const STM_CAPITAL_SCENARIO_TICKER = "STM" as const;
export const STM_CAPITAL_SCENARIO_SYSTEM_ACTOR =
  "system:stm-mrbeast-v1" as const;

export interface StarmartCapitalScenarioOptions {
  announceSlotKey: string;
  rightsFactor?: number;
  rightsPriceAdjustmentPercent?: number;
  mrBeastStakePercent?: number;
  acquisitionPriceChangePercent?: number;
  followupPriceChangePercent?: number;
  followupPriceChangePercents?: readonly number[];
  followupCount?: number;
  existingMajorShareholders?: readonly StockMajorShareholder[];
}

export interface StarmartCapitalScenarioDisclosurePlan {
  id: string;
  title: string;
  body: string;
  slotKey: string;
  effects: StockDisclosureEffect[];
  companyProfileUpdate?: StockCompanyProfileUpdate;
}

export interface StarmartCapitalScenarioPlan {
  scenarioId: typeof STM_CAPITAL_SCENARIO_ID;
  ticker: typeof STM_CAPITAL_SCENARIO_TICKER;
  action: {
    id: string;
    announceSlotKey: string;
    executeSlotKey: string;
    resumeSlotKey: string;
    factor: number;
    reason: string;
    priceAdjustmentPercent: number;
  };
  disclosures: StarmartCapitalScenarioDisclosurePlan[];
  majorShareholders: StockMajorShareholder[];
  slotKeys: string[];
}

const SLOT_PATTERN = /^\d{4}-\d{2}-\d{2} (?:09|13|18|23):00$/;

/**
 * 5% 단위로 떨어지지 않는 실측형 기본 변동률. 후속 호재는 회차마다 다르게 준다.
 *
 * 유상증자 실행 회차는 기계적 희석(주가 1/배수·주식 수 ×배수)만 반영하고 가격을
 * 동결한다. 투심 약화는 그 다음 회차의 독립 공시로 분리해 떨어지는 과정을 보이게 한다.
 */
export const DEFAULT_RIGHTS_PRICE_ADJUSTMENT_PERCENT = -32.4;
export const DEFAULT_MRBEAST_STAKE_PERCENT = 17.3;
export const DEFAULT_ACQUISITION_PRICE_CHANGE_PERCENT = 63.8;
export const DEFAULT_FOLLOWUP_PRICE_CHANGE_PERCENTS = [38.6, 27.4, 44.1] as const;
const RIGHTS_SENTIMENT_TEMPLATE = {
  suffix: "rights-sentiment",
  title: "스타마트 유상증자 물량 부담 · 투자심리 악화",
  body: "대규모 신주 발행에 따른 지분 희석 우려로 스타마트 투자심리가 급격히 악화됐습니다.",
} as const;

const FOLLOWUP_TEMPLATES = [
  {
    suffix: "global-partnership",
    title: "스타마트·미스터비스트 글로벌 콘텐츠 유통 제휴",
    body: "미스터비스트 채널과 스타마트가 공동 콘텐츠 및 글로벌 유통 제휴를 발표했습니다.",
  },
  {
    suffix: "preorder-record",
    title: "스타마트 공동 브랜드 선주문 기록 경신",
    body: "미스터비스트 공동 브랜드 상품의 글로벌 선주문이 스타마트 역대 최고 기록을 경신했습니다.",
  },
  {
    suffix: "north-america-expansion",
    title: "미스터비스트, 스타마트 북미 확장 투자 확정",
    body: "미스터비스트 측이 스타마트 북미 매장 및 물류망 확장을 위한 후속 투자를 확정했습니다.",
  },
] as const;

function assertPercent(value: number, label: string, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}은 ${min}~${max} 범위여야 합니다.`);
  }
}

function normalizeMajorShareholders(
  existing: readonly StockMajorShareholder[],
  stakePercent: number,
): StockMajorShareholder[] {
  const retained = existing
    .filter((item) => item.name.trim() !== "미스터비스트")
    .map((item) => ({
      name: item.name.trim(),
      stakePercent: item.stakePercent,
      ...(item.note?.trim() ? { note: item.note.trim() } : {}),
    }));
  const total = retained.reduce((sum, item) => sum + item.stakePercent, 0);
  if (total + stakePercent > 100) {
    throw new Error("기존 주요 주주 지분과 미스터비스트 지분 합계가 100%를 초과합니다.");
  }
  return [
    ...retained,
    {
      name: "미스터비스트",
      stakePercent,
      note: "전략적 지분 투자",
    },
  ];
}

/**
 * 후속 호재 변동률 해석. 배열이 오면 회차별로 그대로 쓰고, 단일 값이면 전 회차에 같은 값을
 * 적용한다. 둘 다 없으면 회차마다 다른 기본값을 쓴다.
 */
function resolveFollowupPriceChanges(
  options: StarmartCapitalScenarioOptions,
  followupCount: number,
): number[] {
  if (options.followupPriceChangePercents) {
    const values = [...options.followupPriceChangePercents];
    if (values.length !== followupCount) {
      throw new Error(
        `후속 호재 변동률은 후속 공시 횟수와 같은 ${followupCount}개여야 합니다.`,
      );
    }
    return values;
  }
  if (options.followupPriceChangePercent !== undefined) {
    return Array.from(
      { length: followupCount },
      () => options.followupPriceChangePercent!,
    );
  }
  return DEFAULT_FOLLOWUP_PRICE_CHANGE_PERCENTS.slice(0, followupCount);
}

function tickerPriceEffect(changePercent: number): StockDisclosureEffect[] {
  return [
    {
      scope: "TICKER",
      ticker: STM_CAPITAL_SCENARIO_TICKER,
      changePercent,
      structural: true,
    },
  ];
}

export function buildStarmartCapitalScenarioPlan(
  options: StarmartCapitalScenarioOptions,
): StarmartCapitalScenarioPlan {
  if (!SLOT_PATTERN.test(options.announceSlotKey)) {
    throw new Error("발표 회차는 KST NOVEX 회차(09/13/18/23시)여야 합니다.");
  }
  const announceAt = parseNovexSlotKey(options.announceSlotKey);
  if (Number.isNaN(announceAt.getTime())) {
    throw new Error("발표 회차를 해석할 수 없습니다.");
  }

  const factor = options.rightsFactor ?? 2;
  const rightsAdjustment =
    options.rightsPriceAdjustmentPercent ?? DEFAULT_RIGHTS_PRICE_ADJUSTMENT_PERCENT;
  const stakePercent = options.mrBeastStakePercent ?? DEFAULT_MRBEAST_STAKE_PERCENT;
  const acquisitionChange =
    options.acquisitionPriceChangePercent ?? DEFAULT_ACQUISITION_PRICE_CHANGE_PERCENT;
  const followupCount = options.followupCount ?? 3;

  if (!Number.isInteger(factor) || factor < 2 || factor > 10) {
    throw new Error("유상증자 배수는 2~10 정수여야 합니다.");
  }
  assertPercent(rightsAdjustment, "유상증자 투심 조정률", -50, 75);
  assertPercent(stakePercent, "미스터비스트 지분율", 0.01, 100);
  assertPercent(acquisitionChange, "지분 인수 공시 변동률", -50, 75);
  if (!Number.isInteger(followupCount) || followupCount < 2 || followupCount > 3) {
    throw new Error("후속 호재 횟수는 2~3회여야 합니다.");
  }
  const followupChanges = resolveFollowupPriceChanges(options, followupCount);
  followupChanges.forEach((value, index) =>
    assertPercent(value, `후속 공시 ${index + 1}회차 변동률`, -50, 75),
  );

  // 발표+실행(희석·거래정지·가격동결) → 거래재개+투심 악화 → 지분 인수 → 후속 호재.
  // 발표와 실행은 같은 회차에서 collapse하고, 거래재개만 다음 회차로 미룬다.
  const slotKeys = [options.announceSlotKey];
  while (slotKeys.length < 3 + followupCount) {
    slotKeys.push(nextNovexSlotAfter(slotKeys.at(-1)!));
  }
  const majorShareholders = normalizeMajorShareholders(
    options.existingMajorShareholders ?? [],
    stakePercent,
  );
  const disclosures: StarmartCapitalScenarioDisclosurePlan[] = [
    {
      id: `stock-disclosure:${STM_CAPITAL_SCENARIO_ID}:${RIGHTS_SENTIMENT_TEMPLATE.suffix}`,
      title: RIGHTS_SENTIMENT_TEMPLATE.title,
      body: RIGHTS_SENTIMENT_TEMPLATE.body,
      slotKey: slotKeys[1]!,
      effects: tickerPriceEffect(rightsAdjustment),
    },
    {
      id: `stock-disclosure:${STM_CAPITAL_SCENARIO_ID}:stake-acquisition`,
      title: "미스터비스트, 스타마트 전략적 지분 인수",
      body: `미스터비스트가 스타마트 지분 ${stakePercent}%를 인수하고 글로벌 성장 파트너로 합류했습니다.`,
      slotKey: slotKeys[2]!,
      effects: tickerPriceEffect(acquisitionChange),
      companyProfileUpdate: { majorShareholders },
    },
    ...FOLLOWUP_TEMPLATES.slice(0, followupCount).map((template, index) => ({
      id: `stock-disclosure:${STM_CAPITAL_SCENARIO_ID}:${template.suffix}`,
      title: template.title,
      body: template.body,
      slotKey: slotKeys[index + 3]!,
      effects: tickerPriceEffect(followupChanges[index]!),
    })),
  ];

  return {
    scenarioId: STM_CAPITAL_SCENARIO_ID,
    ticker: STM_CAPITAL_SCENARIO_TICKER,
    action: {
      id: `stock-corporate-action:${STM_CAPITAL_SCENARIO_ID}:rights`,
      announceSlotKey: slotKeys[0]!,
      // 발표·실행은 같은 회차. 그 회차는 희석만 반영하고 거래정지·가격동결을 유지한다.
      executeSlotKey: slotKeys[0]!,
      // 거래재개는 투심 공시 회차. 재개와 -32.4%가 같은 회차에서 함께 나간다.
      resumeSlotKey: slotKeys[1]!,
      factor,
      reason: "자본잠식 해소 및 운영자금 조달",
      // 실행 회차는 기계적 희석만 반영한다. 투심 악화는 다음 회차 공시가 소유한다.
      priceAdjustmentPercent: 0,
    },
    disclosures,
    majorShareholders,
    slotKeys,
  };
}

function stablePlan(plan: StarmartCapitalScenarioPlan) {
  return {
    scenarioId: plan.scenarioId,
    ticker: plan.ticker,
    action: plan.action,
    disclosures: plan.disclosures.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      slotKey: item.slotKey,
      effects: item.effects,
      ...(item.companyProfileUpdate
        ? { companyProfileUpdate: item.companyProfileUpdate }
        : {}),
    })),
    majorShareholders: plan.majorShareholders,
    slotKeys: plan.slotKeys,
  };
}

export function starmartCapitalScenarioFingerprint(
  plan: StarmartCapitalScenarioPlan,
): string {
  return createHash("sha256")
    .update(JSON.stringify(stablePlan(plan)))
    .digest("hex");
}

export function firstNovexSlotAfter(
  now: Date,
  minimumLeadMinutes = 30,
): string {
  if (!Number.isFinite(minimumLeadMinutes) || minimumLeadMinutes < 0) {
    throw new Error("최소 예약 여유 시간은 0분 이상이어야 합니다.");
  }
  const threshold = new Date(now.getTime() + minimumLeadMinutes * 60_000);
  const kstParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(threshold);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    kstParts.find((item) => item.type === type)?.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  for (const hour of [9, 13, 18, 23]) {
    const key = `${date} ${String(hour).padStart(2, "0")}:00`;
    if (parseNovexSlotKey(key).getTime() > threshold.getTime()) return key;
  }
  return nextNovexSlotAfter(`${date} 23:00`);
}
