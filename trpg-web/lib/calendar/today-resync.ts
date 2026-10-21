/**
 * 서버가 내려준 todayKey 를 언제 다시 받아올지(`router.refresh()`) 정하는 순수 계산 모음.
 * CalendarClient 의 재동기화 effect 가 쓰고, 테스트는 tests/calendar/today-resync.test.mjs 와
 * tests/calendar/server-midnight.test.mjs 가 한다.
 *
 * - 이벤트 경로(마운트 직후, visibilitychange·focus·online): `resolveTodayResyncKey` — 기기 날짜 기준.
 * - 서버 자정 타이머: `msUntilServerKstMidnightAtDevice` — 서버 시각 기준. 서버 시계와 기기 시계의 차이는
 *   `resolveServerToDeviceOffsetMs` 가 payload 의 생성 시각으로 잰다.
 */

import { msUntilNextKstMidnight } from "./month";

/**
 * 재동기화를 시도할 `${기기 KST 날짜}|${todayKey}` 조합 키. 시도하지 않을 때는 null.
 *
 * - 기기 날짜가 todayKey 보다 **앞설 때만** 시도한다. 서버 날짜는 뒤로 가지 않으므로 기기가 느린 경우의
 *   refresh 는 결과를 바꿀 수 없다(키는 0 패딩 `YYYY-MM-DD` 라 사전순 비교가 날짜순과 같다).
 * - 같은 조합은 한 번만 시도한다. 기기 시계가 틀리면 refresh 해도 서버는 같은 todayKey 를 다시 내려주므로,
 *   visibilitychange·focus 마다 refresh 가 반복되지 않게 한다. 기기 날짜나 todayKey 중 하나라도
 *   바뀌면 조합이 달라져 다시 시도한다.
 * - `serverDayChanged` 는 서버 자정 타이머가 숨김·오프라인으로 refresh 를 건너뛴 뒤의 호출 — 서버 날짜가
 *   바뀐 것이 확실하므로 기기 날짜와 앞선 기록을 무시하고 항상 시도한다(기기가 느려도 침묵하지 않고, 서버
 *   자정 전의 기기 자정에 같은 조합을 이미 써 버렸어도 막히지 않는다). 돌려준 키를 기록하면 refresh 응답
 *   전에 잇달아 오는 다음 이벤트(복귀 시 visibilitychange 와 focus 는 연달아 온다)는 같은 조합으로 막힌다.
 */
export function resolveTodayResyncKey(
  deviceDateKey: string,
  todayKey: string,
  lastAttemptKey: string | null,
  serverDayChanged = false,
): string | null {
  const attemptKey = `${deviceDateKey}|${todayKey}`;
  if (serverDayChanged) return attemptKey;
  if (deviceDateKey <= todayKey) return null;
  return attemptKey === lastAttemptKey ? null : attemptKey;
}

/**
 * 서버 시계로 `serverEpochMs` 다음에 오는 KST 자정이 기기 시계로는 언제인지 계산해, 기기 시각 `deviceNowMs`
 * 에서 거기까지 남은 ms 를 돌려준다. 그 자정이 이미 지났으면 0 — payload 가 만들어진 뒤 서버 날짜가 바뀐 것이
 * 확실하므로(뒤로 가기로 복원된 옛 payload, SSR 과 hydration 사이의 자정) 호출자는 곧바로 확인해야 한다.
 *
 * 서버 자정은 `serverEpochMs + msUntilNextKstMidnight(serverEpochMs)`(서버 시계)이고, 두 시계는 같은 속도로
 * 가므로 오프셋(기기 시각 − 서버 시각)만 더하면 기기 시각이 된다. 기기 시계로 자정을 재면 기기가 빠른 만큼
 * 서버 자정 전에 발화해 같은 todayKey 를 받고, 느린 만큼 늦게 발화한다. 발화 뒤 다시 걸 때는 발화 시각을 서버
 * 시계로 환산한 값(`deviceNowMs − serverToDeviceOffsetMs`)을 `serverEpochMs` 로 주면 되고, 그 결과는 항상
 * `(0, DAY_MS]` 라 타이머가 곧바로 다시 발화하지 않는다.
 */
export function msUntilServerKstMidnightAtDevice(
  serverEpochMs: number,
  serverToDeviceOffsetMs: number,
  deviceNowMs: number,
): number {
  const serverMidnightAtDeviceMs =
    serverEpochMs +
    msUntilNextKstMidnight(new Date(serverEpochMs)) +
    serverToDeviceOffsetMs;
  return Math.max(0, serverMidnightAtDeviceMs - deviceNowMs);
}

/**
 * 서버 시각 → 기기 시각 오프셋(`기기 시각 − 서버 시각`, ms). 서버가 payload 를 만든 시각 `serverEpochMs` 와
 * 그것을 받은 기기 시각 `deviceNowMs` 의 차로 잰다. 전달 지연만큼 커지는 오차는 staleTime 60초·자정 타이머
 * 여유 5초에 비해 무시할 수 있고, 방향이 "서버 시각을 실제보다 뒤로" 라 자정 타이머는 늦게 발화할지언정 서버
 * 자정 전에 발화하지 않는다.
 *
 * 쓰임 둘. TanStack 은 신선도를 기기 `Date.now()` 로 재므로 서버 epoch(initialFetchedAt)를 그대로
 * `initialDataUpdatedAt` 에 넘기면 두 시계의 차이가 staleTime 에 섞인다(기기가 느리면 오래된 prefetch 가
 * 그만큼 더 신선하게 취급됨). 자정 타이머는 이 오프셋으로 서버 자정을 기기 시각으로 환산한다.
 *
 * 문서(모듈) 단위로 **가장 새 payload** 에서 한 번 잰다. 더 새 payload(refresh·전진 내비게이션)가 오면 다시
 * 재고, `serverEpochMs` 가 지금까지 본 것보다 과거면 앞서 잰 값을 유지한다 — 뒤로 가기는 Next 가 옛 RSC
 * payload 를 그대로 복원하므로 마운트마다 재면 오래된 prefetch 가 방금 받은 것으로 환산된다. 다시 재는
 * 덕에 측정 뒤 기기 시계가 뛰어도(수동 변경·NTP 보정) 다음 payload 에서 바로잡힌다. 서버 렌더에서는 요청
 * 간에 공유되지 않게 0 을 돌려준다.
 */
let newestServerEpochMs = Number.NEGATIVE_INFINITY;
let cachedServerToDeviceOffsetMs = 0;
export function resolveServerToDeviceOffsetMs(
  serverEpochMs: number,
  deviceNowMs: number = Date.now(),
): number {
  if (typeof window === "undefined") return 0;
  if (serverEpochMs > newestServerEpochMs) {
    newestServerEpochMs = serverEpochMs;
    cachedServerToDeviceOffsetMs = deviceNowMs - serverEpochMs;
  }
  return cachedServerToDeviceOffsetMs;
}
