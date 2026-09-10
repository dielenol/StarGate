import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MongoClient } from "mongodb";
import { normalizeSeedPayloadDates } from "../seed-payload-normalization.ts";
import { toProtectedCharacterSetPayload } from "../personality-observation-update.ts";

const uri = process.env.MONGODB_TEST_URI;
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(uri);
const files = ["nosb-mini-lullaby-parents-create.json", "nosb-mini-lullaby-publication.json"];
const entries = files.flatMap((file) => JSON.parse(readFileSync(
  new URL(`../../seed-payloads/${file}`, import.meta.url), "utf8",
)));

test("자장가 신규 등록은 동일본 재실행을 허용하고 기존 내용·유형 충돌을 원자적으로 거부한다", {
  skip: !enabled && "로컬 Mongo replica set과 RUN_DB_INTEGRATION_TESTS=1 필요",
}, async (t) => {
  const address = new URL(uri);
  assert.ok(["localhost", "127.0.0.1"].includes(address.hostname), "로컬 테스트 DB만 허용");
  const client = new MongoClient(uri, { maxPoolSize: 2 });
  const db = client.db(`lullaby_guard_test_${process.pid}_${Date.now()}`);
  const keys = { characters: "codename", wiki_pages: "slug", master_items: "slug", session_reports: "sessionId" };
  const creates = entries.filter((entry) => entry.payload);
  assert.equal(creates.length, 10);

  try {
    await client.connect();
    for (const [collection, key] of Object.entries(keys)) {
      await db.collection(collection).createIndex({ [key]: 1 }, { unique: true });
    }
    for (const entry of creates) {
      const key = keys[entry.collection];
      const filter = normalizeSeedPayloadDates(entry.filter);
      const postcondition = normalizeSeedPayloadDates(entry.postcondition);
      const { createdAt, updatedAt, ...fields } = normalizeSeedPayloadDates(entry.payload);
      void updatedAt;
      // 실제 runner의 payload-mode와 같은 변경: 시각 관리 및 관찰 배열 보호.
      const update = {
        $set: entry.collection === "characters" ? toProtectedCharacterSetPayload(fields) : fields,
        $setOnInsert: { createdAt },
      };
      const identity = { [key]: filter[key] };
      const collection = db.collection(entry.collection);

      await t.test(`${entry.collection}:${filter[key]}`, async () => {
        const first = await collection.updateOne(filter, update, { upsert: true });
        assert.equal(first.upsertedCount, 1);
        await collection.updateOne(identity, { $currentDate: { updatedAt: true } });
        assert.ok(await collection.findOne(postcondition));

        // 부모 생성 뒤 같은 파일에서 관찰을 추가해도 생성 조건은 계속 일치해야 한다.
        for (const observation of entries.filter((row) =>
          row.collection === "characters" && row.filter?.codename === filter.codename &&
          row.update?.$addToSet?.["lore.personalityObservations"],
        )) {
          await collection.updateOne(observation.filter, observation.update);
        }
        const replay = await collection.updateOne(filter, update, { upsert: true });
        assert.equal(replay.matchedCount, 1);
        assert.equal(replay.modifiedCount, 0);
        assert.ok(await collection.findOne(postcondition));

        const field = { characters: "role", wiki_pages: "content", master_items: "description", session_reports: "summary" }[entry.collection];
        await collection.updateOne(identity, { $set: { [field]: "다른 작업에서 수정한 내용" } });
        await rejectsWithoutMutation("내용 충돌");

        if (entry.collection === "characters") {
          await collection.updateOne(identity, { $set: { [field]: update.$set[field], type: "AGENT" } });
          await rejectsWithoutMutation("다른 캐릭터 유형 충돌");
        }

        async function rejectsWithoutMutation(reason) {
          const before = await collection.findOne(identity);
          const marker = `${entry.collection}:${filter[key]}:${reason}`;
          const session = client.startSession();
          try {
            await assert.rejects(session.withTransaction(async () => {
              await db.collection("rollback_markers").insertOne({ marker }, { session });
              await collection.updateOne(filter, update, { upsert: true, session });
            }), (error) => error.code === 11000);
          } finally {
            await session.endSession();
          }
          assert.deepEqual(await collection.findOne(identity), before);
          assert.equal(await db.collection("rollback_markers").countDocuments({ marker }), 0);
        }
      });
    }
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
