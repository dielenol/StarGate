/**
 * 프로세스 종료 진행 상태
 *
 * SIGTERM 이후 Discord 토큰이 제거되면 남은 DM 발송은 모두 실패한다. 스케줄러는
 * `isShuttingDown()` 을 확인해 발송 루프를 멈추고 완료 표시를 건너뛰어, 다음
 * 인스턴스가 남은 수신자를 이어서 처리하게 한다. `beginShutdown()` 은 종료 절차의
 * 재진입(두 번째 SIGTERM 등)을 막는 데도 쓴다.
 *
 * @module utils/shutdown-state
 */

let shuttingDown = false;

/** 종료를 시작한다. 이미 시작된 상태면 false 를 반환한다. */
export function beginShutdown(): boolean {
  if (shuttingDown) return false;
  shuttingDown = true;
  return true;
}

/** 종료 절차가 시작되었는지 여부. */
export function isShuttingDown(): boolean {
  return shuttingDown;
}
