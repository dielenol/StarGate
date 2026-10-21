/**
 * 남은 시간을 보존한 채 멈췄다 이어갈 수 있는 타임아웃. ToastProvider 의 자동 닫기가 쓰고,
 * 테스트는 tests/toast/pausable-countdown.test.mjs 가 한다.
 *
 * - `hold(reason)` 가 하나라도 걸려 있는 동안 멈춘다. hover·포커스·탭 고정이 겹쳐도 마지막 것이
 *   `release` 될 때 비로소 재개한다(같은 reason 을 두 번 hold 해도 한 번으로 센다).
 * - 멈출 때 남은 시간을 기록하고, 재개하면 그 남은 시간으로 다시 건다 — CSS 진행 띠의
 *   `animation-play-state: paused` 와 같은 의미라 띠와 타이머가 어긋나지 않는다.
 * - 한 번 끝나거나(`onElapsed` 호출) 취소되면 settled 가 되고 이후 호출은 모두 무시한다.
 */

export interface CountdownClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PausableCountdown {
  /** hold 가 하나라도 걸려 있고 아직 끝나지 않았는가. */
  readonly paused: boolean;
  /** 끝났거나(onElapsed) 취소됐는가. */
  readonly settled: boolean;
  /** 지금 기준 남은 시간(ms). 멈춰 있는 동안은 변하지 않고, settled 뒤에는 0. */
  readonly remainingMs: number;
  isHeld(reason: string): boolean;
  hold(reason: string): void;
  release(reason: string): void;
  cancel(): void;
}

const defaultClock: CountdownClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createPausableCountdown(
  durationMs: number,
  onElapsed: () => void,
  clock: CountdownClock = defaultClock,
): PausableCountdown {
  const holds = new Set<string>();
  let remainingMs = durationMs;
  let deadline = 0;
  let handle: unknown = null;
  let settled = false;

  const arm = () => {
    deadline = clock.now() + remainingMs;
    handle = clock.setTimeout(() => {
      handle = null;
      settled = true;
      remainingMs = 0;
      onElapsed();
    }, remainingMs);
  };

  const disarm = () => {
    if (handle === null) return;
    clock.clearTimeout(handle);
    handle = null;
    remainingMs = Math.max(0, deadline - clock.now());
  };

  arm();

  return {
    get paused() {
      return !settled && holds.size > 0;
    },
    get settled() {
      return settled;
    },
    get remainingMs() {
      if (settled) return 0;
      return handle === null ? remainingMs : Math.max(0, deadline - clock.now());
    },
    isHeld(reason) {
      return holds.has(reason);
    },
    hold(reason) {
      if (settled) return;
      holds.add(reason);
      disarm();
    },
    release(reason) {
      if (settled) return;
      holds.delete(reason);
      if (holds.size === 0 && handle === null) arm();
    },
    cancel() {
      if (settled) return;
      disarm();
      holds.clear();
      settled = true;
    },
  };
}
