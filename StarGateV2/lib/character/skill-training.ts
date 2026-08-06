const SKILL_TRAINING_ALIASES: Readonly<Record<string, string>> = {
  "철학": "문학",
  "문학,철학": "문학",
};

export type SkillTrainingParseResult =
  | { success: true; data: string[] }
  | { success: false };

/**
 * 신규 skillTraining 입력을 표준 토큰 배열로 만든다.
 *
 * 정확히 일치하는 레거시 토큰만 치환한다. `서양철학` 같은 부분 문자열이나
 * 공백이 포함된 임의 표현은 근거 없이 보정하지 않는다.
 */
export function normalizeSkillTraining(values: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const next = SKILL_TRAINING_ALIASES[value] ?? value;
    if (seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }

  return normalized;
}

/** API 경계에서 배열과 원소 타입을 확인한 뒤 동일한 표준화를 적용한다. */
export function parseSkillTrainingInput(
  input: unknown,
): SkillTrainingParseResult {
  if (!Array.isArray(input) || input.some((value) => typeof value !== "string")) {
    return { success: false };
  }

  return { success: true, data: normalizeSkillTraining(input) };
}

/**
 * 편집 API에서 전송값이 저장값과 완전히 같으면 레거시 표현을 그대로 둔다.
 * 다른 필드만 저장하는 요청이 별도 migration 승인을 우회하지 않게 한다.
 */
export function parseEditedSkillTrainingInput(
  input: unknown,
  existing: readonly string[],
): SkillTrainingParseResult {
  if (!Array.isArray(input) || input.some((value) => typeof value !== "string")) {
    return { success: false };
  }
  if (
    input.length === existing.length &&
    input.every((value, index) => value === existing[index])
  ) {
    return { success: true, data: [...existing] };
  }
  return { success: true, data: normalizeSkillTraining(input) };
}
