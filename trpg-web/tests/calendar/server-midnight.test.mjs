import assert from "node:assert/strict";
import test from "node:test";

import { msUntilNextKstMidnight } from "../../lib/calendar/month.ts";
import { msUntilServerKstMidnightAtDevice } from "../../lib/calendar/today-resync.ts";

// CalendarClient 는 todayKey 재동기화 자정 타이머를 이 값 + 5초로 건다 — 서버가 payload 를 만든 시각
// (initialFetchedAt, 서버 시계)의 다음 KST 자정(15:00 UTC)을 문서 오프셋(기기 시각 − 서버 시각)으로 기기 시각으로
// 환산한 뒤 Date.now() 와의 차. 발화하면 발화 시각을 서버 시계로 환산해 같은 함수로 다음 자정에 다시 건다.

const DAY_MS = 24 * 60 * 60 * 1000;
const SLACK_MS = 5_000;
/** 2026-10-21 KST 자정. */
const MIDNIGHT = Date.parse("2026-10-20T15:00:00.000Z");

test("counts down to the server's next KST midnight and clamps at 0 once it has passed", () => {
  const fetchedAt = MIDNIGHT - 60_000; // 서버 23:59:00 에 만든 payload
  assert.equal(msUntilServerKstMidnightAtDevice(fetchedAt, 0, fetchedAt), 60_000);
  assert.equal(msUntilServerKstMidnightAtDevice(fetchedAt, 0, MIDNIGHT - 1), 1);
  assert.equal(msUntilServerKstMidnightAtDevice(fetchedAt, 0, MIDNIGHT), 0);
  // 지난 자정은 0 — 뒤로 가기로 복원된 옛 payload, SSR 과 hydration 사이의 자정.
  assert.equal(msUntilServerKstMidnightAtDevice(fetchedAt, 0, MIDNIGHT + 1), 0);
  assert.equal(
    msUntilServerKstMidnightAtDevice(fetchedAt - DAY_MS, 0, MIDNIGHT - 60_000),
    0,
  );
  // 자정 정각에 만든 payload 의 다음 자정은 하루 뒤, 1ms 전이면 1ms 뒤.
  assert.equal(msUntilServerKstMidnightAtDevice(MIDNIGHT, 0, MIDNIGHT), DAY_MS);
  assert.equal(msUntilServerKstMidnightAtDevice(MIDNIGHT - 1, 0, MIDNIGHT - 1), 1);
});

test("a fast or slow device clock lands on the same server midnight where the device clock alone would not", () => {
  const fetchedAt = MIDNIGHT - 60_000;
  const LATENCY_MS = 100; // 서버 → 기기 전달 지연(오프셋에 섞인다)

  // 기기가 30초 빠름.
  const fastOffset = 30_000 + LATENCY_MS;
  const fastNow = fetchedAt + fastOffset; // payload 가 도착한 기기 시각
  assert.equal(msUntilServerKstMidnightAtDevice(fetchedAt, fastOffset, fastNow), 60_000);
  // 기기 시계로 자정을 재면 30초 이르다 — 서버 자정 전에 발화해 같은 todayKey 를 받는 경로.
  assert.equal(msUntilNextKstMidnight(new Date(fastNow)), 60_000 - 30_000 - LATENCY_MS);

  // 기기가 2분 느림.
  const slowOffset = -120_000 + LATENCY_MS;
  const slowNow = fetchedAt + slowOffset;
  assert.equal(msUntilServerKstMidnightAtDevice(fetchedAt, slowOffset, slowNow), 60_000);
  // 기기 시계로 자정을 재면 2분 늦다.
  assert.equal(msUntilNextKstMidnight(new Date(slowNow)), 60_000 + 120_000 - LATENCY_MS);

  // 오프셋 부호와 무관하게 "기기 시각 + 남은 ms" 를 서버 시계로 되돌리면 서버 자정 한 점이다.
  for (const [offset, now] of [
    [fastOffset, fastNow],
    [slowOffset, slowNow],
    [0, fetchedAt + 30_000],
  ]) {
    assert.equal(
      now + msUntilServerKstMidnightAtDevice(fetchedAt, offset, now) - offset,
      MIDNIGHT,
      String(offset),
    );
  }
});

test("re-arming from the firing moment fires once per server day even when the device is a day off", () => {
  for (const offset of [0, 30_000, -120_000, DAY_MS + 250, -DAY_MS]) {
    let serverEpochMs = MIDNIGHT - 5 * 60 * 60 * 1000; // 서버 19:00 에 만든 payload
    let deviceNow = serverEpochMs + offset;
    const firedAtServer = [];
    for (let day = 0; day < 3; day += 1) {
      const delay =
        msUntilServerKstMidnightAtDevice(serverEpochMs, offset, deviceNow) +
        SLACK_MS;
      assert.ok(
        delay > SLACK_MS && delay <= DAY_MS + SLACK_MS,
        `${offset}/${day}: ${delay}`,
      );
      deviceNow += delay; // 타이머 발화
      firedAtServer.push(deviceNow - offset);
      serverEpochMs = deviceNow - offset; // 발화 시각(서버 시계)을 기준으로 다시 건다
    }
    assert.deepEqual(
      firedAtServer,
      [
        MIDNIGHT + SLACK_MS,
        MIDNIGHT + DAY_MS + SLACK_MS,
        MIDNIGHT + 2 * DAY_MS + SLACK_MS,
      ],
      String(offset),
    );
  }
});

test("re-arming never yields an immediate timer", () => {
  for (const offset of [0, 30_000, -120_000, DAY_MS]) {
    for (const serverNow of [MIDNIGHT - 1, MIDNIGHT, MIDNIGHT + 1, MIDNIGHT + SLACK_MS]) {
      const ms = msUntilServerKstMidnightAtDevice(serverNow, offset, serverNow + offset);
      assert.ok(ms > 0 && ms <= DAY_MS, `${offset}/${serverNow}: ${ms}`);
      assert.equal(ms, msUntilNextKstMidnight(new Date(serverNow)));
    }
  }
});

let freshModuleSeq = 0;
/** resolveServerToDeviceOffsetMs 는 모듈 스코프 캐시를 가지므로 테스트마다 새 모듈 인스턴스를 받는다. */
async function importFreshTodayResync() {
  freshModuleSeq += 1;
  return import(`../../lib/calendar/today-resync.ts?fresh=${freshModuleSeq}`);
}

test("resolveServerToDeviceOffsetMs is 0 on the server render", async () => {
  const { resolveServerToDeviceOffsetMs } = await importFreshTodayResync();
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(resolveServerToDeviceOffsetMs(1_000, 1_300), 0);
});

test("resolveServerToDeviceOffsetMs measures the newest payload once per document", async () => {
  globalThis.window = {};
  try {
    const { resolveServerToDeviceOffsetMs } = await importFreshTodayResync();
    // 첫 payload: 기기 시각 − 서버 시각(전달 지연 포함).
    assert.equal(resolveServerToDeviceOffsetMs(1_000, 1_300), 300);
    // 같은 payload 의 재렌더 — 다시 재지 않는다.
    assert.equal(resolveServerToDeviceOffsetMs(1_000, 9_000), 300);
    // 뒤로 가기로 복원된 옛 payload — 재면 오래된 prefetch 가 방금 받은 것이 되므로 앞서 잰 값을 유지한다.
    assert.equal(resolveServerToDeviceOffsetMs(500, 9_000), 300);
    // refresh·전진 내비게이션으로 온 더 새 payload — 다시 잰다(그사이 기기 시계가 30초 뛰었어도 바로잡힌다).
    assert.equal(resolveServerToDeviceOffsetMs(8_000, 8_400 + 30_000), 30_400);
    assert.equal(resolveServerToDeviceOffsetMs(1_000, 50_000), 30_400);
  } finally {
    delete globalThis.window;
  }
});
