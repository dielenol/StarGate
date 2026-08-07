/**
 * 공용 인벤토리와 CENSOR-3 상태를 읽기 전용으로 점검하는 레거시 진단기다.
 *
 * 직접 변환 실행은 폐쇄했다. CENSOR-3 재료 차감과 지급은 연결된 공방 요청이
 * 가결된 표결을 확인한 뒤 완료품 수령 트랜잭션에서만 수행한다.
 *
 *   pnpm migrate:neved-censor-3
 */

import { createHash } from "node:crypto";

import {
  MongoClient,
  MongoServerError,
  type ClientSession,
  type Db,
  type ObjectId,
} from "mongodb";

const OPERATION_ID = "neved-censor-3-manufacture-2026-08-06-v1";
const OPERATION_DOMAIN = "neved-censor-3-manufacture";
const ACTOR_ID = "system:neved-censor-3-migration";
const CHARACTER_CODENAME = "네베드";
const SOURCE_SLUG = "broken-syllable";
const RESULT_SLUG = "zulu-0028-censor-3";
const RESULT_CODE = "ZULU_0028_CENSOR_3";
const RESULT_NAME = "ZULU-0028 파쇄음절탄 「CENSOR-3」";
const SOURCE_QUANTITY = 3;
const RESULT_QUANTITY = 3;
const SHARED_SCOPE = "GLOBAL";

const OPERATION_PAYLOAD = {
  characterCodename: CHARACTER_CODENAME,
  source: {
    scope: SHARED_SCOPE,
    slug: SOURCE_SLUG,
    quantity: SOURCE_QUANTITY,
  },
  result: {
    slug: RESULT_SLUG,
    quantity: RESULT_QUANTITY,
  },
} as const;

interface CharacterDocument {
  _id: ObjectId;
  codename: string;
  type: string;
}

interface MasterItemDocument {
  _id: ObjectId;
  code?: string;
  slug: string;
  name: string;
  category: string;
  isAvailable?: boolean;
  isPublic?: boolean;
}

interface SharedInventoryDocument {
  _id: ObjectId;
  scope: string;
  itemId: string;
  itemName: string;
  quantity: number;
}

interface CharacterInventoryDocument {
  _id: ObjectId;
  characterId: string;
  characterCodename: string;
  itemId: string;
  itemName: string;
  quantity: number;
}

interface CharacterInventoryLockDocument {
  _id: string;
  characterId: string;
  itemId: string;
  updatedAt: Date;
  version?: number;
}

interface EconomicOperationDocument {
  _id: string;
  requestId: string;
  domain: string;
  actorId: string;
  payloadHash: string;
  status: "processing" | "completed" | "failed";
  responseStatus?: number;
  responseBody?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface MigrationMode {
  execute: boolean;
  dryRun: boolean;
}

export interface NevedCensorMigrationState {
  operation: EconomicOperationDocument | null;
  characters: CharacterDocument[];
  masters: MasterItemDocument[];
  sharedRows: SharedInventoryDocument[];
  targetRows: CharacterInventoryDocument[];
}

export type NevedCensorMigrationPlan =
  | {
      status: "ready";
      characterId: string;
      sourceItemId: string;
      resultItemId: string;
      sourceBefore: number;
      sourceAfter: number;
      resultBefore: 0;
      resultAfter: 3;
    }
  | { status: "replay"; operationId: string };

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function payloadHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

const EXPECTED_PAYLOAD_HASH = payloadHash(OPERATION_PAYLOAD);

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

export function parseMigrationMode(args: readonly string[]): MigrationMode {
  const execute = args.includes("--execute");
  if (execute) {
    throw new Error(
      "CENSOR-3 직접 변환은 폐쇄되었습니다. 연결된 공방 요청의 완료품 수령 절차를 사용하십시오.",
    );
  }
  return { execute: false, dryRun: true };
}

export function planNevedCensorMigration(
  state: NevedCensorMigrationState,
): NevedCensorMigrationPlan {
  assertCondition(
    state.characters.length === 1,
    `네베드 AGENT는 정확히 1명이어야 합니다: ${state.characters.length}`,
  );
  const character = state.characters[0];
  assertCondition(character, "네베드 AGENT를 찾지 못했습니다.");

  const sourceMaster = state.masters.find(
    (item) => item.slug === SOURCE_SLUG,
  );
  const resultMaster = state.masters.find(
    (item) => item.slug === RESULT_SLUG,
  );
  assertCondition(
    sourceMaster?.category === "MATERIAL",
    "깨진 음절 MATERIAL master item을 찾지 못했습니다.",
  );
  assertCondition(
    resultMaster?.category === "CONSUMABLE",
    "CENSOR-3 CONSUMABLE master item을 찾지 못했습니다. seed를 먼저 적용하십시오.",
  );
  assertCondition(
    resultMaster.code === RESULT_CODE &&
      resultMaster.name === RESULT_NAME &&
      resultMaster.isAvailable === false &&
      resultMaster.isPublic === false,
    "CENSOR-3 master item이 승인된 비공개·비판매 seed 계약과 다릅니다.",
  );

  if (state.operation) {
    assertCondition(
      state.operation.domain === OPERATION_DOMAIN &&
        state.operation.actorId === ACTOR_ID &&
        state.operation.payloadHash === EXPECTED_PAYLOAD_HASH,
      "동일 operation id가 다른 변환에 사용되었습니다.",
    );
    assertCondition(
      state.operation.status === "completed",
      `기존 operation 상태가 completed가 아닙니다: ${state.operation.status}`,
    );
    const response = state.operation.responseBody as {
      characterCodename?: unknown;
      source?: { slug?: unknown; consumed?: unknown; remaining?: unknown };
      result?: { slug?: unknown; granted?: unknown };
    } | undefined;
    assertCondition(
      state.operation.responseStatus === 200 &&
        response?.characterCodename === CHARACTER_CODENAME &&
        response.source?.slug === SOURCE_SLUG &&
        response.source.consumed === SOURCE_QUANTITY &&
        Number.isSafeInteger(response.source.remaining) &&
        Number(response.source.remaining) >= 0 &&
        response.result?.slug === RESULT_SLUG &&
        response.result.granted === RESULT_QUANTITY,
      "완료 원장의 CENSOR-3 변환 결과가 예상 계약과 다릅니다.",
    );
    return { status: "replay", operationId: OPERATION_ID };
  }

  assertCondition(
    state.sharedRows.length === 1,
    `공용 깨진 음절 인벤토리 행은 정확히 1개여야 합니다: ${state.sharedRows.length}`,
  );
  const source = state.sharedRows[0];
  assertCondition(source, "공용 깨진 음절 인벤토리를 찾지 못했습니다.");
  assertCondition(
    source.itemId === sourceMaster._id.toString() &&
      source.scope === SHARED_SCOPE &&
      source.quantity >= SOURCE_QUANTITY,
    `공용 깨진 음절이 ${SOURCE_QUANTITY}개 이상 필요합니다: ${source.quantity}`,
  );
  assertCondition(
    state.targetRows.length === 0,
    "원장 없이 네베드가 CENSOR-3를 이미 보유하고 있어 중복 제작을 중단합니다.",
  );

  return {
    status: "ready",
    characterId: character._id.toString(),
    sourceItemId: sourceMaster._id.toString(),
    resultItemId: resultMaster._id.toString(),
    sourceBefore: source.quantity,
    sourceAfter: source.quantity - SOURCE_QUANTITY,
    resultBefore: 0,
    resultAfter: RESULT_QUANTITY,
  };
}

/**
 * 실행 직후에만 mutable inventory 잔량까지 검증한다.
 *
 * 완료 원장 replay 시점에는 이후 정상적인 획득·소비가 발생할 수 있으므로 현재
 * 잔량을 과거 지급 결과와 비교하지 않는다. 반대로 실제 쓰기를 수행한 호출은
 * transaction 직후 이 검증을 거쳐 source/result 반영을 확인한다.
 */
export function verifyAppliedNevedCensorMigration(
  state: NevedCensorMigrationState,
  initialPlan: Extract<NevedCensorMigrationPlan, { status: "ready" }>,
): void {
  const replay = planNevedCensorMigration(state);
  assertCondition(
    replay.status === "replay",
    "쓰기 후 CENSOR-3 변환 원장을 재조회하지 못했습니다.",
  );
  const character = state.characters[0];
  const sourceMaster = state.masters.find(
    (item) => item.slug === SOURCE_SLUG,
  );
  const resultMaster = state.masters.find(
    (item) => item.slug === RESULT_SLUG,
  );
  assertCondition(
    character && sourceMaster && resultMaster,
    "쓰기 후 CENSOR-3 변환 대상을 재조회하지 못했습니다.",
  );
  const response = state.operation?.responseBody as {
    source?: { remaining?: unknown };
  } | undefined;
  assertCondition(
    response?.source?.remaining === initialPlan.sourceAfter,
    "완료 원장의 깨진 음절 잔량이 실행 계획과 다릅니다.",
  );
  if (initialPlan.sourceAfter === 0) {
    assertCondition(
      state.sharedRows.length === 0,
      "쓰기 직후 공용 깨진 음절 0개 행이 제거되지 않았습니다.",
    );
  } else {
    assertCondition(
      state.sharedRows.length === 1 &&
        state.sharedRows[0]?.scope === SHARED_SCOPE &&
        state.sharedRows[0]?.itemId === sourceMaster._id.toString() &&
        state.sharedRows[0]?.quantity === initialPlan.sourceAfter,
      "쓰기 직후 공용 깨진 음절 실제 잔량이 실행 계획과 다릅니다.",
    );
  }
  assertCondition(
    state.targetRows.length === 1 &&
      state.targetRows[0]?.characterId === character._id.toString() &&
      state.targetRows[0]?.itemId === resultMaster._id.toString() &&
      state.targetRows[0]?.itemName === RESULT_NAME &&
      state.targetRows[0]?.quantity === initialPlan.resultAfter,
    "쓰기 직후 네베드 CENSOR-3 실제 지급 수량이 실행 계획과 다릅니다.",
  );
}

export function assertNevedCensorMigrationPlanUnchanged(
  initialPlan: Extract<NevedCensorMigrationPlan, { status: "ready" }>,
  transactionalPlan: Extract<NevedCensorMigrationPlan, { status: "ready" }>,
): void {
  assertCondition(
    transactionalPlan.characterId === initialPlan.characterId &&
      transactionalPlan.sourceItemId === initialPlan.sourceItemId &&
      transactionalPlan.resultItemId === initialPlan.resultItemId &&
      transactionalPlan.sourceBefore === initialPlan.sourceBefore &&
      transactionalPlan.sourceAfter === initialPlan.sourceAfter &&
      transactionalPlan.resultBefore === initialPlan.resultBefore &&
      transactionalPlan.resultAfter === initialPlan.resultAfter,
    "대상 또는 수량이 dry-run 이후 변경되었습니다.",
  );
}

async function readState(
  db: Db,
  session?: ClientSession,
): Promise<NevedCensorMigrationState> {
  const [operation, characters, masters] = await Promise.all([
    db.collection<EconomicOperationDocument>("economic_operations").findOne(
      { _id: OPERATION_ID },
      { session },
    ),
    db.collection<CharacterDocument>("characters")
      .find(
        { codename: CHARACTER_CODENAME, type: "AGENT" },
        { session, projection: { codename: 1, type: 1 } },
      )
      .toArray(),
    db.collection<MasterItemDocument>("master_items")
      .find(
        { slug: { $in: [SOURCE_SLUG, RESULT_SLUG] } },
        {
          session,
          projection: {
            code: 1,
            slug: 1,
            name: 1,
            category: 1,
            isAvailable: 1,
            isPublic: 1,
          },
        },
      )
      .toArray(),
  ]);

  const character = characters[0];
  const sourceMaster = masters.find((item) => item.slug === SOURCE_SLUG);
  const resultMaster = masters.find((item) => item.slug === RESULT_SLUG);
  const [sharedRows, targetRows] = await Promise.all([
    sourceMaster
      ? db.collection<SharedInventoryDocument>("shared_inventory")
          .find(
            {
              scope: SHARED_SCOPE,
              itemId: sourceMaster._id.toString(),
            },
            { session },
          )
          .toArray()
      : [],
    character && resultMaster
      ? db.collection<CharacterInventoryDocument>("character_inventory")
          .find(
            {
              characterId: character._id.toString(),
              itemId: resultMaster._id.toString(),
            },
            { session },
          )
          .toArray()
      : [],
  ]);
  return { operation, characters, masters, sharedRows, targetRows };
}

async function prepareInventoryLock(
  db: Db,
  characterId: string,
  itemId: string,
): Promise<void> {
  const locks = db.collection<CharacterInventoryLockDocument>(
    "character_inventory_locks",
  );
  const _id = `${characterId}:${itemId}`;
  const update = {
    $set: { characterId, itemId, updatedAt: new Date() },
  };
  try {
    await locks.updateOne({ _id }, update, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) {
      throw error;
    }
    await locks.updateOne({ _id }, update);
  }
}

async function executeMigration(
  client: MongoClient,
  db: Db,
  initialPlan: Extract<NevedCensorMigrationPlan, { status: "ready" }>,
): Promise<void> {
  await prepareInventoryLock(
    db,
    initialPlan.characterId,
    initialPlan.resultItemId,
  );
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const lockResult = await db.collection<CharacterInventoryLockDocument>(
        "character_inventory_locks",
      ).updateOne(
        {
          _id: `${initialPlan.characterId}:${initialPlan.resultItemId}`,
        },
        {
          $set: { updatedAt: new Date() },
          $inc: { version: 1 },
        },
        { session },
      );
      assertCondition(
        lockResult.matchedCount === 1,
        "CENSOR-3 인벤토리 lock anchor를 잡지 못했습니다.",
      );

      const state = await readState(db, session);
      const plan = planNevedCensorMigration(state);
      assertCondition(
        plan.status === "ready",
        "트랜잭션 시작 전 다른 실행이 이미 변환을 완료했습니다.",
      );
      assertNevedCensorMigrationPlanUnchanged(initialPlan, plan);

      const now = new Date();
      await db.collection<EconomicOperationDocument>("economic_operations").insertOne(
        {
          _id: OPERATION_ID,
          requestId: OPERATION_ID,
          domain: OPERATION_DOMAIN,
          actorId: ACTOR_ID,
          payloadHash: EXPECTED_PAYLOAD_HASH,
          status: "processing",
          createdAt: now,
          updatedAt: now,
        },
        { session },
      );

      const source = await db.collection<SharedInventoryDocument>("shared_inventory")
        .findOneAndUpdate(
          {
            scope: SHARED_SCOPE,
            itemId: plan.sourceItemId,
            quantity: plan.sourceBefore,
          },
          { $inc: { quantity: -SOURCE_QUANTITY } },
          { session, returnDocument: "after" },
        );
      assertCondition(
        source?.quantity === plan.sourceAfter,
        "공용 깨진 음절 수량이 동시에 변경되어 전환을 중단합니다.",
      );
      if (source.quantity === 0) {
        await db.collection<SharedInventoryDocument>("shared_inventory").deleteOne(
          { _id: source._id, quantity: 0 },
          { session },
        );
      }

      const resultMaster = state.masters.find(
        (item) => item.slug === RESULT_SLUG,
      );
      assertCondition(resultMaster, "CENSOR-3 master item이 사라졌습니다.");
      const target = await db.collection<CharacterInventoryDocument>("character_inventory")
        .findOneAndUpdate(
          {
            characterId: plan.characterId,
            itemId: plan.resultItemId,
          },
          {
            $inc: { quantity: RESULT_QUANTITY },
            $setOnInsert: {
              characterCodename: CHARACTER_CODENAME,
              itemName: resultMaster.name,
              acquiredAt: now,
              note: "깨진 음절 3개를 전환한 CENSOR-3 시즌 1 시제품",
            },
          },
          { session, upsert: true, returnDocument: "after" },
        );
      assertCondition(
        target?.quantity === RESULT_QUANTITY,
        "네베드 CENSOR-3 3발 지급 검증에 실패했습니다.",
      );

      const responseBody = {
        characterCodename: CHARACTER_CODENAME,
        source: {
          slug: SOURCE_SLUG,
          consumed: SOURCE_QUANTITY,
          remaining: plan.sourceAfter,
        },
        result: {
          slug: RESULT_SLUG,
          granted: RESULT_QUANTITY,
        },
      };
      const completed = await db.collection<EconomicOperationDocument>(
        "economic_operations",
      ).updateOne(
        { _id: OPERATION_ID, status: "processing" },
        {
          $set: {
            status: "completed",
            responseStatus: 200,
            responseBody,
            updatedAt: new Date(),
          },
        },
        { session },
      );
      assertCondition(
        completed.modifiedCount === 1,
        "CENSOR-3 변환 원장 완료 기록에 실패했습니다.",
      );
    });
  } finally {
    await session.endSession();
  }
}

async function main(): Promise<void> {
  const mode = parseMigrationMode(process.argv.slice(2));
  const uri = process.env.MONGODB_URI;
  assertCondition(uri, "MONGODB_URI 환경변수가 필요합니다.");
  const dbName = process.env.DB_NAME?.trim() || "stargate";
  if (mode.execute) {
    assertCondition(
      Boolean(process.env.DB_NAME?.trim()),
      "실행 모드에서는 DB_NAME을 명시해야 합니다.",
    );
  }

  const client = new MongoClient(uri, { maxPoolSize: 2 });
  try {
    await client.connect();
    const db = client.db(dbName);
    const before = await readState(db);
    const plan = planNevedCensorMigration(before);
    console.log(
      JSON.stringify(
        {
          mode: mode.dryRun ? "DRY-RUN" : "EXECUTE",
          operationId: OPERATION_ID,
          plan,
        },
        null,
        2,
      ),
    );

    if (plan.status === "replay") {
      console.log("[neved-censor-3] 이미 완료된 원장을 확인했습니다. 추가 변경 없음.");
      return;
    }
    if (mode.dryRun) {
      console.log(
        "[neved-censor-3] dry-run 완료. 실제 적용에는 --execute --yes가 모두 필요합니다.",
      );
      return;
    }

    await executeMigration(client, db, plan);
    const after = await readState(db);
    verifyAppliedNevedCensorMigration(after, plan);
    console.log(
      JSON.stringify(
        { applied: true, verifiedOperationId: OPERATION_ID },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

const isMainEntry = (process.argv[1] ?? "").endsWith(
  "migrate-neved-censor-3.ts",
);
if (isMainEntry) {
  main().catch((error) => {
    console.error("[neved-censor-3] fatal", error);
    process.exitCode = 1;
  });
}
