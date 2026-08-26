import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MongoClient, MongoServerError, ObjectId } from "mongodb";
import {
  parseFrontmatter,
  toDbCatalogItem,
} from "@stargate/shared-db/schemas";

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const SCOPE = "GLOBAL";
const PIPETTE_CODENAME = "PIPETTE";
const OPERATION_ID =
  "nosb-s1e6-turning-point-part2-items-2026-08-26-v1";
const OPERATION_DOMAIN = "session-lore-catalog-inventory-sync";
const ACTOR_ID = "system:nosb-s1e6-part2-lore-sync";
const PAYLOAD_PATH = resolve(
  process.cwd(),
  "scripts/seed-payloads/nosb-s1e6-turning-point-part2-catalog-items.json",
);

const SPEC_FILES = new Map([
  [
    "afterglow-radiance-sample",
    "docs/spec/catalog/afterglow-radiance-sample.md",
  ],
  ["afterglow-head", "docs/spec/catalog/afterglow-head.md"],
  [
    "nhi-rocket-engine-adaptation-document",
    "docs/spec/catalog/nhi-rocket-engine-adaptation-document.md",
  ],
  [
    "used-aurora-virus-syringe",
    "docs/spec/catalog/used-aurora-virus-syringe.md",
  ],
]);

const PERSONAL_TARGETS = [
  {
    codename: PIPETTE_CODENAME,
    slug: "afterglow-radiance-sample",
    quantity: 1,
    note: "NOSB-S1E6 변곡점 2부 직접 채취 표본",
  },
];

const SHARED_TARGETS = [
  {
    slug: "afterglow-radiance-sample",
    quantity: 4,
    note: "NOSB-S1E6 변곡점 2부 전방 수호대 전달 표본",
  },
  {
    slug: "afterglow-head",
    quantity: 1,
    note: "NOSB-S1E6 변곡점 2부 회수 생체 표본",
  },
  {
    slug: "used-aurora-virus-syringe",
    quantity: 1,
    note: "NOSB-S1E6 변곡점 2부 마리아 회수 현장 물증",
  },
];

const CATALOG_ONLY_SLUGS = ["nhi-rocket-engine-adaptation-document"];
const ALL_SLUGS = [...SPEC_FILES.keys()];

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function payloadHash(payload) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function deterministicMasterId(slug) {
  const hex = createHash("sha256")
    .update(`${OPERATION_ID}:${slug}`)
    .digest("hex")
    .slice(0, 24);
  return new ObjectId(hex);
}

function toMasterDocument(payload) {
  return {
    _id: deterministicMasterId(payload.slug),
    ...payload,
    createdAt: new Date(payload.createdAt),
    updatedAt: new Date(payload.updatedAt),
  };
}

function parseCatalogPayloads() {
  const envelopes = JSON.parse(readFileSync(PAYLOAD_PATH, "utf8"));
  assertCondition(Array.isArray(envelopes), "카탈로그 적용 자료가 배열이 아닙니다.");
  const masterEnvelopes = envelopes.filter(
    (entry) => entry?.collection === "master_items",
  );
  assertCondition(
    masterEnvelopes.length === SPEC_FILES.size,
    `카탈로그 항목은 ${SPEC_FILES.size}건이어야 합니다: ${masterEnvelopes.length}`,
  );
  const bySlug = new Map(
    masterEnvelopes.map((entry) => [entry?.payload?.slug, entry?.payload]),
  );
  assertCondition(
    bySlug.size === SPEC_FILES.size,
    "카탈로그 항목 식별자가 중복되거나 비어 있습니다.",
  );

  for (const [slug, specFile] of SPEC_FILES) {
    const payload = bySlug.get(slug);
    assertCondition(payload, `${slug}: 카탈로그 적용 자료가 없습니다.`);
    assertCondition(payload.price === 0, `${slug}: 가격은 0이어야 합니다.`);
    assertCondition(
      payload.isAvailable === false,
      `${slug}: 일반 지급 가능 상태이면 안 됩니다.`,
    );
    assertCondition(
      payload.isPublic === false,
      `${slug}: 전체 공개 상태이면 안 됩니다.`,
    );
    assertCondition(
      typeof payload.previewImage === "string" &&
        existsSync(resolve(process.cwd(), `public${payload.previewImage}`)),
      `${slug}: 카탈로그 이미지 파일을 찾을 수 없습니다.`,
    );
    const raw = readFileSync(resolve(process.cwd(), specFile), "utf8");
    const { data, body } = parseFrontmatter(raw, {
      allowMissing: false,
      fileName: specFile,
    });
    const canonical = toDbCatalogItem(data, body);
    assertCondition(
      stableJson(payload) === stableJson(canonical),
      `${slug}: 적용 자료가 정식 카탈로그 문서와 일치하지 않습니다.`,
    );
  }

  const inventorySlugs = new Set([
    ...PERSONAL_TARGETS.map((target) => target.slug),
    ...SHARED_TARGETS.map((target) => target.slug),
  ]);
  for (const slug of CATALOG_ONLY_SLUGS) {
    assertCondition(
      !inventorySlugs.has(slug),
      `${slug}: 카탈로그 전용 항목에 인벤토리 수량이 지정됐습니다.`,
    );
  }
  return bySlug;
}

async function readState(db, session) {
  const options = session ? { session } : {};
  const desiredIds = ALL_SLUGS.map(deterministicMasterId);
  // MongoDB는 단일 트랜잭션 세션 안의 병렬 작업을 지원하지 않는다.
  // 이 함수는 트랜잭션 안팎에서 모두 쓰이므로 조회를 항상 순차 실행한다.
  const pipette = await db
    .collection("characters")
    .findOne({ codename: PIPETTE_CODENAME }, options);
  const masters = await db
    .collection("master_items")
    .find({ slug: { $in: ALL_SLUGS } }, options)
    .toArray();
  const idCollisions = await db
    .collection("master_items")
    .find(
      {
        _id: { $in: desiredIds },
        slug: { $nin: ALL_SLUGS },
      },
      options,
    )
    .toArray();
  const operation = await db
    .collection("economic_operations")
    .findOne({ _id: OPERATION_ID }, options);
  const itemIds = desiredIds.map((itemId) => itemId.toString());
  const personal = await db
    .collection("character_inventory")
    .find({ itemId: { $in: itemIds } }, options)
    .toArray();
  const shared = await db
    .collection("shared_inventory")
    .find({ scope: SCOPE, itemId: { $in: itemIds } }, options)
    .toArray();
  return { pipette, masters, idCollisions, personal, shared, operation };
}

function inventorySummary(state, operationState) {
  const mastersBySlug = new Map(
    state.masters.map((item) => [item.slug, item]),
  );
  const personalByItemId = new Map(
    state.personal
      .filter(
        (entry) =>
          state.pipette &&
          entry.characterId === state.pipette._id.toString(),
      )
      .map((entry) => [entry.itemId, entry]),
  );
  const sharedByItemId = new Map(
    state.shared.map((entry) => [entry.itemId, entry]),
  );
  const replay = operationState === "replay";
  return {
    personal: PERSONAL_TARGETS.map((target) => {
      const master = mastersBySlug.get(target.slug);
      const current = master
        ? (personalByItemId.get(master._id.toString())?.quantity ?? 0)
        : 0;
      return {
        owner: target.codename,
        slug: target.slug,
        before: current,
        after: replay ? current : current + target.quantity,
      };
    }),
    shared: SHARED_TARGETS.map((target) => {
      const master = mastersBySlug.get(target.slug);
      const current = master
        ? (sharedByItemId.get(master._id.toString())?.quantity ?? 0)
        : 0;
      return {
        owner: "공용 인벤토리",
        slug: target.slug,
        before: current,
        after: replay ? current : current + target.quantity,
      };
    }),
    catalogOnly: CATALOG_ONLY_SLUGS.map((slug) => ({
      slug,
      personalBefore: state.personal.filter((entry) => {
        const master = mastersBySlug.get(slug);
        return master && entry.itemId === master._id.toString();
      }).length,
      personalAfter: 0,
      sharedBefore: state.shared.filter((entry) => {
        const master = mastersBySlug.get(slug);
        return master && entry.itemId === master._id.toString();
      }).length,
      sharedAfter: 0,
    })),
  };
}

function verifyOperation(operation, expectedHash) {
  assertCondition(
    operation?.payloadHash === expectedHash &&
      operation?.domain === OPERATION_DOMAIN &&
      operation?.actorId === ACTOR_ID,
    "동일한 작업 식별자가 다른 적용 내용에 사용됐습니다.",
  );
  assertCondition(
    operation.status === "completed",
    `기존 작업 상태가 완료가 아닙니다: ${operation.status}`,
  );
}

function verifyBaseline(state, expectedHash) {
  assertCondition(
    state.pipette,
    `${PIPETTE_CODENAME} 캐릭터를 찾을 수 없습니다.`,
  );
  assertCondition(
    state.pipette.type === "AGENT",
    `${PIPETTE_CODENAME}가 요원 캐릭터가 아닙니다.`,
  );
  assertCondition(
    state.idCollisions.length === 0,
    "새 카탈로그 항목에 예약한 식별자가 다른 항목과 충돌합니다.",
  );
  if (state.operation) {
    verifyOperation(state.operation, expectedHash);
    return "replay";
  }
  assertCondition(
    state.masters.length === 0,
    "대상 카탈로그 항목이 이미 존재합니다. 부분 적용 또는 중복 등록 가능성이 있어 중단합니다.",
  );
  assertCondition(
    state.personal.length === 0 && state.shared.length === 0,
    "대상 항목의 기존 인벤토리 수량이 있어 중복 지급을 중단합니다.",
  );
  return "not-started";
}

function verifyMaster(master, payload) {
  const expected = toMasterDocument(payload);
  assertCondition(
    master?._id?.toString() === expected._id.toString(),
    `${payload.slug}: 카탈로그 식별자가 적용 계획과 다릅니다.`,
  );
  const actualComparable = Object.fromEntries(
    Object.keys(expected)
      .filter((key) => key !== "_id")
      .map((key) => [key, master[key]]),
  );
  const expectedComparable = Object.fromEntries(
    Object.entries(expected).filter(([key]) => key !== "_id"),
  );
  assertCondition(
    stableJson(actualComparable) === stableJson(expectedComparable),
    `${payload.slug}: 저장된 카탈로그 내용이 정식 문서와 다릅니다.`,
  );
}

function verifyFinalState(state, catalogPayloads, expectedHash) {
  verifyOperation(state.operation, expectedHash);
  assertCondition(
    state.pipette?.type === "AGENT",
    `${PIPETTE_CODENAME} 캐릭터 상태를 확인할 수 없습니다.`,
  );
  assertCondition(
    state.masters.length === ALL_SLUGS.length,
    `카탈로그 ${ALL_SLUGS.length}건을 모두 확인할 수 없습니다.`,
  );
  const mastersBySlug = new Map(
    state.masters.map((item) => [item.slug, item]),
  );
  for (const [slug, payload] of catalogPayloads) {
    verifyMaster(mastersBySlug.get(slug), payload);
  }

  assertCondition(
    state.personal.length === PERSONAL_TARGETS.length,
    "대상 항목의 개인 인벤토리 행 수가 적용 계획과 다릅니다.",
  );
  for (const target of PERSONAL_TARGETS) {
    const master = mastersBySlug.get(target.slug);
    const entry = state.personal.find(
      (candidate) =>
        candidate.characterId === state.pipette._id.toString() &&
        candidate.itemId === master._id.toString(),
    );
    assertCondition(
      entry?.quantity === target.quantity &&
        entry?.characterCodename === target.codename &&
        entry?.itemName === master.name &&
        entry?.note === target.note,
      `${target.codename}의 ${target.slug} 수량 또는 지급 근거가 다릅니다.`,
    );
  }

  assertCondition(
    state.shared.length === SHARED_TARGETS.length,
    "대상 항목의 공용 인벤토리 행 수가 적용 계획과 다릅니다.",
  );
  for (const target of SHARED_TARGETS) {
    const master = mastersBySlug.get(target.slug);
    const entry = state.shared.find(
      (candidate) => candidate.itemId === master._id.toString(),
    );
    assertCondition(
      entry?.scope === SCOPE &&
        entry?.quantity === target.quantity &&
        entry?.itemName === master.name &&
        entry?.note === target.note,
      `${target.slug}: 공용 수량 또는 보관 근거가 다릅니다.`,
    );
  }

  for (const slug of CATALOG_ONLY_SLUGS) {
    const master = mastersBySlug.get(slug);
    assertCondition(
      !state.personal.some(
        (entry) => entry.itemId === master._id.toString(),
      ) &&
        !state.shared.some(
          (entry) => entry.itemId === master._id.toString(),
        ),
      `${slug}: 카탈로그 전용 항목에 인벤토리 수량이 생겼습니다.`,
    );
  }

  return {
    catalogItems: state.masters.length,
    personalRows: state.personal.length,
    sharedRows: state.shared.length,
    personalQuantity: state.personal.reduce(
      (sum, entry) => sum + entry.quantity,
      0,
    ),
    sharedQuantity: state.shared.reduce(
      (sum, entry) => sum + entry.quantity,
      0,
    ),
  };
}

async function preparePersonalInventoryLock(db, characterId, itemId) {
  const lockId = `${characterId}:${itemId}`;
  const locks = db.collection("character_inventory_locks");
  const update = () => ({
    $set: {
      characterId,
      itemId,
      updatedAt: new Date(),
    },
  });
  try {
    await locks.updateOne(
      { _id: lockId },
      update(),
      { upsert: true },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) {
      throw error;
    }
    const recovered = await locks.updateOne(
      { _id: lockId },
      update(),
    );
    assertCondition(
      recovered.matchedCount === 1,
      "피펫 개인 인벤토리 잠금 기준점 준비에 실패했습니다.",
    );
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

if (EXECUTE && !YES) {
  throw new Error("실행에는 --execute --yes가 모두 필요합니다.");
}
assertCondition(process.env.MONGODB_URI, "MONGODB_URI가 필요합니다.");

const catalogPayloads = parseCatalogPayloads();
const operationPayload = {
  catalog: [...catalogPayloads.values()],
  personal: PERSONAL_TARGETS,
  shared: SHARED_TARGETS,
  catalogOnly: CATALOG_ONLY_SLUGS,
};
const expectedHash = payloadHash(operationPayload);
const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 2 });

try {
  await client.connect();
  const db = client.db(
    process.env.DB_NAME || process.env.MONGODB_DB_NAME || "stargate",
  );
  const before = await readState(db);
  const operationState = verifyBaseline(before, expectedHash);
  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? "execute" : "dry-run",
        operationId: OPERATION_ID,
        operationState,
        catalog: ALL_SLUGS.map((slug) => ({
          slug,
          before: before.masters.some((item) => item.slug === slug)
            ? "existing"
            : "absent",
          after: "private, unavailable, price 0",
        })),
        inventory: inventorySummary(before, operationState),
        sideEffects: {
          credits: "unchanged",
          shopStock: "unchanged",
          stocks: "unchanged",
          notifications: "none",
          webhooks: "none",
          internalRecords:
            "one inventory lock anchor and one completed operation record",
        },
      },
      null,
      2,
    ),
  );

  if (!EXECUTE) {
    if (operationState === "replay") {
      const verified = verifyFinalState(
        before,
        catalogPayloads,
        expectedHash,
      );
      console.log(JSON.stringify({ replayed: true, verified }, null, 2));
    }
    process.exitCode = 0;
  } else if (operationState === "replay") {
    const verified = verifyFinalState(before, catalogPayloads, expectedHash);
    console.log(JSON.stringify({ replayed: true, verified }, null, 2));
  } else {
    const pipetteId = before.pipette._id.toString();
    const sampleMasterId = deterministicMasterId(
      PERSONAL_TARGETS[0].slug,
    ).toString();
    await preparePersonalInventoryLock(db, pipetteId, sampleMasterId);

    const session = client.startSession();
    let replayedDuringTransaction = false;
    try {
      await session.withTransaction(async () => {
        const transactionState = await readState(db, session);
        const transactionOperationState = verifyBaseline(
          transactionState,
          expectedHash,
        );
        if (transactionOperationState === "replay") {
          replayedDuringTransaction = true;
          return;
        }
        replayedDuringTransaction = false;
        assertCondition(
          transactionState.pipette._id.toString() === pipetteId,
          `${PIPETTE_CODENAME} 캐릭터 식별자가 실행 직전에 바뀌었습니다.`,
        );
        const now = new Date();
        await db.collection("economic_operations").insertOne(
          {
            _id: OPERATION_ID,
            requestId: OPERATION_ID,
            domain: OPERATION_DOMAIN,
            actorId: ACTOR_ID,
            payloadHash: expectedHash,
            status: "processing",
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );

        await db.collection("master_items").insertMany(
          [...catalogPayloads.values()].map(toMasterDocument),
          { session, ordered: true },
        );
        const masters = await db
          .collection("master_items")
          .find({ slug: { $in: ALL_SLUGS } }, { session })
          .toArray();
        assertCondition(
          masters.length === ALL_SLUGS.length,
          "트랜잭션 안에서 새 카탈로그 4건을 확인할 수 없습니다.",
        );
        const mastersBySlug = new Map(
          masters.map((item) => [item.slug, item]),
        );
        for (const [slug, payload] of catalogPayloads) {
          verifyMaster(mastersBySlug.get(slug), payload);
        }

        const lockResult = await db
          .collection("character_inventory_locks")
          .updateOne(
            { _id: `${pipetteId}:${sampleMasterId}` },
            {
              $set: {
                characterId: pipetteId,
                itemId: sampleMasterId,
                updatedAt: now,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        assertCondition(
          lockResult.matchedCount === 1,
          "피펫 개인 인벤토리 잠금 기준점을 확인할 수 없습니다.",
        );

        const personalDocuments = PERSONAL_TARGETS.map((target) => {
          const master = mastersBySlug.get(target.slug);
          return {
            characterId: pipetteId,
            characterCodename: target.codename,
            itemId: master._id.toString(),
            itemName: master.name,
            quantity: target.quantity,
            acquiredAt: now,
            note: target.note,
          };
        });
        await db.collection("character_inventory").insertMany(
          personalDocuments,
          { session, ordered: true },
        );

        const sharedDocuments = SHARED_TARGETS.map((target) => {
          const master = mastersBySlug.get(target.slug);
          return {
            scope: SCOPE,
            itemId: master._id.toString(),
            itemName: master.name,
            quantity: target.quantity,
            acquiredAt: now,
            note: target.note,
          };
        });
        await db.collection("shared_inventory").insertMany(
          sharedDocuments,
          { session, ordered: true },
        );

        const responseBody = {
          catalogItems: masters.map((item) => ({
            itemId: item._id.toString(),
            slug: item.slug,
            name: item.name,
          })),
          personal: personalDocuments.map(
            ({ characterCodename, itemId, itemName, quantity }) => ({
              characterCodename,
              itemId,
              itemName,
              quantity,
            }),
          ),
          shared: sharedDocuments.map(
            ({ itemId, itemName, quantity }) => ({
              itemId,
              itemName,
              quantity,
            }),
          ),
          catalogOnly: CATALOG_ONLY_SLUGS,
        };
        const completed = await db
          .collection("economic_operations")
          .updateOne(
            { _id: OPERATION_ID, status: "processing" },
            {
              $set: {
                status: "completed",
                responseStatus: 201,
                responseBody,
                updatedAt: new Date(),
              },
            },
            { session },
          );
        assertCondition(
          completed.modifiedCount === 1,
          "적용 완료 기록을 저장하지 못했습니다.",
        );
      });
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) {
        throw error;
      }
      // 동시에 시작한 동일 작업이 먼저 완료했을 수 있다. 아래의
      // 트랜잭션 밖 재조회가 작업 내용과 최종 수량까지 모두 검증한다.
      replayedDuringTransaction = true;
    } finally {
      await session.endSession();
    }

    const after = await readState(db);
    const verified = verifyFinalState(
      after,
      catalogPayloads,
      expectedHash,
    );
    console.log(
      JSON.stringify({ replayed: replayedDuringTransaction, verified }, null, 2),
    );
  }
} finally {
  await client.close();
}
