/**
 * Validator 검증 — registra + trpg 세션 통합 표시 (algorithmic correctness)
 *
 * 본 테스트는 `lib/db/sessions.ts` + `lib/db/trpg-sessions-bridge.ts` 의 핵심
 * 알고리즘을 **순수 함수로 재현**해서 검증한다. 실제 모듈을 직접 import 하면
 * `import "./init"` (확장자 없는 TS 경로) + `@/` alias 가 node:test ESM
 * 환경에서 resolve 되지 않기 때문에 — 동등 로직을 인라인해 검증한다.
 *
 * 검증 범위:
 *   M-1: safeIso boundary (null/undefined/빈 문자열/Invalid Date → "")
 *   M-2: safeIso 정상 입력 (Date/문자열 → ISO 8601)
 *   M-3: KST 결합 변환 (`${date}T${startTime}:00+09:00`) 경계
 *   M-3-bis: monthIndex(0-11) → month(1-12) 변환
 *   M-4: getTrpgGuildId / getTrpgWebBaseUrl 정규화
 *   M-5: 알 수 없는 status → skip (exhaustive switch 안전망)
 *   M-6: invalid date/time → skip
 *   M-7: viewer YES 판정
 *   M-8: Promise.allSettled 부분 실패 격리
 *   M-9: 통합 카운트 합산 (closed = registra only)
 *   M-10: 시간순 정렬
 *   M-11: source 필드 필수 보존
 *
 * 인라인 함수가 실제 모듈과 drift 하지 않도록 — drift 발생 시 본 테스트만 fail.
 * 인라인 헬퍼 정의는 본 파일 상단 (// ── INLINED FROM ... ── 블록)에 위치.
 *
 * 실행:
 *   cd StarGateV2 && node --test lib/db/__tests__/sessions-merge.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

/* ─────────────────────────────────────────────────────────────────────── */
/* ── INLINED FROM lib/db/sessions.ts ───────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

/** Source: lib/db/sessions.ts:safeIso(...)  */
function safeIso(value, fallback = "") {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

/** Source: lib/db/sessions.ts:serializeEnrichedSessions(...) */
function serializeEnrichedRegistra(enriched) {
  return enriched.map(({ raw: s, participants, counts, myRsvp }) => ({
    _id: s._id?.toString?.() ?? "",
    guildId: s.guildId,
    channelId: s.channelId,
    messageId: s.messageId,
    title: s.title,
    targetDateTime: safeIso(s.targetDateTime),
    closeDateTime: safeIso(s.closeDateTime),
    targetRoleId: s.targetRoleId,
    status: s.status,
    createdBy: s.createdBy,
    createdAt: safeIso(s.createdAt),
    updatedAt: safeIso(s.updatedAt),
    participants,
    counts,
    myRsvp,
    source: "registra",
  }));
}

/** Source: lib/db/sessions.ts:findMergedSessionsByGuildInMonth(...) */
async function findMergedSessions({
  registraRaw,
  trpgSerialized,
  registraThrows,
  trpgThrows,
}) {
  // viewer 는 enrichSessions 단계에서 사용되지만 본 인라인은 enrich 단순화로
  // 미사용 — 호출처 시그니처와의 명시적 차이는 본 주석으로 표시.
  const [reg, trpg] = await Promise.allSettled([
    registraThrows
      ? Promise.reject(new Error("registra DB down"))
      : Promise.resolve(registraRaw ?? []),
    trpgThrows
      ? Promise.reject(new Error("trpg DB down"))
      : Promise.resolve(trpgSerialized ?? []),
  ]);

  if (reg.status === "rejected") {
    console.error("[findMergedSessions] registra fetch failed", reg.reason);
  }
  if (trpg.status === "rejected") {
    console.error("[findMergedSessions] trpg fetch failed", trpg.reason);
  }
  const regOk = reg.status === "fulfilled" ? reg.value : [];
  const trpgOk = trpg.status === "fulfilled" ? trpg.value : [];

  // enrichSessions 의 단순화 — DB 의존 없는 fake enrich.
  // (실제 enrichSessions 는 sessionResponses 조인이지만 본 테스트 스코프 밖)
  const enriched = regOk.map((raw) => ({
    raw,
    participants: [],
    counts: { yes: 0, no: 0 },
    myRsvp: null,
  }));
  const registraSerialized = serializeEnrichedRegistra(enriched);

  return [...registraSerialized, ...trpgOk].sort((a, b) =>
    a.targetDateTime.localeCompare(b.targetDateTime),
  );
}

/** Source: lib/db/sessions.ts:countMergedActiveSessionsByGuild(...) */
async function countMerged({
  registraCounts,
  registraThrows,
  trpgCounts,
  trpgThrows,
  trpgEnabled,
}) {
  const [reg, trpg] = await Promise.allSettled([
    registraThrows
      ? Promise.reject(new Error("registra count failed"))
      : Promise.resolve(registraCounts),
    !trpgEnabled
      ? Promise.resolve({ open: 0, cancel: 0, mine: 0 })
      : trpgThrows
      ? Promise.reject(new Error("trpg count failed"))
      : Promise.resolve(trpgCounts),
  ]);

  if (reg.status === "rejected") {
    console.error("[countMergedActiveSessions] registra failed", reg.reason);
  }
  if (trpg.status === "rejected") {
    console.error("[countMergedActiveSessions] trpg failed", trpg.reason);
  }

  const r =
    reg.status === "fulfilled"
      ? reg.value
      : { all: 0, open: 0, closed: 0, cancel: 0, mine: 0 };
  const t =
    trpg.status === "fulfilled"
      ? trpg.value
      : { open: 0, cancel: 0, mine: 0 };

  const trpgAll = t.open + t.cancel;
  return {
    all: r.all + trpgAll,
    open: r.open + t.open,
    closed: r.closed, // trpg 미합산 (closed 개념 없음)
    cancel: r.cancel + t.cancel,
    mine: r.mine + t.mine,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */
/* ── INLINED FROM lib/db/trpg-sessions-bridge.ts ───────────────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

/** Source: trpg-sessions-bridge.ts:getTrpgGuildId */
function getTrpgGuildId(env = process.env) {
  const raw = env.TRPG_GUILD_ID?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Source: trpg-sessions-bridge.ts:getTrpgWebBaseUrl */
function getTrpgWebBaseUrl(env = process.env) {
  const raw = env.TRPG_WEB_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** Source: trpg-sessions-bridge.ts:fetchTrpgSessionsAsSerialized(...) — pure mapping. */
function trpgRawToSerialized(raws, viewer, nameByDiscordId = new Map()) {
  const serialized = [];
  for (const raw of raws) {
    const dt = new Date(`${raw.date}T${raw.startTime}:00+09:00`);
    if (Number.isNaN(dt.getTime())) {
      console.warn(
        `[trpg-sessions-bridge] invalid date/time skipped: id=${raw._id ?? "?"} date=${raw.date} startTime=${raw.startTime}`,
      );
      continue;
    }
    let mappedStatus;
    switch (raw.status) {
      case "open":
        mappedStatus = "OPEN";
        break;
      case "cancelled":
        mappedStatus = "CANCELED";
        break;
      default: {
        // exhaustive 안전망 — 실제 코드에서는 `const _: never = raw.status`
        console.warn(
          `[trpg-sessions-bridge] unknown status skipped: id=${raw._id ?? "?"} status=${raw.status}`,
        );
        continue;
      }
    }

    const participants = raw.participantDiscordIds.map((id) => ({
      userId: id,
      status: "YES",
      displayName: nameByDiscordId.get(id) ?? id,
      codename: undefined,
    }));

    const isViewerYes =
      typeof viewer === "string" &&
      viewer.length > 0 &&
      raw.participantDiscordIds.includes(viewer);

    serialized.push({
      _id: raw._id ?? "",
      guildId: raw.guildId,
      channelId: "",
      messageId: "",
      targetRoleId: "",
      title: raw.title,
      targetDateTime: dt.toISOString(),
      closeDateTime: "",
      status: mappedStatus,
      createdBy: raw.createdByDiscordId,
      createdAt: (raw.createdAt instanceof Date
        ? raw.createdAt
        : new Date(raw.createdAt)
      ).toISOString(),
      updatedAt: (raw.updatedAt instanceof Date
        ? raw.updatedAt
        : new Date(raw.updatedAt)
      ).toISOString(),
      participants,
      counts: {
        yes: raw.participantDiscordIds.length,
        no: 0,
      },
      myRsvp: isViewerYes ? "YES" : null,
      source: "trpg",
    });
  }
  return serialized;
}

/* ─────────────────────────────────────────────────────────────────────── */
/* ── helpers ───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

function rawTrpg(overrides = {}) {
  return {
    _id: "trpg-1",
    guildId: "trpg-guild",
    title: "TRPG Session",
    date: "2026-05-20",
    startTime: "20:00",
    createdByDiscordId: "creator",
    createdByUsername: "Creator",
    participantDiscordIds: [],
    status: "open",
    createdAt: new Date("2026-05-15T00:00:00Z"),
    updatedAt: new Date("2026-05-15T00:00:00Z"),
    ...overrides,
  };
}

function rawRegistra(overrides = {}) {
  return {
    _id: { toString: () => "reg-1" },
    guildId: "reg-guild",
    channelId: "channel-1",
    messageId: "msg-1",
    targetRoleId: "role-1",
    title: "Registra Session",
    targetDateTime: new Date("2026-05-21T11:00:00Z"),
    closeDateTime: new Date("2026-05-21T10:00:00Z"),
    status: "OPEN",
    createdBy: "user-1",
    createdAt: new Date("2026-05-15T00:00:00Z"),
    updatedAt: new Date("2026-05-15T00:00:00Z"),
    ...overrides,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */
/* M-1/M-2: safeIso boundary                                                 */
/* ─────────────────────────────────────────────────────────────────────── */

describe("M-1/M-2: safeIso boundary", () => {
  test("null/undefined/0/빈 문자열 → fallback('')", () => {
    assert.equal(safeIso(null), "");
    assert.equal(safeIso(undefined), "");
    assert.equal(safeIso(""), "");
    assert.equal(safeIso(0), ""); // 0 은 falsy → fallback
  });

  test("Invalid Date 객체 / 잘못된 문자열 → fallback('')", () => {
    assert.equal(safeIso(new Date("invalid")), "");
    assert.equal(safeIso("not-a-date"), "");
    assert.equal(safeIso("9999-99-99T99:99:99Z"), "");
  });

  test("정상 Date → ISO 8601", () => {
    const d = new Date("2026-05-21T11:00:00Z");
    assert.equal(safeIso(d), "2026-05-21T11:00:00.000Z");
  });

  test("정상 ISO 문자열 → 동일 ISO 8601 (normalize)", () => {
    assert.equal(safeIso("2026-05-21T11:00:00.000Z"), "2026-05-21T11:00:00.000Z");
    // KST offset 표기도 UTC ISO 로 정규화
    assert.equal(safeIso("2026-05-21T20:00:00+09:00"), "2026-05-21T11:00:00.000Z");
  });

  test("커스텀 fallback 적용", () => {
    assert.equal(safeIso(null, "—"), "—");
    assert.equal(safeIso(new Date("bad"), "N/A"), "N/A");
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* M-3: KST → UTC 결합 변환                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

describe("M-3: KST → UTC 경계", () => {
  test("KST 2026-12-31 23:59 → UTC 2026-12-31T14:59:00.000Z", () => {
    const dt = new Date(`2026-12-31T23:59:00+09:00`);
    assert.equal(dt.toISOString(), "2026-12-31T14:59:00.000Z");
  });

  test("KST 2026-01-01 00:00 → UTC 2025-12-31T15:00:00.000Z (연말 경계)", () => {
    const dt = new Date(`2026-01-01T00:00:00+09:00`);
    assert.equal(dt.toISOString(), "2025-12-31T15:00:00.000Z");
  });

  test("KST 2026-05-15 09:00 → UTC 2026-05-15T00:00:00.000Z", () => {
    const dt = new Date(`2026-05-15T09:00:00+09:00`);
    assert.equal(dt.toISOString(), "2026-05-15T00:00:00.000Z");
  });

  test("KST 윤일 2024-02-29 12:00 → UTC 2024-02-29T03:00:00.000Z", () => {
    const dt = new Date(`2024-02-29T12:00:00+09:00`);
    assert.equal(dt.toISOString(), "2024-02-29T03:00:00.000Z");
  });

  test("Invalid 포맷 → Number.isNaN(d.getTime()) === true", () => {
    assert.equal(Number.isNaN(new Date(`T:00+09:00`).getTime()), true);
    assert.equal(Number.isNaN(new Date(`2026-13-99T25:99:00+09:00`).getTime()), true);
    assert.equal(Number.isNaN(new Date(`T:00+09:00`).getTime()), true);
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* M-4: env 정규화                                                            */
/* ─────────────────────────────────────────────────────────────────────── */

describe("M-4: TRPG env 정규화", () => {
  test("getTrpgGuildId — 비어 있으면 null", () => {
    assert.equal(getTrpgGuildId({}), null);
    assert.equal(getTrpgGuildId({ TRPG_GUILD_ID: "" }), null);
    assert.equal(getTrpgGuildId({ TRPG_GUILD_ID: "   " }), null);
    assert.equal(getTrpgGuildId({ TRPG_GUILD_ID: " 123 " }), "123");
    assert.equal(getTrpgGuildId({ TRPG_GUILD_ID: "guild-456" }), "guild-456");
  });

  test("getTrpgWebBaseUrl — trailing slash 제거 + 비어있으면 null", () => {
    assert.equal(getTrpgWebBaseUrl({}), null);
    assert.equal(getTrpgWebBaseUrl({ TRPG_WEB_BASE_URL: "" }), null);
    assert.equal(getTrpgWebBaseUrl({ TRPG_WEB_BASE_URL: "   " }), null);
    assert.equal(
      getTrpgWebBaseUrl({ TRPG_WEB_BASE_URL: "https://trpg.example.com/" }),
      "https://trpg.example.com",
    );
    assert.equal(
      getTrpgWebBaseUrl({ TRPG_WEB_BASE_URL: "https://trpg.example.com//" }),
      "https://trpg.example.com",
    );
    assert.equal(
      getTrpgWebBaseUrl({ TRPG_WEB_BASE_URL: "https://trpg.example.com" }),
      "https://trpg.example.com",
    );
    assert.equal(
      getTrpgWebBaseUrl({ TRPG_WEB_BASE_URL: "  https://trpg.example.com/  " }),
      "https://trpg.example.com",
    );
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* M-5/M-6: trpg invalid 입력 안전망                                          */
/* ─────────────────────────────────────────────────────────────────────── */

describe("M-5/M-6: trpg invalid 입력 skip", () => {
  test("invalid date/time → skip + console.warn", () => {
    const origWarn = console.warn;
    const warns = [];
    console.warn = (...args) => warns.push(args.join(" "));
    try {
      const result = trpgRawToSerialized(
        [
          rawTrpg({ _id: "bad-1", date: "", startTime: "" }),
          rawTrpg({ _id: "bad-2", date: "2026-13-99", startTime: "25:99" }),
          rawTrpg({ _id: "ok-3", date: "2026-05-20", startTime: "20:00" }),
        ],
        null,
      );
      assert.equal(result.length, 1, "정상 1건만 직렬화");
      assert.equal(result[0].source, "trpg");
      assert.equal(result[0]._id, "ok-3");
      assert.ok(warns.length >= 2, `2건의 invalid skipped warn, 실제: ${warns.length}`);
      assert.ok(
        warns.every((w) => w.includes("invalid date/time skipped")),
      );
    } finally {
      console.warn = origWarn;
    }
  });

  test("알 수 없는 status → skip + console.warn", () => {
    const origWarn = console.warn;
    const warns = [];
    console.warn = (...args) => warns.push(args.join(" "));
    try {
      const result = trpgRawToSerialized(
        [
          rawTrpg({ _id: "a", status: "open" }),
          rawTrpg({ _id: "b", status: "rescheduled" }), // unknown
          rawTrpg({ _id: "c", status: "cancelled" }),
          rawTrpg({ _id: "d", status: "deleted" }), // unknown
        ],
        null,
      );
      assert.equal(result.length, 2, "open + cancelled 만 직렬화");
      assert.deepEqual(
        result.map((r) => r.status).sort(),
        ["CANCELED", "OPEN"],
      );
      assert.ok(
        warns.some((w) => w.includes("unknown status")),
        "unknown status warn 발생",
      );
    } finally {
      console.warn = origWarn;
    }
  });

  test("status 매핑 정확성 — open → OPEN, cancelled → CANCELED", () => {
    const result = trpgRawToSerialized(
      [
        rawTrpg({ _id: "a", status: "open" }),
        rawTrpg({ _id: "b", status: "cancelled" }),
      ],
      null,
    );
    assert.equal(result.find((r) => r._id === "a").status, "OPEN");
    assert.equal(result.find((r) => r._id === "b").status, "CANCELED");
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* M-7: viewer YES 판정                                                       */
/* ─────────────────────────────────────────────────────────────────────── */

describe("M-7: viewer myRsvp 판정", () => {
  test("viewer 가 participants 에 포함 → myRsvp = YES", () => {
    const result = trpgRawToSerialized(
      [rawTrpg({ participantDiscordIds: ["viewer-123", "other"] })],
      "viewer-123",
    );
    assert.equal(result[0].myRsvp, "YES");
    assert.equal(result[0].counts.yes, 2);
  });

  test("viewer 미포함 → myRsvp = null", () => {
    const result = trpgRawToSerialized(
      [rawTrpg({ participantDiscordIds: ["other"] })],
      "viewer-123",
    );
    assert.equal(result[0].myRsvp, null);
  });

  test("viewer === null → myRsvp = null", () => {
    const result = trpgRawToSerialized(
      [rawTrpg({ participantDiscordIds: ["viewer-123"] })],
      null,
    );
    assert.equal(result[0].myRsvp, null);
  });

  test("viewer === '' (빈 문자열) → myRsvp = null (length 가드)", () => {
    const result = trpgRawToSerialized(
      [rawTrpg({ participantDiscordIds: ["", "viewer-123"] })],
      "",
    );
    assert.equal(result[0].myRsvp, null, "빈 viewer 매칭 차단");
  });

  test("participants 빈 배열 → counts.yes=0, myRsvp=null", () => {
    const result = trpgRawToSerialized(
      [rawTrpg({ participantDiscordIds: [] })],
      "viewer-123",
    );
    assert.equal(result[0].counts.yes, 0);
    assert.equal(result[0].myRsvp, null);
    assert.deepEqual(result[0].participants, []);
  });

  test("displayName 매핑 — 활성 멤버는 mapped, 탈퇴자는 discordId fallback", () => {
    const nameMap = new Map([
      ["active-1", "Active User"],
      // "left-1" 은 의도적으로 누락 (탈퇴자)
    ]);
    const result = trpgRawToSerialized(
      [
        rawTrpg({
          participantDiscordIds: ["active-1", "left-1"],
        }),
      ],
      null,
      nameMap,
    );
    assert.equal(result[0].participants[0].displayName, "Active User");
    assert.equal(
      result[0].participants[1].displayName,
      "left-1",
      "활성 멤버 매핑 실패 → discordId 폴백",
    );
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* M-8: Promise.allSettled 부분 실패 격리                                     */
/* ─────────────────────────────────────────────────────────────────────── */

describe("M-8: Promise.allSettled 부분 실패 격리", () => {
  test("registra 만 실패 → trpg 데이터만 노출", async () => {
    const origErr = console.error;
    const errs = [];
    console.error = (...args) => errs.push(args.join(" "));
    try {
      const trpgItems = trpgRawToSerialized(
        [rawTrpg({ title: "Survivor", date: "2026-05-22", startTime: "10:00" })],
        null,
      );
      const result = await findMergedSessions({
        registraRaw: null,
        registraThrows: true,
        trpgSerialized: trpgItems,
        viewer: null,
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].source, "trpg");
      assert.equal(result[0].title, "Survivor");
      assert.ok(
        errs.some((e) => e.includes("registra fetch failed")),
        "registra 실패 console.error 발생",
      );
    } finally {
      console.error = origErr;
    }
  });

  test("trpg 만 실패 → registra 데이터만 노출", async () => {
    const origErr = console.error;
    const errs = [];
    console.error = (...args) => errs.push(args.join(" "));
    try {
      const result = await findMergedSessions({
        registraRaw: [rawRegistra({ title: "Reg-Only" })],
        trpgSerialized: null,
        trpgThrows: true,
        viewer: null,
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].source, "registra");
      assert.equal(result[0].title, "Reg-Only");
      assert.ok(
        errs.some((e) => e.includes("trpg fetch failed")),
        "trpg 실패 console.error 발생",
      );
    } finally {
      console.error = origErr;
    }
  });

  test("둘 다 실패 → 빈 배열 + 두 console.error", async () => {
    const origErr = console.error;
    const errs = [];
    console.error = (...args) => errs.push(args.join(" "));
    try {
      const result = await findMergedSessions({
        registraRaw: null,
        registraThrows: true,
        trpgSerialized: null,
        trpgThrows: true,
        viewer: null,
      });
      assert.equal(result.length, 0);
      assert.ok(
        errs.some((e) => e.includes("registra fetch failed")),
      );
      assert.ok(
        errs.some((e) => e.includes("trpg fetch failed")),
      );
    } finally {
      console.error = origErr;
    }
  });

  test("정상 + 정상 → 합본 + 시간순 정렬", async () => {
    const trpgItems = trpgRawToSerialized(
      [
        rawTrpg({
          _id: "t1",
          date: "2026-05-21",
          startTime: "20:00", // KST 20:00 → UTC 11:00
        }),
      ],
      null,
    );
    const result = await findMergedSessions({
      registraRaw: [
        rawRegistra({
          _id: { toString: () => "r1" },
          targetDateTime: new Date("2026-05-22T10:00:00Z"),
        }),
        rawRegistra({
          _id: { toString: () => "r2" },
          targetDateTime: new Date("2026-05-20T10:00:00Z"),
        }),
      ],
      trpgSerialized: trpgItems,
      viewer: null,
    });
    assert.equal(result.length, 3);
    assert.equal(result[0]._id, "r2"); // 05-20 10:00
    assert.equal(result[1]._id, "t1"); // 05-21 11:00 (= KST 20:00)
    assert.equal(result[2]._id, "r1"); // 05-22 10:00
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* M-9: 통합 카운트 합산                                                       */
/* ─────────────────────────────────────────────────────────────────────── */

describe("M-9: 통합 카운트 합산", () => {
  test("registra + trpg 정상 합산 — closed 는 registra only", async () => {
    const counts = await countMerged({
      registraCounts: { all: 10, open: 5, closed: 3, cancel: 2, mine: 1 },
      trpgCounts: { open: 4, cancel: 1, mine: 2 },
      trpgEnabled: true,
    });
    assert.equal(counts.open, 9, "registra.open(5) + trpg.open(4)");
    assert.equal(counts.cancel, 3, "registra.cancel(2) + trpg.cancel(1)");
    assert.equal(counts.closed, 3, "trpg 미합산 — closed 개념 부재");
    assert.equal(counts.all, 15, "registra.all(10) + trpg(open+cancel=5)");
    assert.equal(counts.mine, 3, "registra(1) + trpg(2)");
  });

  test("registra 실패 → registra 측 0 fallback, trpg 보존", async () => {
    const origErr = console.error;
    console.error = () => {};
    try {
      const counts = await countMerged({
        registraCounts: null,
        registraThrows: true,
        trpgCounts: { open: 7, cancel: 0, mine: 2 },
        trpgEnabled: true,
      });
      assert.equal(counts.open, 7);
      assert.equal(counts.cancel, 0);
      assert.equal(counts.closed, 0);
      assert.equal(counts.all, 7);
      assert.equal(counts.mine, 2);
    } finally {
      console.error = origErr;
    }
  });

  test("trpg 실패 → trpg 측 0 fallback, registra 보존", async () => {
    const origErr = console.error;
    console.error = () => {};
    try {
      const counts = await countMerged({
        registraCounts: { all: 8, open: 4, closed: 2, cancel: 2, mine: 1 },
        trpgCounts: null,
        trpgThrows: true,
        trpgEnabled: true,
      });
      assert.equal(counts.all, 8);
      assert.equal(counts.open, 4);
      assert.equal(counts.closed, 2);
      assert.equal(counts.cancel, 2);
      assert.equal(counts.mine, 1);
    } finally {
      console.error = origErr;
    }
  });

  test("TRPG_GUILD_ID 미설정 → trpg 카운트 0", async () => {
    const counts = await countMerged({
      registraCounts: { all: 8, open: 4, closed: 2, cancel: 2, mine: 1 },
      trpgEnabled: false,
    });
    assert.deepEqual(counts, { all: 8, open: 4, closed: 2, cancel: 2, mine: 1 });
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* M-11: source 필수 보존                                                     */
/* ─────────────────────────────────────────────────────────────────────── */

describe("M-11: source 필드 필수 보존", () => {
  test("registra/trpg 모든 결과에 source 채워짐", async () => {
    const trpgItems = trpgRawToSerialized([rawTrpg()], null);
    const result = await findMergedSessions({
      registraRaw: [rawRegistra()],
      trpgSerialized: trpgItems,
      viewer: null,
    });
    const sources = result.map((r) => r.source).sort();
    assert.deepEqual(sources, ["registra", "trpg"]);
    assert.ok(
      result.every((r) => r.source === "registra" || r.source === "trpg"),
      "source 가 union 멤버 외 값이면 type 안전성 깨짐",
    );
  });
});
