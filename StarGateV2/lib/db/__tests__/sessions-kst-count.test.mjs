/**
 * Validator 검증 — S4-2 countMergedSessionsOnKstDate (Phase 1 성능 최적화)
 *
 * 본 테스트는 `lib/db/sessions.ts` 의 신설 경량 카운트 함수와, 그것이 대체한
 * 구 대시보드 경로(lib/erp/dashboard.ts 의 "merged 목록 → serialize → 필터")의
 * 핵심 알고리즘을 **순수 함수로 재현**해서 등가성을 검증한다. 실제 모듈은
 * `import "./init"` + `@/` alias 로 node:test ESM 에서 직접 import 이 불안정하므로
 * sessions-merge.test.mjs 와 동일하게 인라인 방식을 따른다.
 *
 * 검증 범위:
 *   K-1: KST 자정 경계 (UTC 14:59:59.999 vs 15:00:00.000)
 *   K-2: registra raw(Date) / trpg serialized(ISO string) 2소스 동등 처리
 *   K-3: status 필터 — CANCELED 만 제외 (OPEN/CLOSING/CANCELING/CLOSED 포함)
 *   K-4: invalid date → null → 미카운트 (throw 금지; 구 경로는 toISOString RangeError 위험)
 *   K-5: Promise.allSettled 부분 실패 격리 — 한 소스 실패 시 다른 소스 카운트 유지
 *   K-6: 등가성 oracle — 유효 데이터에서 구 dashboard 필터 count === 신규 count
 *   K-7: 빈 소스 → 0
 *
 * 인라인 함수가 실제 모듈과 drift 하지 않도록 — drift 발생 시 본 테스트만 fail.
 *
 * 실행:
 *   cd StarGateV2 && node --test lib/db/__tests__/sessions-kst-count.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

/* ─────────────────────────────────────────────────────────────────────── */
/* ── INLINED FROM lib/db/sessions.ts (신규 경로) ────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Source: lib/db/sessions.ts:toKstDateStringOrNull(...) */
function toKstDateStringOrNull(value) {
  const date = typeof value === "string" ? new Date(value) : value;
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Source: lib/db/sessions.ts:countMergedSessionsOnKstDate(...)
 * — fetch 를 주입 가능한 형태로 재현 (allSettled 격리 + 필터 + 합산 동일).
 */
async function countMergedSessionsOnKstDate({
  registraFetch,
  trpgFetch,
  kstDateString,
}) {
  const [registraRawResult, trpgSerializedResult] = await Promise.allSettled([
    registraFetch(),
    trpgFetch(),
  ]);

  const registraRaw =
    registraRawResult.status === "fulfilled" ? registraRawResult.value : [];
  const trpgSerialized =
    trpgSerializedResult.status === "fulfilled"
      ? trpgSerializedResult.value
      : [];

  const isOnDate = (targetDateTime) =>
    toKstDateStringOrNull(targetDateTime) === kstDateString;

  const registraCount = registraRaw.filter(
    (session) =>
      session.status !== "CANCELED" && isOnDate(session.targetDateTime),
  ).length;
  const trpgCount = trpgSerialized.filter(
    (session) =>
      session.status !== "CANCELED" && isOnDate(session.targetDateTime),
  ).length;

  return registraCount + trpgCount;
}

/* ─────────────────────────────────────────────────────────────────────── */
/* ── INLINED FROM 구 경로 (git HEAD 의 lib/erp/dashboard.ts + sessions.ts) ─ */
/* ─────────────────────────────────────────────────────────────────────── */

/** Source: lib/db/sessions.ts:safeIso(...) — serializeEnrichedSessions 가 사용 */
function safeIso(value, fallback = "") {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

/** Source(HEAD): lib/erp/dashboard.ts:toKstDateString(...) — 구 필터의 변환기 */
function legacyToKstDateString(value) {
  const date = typeof value === "string" ? new Date(value) : value;
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10); // Invalid Date 면 RangeError
}

/**
 * Source(HEAD): 구 dashboard 경로 재현 —
 * findMergedSessionsByGuildInMonth(serialize 포함) 결과를
 * `status !== "CANCELED" && toKstDateString(targetDateTime) === todayKst` 로 필터.
 */
function legacyDashboardTodayCount({ registraRaw, trpgSerialized, todayKst }) {
  const registraSerialized = registraRaw.map((s) => ({
    status: s.status,
    targetDateTime: safeIso(s.targetDateTime),
  }));
  const merged = [...registraSerialized, ...trpgSerialized].sort((a, b) =>
    a.targetDateTime.localeCompare(b.targetDateTime),
  );
  return merged.filter(
    (session) =>
      session.status !== "CANCELED" &&
      legacyToKstDateString(session.targetDateTime) === todayKst,
  ).length;
}

/* ─────────────────────────────────────────────────────────────────────── */
/* ── Fixtures ──────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

const TODAY_KST = "2026-07-30";

/** registra raw — targetDateTime: Date */
const registraFixture = [
  { status: "OPEN", targetDateTime: new Date("2026-07-30T01:00:00.000Z") }, // KST 07-30 10:00 ✓
  { status: "CLOSED", targetDateTime: new Date("2026-07-29T16:00:00.000Z") }, // KST 07-30 01:00 ✓
  { status: "CANCELED", targetDateTime: new Date("2026-07-30T05:00:00.000Z") }, // 제외
  { status: "OPEN", targetDateTime: new Date("2026-07-30T16:00:00.000Z") }, // KST 07-31 → 미포함
  { status: "CANCELING", targetDateTime: new Date("2026-07-30T03:00:00.000Z") }, // CANCELED 아님 ✓
];

/** trpg serialized — targetDateTime: ISO string */
const trpgFixture = [
  { status: "OPEN", targetDateTime: "2026-07-30T10:00:00.000Z" }, // KST 07-30 19:00 ✓
  { status: "CANCELED", targetDateTime: "2026-07-30T10:00:00.000Z" }, // 제외
  { status: "CLOSED", targetDateTime: "2026-07-29T14:59:59.999Z" }, // KST 07-29 23:59 → 미포함
];

/* ─────────────────────────────────────────────────────────────────────── */
/* ── Tests ─────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────── */

test("K-1: KST 자정 경계 — 14:59:59.999Z 는 전날, 15:00:00.000Z 는 당일", () => {
  assert.equal(
    toKstDateStringOrNull(new Date("2026-07-29T14:59:59.999Z")),
    "2026-07-29",
  );
  assert.equal(
    toKstDateStringOrNull(new Date("2026-07-29T15:00:00.000Z")),
    "2026-07-30",
  );
  // 당일의 끝 경계
  assert.equal(
    toKstDateStringOrNull(new Date("2026-07-30T14:59:59.999Z")),
    "2026-07-30",
  );
  assert.equal(
    toKstDateStringOrNull(new Date("2026-07-30T15:00:00.000Z")),
    "2026-07-31",
  );
});

test("K-2: Date 와 ISO string 이 동일 시각이면 동일 판정", () => {
  const iso = "2026-07-30T00:30:00.000Z";
  assert.equal(
    toKstDateStringOrNull(new Date(iso)),
    toKstDateStringOrNull(iso),
  );
});

test("K-3: status 필터 — CANCELED 만 제외", async () => {
  const count = await countMergedSessionsOnKstDate({
    registraFetch: async () => registraFixture,
    trpgFetch: async () => trpgFixture,
    kstDateString: TODAY_KST,
  });
  // registra: OPEN(10:00) + CLOSED(01:00) + CANCELING(12:00) = 3
  // trpg: OPEN(19:00) = 1
  assert.equal(count, 4);
});

test("K-4: invalid date → 미카운트 + throw 없음 (구 경로는 RangeError 위험)", async () => {
  const withInvalid = [
    { status: "OPEN", targetDateTime: new Date("invalid") },
    { status: "OPEN", targetDateTime: "" },
    { status: "OPEN", targetDateTime: "2026-07-30T01:00:00.000Z" },
  ];
  const count = await countMergedSessionsOnKstDate({
    registraFetch: async () => withInvalid,
    trpgFetch: async () => [],
    kstDateString: TODAY_KST,
  });
  assert.equal(count, 1, "invalid 입력은 조용히 미카운트");

  // 참고: 구 경로 재현은 safeIso("") → "" → new Date("") Invalid → RangeError.
  // 신규 함수가 이 결함을 제거했음을 명시적으로 고정한다.
  assert.throws(() =>
    legacyDashboardTodayCount({
      registraRaw: withInvalid,
      trpgSerialized: [],
      todayKst: TODAY_KST,
    }),
  );
});

test("K-5: allSettled 격리 — 한 소스 실패 시 다른 소스 카운트 유지", async () => {
  const registraOnly = await countMergedSessionsOnKstDate({
    registraFetch: async () => registraFixture,
    trpgFetch: async () => {
      throw new Error("trpg down");
    },
    kstDateString: TODAY_KST,
  });
  assert.equal(registraOnly, 3);

  const trpgOnly = await countMergedSessionsOnKstDate({
    registraFetch: async () => {
      throw new Error("registra down");
    },
    trpgFetch: async () => trpgFixture,
    kstDateString: TODAY_KST,
  });
  assert.equal(trpgOnly, 1);

  const bothDown = await countMergedSessionsOnKstDate({
    registraFetch: async () => {
      throw new Error("registra down");
    },
    trpgFetch: async () => {
      throw new Error("trpg down");
    },
    kstDateString: TODAY_KST,
  });
  assert.equal(bothDown, 0);
});

test("K-6: 등가성 oracle — 유효 데이터에서 구 필터와 동일 카운트", async () => {
  // 고정 픽스처
  const newCount = await countMergedSessionsOnKstDate({
    registraFetch: async () => registraFixture,
    trpgFetch: async () => trpgFixture,
    kstDateString: TODAY_KST,
  });
  const legacyCount = legacyDashboardTodayCount({
    registraRaw: registraFixture,
    trpgSerialized: trpgFixture,
    todayKst: TODAY_KST,
  });
  assert.equal(newCount, legacyCount);

  // 결정적 시드 기반 준-랜덤 픽스처 (100 세션 × 4 케이스)
  const statuses = ["OPEN", "CLOSING", "CANCELING", "CLOSED", "CANCELED"];
  for (let seed = 0; seed < 4; seed += 1) {
    const registra = [];
    const trpg = [];
    for (let i = 0; i < 100; i += 1) {
      const n = (seed * 100 + i) * 2654435761 % 2 ** 32;
      const hourOffset = (n % 96) - 48; // 오늘 KST 기준 ±48h
      const at = new Date(
        Date.UTC(2026, 6, 30, 3, 0, 0) + hourOffset * 60 * 60 * 1000,
      );
      const status = statuses[n % statuses.length];
      if (i % 2 === 0) {
        registra.push({ status, targetDateTime: at });
      } else {
        trpg.push({ status, targetDateTime: at.toISOString() });
      }
    }
    const a = await countMergedSessionsOnKstDate({
      registraFetch: async () => registra,
      trpgFetch: async () => trpg,
      kstDateString: TODAY_KST,
    });
    const b = legacyDashboardTodayCount({
      registraRaw: registra,
      trpgSerialized: trpg,
      todayKst: TODAY_KST,
    });
    assert.equal(a, b, `seed=${seed} 에서 신규/구 카운트 불일치`);
  }
});

test("K-7: 빈 소스 → 0", async () => {
  const count = await countMergedSessionsOnKstDate({
    registraFetch: async () => [],
    trpgFetch: async () => [],
    kstDateString: TODAY_KST,
  });
  assert.equal(count, 0);
});
