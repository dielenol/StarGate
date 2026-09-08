import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import type {
  DashboardSessionOverviewCandidates,
} from "../../../types/dashboard-sessions";

const require = createRequire(import.meta.url);
const {
  buildDashboardSessionIdentity,
  buildDashboardSessionHref,
  parseDashboardSessionTarget,
  parseDashboardSessionTargetFromUrlSearchParams,
  selectDashboardSessionOverview,
} = require("../../../types/dashboard-sessions.ts") as typeof import("../../../types/dashboard-sessions");

const NOW = new Date("2026-05-31T14:30:00.000Z"); // KST 2026-05-31 23:30
const USER_SESSION_ID = "ffffffffffffffffffffffff";

function registraSession(
  index: number,
  overrides: Partial<{
    _id: string;
    title: string;
    targetDateTime: Date;
    status: "OPEN" | "CLOSING" | "CANCELING" | "CLOSED" | "CANCELED";
  }> = {},
) {
  return {
    _id: index.toString(16).padStart(24, "0"),
    title: `ORDO ${index}`,
    targetDateTime: new Date(NOW.getTime() + (index + 1) * 60_000),
    status: "OPEN" as const,
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: `message-${index}`,
    ...overrides,
  };
}

function overview(
  overrides: Partial<DashboardSessionOverviewCandidates> = {},
) {
  return selectDashboardSessionOverview({
    registra: { sessions: [], responseBySessionId: new Map() },
    trpg: [],
    trpgEnabled: true,
    trpgWebBaseUrl: "https://trpg.example.test",
    now: NOW,
    ...overrides,
  });
}

test("20개 선행 미응답 일정이 있어도 뒤의 내 참여 일정이 잘리지 않는다", () => {
  const earlier = Array.from({ length: 20 }, (_, index) =>
    registraSession(index + 1),
  );
  const mine = registraSession(99, {
    _id: USER_SESSION_ID,
    targetDateTime: new Date(NOW.getTime() + 60 * 60_000),
  });
  const result = overview({
    registra: {
      sessions: [...earlier, mine],
      responseBySessionId: new Map([[USER_SESSION_ID, "YES"]]),
    },
  });

  assert.deepEqual(
    result.myRsvpUpcoming.map((session) => session._id),
    [USER_SESSION_ID],
  );
  assert.equal(result.pendingResponseCount, 20);
  assert.equal(result.pendingResponse.length, 5);
});

test("응답 대기는 응답 행 자체가 없는 OPEN/CLOSING만 집계한다", () => {
  const openMissing = registraSession(1);
  const closingMissing = registraSession(2, { status: "CLOSING" });
  const openNo = registraSession(3);
  const closedMissing = registraSession(4, { status: "CLOSED" });
  const result = overview({
    registra: {
      sessions: [openMissing, closingMissing, openNo, closedMissing],
      responseBySessionId: new Map([[openNo._id, "NO"]]),
    },
  });

  assert.deepEqual(
    result.pendingResponse.map((session) => session._id),
    [openMissing._id, closingMissing._id],
  );
  assert.equal(result.pendingResponseCount, 2);
});

test("내 참여는 미래 CLOSING/CLOSED/CANCELING을 유지하고 취소·지난 일정은 제외한다", () => {
  const sessions = [
    registraSession(1, { status: "CLOSING" }),
    registraSession(2, { status: "CLOSED" }),
    registraSession(3, { status: "CANCELING" }),
    registraSession(4, { status: "CANCELED" }),
    registraSession(5, {
      targetDateTime: new Date(NOW.getTime() - 1),
    }),
  ];
  const result = overview({
    registra: {
      sessions,
      responseBySessionId: new Map(
        sessions.map((session) => [session._id, "YES"] as const),
      ),
    },
  });

  assert.deepEqual(
    result.myRsvpUpcoming.map((session) => session._id),
    sessions.slice(0, 3).map((session) => session._id),
  );
});

test("같은 ObjectId의 ORDO/TRPG 일정도 source 링크와 복합키가 충돌하지 않는다", () => {
  const sameId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const result = overview({
    registra: {
      sessions: [registraSession(1, { _id: sameId })],
      responseBySessionId: new Map([[sameId, "YES"]]),
    },
    trpg: [
      {
        _id: sameId,
        title: "TRPG 동일 ID",
        targetDateTime: new Date(NOW.getTime() + 30_000),
        guildId: "trpg-guild",
      },
    ],
  });

  assert.equal(result.myRsvpUpcoming.length, 2);
  const registra = result.myRsvpUpcoming.find((item) => item.source === "registra");
  const trpg = result.myRsvpUpcoming.find((item) => item.source === "trpg");
  assert.match(registra?.href ?? "", /source=registra/);
  assert.match(trpg?.href ?? "", /source=trpg/);
  assert.equal(trpg?.channelId, "");
  assert.equal(trpg?.messageId, "");
  assert.equal(trpg?.externalHref, "https://trpg.example.test/calendar");
  assert.notEqual(
    buildDashboardSessionIdentity("registra", sameId),
    buildDashboardSessionIdentity("trpg", sameId),
  );
});

test("KST 자정·월 경계를 href와 딥링크 월 선택에 동일하게 적용한다", () => {
  const href = buildDashboardSessionHref({
    sessionId: USER_SESSION_ID,
    source: "trpg",
    targetDateTime: "2026-05-31T15:00:00.000Z",
  });
  assert.equal(
    href,
    `/erp/sessions?sessionId=${USER_SESSION_ID}&source=trpg&date=2026-06-01`,
  );
  const params = new URL(href, "https://erp.example.test").searchParams;
  assert.deepEqual(parseDashboardSessionTargetFromUrlSearchParams(params), {
    sessionId: USER_SESSION_ID,
    source: "trpg",
    date: "2026-06-01",
    year: 2026,
    month: 6,
  });
});

test("불완전·잘못된 딥링크는 unrelated session을 열 수 있는 target을 만들지 않는다", () => {
  assert.equal(
    parseDashboardSessionTarget({
      sessionId: USER_SESSION_ID,
      source: "registra",
    }),
    null,
  );
  assert.equal(
    parseDashboardSessionTarget({
      sessionId: USER_SESSION_ID,
      source: "unknown",
      date: "2026-06-01",
    }),
    null,
  );
  assert.equal(
    parseDashboardSessionTarget({
      sessionId: "not-an-object-id",
      source: "registra",
      date: "2026-06-01",
    }),
    null,
  );
  assert.equal(
    parseDashboardSessionTarget({
      sessionId: USER_SESSION_ID,
      source: "registra",
      date: "2026-02-30",
    }),
    null,
  );
  assert.equal(
    parseDashboardSessionTarget({
      sessionId: [USER_SESSION_ID],
      source: "registra",
      date: "2026-06-01",
    }),
    null,
  );
});

test("활성 소스 장애만 unavailable로 보고하고 다른 소스 결과를 유지한다", () => {
  const trpgOnly = overview({
    registra: null,
    trpg: [
      {
        _id: USER_SESSION_ID,
        title: "TRPG 유지",
        targetDateTime: new Date(NOW.getTime() + 60_000),
        guildId: "trpg-guild",
      },
    ],
  });
  assert.deepEqual(trpgOnly.unavailableSources, ["registra"]);
  assert.equal(trpgOnly.myRsvpUpcoming[0]?.source, "trpg");

  const disabledTrpg = overview({ trpg: null, trpgEnabled: false });
  assert.deepEqual(disabledTrpg.unavailableSources, []);

  const failedTrpg = overview({ trpg: null, trpgEnabled: true });
  assert.deepEqual(failedTrpg.unavailableSources, ["trpg"]);
});

test("외부 링크는 HTTP(S) TRPG base만 허용하고 DTO에 참여 문서를 싣지 않는다", () => {
  const result = overview({
    registra: { sessions: [], responseBySessionId: new Map() },
    trpg: [
      {
        _id: USER_SESSION_ID,
        title: "TRPG",
        targetDateTime: new Date(NOW.getTime() + 60_000),
        guildId: "trpg-guild",
      },
    ],
    trpgWebBaseUrl: "javascript:alert(1)",
  });
  assert.equal(result.myRsvpUpcoming[0]?.externalHref, null);
  assert.deepEqual(Object.keys(result.myRsvpUpcoming[0] ?? {}).sort(), [
    "_id",
    "channelId",
    "externalHref",
    "externalLabel",
    "guildId",
    "href",
    "messageId",
    "source",
    "status",
    "targetDateTime",
    "title",
  ]);
});
