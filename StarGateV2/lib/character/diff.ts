/**
 * 캐릭터 변경 diff 계산 (P6 audit 용)
 *
 * `updateCharacter` 가 트랜잭션 없이 수행되므로 호출자가 update 직전 before /
 * 직후 after 스냅샷을 들고 있다가 본 헬퍼로 차이를 추출. 결과는 그대로
 * `insertChangeLog({ changes })` 에 투입된다.
 *
 * 비교 대상은 화이트리스트(allowedFields) 의 dot path 만. 화이트리스트 외 필드는
 * 어차피 update 에 반영되지 않으므로 비교할 의미가 없고, 실수로 외부 데이터가
 * audit 에 새는 것도 방지.
 */

import type { CharacterChangeLogEntry } from "@stargate/shared-db";

/**
 * 객체에서 dot path 값을 읽어온다. 중간 경로가 undefined면 undefined 반환.
 *
 * shared-db `buildUpdatePatch` 와 같은 시멘틱 유지 — 두 곳이 다르게 동작하면
 * audit diff 와 실제 update 가 어긋나기 때문.
 */
function getPathValue(source: unknown, path: string): unknown {
  if (source === null || source === undefined) return undefined;
  const segments = path.split(".");
  let cursor: unknown = source;
  for (const seg of segments) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

/**
 * 두 값이 의미상 동일한지. JSON 직렬화 비교라 Date / ObjectId 등은 문자열로 변환된 뒤 비교.
 *
 * 캐릭터 sheet 는 거의 string/number/boolean/array/plain object 이므로 JSON 비교로
 * 충분. 정밀 비교가 필요한 케이스(예: equipment 배열 내 객체 순서)는 호출자가 정렬한 뒤
 * 비교한다는 가정.
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return a === b;
  if (a === null || b === null) return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * before/after 에서 화이트리스트의 각 dot path 별 차이만 추출.
 * 변경이 없으면 빈 배열 반환 → 호출자는 빈 배열일 때 `insertChangeLog` 를 생략한다.
 */
export function computeCharacterDiff(
  before: unknown,
  after: unknown,
  allowedFields: ReadonlySet<string> | Set<string>,
): CharacterChangeLogEntry[] {
  const entries: CharacterChangeLogEntry[] = [];
  for (const field of allowedFields) {
    const beforeVal = getPathValue(before, field);
    const afterVal = getPathValue(after, field);
    if (!isEqual(beforeVal, afterVal)) {
      entries.push({ field, before: beforeVal, after: afterVal });
    }
  }
  return entries;
}
