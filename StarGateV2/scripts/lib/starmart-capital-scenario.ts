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
    factor: number;
    reason: string;
    priceAdjustmentPercent: number;
  };
  disclosures: StarmartCapitalScenarioDisclosurePlan[];
  majorShareholders: StockMajorShareholder[];
  slotKeys: string[];
}

const SLOT_PATTERN = /^\d{4}-\d{2}-\d{2} (?:09|13|18|23):00$/;
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
  const rightsAdjustment = options.rightsPriceAdjustmentPercent ?? -35;
  const stakePercent = options.mrBeastStakePercent ?? 20;
  const acquisitionChange = options.acquisitionPriceChangePercent ?? 70;
  const followupChange = options.followupPriceChangePercent ?? 25;
  const followupCount = options.followupCount ?? 3;

  if (!Number.isInteger(factor) || factor < 2 || factor > 10) {
    throw new Error("유상증자 배수는 2~10 정수여야 합니다.");
  }
  assertPercent(rightsAdjustment, "유상증자 사유 조정률", -50, 75);
  assertPercent(stakePercent, "미스터비스트 지분율", 0.01, 100);
  assertPercent(acquisitionChange, "지분 인수 공시 변동률", -50, 75);
  assertPercent(followupChange, "후속 공시 변동률", -50, 75);
  if (!Number.isInteger(followupCount) || followupCount < 2 || followupCount > 3) {
    throw new Error("후속 호재 횟수는 2~3회여야 합니다.");
  }

  const slotKeys = [options.announceSlotKey];
  while (slotKeys.length < 3 + followupCount) {
    slotKeys.push(nextNovexSlotAfter(slotKeys.at(-1)!));
  }
  const majorShareholders = normalizeMajorShareholders(
    options.existingMajorShareholders ?? [],
    stakePercent,
  );
  const stakeSlotKey = slotKeys[2]!;
  const disclosures: StarmartCapitalScenarioDisclosurePlan[] = [
    {
      id: `stock-disclosure:${STM_CAPITAL_SCENARIO_ID}:stake-acquisition`,
      title: "미스터비스트, 스타마트 전략적 지분 인수",
      body: `미스터비스트가 스타마트 지분 ${stakePercent}%를 인수하고 글로벌 성장 파트너로 합류했습니다.`,
      slotKey: stakeSlotKey,
      effects: tickerPriceEffect(acquisitionChange),
      companyProfileUpdate: { majorShareholders },
    },
    ...FOLLOWUP_TEMPLATES.slice(0, followupCount).map((template, index) => ({
      id: `stock-disclosure:${STM_CAPITAL_SCENARIO_ID}:${template.suffix}`,
      title: template.title,
      body: template.body,
      slotKey: slotKeys[index + 3]!,
      effects: tickerPriceEffect(followupChange),
    })),
  ];

  return {
    scenarioId: STM_CAPITAL_SCENARIO_ID,
    ticker: STM_CAPITAL_SCENARIO_TICKER,
    action: {
      id: `stock-corporate-action:${STM_CAPITAL_SCENARIO_ID}:rights`,
      announceSlotKey: slotKeys[0]!,
      executeSlotKey: slotKeys[1]!,
      factor,
      reason: "자본잠식 해소 및 운영자금 조달",
      priceAdjustmentPercent: rightsAdjustment,
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
