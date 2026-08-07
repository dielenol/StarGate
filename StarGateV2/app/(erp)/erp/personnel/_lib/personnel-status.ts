type PersonnelStatusRecord = {
  lifeStatus?: "DECEASED";
};

export function isDeceasedPersonnel(
  personnel: PersonnelStatusRecord,
): boolean {
  return personnel.lifeStatus === "DECEASED";
}

/**
 * 현재 조직 정원 집계에는 명시적 사망 기록만 제외한다.
 * 상태 필드 부재를 생존 확정으로 해석하는 함수가 아니라, 아카이브 분리용 기준이다.
 */
export function isStaffingPersonnel(
  personnel: PersonnelStatusRecord,
): boolean {
  return !isDeceasedPersonnel(personnel);
}

export function countStaffingPersonnel(
  personnel: readonly PersonnelStatusRecord[],
): number {
  return personnel.filter(isStaffingPersonnel).length;
}
