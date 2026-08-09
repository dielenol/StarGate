import { isDeepStrictEqual } from "node:util";

/**
 * 캐릭터 변경 로그 되돌림(revert) 유틸 (P8)
 *
 * `character_change_logs.changes` 배열은 `{ field, before, after }` 의 dot path 표기.
 * `updateCharacter` 의 `buildUpdatePatch` 는 dot path 를 직접 처리하지 못하고
 *   - 단순 키 (`codename`): `input[key]`
 *   - dot path (`sheet.quote`): `input.sheet?.quote`
 * 형태로 부분 객체에서 값을 추출한다.
 *
 * 따라서 revert body 는 dot path 를 다시 부분 객체 트리로 풀어줘야 한다.
 *
 * 예: changes = [
 *       { field: "sheet.quote", before: "A", after: "B" },
 *       { field: "sheet.appearance", before: "X", after: "Y" },
 *       { field: "codename", before: "C-1", after: "C-2" },
 *     ]
 *   → revertBody = {
 *       sheet: { quote: "A", appearance: "X" },
 *       codename: "C-1",
 *     }
 *
 * 주의:
 *   - 화이트리스트(`buildUpdatePatch` 의 `allowedFields`) 가 추가 가드를 적용하므로
 *     이 함수는 화이트리스트를 의식하지 않고 모든 변경을 그대로 풀어 둔다.
 *     호출자(route handler)가 ADMIN_ALLOWED_CHARACTER_FIELDS 를 같이 넘긴다.
 *   - `changesToRevertFieldPatch`는 `before === undefined`를 Mongo `$unset`으로
 *     분리해 "원래 필드 자체가 없었음"까지 복원한다.
 */

interface ChangeEntry {
  field: string;
  before: unknown;
}

export interface CharacterRevertFieldPatch {
  set: Record<string, unknown>;
  unset: string[];
}

interface CurrentValueChangeEntry {
  field: string;
  after: unknown;
}

function valueAtPath(document: unknown, path: string): unknown {
  let current = document;
  for (const segment of path.split(".")) {
    if (
      !segment ||
      current === null ||
      typeof current !== "object" ||
      !(segment in current)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** 로그 이후 같은 필드가 다시 변경되지 않았는지 확인한다. */
export function areChangeLogAfterValuesCurrent(
  document: unknown,
  changes: ReadonlyArray<CurrentValueChangeEntry>,
): boolean {
  return changes.every(({ field, after }) =>
    Boolean(field) && isDeepStrictEqual(valueAtPath(document, field), after),
  );
}

/**
 * change log 의 changes 배열을 `updateCharacter` 가 받을 수 있는 부분 객체로 변환.
 *
 * dot path 의 각 segment 마다 cursor 를 부분 객체로 내려가며 last segment 에 before 값을 둔다.
 * 동일 root 의 여러 dot path (e.g. `sheet.quote` + `sheet.appearance`) 가 안전히 병합된다.
 */
export function changesToRevertBody(
  changes: ReadonlyArray<ChangeEntry>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const { field, before } of changes) {
    if (!field || typeof field !== "string") continue;
    const segments = field.split(".");
    let cursor: Record<string, unknown> = body;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const next = cursor[seg];
      if (next === undefined || next === null || typeof next !== "object") {
        const nested: Record<string, unknown> = {};
        cursor[seg] = nested;
        cursor = nested;
      } else {
        cursor = next as Record<string, unknown>;
      }
    }
    cursor[segments[segments.length - 1]] = before;
  }
  return body;
}

/** 원래 없던 필드는 `$unset`, 값이 있던 필드는 flat `$set`으로 복원한다. */
export function changesToRevertFieldPatch(
  changes: ReadonlyArray<ChangeEntry>,
): CharacterRevertFieldPatch {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const { field, before } of changes) {
    if (!field || typeof field !== "string") continue;
    if (before === undefined) {
      unset.push(field);
      delete set[field];
    } else {
      set[field] = before;
      const index = unset.indexOf(field);
      if (index >= 0) unset.splice(index, 1);
    }
  }
  return { set, unset };
}
