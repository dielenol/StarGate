/**
 * 판매량 주가 연동 배포 전에 이미 판매된 미스터비스트 소다 수량을 demand 원장에 반영한다.
 *
 * 안전한 순서:
 * 1. checkout dual-write 코드를 배포하되 tick gate는 false로 둔다.
 * 2. dry-run을 확인한다.
 * 3. --execute --yes --tick-paused로 backfill하고 재조회한다.
 * 4. Web/worker의 MRBEAST_SODA_STOCK_IMPACT_TICK_ENABLED를 함께 true로 바꾼다.
 *
 * 기본은 읽기 전용이다. 실제 쓰기는 세 확인 인자를 모두 전달해야 한다.
 */

import {
  isMrBeastSodaStockImpactTickEnabled,
  MRBEAST_SODA_STOCK_IMPACT_PROMOTION,
  MRBEAST_SODA_STOCK_IMPACT_TICKER,
  resolveMrBeastSodaStockImpactWindow,
  type MrBeastSodaStockImpactWindow,
} from "@stargate/core/domain/mrbeast-soda-stock-impact";
import {
  MongoClient,
  type ClientSession,
  type Collection,
  type Db,
} from "mongodb";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
if (execute && (!args.has("--yes") || !args.has("--tick-paused"))) {
  throw new Error(
    "실행 모드는 --execute --yes --tick-paused를 함께 전달해야 합니다.",
  );
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");

const webDbName = process.env.DB_NAME?.trim();
const workerDbName = process.env.MONGODB_DB_NAME?.trim();
if (webDbName && workerDbName && webDbName !== workerDbName) {
  throw new Error("DB_NAME과 MONGODB_DB_NAME이 일치해야 합니다.");
}
if (execute && !webDbName && !workerDbName) {
  throw new Error("실행 모드에서는 DB_NAME 또는 MONGODB_DB_NAME을 명시해야 합니다.");
}
if (
  execute &&
  isMrBeastSodaStockImpactTickEnabled(
    process.env.MRBEAST_SODA_STOCK_IMPACT_TICK_ENABLED,
  )
) {
  throw new Error(
    "backfill 중에는 MRBEAST_SODA_STOCK_IMPACT_TICK_ENABLED가 false여야 합니다.",
  );
}

const dbName = webDbName || workerDbName || "stargate";
const client = new MongoClient(uri, { maxPoolSize: 2 });
await client.connect();

interface LotteryConfigDoc {
  _id: "mrbeast-lottery";
  eventId: string;
  version: number;
  startAt: Date;
  endAt: Date;
}

interface DailyCounterDoc {
  slug: string;
  purchasedQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

interface DemandDoc {
  _id: string;
  promotion: typeof MRBEAST_SODA_STOCK_IMPACT_PROMOTION;
  ticker: typeof MRBEAST_SODA_STOCK_IMPACT_TICKER;
  eventId: string;
  configVersion: number;
  startAt: Date;
  endAt: Date;
  soldQuantity: number;
  appliedQuantity: number;
  createdAt: Date;
  updatedAt: Date;
  backfilledAt?: Date;
  backfillSource?: "shop_daily_purchase_counters";
}

interface BackfillPlan {
  window: MrBeastSodaStockImpactWindow;
  demandId: string;
  quantity: number;
  buyers: number;
  existing: DemandDoc | null;
}

function demandId(window: MrBeastSodaStockImpactWindow): string {
  return `${MRBEAST_SODA_STOCK_IMPACT_PROMOTION}:${window.eventId}:v${window.configVersion}`;
}

function demandMatchesWindow(
  demand: DemandDoc,
  window: MrBeastSodaStockImpactWindow,
): boolean {
  return (
    demand.promotion === MRBEAST_SODA_STOCK_IMPACT_PROMOTION &&
    demand.ticker === MRBEAST_SODA_STOCK_IMPACT_TICKER &&
    demand.eventId === window.eventId &&
    demand.configVersion === window.configVersion &&
    demand.startAt.getTime() === window.startAt.getTime() &&
    demand.endAt.getTime() === window.endAt.getTime()
  );
}

async function createPlan(
  db: Db,
  session?: ClientSession,
): Promise<BackfillPlan> {
  const config = await db
    .collection<LotteryConfigDoc>("shop_runtime_state")
    .findOne({ _id: "mrbeast-lottery" }, { session });
  const window = resolveMrBeastSodaStockImpactWindow({
    eventId: config?.eventId ?? null,
    configVersion: config?.version ?? 0,
    startAt: config?.startAt ?? null,
    endAt: config?.endAt ?? null,
  });
  if (!window) {
    throw new Error("유효한 미스터비스트 소다 주가 영향 기간이 없습니다.");
  }

  const upperBound = new Date(Math.min(Date.now(), window.endAt.getTime()));
  const counters = db.collection<DailyCounterDoc>(
    "shop_daily_purchase_counters",
  );
  const [startBoundaryCount, endBoundaryCount, upperBoundaryCount] =
    await Promise.all([
      counters.countDocuments(
        {
          slug: "mrbeast_soda",
          createdAt: { $lt: window.startAt },
          updatedAt: { $gte: window.startAt },
        },
        { session },
      ),
      counters.countDocuments(
        {
          slug: "mrbeast_soda",
          createdAt: { $lt: window.endAt },
          updatedAt: { $gte: window.endAt },
        },
        { session },
      ),
      counters.countDocuments(
        {
          slug: "mrbeast_soda",
          createdAt: { $lt: upperBound },
          updatedAt: { $gt: upperBound },
        },
        { session },
      ),
    ]);
  if (startBoundaryCount > 0 || endBoundaryCount > 0 || upperBoundaryCount > 0) {
    throw new Error(
      `기간 경계를 걸친 counter는 안전하게 분리할 수 없습니다. start=${startBoundaryCount} end=${endBoundaryCount} upper=${upperBoundaryCount}`,
    );
  }

  const totals = await counters
    .aggregate<{ quantity: number; buyers: number }>(
      [
        {
          $match: {
            slug: "mrbeast_soda",
            createdAt: { $gte: window.startAt, $lt: upperBound },
          },
        },
        {
          $group: {
            _id: null,
            quantity: { $sum: "$purchasedQuantity" },
            buyers: { $sum: 1 },
          },
        },
        { $project: { _id: 0, quantity: 1, buyers: 1 } },
      ],
      { session },
    )
    .next();
  const quantity = totals?.quantity ?? 0;
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error("기존 미스터비스트 소다 판매량 합계가 올바르지 않습니다.");
  }

  const id = demandId(window);
  const demands = db.collection<DemandDoc>(
    "mrbeast_soda_stock_impact_demand",
  );
  const overlappingDemands = await demands
    .find(
      {
        promotion: MRBEAST_SODA_STOCK_IMPACT_PROMOTION,
        startAt: { $lt: window.endAt },
        endAt: { $gt: window.startAt },
      },
      { session },
    )
    .toArray();
  const otherDemand = overlappingDemands.find((demand) => demand._id !== id);
  if (otherDemand) {
    throw new Error(
      `기간이 겹치는 다른 이벤트 또는 config version demand(${otherDemand._id})가 있어 중복 여부를 안전하게 판정할 수 없습니다.`,
    );
  }
  const existing = overlappingDemands[0] ?? null;
  if (existing && !demandMatchesWindow(existing, window)) {
    throw new Error("현재 demand와 이벤트 기간 설정이 일치하지 않습니다.");
  }
  if ((existing?.appliedQuantity ?? 0) !== 0) {
    throw new Error(
      "이미 시세에 적용된 판매량이 있어 안전하게 backfill할 수 없습니다.",
    );
  }
  if ((existing?.soldQuantity ?? 0) > quantity) {
    throw new Error(
      "demand 판매량이 일일 counter 합계보다 커서 안전하게 병합할 수 없습니다.",
    );
  }

  return {
    window,
    demandId: id,
    quantity,
    buyers: totals?.buyers ?? 0,
    existing,
  };
}

async function applyPlan(
  demands: Collection<DemandDoc>,
  plan: BackfillPlan,
  session: ClientSession,
): Promise<void> {
  const appliedAt = new Date();
  if (!plan.existing) {
    await demands.insertOne(
      {
        _id: plan.demandId,
        promotion: MRBEAST_SODA_STOCK_IMPACT_PROMOTION,
        ticker: MRBEAST_SODA_STOCK_IMPACT_TICKER,
        eventId: plan.window.eventId,
        configVersion: plan.window.configVersion,
        startAt: plan.window.startAt,
        endAt: plan.window.endAt,
        soldQuantity: plan.quantity,
        appliedQuantity: 0,
        createdAt: appliedAt,
        updatedAt: appliedAt,
        backfilledAt: appliedAt,
        backfillSource: "shop_daily_purchase_counters",
      },
      { session },
    );
    return;
  }

  const result = await demands.updateOne(
    {
      _id: plan.demandId,
      soldQuantity: plan.existing.soldQuantity,
      appliedQuantity: 0,
    },
    {
      $set: {
        soldQuantity: plan.quantity,
        updatedAt: appliedAt,
        backfilledAt: appliedAt,
        backfillSource: "shop_daily_purchase_counters",
      },
    },
    { session },
  );
  if (result.matchedCount !== 1) {
    throw new Error("판매량 demand backfill 경쟁 검증에 실패했습니다.");
  }
}

try {
  const db = client.db(dbName);
  if (!execute) {
    const plan = await createPlan(db);
    console.log(
      `[mrbeast-soda-stock-impact] mode=DRY-RUN db=${dbName} event=${plan.window.eventId} buyers=${plan.buyers} quantity=${plan.quantity} existing=${plan.existing?.soldQuantity ?? 0}`,
    );
    console.log(
      "[mrbeast-soda-stock-impact] dry-run 완료. DB는 변경되지 않았습니다.",
    );
  } else {
    const session = client.startSession();
    let appliedPlan: BackfillPlan | null;
    try {
      appliedPlan = await session.withTransaction(async () => {
        const plan = await createPlan(db, session);
        await applyPlan(
          db.collection<DemandDoc>("mrbeast_soda_stock_impact_demand"),
          plan,
          session,
        );
        return plan;
      });
    } finally {
      await session.endSession();
    }
    if (!appliedPlan) {
      throw new Error("판매량 demand backfill transaction 결과가 없습니다.");
    }
    const verified = await db
      .collection<DemandDoc>("mrbeast_soda_stock_impact_demand")
      .findOne({ _id: appliedPlan.demandId });
    if (
      !verified ||
      verified.soldQuantity !== appliedPlan.quantity ||
      verified.appliedQuantity !== 0 ||
      !demandMatchesWindow(verified, appliedPlan.window)
    ) {
      throw new Error("판매량 demand backfill 재조회 검증에 실패했습니다.");
    }
    console.log(
      `[mrbeast-soda-stock-impact] 반영 완료 db=${dbName} quantity=${verified.soldQuantity} applied=${verified.appliedQuantity}`,
    );
    console.log(
      "[mrbeast-soda-stock-impact] 다음 단계: Web/worker에서 MRBEAST_SODA_STOCK_IMPACT_TICK_ENABLED=true를 함께 설정하세요.",
    );
  }
} finally {
  await client.close();
}
