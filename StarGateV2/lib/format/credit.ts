/**
 * 크레딧 표시 공통 포맷 — `¤ 1,234`.
 *
 * locale 을 ko-KR 로 고정해 서버/클라이언트 런타임 locale 차이로 인한
 * 표기 편차(잠재적 hydration mismatch)를 차단한다.
 * (shop / equipment-shop / credits 클라이언트의 로컬 사본 3개를 통합)
 */
export function formatCredits(value: number): string {
  return `¤ ${value.toLocaleString("ko-KR")}`;
}
