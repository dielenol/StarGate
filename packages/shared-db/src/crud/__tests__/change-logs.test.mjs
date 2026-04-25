/**
 * P1 검증 — S4: change_logs CRUD 정합성 + S5: 인덱스 idempotency
 *
 * 검증:
 *   S4-1: insertChangeLog 후 getChangeLogById 가 동일 도큐먼트 반환
 *   S4-2: listChangeLogsByCharacter 가 createdAt 내림차순 정렬
 *   S4-3: markChangeLogReverted 멱등성 — 두 번째 호출은 null 반환
 *   S4-4: countRecentChangesByActor 가 windowMs 기준 정확히 카운트 (경계 시점)
 *   S5-1: ensureChangeLogsIndexes 두 번 호출해도 에러 없이 동일 결과
 *   S5-2: 기존 인덱스 (sparse:true) 재호출 호환
 *
 * MONGODB_URI 가 없으면 skip (로컬 전용 통합 테스트).
 * DB_NAME 은 의도치 않은 오염 방지를 위해 'stargate_test_change_logs' 고정.
 */

import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";

import {
  ensureChangeLogsIndexes,
  getClient,
  getDb,
  initServerless,
  insertChangeLog,
  getChangeLogById,
  listChangeLogsByCharacter,
  listChangeLogsByActor,
  countRecentChangesByActor,
  markChangeLogReverted,
} from "../../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// StarGateV2/.env.local 을 참조 (MONGODB_URI 획득). 기존 upsert-race.test.mjs 패턴.
const ENV_PATH = resolve(
  __dirname,
  "../../../../../StarGateV2/.env.local"
);

function loadEnv() {
  try {
    const content = readFileSync(ENV_PATH, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local 부재 — 테스트 skip.
  }
}

loadEnv();

const HAS_DB =
  typeof process.env.MONGODB_URI === "string" &&
  process.env.MONGODB_URI.length > 0;
const TEST_DB_NAME = "stargate_test_change_logs";
const COLLECTION_NAME = "character_change_logs";
const SKIP_MSG = "MONGODB_URI 없음 (로컬 전용 통합 테스트)";

// 테스트마다 사용할 고유 character/actor id (cleanup 충돌 회피)
const TEST_CHARACTER_ID = new ObjectId();
const TEST_ACTOR_ID = `test-actor-${Date.now()}`;

before(async () => {
  if (!HAS_DB) return;
  initServerless({
    uri: process.env.MONGODB_URI,
    dbName: TEST_DB_NAME,
  });

  // 사전 cleanup — 이전 실행 잔재 제거
  const db = await getDb();
  const col = db.collection(COLLECTION_NAME);
  await col.deleteMany({ characterId: TEST_CHARACTER_ID });
  await col.deleteMany({ actorId: TEST_ACTOR_ID });
  await col.deleteMany({ actorId: { $regex: /^test-actor-/ } });

  // 인덱스 보장 — 첫 실행
  await ensureChangeLogsIndexes(db);
});

after(async () => {
  if (!HAS_DB) return;
  try {
    const db = await getDb();
    const col = db.collection(COLLECTION_NAME);
    await col.deleteMany({ characterId: TEST_CHARACTER_ID });
    await col.deleteMany({ actorId: TEST_ACTOR_ID });
    await col.deleteMany({ actorId: { $regex: /^test-actor-/ } });
  } catch {
    // ignore cleanup errors
  }
  const client = await getClient().catch(() => null);
  if (client) await client.close().catch(() => {});
});

/* ── S4-1: insert + getChangeLogById round-trip ── */

test(
  "S4-1: insertChangeLog 후 getChangeLogById가 동일 도큐먼트 반환",
  { skip: !HAS_DB && SKIP_MSG },
  async () => {
    const log = await insertChangeLog({
      characterId: TEST_CHARACTER_ID,
      actorId: TEST_ACTOR_ID,
      actorRole: "U",
      actorIsOwner: true,
      source: "player",
      changes: [
        { field: "sheet.quote", before: "old", after: "new" },
      ],
      reason: "테스트",
    });

    assert.ok(log._id instanceof ObjectId, "_id가 ObjectId");
    assert.equal(log.actorId, TEST_ACTOR_ID);
    assert.equal(log.actorRole, "U");
    assert.equal(log.actorIsOwner, true);
    assert.equal(log.source, "player");
    assert.equal(log.revertedAt, null);
    assert.equal(log.revertedBy, null);
    assert.ok(log.createdAt instanceof Date);

    const fetched = await getChangeLogById(log._id);
    assert.ok(fetched, "getChangeLogById가 도큐먼트 반환");
    assert.equal(fetched._id.toHexString(), log._id.toHexString());
    assert.equal(fetched.actorId, TEST_ACTOR_ID);
    assert.deepEqual(fetched.changes, log.changes);

    // string id 형태로도 조회 가능
    const fetchedByStr = await getChangeLogById(log._id.toHexString());
    assert.ok(fetchedByStr);
    assert.equal(fetchedByStr._id.toHexString(), log._id.toHexString());

    // 잘못된 id는 null 반환
    const invalid = await getChangeLogById("not-a-valid-id");
    assert.equal(invalid, null);
  }
);

/* ── S4-2: createdAt 내림차순 정렬 ── */

test(
  "S4-2: listChangeLogsByCharacter — createdAt 내림차순 (최신이 먼저)",
  { skip: !HAS_DB && SKIP_MSG },
  async () => {
    // sortable한 시점 차이를 만들기 위해 약간의 delay
    const log1 = await insertChangeLog({
      characterId: TEST_CHARACTER_ID,
      actorId: TEST_ACTOR_ID,
      actorRole: "U",
      actorIsOwner: true,
      source: "player",
      changes: [{ field: "sheet.age", before: "30", after: "31" }],
    });
    await new Promise((r) => setTimeout(r, 10));
    const log2 = await insertChangeLog({
      characterId: TEST_CHARACTER_ID,
      actorId: TEST_ACTOR_ID,
      actorRole: "U",
      actorIsOwner: true,
      source: "player",
      changes: [{ field: "sheet.height", before: "170", after: "171" }],
    });
    await new Promise((r) => setTimeout(r, 10));
    const log3 = await insertChangeLog({
      characterId: TEST_CHARACTER_ID,
      actorId: TEST_ACTOR_ID,
      actorRole: "U",
      actorIsOwner: true,
      source: "player",
      changes: [{ field: "sheet.background", before: "old", after: "new" }],
    });

    const list = await listChangeLogsByCharacter(TEST_CHARACTER_ID);
    assert.ok(list.length >= 3, `최소 3개 로그가 있어야 함 (실제: ${list.length})`);

    // 가장 최근에 작성한 log3가 첫 번째
    assert.equal(list[0]._id.toHexString(), log3._id.toHexString());
    assert.equal(list[1]._id.toHexString(), log2._id.toHexString());
    assert.equal(list[2]._id.toHexString(), log1._id.toHexString());

    // createdAt 단조 감소 검증
    for (let i = 0; i < list.length - 1; i++) {
      assert.ok(
        list[i].createdAt.getTime() >= list[i + 1].createdAt.getTime(),
        `createdAt 내림차순 위반 at index ${i}`
      );
    }

    // string id 형태도 작동
    const listStr = await listChangeLogsByCharacter(
      TEST_CHARACTER_ID.toHexString()
    );
    assert.equal(listStr.length, list.length);

    // 잘못된 id면 빈 배열
    const empty = await listChangeLogsByCharacter("not-valid");
    assert.deepEqual(empty, []);

    // limit 작동
    const limited = await listChangeLogsByCharacter(TEST_CHARACTER_ID, {
      limit: 2,
    });
    assert.equal(limited.length, 2);
  }
);

/* ── S4-3: markChangeLogReverted 멱등성 ── */

test(
  "S4-3: markChangeLogReverted — 첫 호출 성공, 두 번째는 null (멱등)",
  { skip: !HAS_DB && SKIP_MSG },
  async () => {
    const log = await insertChangeLog({
      characterId: TEST_CHARACTER_ID,
      actorId: TEST_ACTOR_ID,
      actorRole: "U",
      actorIsOwner: true,
      source: "player",
      changes: [{ field: "sheet.quote", before: "a", after: "b" }],
    });

    // 1차 revert
    const reverted1 = await markChangeLogReverted(log._id, "admin-1");
    assert.ok(reverted1, "1차 revert는 도큐먼트 반환");
    assert.ok(reverted1.revertedAt instanceof Date);
    assert.equal(reverted1.revertedBy, "admin-1");

    // 2차 revert — 이미 revertedAt이 설정되어 있으므로 null
    const reverted2 = await markChangeLogReverted(log._id, "admin-2");
    assert.equal(reverted2, null, "이미 revert된 로그 재호출은 null (멱등)");

    // DB 조회로 revertedBy가 admin-1로 유지되는지 확인 (admin-2로 덮어쓰지 않음)
    const fetched = await getChangeLogById(log._id);
    assert.equal(
      fetched.revertedBy,
      "admin-1",
      "재호출이 revertedBy를 덮어쓰면 안 됨"
    );

    // 잘못된 id
    const invalid = await markChangeLogReverted("not-valid", "admin");
    assert.equal(invalid, null);
  }
);

/* ── S4-4: countRecentChangesByActor 윈도우 경계 ── */

test(
  "S4-4: countRecentChangesByActor — windowMs 기준 정확 카운트",
  { skip: !HAS_DB && SKIP_MSG },
  async () => {
    const isolatedActor = `count-actor-${Date.now()}`;

    const beforeWindowStart = Date.now();

    // 5개 로그 insert
    for (let i = 0; i < 5; i++) {
      await insertChangeLog({
        characterId: TEST_CHARACTER_ID,
        actorId: isolatedActor,
        actorRole: "U",
        actorIsOwner: true,
        source: "player",
        changes: [{ field: "sheet.age", before: "0", after: String(i) }],
      });
    }

    // 충분히 큰 윈도우 — 5개 모두 포함
    const wide = await countRecentChangesByActor(isolatedActor, 60_000);
    assert.equal(wide, 5, "60초 윈도우는 5개 모두 포함");

    // 0ms 윈도우 — since = 현재시각이므로 createdAt > since 가 false → 0개
    const zero = await countRecentChangesByActor(isolatedActor, 0);
    assert.equal(zero, 0, "0ms 윈도우는 0개");

    // 음수 윈도우 — since는 미래 시각, 모든 로그가 since 이전 → 0개
    const negative = await countRecentChangesByActor(isolatedActor, -10_000);
    assert.equal(negative, 0, "음수 윈도우는 0개");

    // revert된 로그도 카운트에 포함되는지 확인 (코멘트: "시도 횟수 기준")
    const log = await insertChangeLog({
      characterId: TEST_CHARACTER_ID,
      actorId: isolatedActor,
      actorRole: "U",
      actorIsOwner: true,
      source: "player",
      changes: [{ field: "sheet.quote", before: "x", after: "y" }],
    });
    await markChangeLogReverted(log._id, "admin-x");
    const includesReverted = await countRecentChangesByActor(
      isolatedActor,
      60_000
    );
    assert.equal(
      includesReverted,
      6,
      "revert된 로그도 카운트 포함 (시도 횟수 기준)"
    );

    // cleanup
    const db = await getDb();
    await db.collection(COLLECTION_NAME).deleteMany({ actorId: isolatedActor });
  }
);

/* ── S4 추가: listChangeLogsByActor ── */

test(
  "S4-extra: listChangeLogsByActor — actor별 필터 + 정렬",
  { skip: !HAS_DB && SKIP_MSG },
  async () => {
    const isolatedActor = `list-actor-${Date.now()}`;

    await insertChangeLog({
      characterId: TEST_CHARACTER_ID,
      actorId: isolatedActor,
      actorRole: "M",
      actorIsOwner: false,
      source: "admin",
      changes: [{ field: "sheet.hp", before: 100, after: 80 }],
      reason: "데미지 적용",
    });
    await new Promise((r) => setTimeout(r, 5));
    await insertChangeLog({
      characterId: TEST_CHARACTER_ID,
      actorId: isolatedActor,
      actorRole: "M",
      actorIsOwner: false,
      source: "admin",
      changes: [{ field: "sheet.san", before: 70, after: 65 }],
    });

    const list = await listChangeLogsByActor(isolatedActor);
    assert.equal(list.length, 2);
    // 최신 먼저
    assert.equal(list[0].changes[0].field, "sheet.san");
    assert.equal(list[1].changes[0].field, "sheet.hp");

    // cleanup
    const db = await getDb();
    await db.collection(COLLECTION_NAME).deleteMany({ actorId: isolatedActor });
  }
);

/* ── S5: 인덱스 idempotency ── */

test(
  "S5-1: ensureChangeLogsIndexes — 두 번 호출해도 에러 없음 (idempotent)",
  { skip: !HAS_DB && SKIP_MSG },
  async () => {
    const db = await getDb();
    // 첫 호출
    await ensureChangeLogsIndexes(db);
    const indexesAfterFirst = await db
      .collection(COLLECTION_NAME)
      .listIndexes()
      .toArray();
    const firstNames = new Set(indexesAfterFirst.map((i) => i.name));

    // 두 번째 호출 — 에러 throw하지 않아야 함
    await assert.doesNotReject(
      () => ensureChangeLogsIndexes(db),
      "두 번째 호출은 에러 없이 통과"
    );

    const indexesAfterSecond = await db
      .collection(COLLECTION_NAME)
      .listIndexes()
      .toArray();
    const secondNames = new Set(indexesAfterSecond.map((i) => i.name));

    // 인덱스 셋이 동일해야 함
    assert.equal(secondNames.size, firstNames.size);
    for (const name of firstNames) {
      assert.ok(secondNames.has(name), `인덱스 ${name}이 사라짐`);
    }
  }
);

test(
  "S5-2: ensureChangeLogsIndexes — 3개 인덱스 생성 + 옵션 검증",
  { skip: !HAS_DB && SKIP_MSG },
  async () => {
    const db = await getDb();
    await ensureChangeLogsIndexes(db);
    const indexes = await db
      .collection(COLLECTION_NAME)
      .listIndexes()
      .toArray();

    const expectedNames = [
      "character_change_logs_characterId_createdAt",
      "character_change_logs_actorId_createdAt",
      "character_change_logs_revertedAt",
    ];
    for (const name of expectedNames) {
      const idx = indexes.find((i) => i.name === name);
      assert.ok(idx, `인덱스 ${name} 누락. 실제: ${indexes.map((i) => i.name).join(",")}`);
    }

    // sparse 옵션 검증 (revertedAt 인덱스)
    const revertedIdx = indexes.find(
      (i) => i.name === "character_change_logs_revertedAt"
    );
    assert.equal(
      revertedIdx?.sparse,
      true,
      "revertedAt 인덱스는 sparse:true 유지 (4cfc14f 호환성)"
    );

    // characterId/createdAt 복합 인덱스 키 검증
    const charIdx = indexes.find(
      (i) => i.name === "character_change_logs_characterId_createdAt"
    );
    assert.deepEqual(charIdx?.key, { characterId: 1, createdAt: -1 });

    const actorIdx = indexes.find(
      (i) => i.name === "character_change_logs_actorId_createdAt"
    );
    assert.deepEqual(actorIdx?.key, { actorId: 1, createdAt: -1 });
  }
);
