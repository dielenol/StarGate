import assert from "node:assert/strict";
import test from "node:test";

import { createPausableCountdown } from "../../lib/toast/pausable-countdown.ts";

// ToastProvider 는 hover·포커스·터치 탭 고정을 각각의 reason 으로 hold/release 하고,
// `paused` 를 .toast--paused 클래스(진행 띠 animation-play-state: paused)에 비춘다.

/** 수동으로 시간을 흘리는 가짜 시계 — 타이머는 예정 시각 순서로 발화한다. */
function createFakeClock(start = 10_000) {
  let now = start;
  let nextHandle = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(callback, ms) {
      const handle = nextHandle++;
      timers.set(handle, { at: now + ms, callback });
      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle);
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [handle, timer] = due;
        timers.delete(handle);
        now = timer.at;
        timer.callback();
      }
      now = target;
    },
    get pending() {
      return timers.size;
    },
  };
}

function createCountdown(durationMs, clock) {
  const fired = [];
  const countdown = createPausableCountdown(
    durationMs,
    () => fired.push(clock.now()),
    clock,
  );
  return { countdown, fired };
}

test("fires once after the duration when nothing holds it", () => {
  const clock = createFakeClock();
  const { countdown, fired } = createCountdown(8000, clock);

  assert.equal(countdown.paused, false);
  assert.equal(countdown.remainingMs, 8000);
  clock.advance(7999);
  assert.deepEqual(fired, []);
  assert.equal(countdown.remainingMs, 1);
  clock.advance(1);
  assert.deepEqual(fired, [18_000]);
  assert.equal(countdown.settled, true);
  assert.equal(countdown.remainingMs, 0);
  assert.equal(clock.pending, 0);
});

test("a hold freezes the remaining time and release re-arms with exactly that remainder", () => {
  const clock = createFakeClock();
  const { countdown, fired } = createCountdown(8000, clock);

  clock.advance(3000);
  countdown.hold("hover");
  assert.equal(countdown.paused, true);
  assert.equal(countdown.remainingMs, 5000);
  assert.equal(clock.pending, 0);

  // 원래 마감(8초)을 한참 지나도 멈춰 있는 동안은 발화하지 않고 남은 시간도 그대로다.
  clock.advance(20_000);
  assert.deepEqual(fired, []);
  assert.equal(countdown.remainingMs, 5000);

  countdown.release("hover");
  assert.equal(countdown.paused, false);
  assert.equal(clock.pending, 1);
  clock.advance(4999);
  assert.deepEqual(fired, []);
  clock.advance(1);
  // 10_000 + 3000 + 20_000 + 5000
  assert.deepEqual(fired, [38_000]);
});

test("overlapping holds resume only when the last reason is released", () => {
  const clock = createFakeClock();
  const { countdown, fired } = createCountdown(3000, clock);

  clock.advance(1000);
  countdown.hold("hover");
  countdown.hold("focus");
  clock.advance(500);
  // hover 가 먼저 떠나도 포커스가 남아 있으면 계속 멈춘 상태.
  countdown.release("hover");
  assert.equal(countdown.paused, true);
  assert.equal(countdown.isHeld("hover"), false);
  assert.equal(countdown.isHeld("focus"), true);
  assert.equal(countdown.remainingMs, 2000);
  assert.equal(clock.pending, 0);

  countdown.release("focus");
  assert.equal(countdown.paused, false);
  clock.advance(2000);
  assert.deepEqual(fired, [13_500]);
});

test("holding the same reason twice counts once, and releasing an unknown reason changes nothing", () => {
  const clock = createFakeClock();
  const { countdown, fired } = createCountdown(3000, clock);

  countdown.hold("pinned");
  countdown.hold("pinned");
  countdown.release("focus");
  assert.equal(countdown.paused, true);
  countdown.release("pinned");
  assert.equal(countdown.paused, false);
  clock.advance(3000);
  assert.deepEqual(fired, [13_000]);
});

test("cancel drops the pending timer and makes every later call a no-op", () => {
  const clock = createFakeClock();
  const { countdown, fired } = createCountdown(3000, clock);

  clock.advance(1000);
  countdown.cancel();
  assert.equal(countdown.settled, true);
  assert.equal(countdown.paused, false);
  assert.equal(countdown.remainingMs, 0);
  assert.equal(clock.pending, 0);

  // 닫기 버튼으로 닫힌 뒤 pointerleave·blur 가 늦게 와도 타이머가 되살아나지 않는다.
  countdown.hold("hover");
  countdown.release("hover");
  assert.equal(countdown.paused, false);
  assert.equal(clock.pending, 0);
  clock.advance(10_000);
  assert.deepEqual(fired, []);
});

test("cancel while held clears the holds and does not re-arm on release", () => {
  const clock = createFakeClock();
  const { countdown, fired } = createCountdown(3000, clock);

  countdown.hold("focus");
  countdown.cancel();
  assert.equal(countdown.isHeld("focus"), false);
  countdown.release("focus");
  assert.equal(clock.pending, 0);
  clock.advance(10_000);
  assert.deepEqual(fired, []);
});

test("after it has fired, hold and release are ignored", () => {
  const clock = createFakeClock();
  const { countdown, fired } = createCountdown(3000, clock);

  clock.advance(3000);
  assert.deepEqual(fired, [13_000]);
  countdown.hold("hover");
  assert.equal(countdown.paused, false);
  countdown.release("hover");
  assert.equal(clock.pending, 0);
  clock.advance(10_000);
  assert.deepEqual(fired, [13_000]);
});
