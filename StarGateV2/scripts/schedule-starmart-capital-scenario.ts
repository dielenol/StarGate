/**
 * 스타마트 자본잠식 유상증자 → 미스터비스트 지분 인수 시나리오 예약 도구.
 *
 * 기본 동작은 읽기 전용이다. 실제 예약은 NOVEX 전환과 첫 회차 검증을 마친 뒤
 * 동일한 dry-run 계획 해시와 모든 확인 플래그를 함께 전달해야 한다.
 *
 *   pnpm schedule:starmart-capital -- --announce-slot "YYYY-MM-DD HH:00"
 *
 *   pnpm schedule:starmart-capital -- \
 *     --apply --yes \
 *     --target-db <DB_NAME> \
 *     --announce-slot "YYYY-MM-DD HH:00" \
 *     --expected-plan <DRY_RUN_PLAN_SHA256> \
 *     --expected-worker-slot "YYYY-MM-DD HH:00" \
 *     --novex-enabled --worker-cron-confirmed --first-round-verified
 *
 * APPLY는 현재 enabled worker 배포 컨테이너의 승인된 runbook 단계에서만 실행한다.
 * 해당 환경은 NOVEX_V2_MODE=enabled 및
 * NOVEX_SCENARIO_APPLY_CONTEXT=deployment-runbook을 제공해야 한다.
 */

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  latestDueNovexSlot,
  nextNovexSlotAfter,
  NOVEX_REGULAR_SESSION_TITLE,
  novexKstDate,
  novexSlotKey,
  parseNovexSlotKey,
  resolveNovexTradingWindow,
  shouldDeferNovexRoundForEarlyClose,
} from "@stargate/core/domain/novex-market";
import {
  assertStockRightsOfferingExecutionSafe,
  close,
  claimStockMarketMigrationReady,
  connect,
  createStockCorporateAction,
  createStockDisclosure,
  getNovex2MigrationReadiness,
  getClient,
  getDb,
  inspectNovex2Migration,
  novex2MigrationPlanFingerprint,
  type Novex2MigrationPlan,
  type Novex2MigrationReadiness,
  type ScheduledJobRun,
  type StockCompanyProfile,
  type StockCorporateAction,
  type StockDisclosure,
  type StockHolding,
  type StockMarketCalendarException,
  type StockMarketState,
  type StockPrice,
} from "@stargate/shared-db";
import type { ClientSession, Db } from "mongodb";

import {
  buildStarmartCapitalScenarioPlan,
  DEFAULT_ACQUISITION_PRICE_CHANGE_PERCENT,
  DEFAULT_MRBEAST_STAKE_PERCENT,
  DEFAULT_RIGHTS_PRICE_ADJUSTMENT_PERCENT,
  firstNovexSlotAfter,
  STM_CAPITAL_SCENARIO_SYSTEM_ACTOR,
  STM_CAPITAL_SCENARIO_TICKER,
  starmartCapitalScenarioFingerprint,
  type StarmartCapitalScenarioPlan,
} from "./lib/starmart-capital-scenario.ts";

const ACTIVE_ACTION_STATUSES = [
  "SCHEDULED",
  "HALTED",
  "SNAPSHOTTED",
  "PROCESSING",
] as const;
const BASE_STM_SHARES_OUTSTANDING = 180_000_000;

export interface ScenarioInspection {
  migrationReadiness: Novex2MigrationReadiness | null;
  marketState: StockMarketState | null;
  recentEnabledRuns: ScheduledJobRun[];
  price: StockPrice | null;
  companyProfile: StockCompanyProfile | null;
  holdings: Array<Pick<StockHolding, "shares" | "avgPrice">>;
  totalHoldingShares: number;
  deferredSlotKeys: string[];
  activeActionCount: number;
  conflictingDisclosureCount: number;
  existingAction: StockCorporateAction | null;
  existingDisclosures: StockDisclosure[];
}

function readArgument(argv: readonly string[], name: string): string | null {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim() || null;
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1]?.trim() || null : null;
}

function readNumberArgument(
  argv: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = readArgument(argv, name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} 값이 숫자가 아닙니다.`);
  return value;
}

/**
 * 후속 호재 변동률 인자 해석. `--followup-percents 29.3,41.7,33.8`은 회차별 값으로,
 * `--followup-change`는 전 회차 동일 값으로 넘긴다. 둘 다 없으면 옵션을 넘기지 않아
 * 시나리오 기본값(회차마다 다른 값)이 그대로 쓰인다.
 */
function resolveFollowupArgument(
  argv: readonly string[],
): { followupPriceChangePercents?: number[]; followupPriceChangePercent?: number } {
  const list = readArgument(argv, "--followup-percents");
  if (list) {
    const values = list.split(",").map((item) => {
      const value = Number(item.trim());
      if (!Number.isFinite(value)) {
        throw new Error("--followup-percents 값이 숫자가 아닙니다.");
      }
      return value;
    });
    return { followupPriceChangePercents: values };
  }
  const single = readArgument(argv, "--followup-change");
  if (single === null) return {};
  const value = Number(single);
  if (!Number.isFinite(value)) {
    throw new Error("--followup-change 값이 숫자가 아닙니다.");
  }
  return { followupPriceChangePercent: value };
}

function maskDbName(value: string): string {
  if (value.length <= 2) return "**";
  return `${value[0]}${"*".repeat(Math.min(7, value.length - 2))}${value.at(-1)}`;
}

function roundPrice(value: number): number {
  return Math.max(0.01, Math.round((value + Number.EPSILON) * 100) / 100);
}

function actionMatchesPlan(
  action: StockCorporateAction | null,
  plan: StarmartCapitalScenarioPlan,
): boolean {
  return Boolean(
    action &&
      action.type === "RIGHTS_OFFERING" &&
      action._id === plan.action.id &&
      action.ticker === plan.ticker &&
      action.factor === plan.action.factor &&
      action.reason === plan.action.reason &&
      action.priceAdjustmentPercent === plan.action.priceAdjustmentPercent &&
      action.announceSlotKey === plan.action.announceSlotKey &&
      action.executeSlotKey === plan.action.executeSlotKey,
  );
}

function disclosureMatchesPlan(
  disclosure: StockDisclosure,
  plan: StarmartCapitalScenarioPlan,
): boolean {
  const expected = plan.disclosures.find((item) => item.id === disclosure._id);
  return Boolean(
    expected &&
      disclosure.kind === "PRICE" &&
      disclosure.source === "GM" &&
      disclosure.title === expected.title &&
      disclosure.body === expected.body &&
      disclosure.slotKey === expected.slotKey &&
      disclosure.ownerCorporateActionId === plan.action.id &&
      JSON.stringify(disclosure.effects) === JSON.stringify(expected.effects) &&
      JSON.stringify(disclosure.companyProfileUpdate ?? null) ===
        JSON.stringify(expected.companyProfileUpdate ?? null),
  );
}

function managedDisclosureIds(plan: StarmartCapitalScenarioPlan): string[] {
  return [
    `stock-disclosure:corporate-action:${plan.action.id}:announcement`,
    `stock-disclosure:corporate-action:${plan.action.id}:execution`,
  ];
}

function existingScenarioIsExact(
  inspection: ScenarioInspection,
  plan: StarmartCapitalScenarioPlan,
): boolean {
  const managedIds = managedDisclosureIds(plan);
  return (
    actionMatchesPlan(inspection.existingAction, plan) &&
    inspection.existingDisclosures.length === plan.disclosures.length + managedIds.length &&
    plan.disclosures.every((item) => {
      const row = inspection.existingDisclosures.find(
        (disclosure) => disclosure._id === item.id,
      );
      return row ? disclosureMatchesPlan(row, plan) : false;
    }) &&
    managedIds.every((id) => {
      const row = inspection.existingDisclosures.find((item) => item._id === id);
      return row?.source === "CORPORATE_ACTION";
    })
  );
}

export function existingScenarioStateIsHealthy(
  inspection: ScenarioInspection,
  plan: StarmartCapitalScenarioPlan,
): boolean {
  if (!existingScenarioIsExact(inspection, plan) || !inspection.existingAction) {
    return false;
  }
  const byId = new Map(
    inspection.existingDisclosures.map((item) => [item._id, item]),
  );
  const announcement = byId.get(managedDisclosureIds(plan)[0]!);
  const execution = byId.get(managedDisclosureIds(plan)[1]!);
  const custom = plan.disclosures.map((item) => byId.get(item.id));
  if (!announcement || !execution || custom.some((item) => !item)) return false;

  if (inspection.existingAction.status === "SCHEDULED") {
    return (
      inspection.price?.corporateActionReservationId === plan.action.id &&
      !inspection.price.corporateActionHaltId &&
      inspection.price.isTradingHalted !== true &&
      [announcement, execution, ...custom].every(
        (item) => item?.status === "SCHEDULED",
      )
    );
  }
  if (inspection.existingAction.status === "HALTED") {
    return (
      !inspection.price?.corporateActionReservationId &&
      inspection.price?.corporateActionHaltId === plan.action.id &&
      inspection.price.isTradingHalted === true &&
      announcement.status === "PUBLISHED" &&
      execution.status === "SCHEDULED" &&
      custom.every((item) => item?.status === "SCHEDULED")
    );
  }
  if (inspection.existingAction.status !== "COMPLETED") return false;
  if (
    inspection.price?.corporateActionReservationId ||
    inspection.price?.corporateActionHaltId ||
    announcement.status !== "PUBLISHED" ||
    execution.status !== "PUBLISHED" ||
    custom.some(
      (item) => item?.status !== "SCHEDULED" && item?.status !== "PUBLISHED",
    )
  ) {
    return false;
  }
  const stakeDisclosure = custom[0];
  if (stakeDisclosure?.status !== "PUBLISHED") return true;
  return (
    inspection.companyProfile?.sourceDisclosureId === stakeDisclosure._id &&
    JSON.stringify(inspection.companyProfile.majorShareholders) ===
      JSON.stringify(plan.majorShareholders)
  );
}

async function findDeferredScenarioSlots(
  db: Db,
  plan: StarmartCapitalScenarioPlan,
  session?: ClientSession,
): Promise<string[]> {
  const dates = [...new Set(plan.slotKeys.map((slotKey) => slotKey.slice(0, 10)))];
  const windows = new Map<string, ReturnType<typeof resolveNovexTradingWindow>>();
  await Promise.all(
    dates.map(async (date) => {
      const start = new Date(`${date}T00:00:00+09:00`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const [exception, sessions] = await Promise.all([
        db.collection<StockMarketCalendarException>(
          "stock_market_calendar_exceptions",
        ).findOne({ _id: `stock-calendar:${date}` }, { session }),
        db.collection<{ title: string; targetDateTime: Date }>("sessions")
          .find(
            {
              title: NOVEX_REGULAR_SESSION_TITLE,
              targetDateTime: { $gte: start, $lt: end },
            },
            { projection: { targetDateTime: 1 }, session },
          )
          .toArray(),
      ]);
      windows.set(
        date,
        resolveNovexTradingWindow({
          kstDate: date,
          regularSessionStarts: sessions.map((item) => item.targetDateTime),
          exception,
        }),
      );
    }),
  );
  return plan.slotKeys.filter((slotKey) => {
    const window = windows.get(slotKey.slice(0, 10));
    return window
      ? shouldDeferNovexRoundForEarlyClose(slotKey, window.closesAt)
      : true;
  });
}

async function inspectScenario(
  db: Db,
  plan: StarmartCapitalScenarioPlan,
  session?: ClientSession,
): Promise<ScenarioInspection> {
  const actionIds = [plan.action.id];
  const disclosureIds = [
    ...managedDisclosureIds(plan),
    ...plan.disclosures.map((item) => item.id),
  ];
  const [
    migrationReadiness,
    marketState,
    recentEnabledRuns,
    price,
    companyProfile,
    holdings,
    holdingTotals,
    deferredSlotKeys,
    activeActionCount,
    conflictingDisclosureCount,
    existingAction,
    existingDisclosures,
  ] = await Promise.all([
    getNovex2MigrationReadiness(db, session),
    db.collection<StockMarketState>("stock_market_state").findOne(
      { _id: "novex" },
      { session },
    ),
    db.collection<ScheduledJobRun>("scheduled_job_runs")
      .find(
        {
          jobName: "stocks.tick",
          status: "SUCCEEDED",
          "summary.novexMode": "enabled",
          slotKey: { $regex: / (?:09|13|18|23):00$/ },
        },
        { session },
      )
      .sort({ completedAt: -1, updatedAt: -1 })
      .limit(4)
      .toArray(),
    db.collection<StockPrice>("stock_prices").findOne(
      { ticker: plan.ticker },
      { session },
    ),
    db.collection<StockCompanyProfile>("stock_company_profiles").findOne(
      { _id: plan.ticker },
      { session },
    ),
    db.collection<StockHolding>("stock_holdings")
      .find(
        { ticker: plan.ticker },
        { projection: { shares: 1, avgPrice: 1 }, session },
      )
      .toArray(),
    db.collection<StockHolding>("stock_holdings")
      .aggregate<{ _id: null; shares: number }>(
        [
          { $match: { ticker: plan.ticker } },
          { $group: { _id: null, shares: { $sum: "$shares" } } },
        ],
        { session },
      )
      .next(),
    findDeferredScenarioSlots(db, plan, session),
    db.collection<StockCorporateAction>("stock_corporate_actions").countDocuments(
      {
        _id: { $nin: actionIds },
        ticker: plan.ticker,
        status: { $in: [...ACTIVE_ACTION_STATUSES] },
      },
      { session },
    ),
    db.collection<StockDisclosure>("stock_disclosures").countDocuments(
      {
        _id: { $nin: disclosureIds },
        status: "SCHEDULED",
        kind: "PRICE",
        slotKey: { $in: plan.slotKeys },
        effects: {
          $elemMatch: {
            $or: [
              { scope: "MARKET" },
              { scope: "TICKER", ticker: plan.ticker },
            ],
          },
        },
      },
      { session },
    ),
    db.collection<StockCorporateAction>("stock_corporate_actions").findOne(
      { _id: plan.action.id },
      { session },
    ),
    db.collection<StockDisclosure>("stock_disclosures")
      .find({ _id: { $in: disclosureIds } }, { session })
      .sort({ _id: 1 })
      .toArray(),
  ]);
  return {
    migrationReadiness,
    marketState,
    recentEnabledRuns,
    price,
    companyProfile,
    holdings,
    totalHoldingShares: holdingTotals?.shares ?? 0,
    deferredSlotKeys,
    activeActionCount,
    conflictingDisclosureCount,
    existingAction,
    existingDisclosures,
  };
}

export function migrationBlockers(plan: Novex2MigrationPlan): string[] {
  return [
    plan.ttlIndexPresent ? "stock_price_history TTL index 잔존" : null,
    plan.pricesWithoutReferencePrice > 0
      ? `referencePrice 미설정 ${plan.pricesWithoutReferencePrice}건`
      : null,
    plan.indexesToCreate.length > 0
      ? `미생성 NOVEX index ${plan.indexesToCreate.length}개`
      : null,
    plan.legacyPendingEventsToConvert > 0
      ? `미변환 legacy PENDING 이벤트 ${plan.legacyPendingEventsToConvert}건`
      : null,
    plan.legacyPendingPriceEffectConflicts.length > 0
      ? `legacy 가격 효과 충돌 ${plan.legacyPendingPriceEffectConflicts.length}건`
      : null,
    ...plan.uniqueIndexChecks
      .filter((item) => item.duplicateGroups > 0)
      .map(
        (item) =>
          `unique 중복 ${item.collection}.${item.name} ${item.duplicateGroups}그룹`,
      ),
  ].filter((item): item is string => item !== null);
}

export function expectedLatestWorkerSlot(now: Date): string {
  const threshold = new Date(now.getTime() - 30 * 60_000);
  const due = latestDueNovexSlot(threshold);
  if (due) return due;
  const yesterday = novexKstDate(
    new Date(threshold.getTime() - 24 * 60 * 60 * 1000),
  );
  return novexSlotKey(yesterday, 23);
}

export function enabledRunsAreConsecutive(runs: readonly ScheduledJobRun[]): boolean {
  if (runs.length < 4) return false;
  const ascending = [...runs]
    .map((item) => item.slotKey)
    .sort((left, right) => left.localeCompare(right));
  return ascending.every(
    (slotKey, index) =>
      index === 0 || nextNovexSlotAfter(ascending[index - 1]!) === slotKey,
  );
}

function profileBaseMatchesInspection(
  inspection: ScenarioInspection,
  plan: StarmartCapitalScenarioPlan,
): boolean {
  const withoutMrBeast = (items: readonly { name: string; stakePercent: number; note?: string }[]) =>
    items
      .filter((item) => item.name.trim() !== "미스터비스트")
      .map((item) => ({
        name: item.name.trim(),
        stakePercent: item.stakePercent,
        ...(item.note?.trim() ? { note: item.note.trim() } : {}),
      }));
  return (
    JSON.stringify(withoutMrBeast(inspection.companyProfile?.majorShareholders ?? [])) ===
    JSON.stringify(withoutMrBeast(plan.majorShareholders))
  );
}

function rightsExecutionSafetyError(
  inspection: ScenarioInspection,
  plan: StarmartCapitalScenarioPlan,
): string | null {
  if (!inspection.price) return null;
  try {
    assertStockRightsOfferingExecutionSafe({
      current: inspection.price,
      holdings: inspection.holdings,
      factor: plan.action.factor,
      priceAdjustmentPercent: plan.action.priceAdjustmentPercent,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function inspectionBlockers(
  inspection: ScenarioInspection,
  plan: StarmartCapitalScenarioPlan,
  now: Date,
  expectedWorkerSlot?: string | null,
  expectedMigrationFingerprint?: string | null,
): string[] {
  const existingIsEmpty =
    inspection.existingAction === null && inspection.existingDisclosures.length === 0;
  const existingIsExact = existingScenarioIsExact(inspection, plan);
  const existingStateIsHealthy = existingScenarioStateIsHealthy(
    inspection,
    plan,
  );
  const ownedByThisAction =
    inspection.price?.corporateActionReservationId === plan.action.id ||
    inspection.price?.corporateActionHaltId === plan.action.id;
  const latestEnabledRun = inspection.recentEnabledRuns[0] ?? null;
  const latestCompletedAt = latestEnabledRun?.completedAt ?? latestEnabledRun?.updatedAt;
  const expectedLatestSlot = expectedLatestWorkerSlot(now);
  const executionSafetyError = rightsExecutionSafetyError(inspection, plan);

  return [
    inspection.migrationReadiness?.status === "READY"
      ? null
      : "NOVEX migration READY marker 없음",
    expectedMigrationFingerprint &&
    inspection.migrationReadiness?.readyPlanFingerprint !==
      expectedMigrationFingerprint
      ? "NOVEX migration READY fingerprint 불일치"
      : null,
    inspection.marketState ? null : "stock_market_state 미초기화",
    inspection.marketState?.lastCompletedSlotKey ? null : "완료된 NOVEX 회차 없음",
    latestEnabledRun ? null : "enabled 모드 성공 stocks.tick 증거 없음",
    inspection.recentEnabledRuns.length >= 4 && enabledRunsAreConsecutive(inspection.recentEnabledRuns)
      ? null
      : "최근 연속 enabled NOVEX 회차 4건 증거 없음",
    latestEnabledRun && inspection.marketState?.lastCompletedSlotKey !== latestEnabledRun.slotKey
      ? "시장 상태와 최신 enabled worker 회차 불일치"
      : null,
    latestEnabledRun?.slotKey === expectedLatestSlot
      ? null
      : `최신 enabled worker 회차가 예상 회차(${expectedLatestSlot})와 다름`,
    latestCompletedAt && now.getTime() - latestCompletedAt.getTime() <= 12 * 60 * 60 * 1000
      ? null
      : "최신 enabled worker 성공이 12시간보다 오래됨",
    expectedWorkerSlot && latestEnabledRun?.slotKey !== expectedWorkerSlot
      ? "승인한 worker 회차와 실행 직전 최신 회차가 다름"
      : null,
    inspection.price ? null : "STM 가격 문서 없음",
    inspection.price?.referencePrice !== undefined
      ? null
      : "STM referencePrice 미설정",
    inspection.price?.isTradingHalted === true && !ownedByThisAction
      ? "STM 수동 거래정지 중"
      : null,
    inspection.price?.corporateActionReservationId &&
    inspection.price.corporateActionReservationId !== plan.action.id
      ? "STM 기업행동 예약 owner 존재"
      : null,
    inspection.price?.corporateActionHaltId &&
    inspection.price.corporateActionHaltId !== plan.action.id
      ? "STM 기업행동 정지 owner 존재"
      : null,
    inspection.activeActionCount > 0
      ? `STM 진행 중 다른 기업행동 ${inspection.activeActionCount}건`
      : null,
    inspection.conflictingDisclosureCount > 0
      ? `대상 회차 가격 공시 충돌 ${inspection.conflictingDisclosureCount}건`
      : null,
    inspection.deferredSlotKeys.length > 0
      ? `조기폐장으로 이월될 시나리오 회차: ${inspection.deferredSlotKeys.join(", ")}`
      : null,
    profileBaseMatchesInspection(inspection, plan)
      ? null
      : "계획 생성 뒤 STM 주요 주주 정보가 변경됨",
    executionSafetyError
      ? `유상증자 실행 안전성 사전검증 실패: ${executionSafetyError}`
      : null,
    !existingIsEmpty && !existingIsExact
      ? "동일 시나리오 ID의 부분·상이한 예약 존재"
      : null,
    existingIsExact && !existingStateIsHealthy
      ? "동일 시나리오의 상태·공시·owner 원장이 서로 불일치"
      : null,
    existingIsExact && inspection.existingAction?.status === "CANCELLED"
      ? "동일 시나리오가 취소되어 새 버전 ID가 필요"
      : null,
    existingIsExact && inspection.existingAction?.status === "ERROR"
      ? "동일 시나리오가 ERROR라 복구 또는 취소 판단 필요"
      : null,
  ].filter((item): item is string => item !== null);
}

function stableInspection(inspection: ScenarioInspection) {
  return {
    migrationReadiness: inspection.migrationReadiness
      ? {
          version: inspection.migrationReadiness.version,
          status: inspection.migrationReadiness.status,
          attemptId: inspection.migrationReadiness.attemptId,
          sourcePlanFingerprint:
            inspection.migrationReadiness.sourcePlanFingerprint,
          readyPlanFingerprint:
            inspection.migrationReadiness.readyPlanFingerprint ?? null,
          startedAt: inspection.migrationReadiness.startedAt.toISOString(),
          completedAt:
            inspection.migrationReadiness.completedAt?.toISOString() ?? null,
          updatedAt: inspection.migrationReadiness.updatedAt.toISOString(),
        }
      : null,
    marketState: inspection.marketState
      ? {
          status: inspection.marketState.status,
          lastCompletedSlotKey: inspection.marketState.lastCompletedSlotKey ?? null,
          tradeRevision: inspection.marketState.tradeRevision,
          updatedAt: inspection.marketState.updatedAt.toISOString(),
        }
      : null,
    recentEnabledRuns: inspection.recentEnabledRuns.map((item) => ({
      slotKey: item.slotKey,
      completedAt: item.completedAt?.toISOString() ?? null,
      updatedAt: item.updatedAt.toISOString(),
    })),
    price: inspection.price
      ? {
          price: inspection.price.price,
          referencePrice: inspection.price.referencePrice ?? null,
          lastUpdate: inspection.price.lastUpdate,
          isTradingHalted: inspection.price.isTradingHalted === true,
          corporateActionReservationId:
            inspection.price.corporateActionReservationId ?? null,
          corporateActionHaltId: inspection.price.corporateActionHaltId ?? null,
          cumulativeSplitFactor: inspection.price.cumulativeSplitFactor ?? 1,
          cumulativeCapitalIncreaseFactor:
            inspection.price.cumulativeCapitalIncreaseFactor ?? 1,
        }
      : null,
    companyProfile: inspection.companyProfile
      ? {
          sourceDisclosureId: inspection.companyProfile.sourceDisclosureId,
          majorShareholders: inspection.companyProfile.majorShareholders,
          updatedAt: inspection.companyProfile.updatedAt.toISOString(),
        }
      : null,
    holdings: inspection.holdings
      .map((item) => ({ shares: item.shares, avgPrice: item.avgPrice }))
      .sort((left, right) =>
        left.shares - right.shares || left.avgPrice - right.avgPrice,
      ),
    totalHoldingShares: inspection.totalHoldingShares,
    deferredSlotKeys: [...inspection.deferredSlotKeys].sort(),
    activeActionCount: inspection.activeActionCount,
    conflictingDisclosureCount: inspection.conflictingDisclosureCount,
    existingAction: inspection.existingAction
      ? {
          id: inspection.existingAction._id,
          status: inspection.existingAction.status,
        }
      : null,
    existingDisclosures: inspection.existingDisclosures.map((item) => ({
      id: item._id,
      status: item.status,
      slotKey: item.slotKey ?? null,
    })),
  };
}

export function executionFingerprint(input: {
  migrationFingerprint: string;
  scenarioFingerprint: string;
  inspection: ScenarioInspection;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        migrationFingerprint: input.migrationFingerprint,
        scenarioFingerprint: input.scenarioFingerprint,
        inspection: stableInspection(input.inspection),
      }),
    )
    .digest("hex");
}

function expectedPricePath(plan: StarmartCapitalScenarioPlan, currentPrice: number) {
  const mechanical = roundPrice(currentPrice / plan.action.factor);
  let cursor = roundPrice(
    mechanical * (1 + plan.action.priceAdjustmentPercent / 100),
  );
  const rows = [
    { slotKey: plan.action.executeSlotKey, label: "유상증자 실행", price: cursor },
  ];
  for (const disclosure of plan.disclosures) {
    const percent = disclosure.effects[0]?.changePercent ?? 0;
    cursor = roundPrice(cursor * (1 + percent / 100));
    rows.push({ slotKey: disclosure.slotKey, label: disclosure.title, price: cursor });
  }
  return { mechanical, rows };
}

async function applyScenario(
  db: Db,
  plan: StarmartCapitalScenarioPlan,
  now: Date,
  approval: {
    expectedPlan: string;
    migrationFingerprint: string;
    scenarioFingerprint: string;
    expectedWorkerSlot: string;
  },
): Promise<"created" | "replayed"> {
  const client = await getClient();
  const session = client.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const current = await inspectScenario(db, plan, session);
      if (
        existingScenarioStateIsHealthy(current, plan) &&
        current.existingAction?.status !== "CANCELLED" &&
        current.existingAction?.status !== "ERROR"
      ) {
        return "replayed" as const;
      }
      await claimStockMarketMigrationReady(session);
      if (
        current.migrationReadiness?.status !== "READY" ||
        current.migrationReadiness.readyPlanFingerprint !==
          approval.migrationFingerprint
      ) {
        throw new Error(
          "NOVEX migration READY marker가 승인 뒤 바뀌어 transaction write 전에 중단했습니다.",
        );
      }
      const transactionPlanSha256 = executionFingerprint({
        migrationFingerprint: approval.migrationFingerprint,
        scenarioFingerprint: approval.scenarioFingerprint,
        inspection: current,
      });
      if (transactionPlanSha256 !== approval.expectedPlan) {
        throw new Error(
          "승인 뒤 DB 상태가 바뀌어 transaction snapshot에서 중단했습니다.",
        );
      }
      const blockers = inspectionBlockers(
        current,
        plan,
        now,
        approval.expectedWorkerSlot,
        approval.migrationFingerprint,
      );
      if (blockers.length > 0) {
        throw new Error(`transaction 직전 상태 검증 실패: ${blockers.join(", ")}`);
      }

      await createStockCorporateAction(
        {
          _id: plan.action.id,
          type: "RIGHTS_OFFERING",
          ticker: plan.ticker,
          factor: plan.action.factor,
          reason: plan.action.reason,
          priceAdjustmentPercent: plan.action.priceAdjustmentPercent,
          announceSlotKey: plan.action.announceSlotKey,
          executeSlotKey: plan.action.executeSlotKey,
          status: "SCHEDULED",
          createdById: STM_CAPITAL_SCENARIO_SYSTEM_ACTOR,
          createdAt: now,
          updatedAt: now,
        },
        session,
      );
      for (const disclosure of plan.disclosures) {
        await createStockDisclosure(
          {
            id: disclosure.id,
            title: disclosure.title,
            body: disclosure.body,
            kind: "PRICE",
            status: "SCHEDULED",
            source: "GM",
            effects: disclosure.effects,
            publishAt: parseNovexSlotKey(disclosure.slotKey),
            slotKey: disclosure.slotKey,
            shock: true,
            ownerCorporateActionId: plan.action.id,
            companyProfileUpdate: disclosure.companyProfileUpdate,
            createdById: STM_CAPITAL_SCENARIO_SYSTEM_ACTOR,
            now,
          },
          session,
        );
      }
      return "created" as const;
    });
    if (!result) throw new Error("시나리오 예약 transaction 결과가 없습니다.");
    return result;
  } finally {
    await session.endSession();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const targetDb = readArgument(argv, "--target-db");
  const expectedPlan = readArgument(argv, "--expected-plan");
  const expectedWorkerSlot = readArgument(argv, "--expected-worker-slot");
  const explicitAnnounceSlot = readArgument(argv, "--announce-slot");
  const uri = process.env.MONGODB_URI;
  const workerDb = process.env.MONGODB_DB_NAME?.trim() || null;
  const webDb = process.env.DB_NAME?.trim() || null;
  if (workerDb && webDb && workerDb !== webDb) {
    throw new Error("MONGODB_DB_NAME과 DB_NAME이 달라 중단했습니다.");
  }
  const configuredDb = workerDb || webDb;
  if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");
  if (configuredDb && targetDb && configuredDb !== targetDb) {
    throw new Error("환경 DB와 --target-db가 달라 mutation 전에 중단했습니다.");
  }
  if (
    apply &&
    (!argv.includes("--yes") ||
      !targetDb ||
      !expectedPlan ||
      !expectedWorkerSlot ||
      !explicitAnnounceSlot ||
      !argv.includes("--novex-enabled") ||
      !argv.includes("--worker-cron-confirmed") ||
      !argv.includes("--first-round-verified"))
  ) {
    throw new Error(
      "WRITE에는 --apply --yes --target-db --announce-slot --expected-plan --expected-worker-slot --novex-enabled --worker-cron-confirmed --first-round-verified가 모두 필요합니다.",
    );
  }
  if (
    apply &&
    (process.env.NOVEX_V2_MODE !== "enabled" ||
      process.env.NOVEX_SCENARIO_APPLY_CONTEXT !== "deployment-runbook")
  ) {
    throw new Error(
      "APPLY는 NOVEX_V2_MODE=enabled인 worker 배포 환경의 deployment-runbook 단계에서만 허용됩니다.",
    );
  }

  const dbName = targetDb ?? configuredDb ?? "stargate";
  await connect({ uri, dbName, maxPoolSize: 2 });
  try {
    const db = await getDb();
    const now = new Date();
    const announceSlotKey =
      explicitAnnounceSlot ?? firstNovexSlotAfter(now, 30);
    const initialProfile = await db
      .collection<StockCompanyProfile>("stock_company_profiles")
      .findOne({ _id: STM_CAPITAL_SCENARIO_TICKER });
    const plan = buildStarmartCapitalScenarioPlan({
      announceSlotKey,
      rightsFactor: readNumberArgument(argv, "--rights-factor", 2),
      rightsPriceAdjustmentPercent: readNumberArgument(
        argv,
        "--rights-adjustment",
        DEFAULT_RIGHTS_PRICE_ADJUSTMENT_PERCENT,
      ),
      mrBeastStakePercent: readNumberArgument(
        argv,
        "--stake-percent",
        DEFAULT_MRBEAST_STAKE_PERCENT,
      ),
      acquisitionPriceChangePercent: readNumberArgument(
        argv,
        "--acquisition-change",
        DEFAULT_ACQUISITION_PRICE_CHANGE_PERCENT,
      ),
      ...resolveFollowupArgument(argv),
      followupCount: readNumberArgument(argv, "--followup-count", 3),
      existingMajorShareholders: initialProfile?.majorShareholders ?? [],
    });
    if (parseNovexSlotKey(plan.action.announceSlotKey).getTime() <= now.getTime() + 30 * 60_000) {
      throw new Error("발표 회차는 실행 시점 기준 최소 30분 이후여야 합니다.");
    }

    const [migration, inspection] = await Promise.all([
      inspectNovex2Migration(db),
      inspectScenario(db, plan),
    ]);
    const migrationFingerprint = novex2MigrationPlanFingerprint(migration);
    const scenarioFingerprint = starmartCapitalScenarioFingerprint(plan);
    const planSha256 = executionFingerprint({
      migrationFingerprint,
      scenarioFingerprint,
      inspection,
    });
    const blockers = [
      ...migrationBlockers(migration),
      ...inspectionBlockers(
        inspection,
        plan,
        now,
        expectedWorkerSlot,
        migrationFingerprint,
      ),
    ];
    const splitFactor = inspection.price?.cumulativeSplitFactor ?? 1;
    const capitalFactor =
      inspection.price?.cumulativeCapitalIncreaseFactor ?? 1;
    const currentIssuedShares =
      BASE_STM_SHARES_OUTSTANDING * splitFactor * capitalFactor;
    const projectedIssuedShares = currentIssuedShares * plan.action.factor;
    const projectedHoldingShares =
      inspection.totalHoldingShares * plan.action.factor;
    const pricePath = inspection.price
      ? expectedPricePath(plan, inspection.price.price)
      : null;
    if (
      !Number.isSafeInteger(inspection.totalHoldingShares) ||
      !Number.isSafeInteger(projectedHoldingShares)
    ) {
      blockers.push("STM 보유주식 합계가 안전한 정수 범위를 벗어남");
    }
    if (
      !Number.isSafeInteger(currentIssuedShares) ||
      !Number.isSafeInteger(projectedIssuedShares)
    ) {
      blockers.push("STM 발행주식 수가 안전한 정수 범위를 벗어남");
    }
    if (
      inspection.price &&
      inspection.price.price / plan.action.factor < 0.01
    ) {
      blockers.push("유상증자 기계 조정가가 0.01 CR 미만");
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? "APPLY" : "DRY-RUN",
          targetDb: maskDbName(dbName),
          scenarioId: plan.scenarioId,
          ticker: plan.ticker,
          planSha256,
          migrationPlanSha256: migrationFingerprint,
          latestEnabledWorkerSlot:
            inspection.recentEnabledRuns[0]?.slotKey ?? null,
          blockers,
          action: plan.action,
          disclosures: plan.disclosures.map((item) => ({
            id: item.id,
            slotKey: item.slotKey,
            title: item.title,
            changePercent: item.effects[0]?.changePercent ?? 0,
            structural: item.effects[0]?.structural === true,
            ...(item.companyProfileUpdate
              ? { majorShareholders: item.companyProfileUpdate.majorShareholders }
              : {}),
          })),
          projection: {
            currentPrice: inspection.price?.price ?? null,
            mechanicalRightsPrice: pricePath?.mechanical ?? null,
            pricePath: pricePath?.rows ?? [],
            currentHoldingShares: inspection.totalHoldingShares,
            projectedHoldingShares,
            currentIssuedShares,
            projectedIssuedShares,
          },
          existingReservation: inspection.existingAction
            ? {
                status: inspection.existingAction.status,
                exact: actionMatchesPlan(inspection.existingAction, plan),
              }
            : null,
        },
        null,
        2,
      ),
    );

    if (!apply) {
      console.log(
        blockers.length > 0
          ? "[stm-capital-scenario] 변경하지 않았습니다. blocker 해소와 별도 라이브 승인 뒤 다시 dry-run 하세요."
          : "[stm-capital-scenario] 변경하지 않았습니다. 별도 라이브 승인 뒤 동일 planSha256으로 APPLY 하세요.",
      );
      return;
    }
    if (
      existingScenarioStateIsHealthy(inspection, plan) &&
      inspection.existingAction?.status !== "CANCELLED" &&
      inspection.existingAction?.status !== "ERROR"
    ) {
      console.log(
        `[stm-capital-scenario] 동일 예약 확인 완료: status=${inspection.existingAction?.status ?? "UNKNOWN"} mutation=no-op`,
      );
      return;
    }
    if (blockers.length > 0) {
      throw new Error(`예약 전제 미충족: ${blockers.join(", ")}`);
    }
    if (expectedPlan !== planSha256) {
      throw new Error(
        "승인된 planSha256과 실행 직전 DB/시나리오 계획이 달라 mutation 전에 중단했습니다.",
      );
    }
    const result = await applyScenario(db, plan, now, {
      expectedPlan,
      migrationFingerprint,
      scenarioFingerprint,
      expectedWorkerSlot: expectedWorkerSlot!,
    });
    const verified = await inspectScenario(db, plan);
    if (
      !existingScenarioStateIsHealthy(verified, plan) ||
      (result === "created" &&
        verified.price?.corporateActionReservationId !== plan.action.id)
    ) {
      throw new Error("예약 후 DB 재조회 검증에 실패했습니다.");
    }
    console.log(
      `[stm-capital-scenario] ${result === "created" ? "예약 완료" : "동일 예약 replay"}: action=1 disclosures=${verified.existingDisclosures.length} reservationOwner=ok`,
    );
  } finally {
    await close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      "[stm-capital-scenario] 실패:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
