/**
 * 캐릭터 시트의 기본값과 포인트 보정값을 합친 실제 적용 능력치.
 * VTT 동기화와 같은 규칙으로 정수화하고 음수는 0으로 제한한다.
 */
export function finalCharacterStat(
  base: number,
  delta?: number,
): number {
  const total = Math.trunc((Number(base) || 0) + (Number(delta) || 0));
  return Math.max(0, total);
}
