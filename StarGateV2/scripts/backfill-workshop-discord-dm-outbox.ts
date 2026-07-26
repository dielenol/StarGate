/**
 * outbox 도입 전에 이미 IN_PROGRESS였던 공방 요청에 READY DM 이벤트를 보강한다.
 *
 * 기본은 dry-run이다. 실제 쓰기는 --execute --yes를 함께 전달해야 한다.
 * 실행 전 새 writer와 DM cron을 배포하고, 실행 후 대상 0건을 재확인한다.
 */

import { MongoClient } from "mongodb";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
if (execute && !args.has("--yes")) {
  throw new Error("실행 모드는 --execute --yes를 함께 전달해야 합니다.");
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");

const dbName = process.env.DB_NAME?.trim() || "stargate";
const client = new MongoClient(uri, { maxPoolSize: 2 });
await client.connect();

const filter = {
  status: "IN_PROGRESS",
  readyAt: { $type: "date" },
  "discordDmOutbox.id": { $ne: "READY" },
} as const;

try {
  const requests = client
    .db(dbName)
    .collection<{
      _id: string;
      status: "IN_PROGRESS";
      readyAt: Date;
      updatedAt: Date;
    }>("equipment_workshop_requests");
  const candidates = await requests
    .find(filter, { projection: { _id: 1, readyAt: 1, updatedAt: 1 } })
    .toArray();

  console.log(
    `[workshop-dm-outbox] mode=${execute ? "EXECUTE" : "DRY-RUN"} candidates=${candidates.length}`,
  );
  if (!execute) {
    console.log("[workshop-dm-outbox] dry-run 완료. DB는 변경되지 않았습니다.");
  } else if (candidates.length > 0) {
    const result = await requests.bulkWrite(
      candidates.map((request) => ({
        updateOne: {
          filter: {
            _id: request._id,
            status: "IN_PROGRESS",
            readyAt: request.readyAt,
            "discordDmOutbox.id": { $ne: "READY" },
          },
          update: {
            $push: {
              discordDmOutbox: {
                id: "READY",
                event: "READY",
                createdAt: request.updatedAt,
                availableAt: request.readyAt,
                payload: { readyAt: request.readyAt },
              },
            },
          },
        },
      })),
      { ordered: false },
    );
    const remaining = await requests.countDocuments(filter);
    console.log(
      `[workshop-dm-outbox] matched=${result.matchedCount} modified=${result.modifiedCount} remaining=${remaining}`,
    );
    if (remaining > 0) {
      throw new Error(
        `검증 실패: READY outbox가 없는 진행 요청 ${remaining}건이 남았습니다.`,
      );
    }
  }
} finally {
  await client.close();
}
