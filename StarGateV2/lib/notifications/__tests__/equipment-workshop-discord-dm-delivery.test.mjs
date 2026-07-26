import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, _context, nextResolve) {
    if (specifier === "@/lib/db/equipment-workshop-requests") {
      return {
        shortCircuit: true,
        url: [
          "data:text/javascript,",
          "export async function claimDueEquipmentWorkshopDiscordDmDelivery(){return null}",
          "export async function completeEquipmentWorkshopDiscordDmEvent(){return false}",
          "export async function releaseEquipmentWorkshopDiscordDmDelivery(){return false}",
        ].join(";"),
      };
    }
    if (specifier === "@/lib/notifications/equipment-workshop-discord-dm") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function notifyEquipmentWorkshopDiscordDm(){return 'skipped_unconfigured'}",
      };
    }
    return nextResolve(specifier);
  },
});

const { drainEquipmentWorkshopDiscordDms } = await import(
  "../equipment-workshop-discord-dm-delivery.ts"
);
const {
  createEquipmentWorkshopDiscordDmOutboxEvent,
  createEquipmentWorkshopStatusDmOutboxEvents,
} = await import("../../equipment-shop/workshop-discord-dm-outbox.ts");
const cronRoute = fs.readFileSync(
  new URL(
    "../../../app/api/cron/equipment-workshop/dm/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const vercelConfig = fs.readFileSync(
  new URL("../../../vercel.json", import.meta.url),
  "utf8",
);
const dbSource = fs.readFileSync(
  new URL("../../db/equipment-workshop-requests.ts", import.meta.url),
  "utf8",
);
const backfillSource = fs.readFileSync(
  new URL(
    "../../../scripts/backfill-workshop-discord-dm-outbox.ts",
    import.meta.url,
  ),
  "utf8",
);

const NOW = new Date("2026-07-26T01:05:00.000Z");

function event(id, eventName, availableAt = NOW) {
  return {
    id,
    event: eventName,
    createdAt: new Date("2026-07-26T00:00:00.000Z"),
    availableAt,
  };
}

function workshopRequest(id, overrides = {}) {
  return {
    _id: id,
    kind: "custom",
    userId: `user-${id}`,
    userName: "테스트 사용자",
    characterId: `character-${id}`,
    characterCodename: "INDEXER",
    details: "테스트 공방 요청입니다.",
    status: "IN_PROGRESS",
    createdAt: new Date("2026-07-26T00:00:00.000Z"),
    updatedAt: new Date("2026-07-26T00:00:00.000Z"),
    discordDmOutbox: [event("REQUESTED", "REQUESTED")],
    ...overrides,
  };
}

test("상태 mutation용 outbox 이벤트는 결정적 ID와 READY 예약 시각을 가진다", () => {
  const readyAt = new Date("2026-07-26T02:00:00.000Z");
  const events = createEquipmentWorkshopStatusDmOutboxEvents({
    status: "IN_PROGRESS",
    at: NOW,
    quoteVersion: 3,
    readyAt,
  });
  const quote = createEquipmentWorkshopDiscordDmOutboxEvent({
    event: "QUOTED",
    createdAt: NOW,
    payload: { quoteVersion: 3 },
  });

  assert.deepEqual(
    events.map(({ id, availableAt }) => ({
      id,
      availableAt: availableAt.toISOString(),
    })),
    [
      { id: "IN_PROGRESS:3", availableAt: NOW.toISOString() },
      { id: "READY", availableAt: readyAt.toISOString() },
    ],
  );
  assert.equal(quote.id, "QUOTED:3");
  assert.deepEqual(
    createEquipmentWorkshopStatusDmOutboxEvents({
      status: "APPROVED",
      at: NOW,
    }),
    [],
  );
});

test("요청 단위 lease가 적재 순서대로 단계 DM을 완료한다", async () => {
  const request = workshopRequest("request-1", {
    discordDmOutbox: [
      event("REQUESTED", "REQUESTED"),
      event("IN_REVIEW", "IN_REVIEW"),
      event("QUOTED:1", "QUOTED"),
    ],
  });
  const completed = [];
  const notified = [];
  let claimed = false;
  const summary = await drainEquipmentWorkshopDiscordDms(
    {},
    {
      botToken: "ameri-test-token",
      currentTime: () => NOW,
      randomUUID: () => "lease-1",
      claim: async () => {
        if (claimed) return null;
        claimed = true;
        return request;
      },
      complete: async (input) => {
        completed.push(input);
        return true;
      },
      release: async () => true,
      notify: async (input, botToken) => {
        notified.push({ input, botToken });
        return "sent";
      },
    },
  );

  assert.deepEqual(summary, {
    configured: true,
    claimed: 1,
    sent: 3,
    skipped: 0,
    failed: 0,
  });
  assert.deepEqual(
    notified.map(({ input }) => input.event),
    ["REQUESTED", "IN_REVIEW", "QUOTED"],
  );
  assert.ok(notified.every(({ botToken }) => botToken === "ameri-test-token"));
  assert.deepEqual(
    completed.map(({ eventId }) => eventId),
    ["REQUESTED", "IN_REVIEW", "QUOTED:1"],
  );
});

test("완료된 요청의 미발송 READY는 생략하고 COMPLETED를 다음에 보낸다", async () => {
  const request = workshopRequest("request-completed", {
    status: "COMPLETED",
    discordDmOutbox: [
      event("READY", "READY"),
      event("COMPLETED", "COMPLETED"),
    ],
  });
  const results = [];
  const notified = [];
  let claimed = false;
  const summary = await drainEquipmentWorkshopDiscordDms(
    {},
    {
      botToken: "ameri-test-token",
      currentTime: () => NOW,
      randomUUID: () => "lease-completed",
      claim: async () => {
        if (claimed) return null;
        claimed = true;
        return request;
      },
      complete: async (input) => {
        results.push(input.result);
        return true;
      },
      release: async () => true,
      notify: async (input) => {
        notified.push(input.event);
        return "sent";
      },
    },
  );

  assert.equal(summary.skipped, 1);
  assert.equal(summary.sent, 1);
  assert.deepEqual(results, ["no_longer_ready", "sent"]);
  assert.deepEqual(notified, ["COMPLETED"]);
});

test("실패 문서는 backoff로 해제하고 같은 실행에서 다음 문서를 처리한다", async () => {
  const queue = [
    workshopRequest("request-failed"),
    workshopRequest("request-next"),
  ];
  const releases = [];
  const summary = await drainEquipmentWorkshopDiscordDms(
    {},
    {
      botToken: "ameri-test-token",
      currentTime: () => NOW,
      randomUUID: () => "lease",
      claim: async () => queue.shift() ?? null,
      complete: async () => true,
      release: async (input) => {
        releases.push(input);
        return true;
      },
      notify: async (input) => {
        if (input.requestId === "request-failed") {
          throw new Error("Discord unavailable");
        }
        return "sent";
      },
    },
  );

  assert.equal(summary.failed, 1);
  assert.equal(summary.sent, 1);
  assert.equal(releases[0].requestId, "request-failed");
  assert.equal(
    releases[0].nextAttemptAt.toISOString(),
    "2026-07-26T01:10:00.000Z",
  );
  assert.match(releases[0].error, /Discord unavailable/);
  assert.equal(releases[1].requestId, "request-next");
  assert.equal(releases[1].nextAttemptAt, undefined);
});

test("Discord 403 수신 거부는 영구 생략 처리해 재시도하지 않는다", async () => {
  const completed = [];
  const releases = [];
  let claimed = false;
  const summary = await drainEquipmentWorkshopDiscordDms(
    {},
    {
      botToken: "ameri-test-token",
      currentTime: () => NOW,
      randomUUID: () => "lease-403",
      claim: async () => {
        if (claimed) return null;
        claimed = true;
        return workshopRequest("request-403");
      },
      complete: async (input) => {
        completed.push(input);
        return true;
      },
      release: async (input) => {
        releases.push(input);
        return true;
      },
      notify: async () => {
        throw new Error(
          "Discord 개인 메시지 전송 실패 (403): Cannot send messages to this user",
        );
      },
    },
  );

  assert.equal(summary.skipped, 1);
  assert.equal(summary.failed, 0);
  assert.equal(completed[0].result, "skipped_unreachable");
  assert.equal(releases[0].nextAttemptAt, undefined);
});

test("각 claim은 실제 claim 시각으로 새 lease 만료를 계산한다", async () => {
  const times = [
    new Date("2026-07-26T01:00:00.000Z"),
    new Date("2026-07-26T01:02:00.000Z"),
    new Date("2026-07-26T01:04:00.000Z"),
  ];
  const claims = [];
  const queue = [workshopRequest("request-1"), workshopRequest("request-2")];
  await drainEquipmentWorkshopDiscordDms(
    {},
    {
      botToken: "ameri-test-token",
      currentTime: () => times.shift() ?? NOW,
      randomUUID: () => "lease",
      claim: async (input) => {
        claims.push(input);
        return queue.shift() ?? null;
      },
      complete: async () => true,
      release: async () => true,
      notify: async () => "sent",
    },
  );

  assert.equal(
    claims[0].leaseUntil.toISOString(),
    "2026-07-26T01:10:00.000Z",
  );
  assert.equal(
    claims[1].leaseUntil.toISOString(),
    "2026-07-26T01:12:00.000Z",
  );
});

test("토큰이 없으면 DB claim 없이 종료한다", async () => {
  let claimCount = 0;
  const summary = await drainEquipmentWorkshopDiscordDms({}, {
    botToken: null,
    claim: async () => {
      claimCount += 1;
      return null;
    },
  });

  assert.equal(summary.configured, false);
  assert.equal(claimCount, 0);
});

test("기존 IN_PROGRESS 요청 backfill은 dry-run 기본과 이중 실행 확인을 요구한다", () => {
  assert.match(backfillSource, /const execute = args\.has\("--execute"\)/);
  assert.match(backfillSource, /execute && !args\.has\("--yes"\)/);
  assert.match(backfillSource, /"discordDmOutbox\.id": \{ \$ne: "READY" \}/);
  assert.match(backfillSource, /remaining > 0/);
});

test("DM cron은 인증·5분 간격·실패 상태를 노출하고 내부 outbox는 DTO에서 숨긴다", () => {
  assert.match(cronRoute, /authHeader !== `Bearer \$\{secret\}`/);
  assert.match(cronRoute, /drainEquipmentWorkshopDiscordDms/);
  assert.match(
    cronRoute,
    /const ok = summary\.configured && summary\.failed === 0/,
  );
  assert.match(cronRoute, /status: ok \? 200 : 503/);
  assert.match(
    vercelConfig,
    /"path": "\/api\/cron\/equipment-workshop\/dm"[\s\S]*"schedule": "\*\/5 \* \* \* \*"/,
  );
  assert.match(dbSource, /discordDmOutbox: _discordDmOutbox/);
  assert.match(dbSource, /discordDmDelivery: _discordDmDelivery/);
  assert.match(dbSource, /discordDmDelivery\.nextAttemptAt/);
  assert.match(
    dbSource,
    /input\.currentStatus === "IN_PROGRESS" && closesOperation[\s\S]*discordDmDelivery\.leaseUntil/,
  );
});
