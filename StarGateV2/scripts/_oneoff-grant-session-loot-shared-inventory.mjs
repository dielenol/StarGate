import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MongoClient } from "mongodb";

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const SCOPE = "GLOBAL";
const OPERATION_ID = "shared-inventory-session-loot-backfill-2026-07-30-v1";
const ACTOR_ID = "system:session-reward-backfill";
const PAYLOAD_PATH = resolve(
  process.cwd(),
  "scripts/seed-payloads/catalog-session-loot-backfill-2026-07-28.json",
);

const TARGETS = [
  { slug: "zulu-0028-contained-entity", quantity: 1 },
  { slug: "broken-syllable", quantity: 3 },
  { slug: "zulu-0040-crown-specimen", quantity: 1 },
  { slug: "zulu-0872-3-dongsik-wings", quantity: 1 },
  { slug: "kerub-fireblade", quantity: 1 },
  { slug: "montauk-slaughter-hound-appearance-plate", quantity: 1 },
  { slug: "conductor-corpse", quantity: 1 },
  { slug: "conductor-record-spindle", quantity: 3 },
  { slug: "golden-dawn-cultist-mask", quantity: 5 },
  { slug: "inverted-sock-contained-entity", quantity: 1 },
  { slug: "white-rose-assistant-call", quantity: 1 },
];

const EXISTING_MASTER_INVARIANTS = new Map([
  ["broken-syllable", { name: "깨진 음절", category: "MATERIAL" }],
  [
    "zulu-0040-crown-specimen",
    { name: "ZULU-0040 왕관 격리 표본", category: "MATERIAL" },
  ],
  [
    "zulu-0872-3-dongsik-wings",
    { name: "ZULU-872-3 이동식의 날개", category: "SPECIAL" },
  ],
  ["kerub-fireblade", { name: "커룹의 불칼", category: "SPECIAL" }],
]);

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

function stableValue(value) {
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

function payloadHash(payload) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(payload)))
    .digest("hex");
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCatalogPayloads() {
  const envelopes = JSON.parse(readFileSync(PAYLOAD_PATH, "utf8"));
  assertCondition(Array.isArray(envelopes), "카탈로그 payload가 배열이 아닙니다.");
  const masters = envelopes
    .filter((entry) => entry?.collection === "master_items")
    .map((entry) => entry.payload);
  const bySlug = new Map(masters.map((item) => [item?.slug, item]));
  assertCondition(bySlug.size === 7, `신규 master payload는 7건이어야 합니다: ${bySlug.size}`);

  for (const [slug, item] of bySlug) {
    assertCondition(item && TARGETS.some((target) => target.slug === slug), `예상하지 않은 신규 slug: ${slug}`);
    assertCondition(item.isAvailable === false, `${slug}: isAvailable은 false여야 합니다.`);
    assertCondition(item.isPublic === true, `${slug}: isPublic은 true여야 합니다.`);
    assertCondition(item.source === "session-reward", `${slug}: source가 session-reward가 아닙니다.`);
    assertCondition(
      typeof item.previewImage === "string" &&
        existsSync(resolve(process.cwd(), `public${item.previewImage}`)),
      `${slug}: previewImage 파일을 찾을 수 없습니다.`,
    );
  }

  const whiteRose = bySlug.get("white-rose-assistant-call");
  assertCondition(whiteRose?.category === "CONSUMABLE", "화이트 로즈 호출권은 CONSUMABLE이어야 합니다.");
  assertCondition(
    whiteRose?.previewImage ===
      "/assets/catalog/consumables/white-rose-assistant-call.png",
    "화이트 로즈 호출권 이미지 경로가 소모품 카탈로그와 일치하지 않습니다.",
  );
  return bySlug;
}

function toMasterDocument(payload) {
  return {
    ...payload,
    createdAt: new Date(payload.createdAt),
    updatedAt: new Date(payload.updatedAt),
  };
}

function verifyExistingMaster(item, slug) {
  const expected = EXISTING_MASTER_INVARIANTS.get(slug);
  assertCondition(expected, `${slug}: 기존 master 불변 조건이 정의되지 않았습니다.`);
  assertCondition(item?.name === expected.name, `${slug}: 기존 master 이름이 달라졌습니다.`);
  assertCondition(item?.category === expected.category, `${slug}: 기존 master category가 달라졌습니다.`);
  assertCondition(item?.isAvailable === false, `${slug}: 기존 master가 지급 가능 상태로 바뀌었습니다.`);
}

async function readState(db, session) {
  const slugs = TARGETS.map((target) => target.slug);
  const masters = await db
    .collection("master_items")
    .find({ slug: { $in: slugs } }, { session })
    .toArray();
  const itemIds = masters.map((item) => item._id.toString());
  const shared = itemIds.length
    ? await db
        .collection("shared_inventory")
        .find({ scope: SCOPE, itemId: { $in: itemIds } }, { session })
        .toArray()
    : [];
  const operation = await db
    .collection("economic_operations")
    .findOne({ _id: OPERATION_ID }, { session });
  return { masters, shared, operation };
}

function summarize(state, newPayloads) {
  const mastersBySlug = new Map(state.masters.map((item) => [item.slug, item]));
  const sharedByItemId = new Map(state.shared.map((entry) => [entry.itemId, entry]));
  return TARGETS.map((target) => {
    const master = mastersBySlug.get(target.slug);
    const shared = master ? sharedByItemId.get(master._id.toString()) : null;
    return {
      slug: target.slug,
      requested: target.quantity,
      master: master ? "existing" : newPayloads.has(target.slug) ? "insert" : "missing",
      before: shared?.quantity ?? 0,
      after: (shared?.quantity ?? 0) + target.quantity,
    };
  });
}

function verifyBaseline(state, newPayloads, expectedHash) {
  if (state.operation) {
    assertCondition(
      state.operation.payloadHash === expectedHash &&
        state.operation.domain === "shared-inventory-session-loot-backfill" &&
        state.operation.actorId === ACTOR_ID,
      "동일 operation id가 다른 payload에 사용되었습니다.",
    );
    assertCondition(
      state.operation.status === "completed",
      `기존 operation 상태가 completed가 아닙니다: ${state.operation.status}`,
    );
    return "replay";
  }

  assertCondition(state.shared.length === 0, "대상 공용 인벤토리 행이 이미 존재합니다. 중복 지급을 중단합니다.");
  const mastersBySlug = new Map(state.masters.map((item) => [item.slug, item]));
  for (const target of TARGETS) {
    const existing = mastersBySlug.get(target.slug);
    if (EXISTING_MASTER_INVARIANTS.has(target.slug)) {
      verifyExistingMaster(existing, target.slug);
    } else {
      assertCondition(newPayloads.has(target.slug), `${target.slug}: 신규 payload가 없습니다.`);
      assertCondition(!existing, `${target.slug}: 신규 master가 선행 생성되었습니다.`);
    }
  }
  return "not-started";
}

function verifyFinalState(state) {
  assertCondition(state.operation?.status === "completed", "economic operation 완료 상태를 확인할 수 없습니다.");
  assertCondition(state.masters.length === TARGETS.length, "master_items 11종을 모두 확인할 수 없습니다.");
  assertCondition(state.shared.length === TARGETS.length, "shared_inventory 11행을 모두 확인할 수 없습니다.");
  const mastersBySlug = new Map(state.masters.map((item) => [item.slug, item]));
  const sharedByItemId = new Map(state.shared.map((entry) => [entry.itemId, entry]));
  let total = 0;
  for (const target of TARGETS) {
    const master = mastersBySlug.get(target.slug);
    assertCondition(master, `${target.slug}: master가 없습니다.`);
    const shared = sharedByItemId.get(master._id.toString());
    assertCondition(shared?.quantity === target.quantity, `${target.slug}: 지급 수량이 일치하지 않습니다.`);
    assertCondition(shared?.itemName === master.name, `${target.slug}: 공용 인벤토리 이름이 master와 다릅니다.`);
    total += shared.quantity;
  }
  assertCondition(total === 19, `공용 인벤토리 총 수량이 19가 아닙니다: ${total}`);
  return { rows: state.shared.length, total };
}

loadEnvFile(".env.local");
loadEnvFile(".env");

if (EXECUTE && !YES) {
  throw new Error("실행에는 --execute --yes가 모두 필요합니다.");
}
assertCondition(process.env.MONGODB_URI, "MONGODB_URI가 필요합니다.");

const newPayloads = parseCatalogPayloads();
const operationPayload = {
  scope: SCOPE,
  targets: TARGETS,
  masters: [...newPayloads.values()],
};
const expectedHash = payloadHash(operationPayload);
const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 2 });

try {
  await client.connect();
  const db = client.db(process.env.DB_NAME || "stargate");
  const before = await readState(db);
  const baseline = verifyBaseline(before, newPayloads, expectedHash);
  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? "execute" : "dry-run",
        operationId: OPERATION_ID,
        operationState: baseline,
        rows: summarize(before, newPayloads),
      },
      null,
      2,
    ),
  );

  if (!EXECUTE) process.exitCode = 0;
  else if (baseline === "replay") {
    const verified = verifyFinalState(before);
    console.log(JSON.stringify({ replayed: true, verified }, null, 2));
  } else {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const transactionState = await readState(db, session);
        verifyBaseline(transactionState, newPayloads, expectedHash);
        const now = new Date();
        await db.collection("economic_operations").insertOne(
          {
            _id: OPERATION_ID,
            requestId: OPERATION_ID,
            domain: "shared-inventory-session-loot-backfill",
            actorId: ACTOR_ID,
            payloadHash: expectedHash,
            status: "processing",
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );

        await db.collection("master_items").insertMany(
          [...newPayloads.values()].map(toMasterDocument),
          { session, ordered: true },
        );
        const masters = await db
          .collection("master_items")
          .find(
            { slug: { $in: TARGETS.map((target) => target.slug) } },
            { session },
          )
          .toArray();
        assertCondition(masters.length === TARGETS.length, "트랜잭션 안에서 master_items 11종을 확인할 수 없습니다.");
        const mastersBySlug = new Map(masters.map((item) => [item.slug, item]));
        for (const [slug] of EXISTING_MASTER_INVARIANTS) {
          verifyExistingMaster(mastersBySlug.get(slug), slug);
        }

        const sharedDocuments = TARGETS.map((target) => {
          const master = mastersBySlug.get(target.slug);
          assertCondition(master, `${target.slug}: master가 없습니다.`);
          return {
            scope: SCOPE,
            itemId: master._id.toString(),
            itemName: master.name,
            quantity: target.quantity,
            acquiredAt: now,
            note: "미지급 전리품 백필 — 사용자 제공 보상표",
          };
        });
        await db.collection("shared_inventory").insertMany(sharedDocuments, {
          session,
          ordered: true,
        });

        const responseBody = {
          scope: SCOPE,
          rows: sharedDocuments.length,
          total: sharedDocuments.reduce((sum, item) => sum + item.quantity, 0),
          items: sharedDocuments.map(({ itemId, itemName, quantity }) => ({
            itemId,
            itemName,
            quantity,
          })),
        };
        const completed = await db.collection("economic_operations").updateOne(
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
        assertCondition(completed.modifiedCount === 1, "economic operation 완료 기록에 실패했습니다.");
      });
    } finally {
      await session.endSession();
    }

    const after = await readState(db);
    const verified = verifyFinalState(after);
    console.log(JSON.stringify({ replayed: false, verified }, null, 2));
  }
} finally {
  await client.close();
}
