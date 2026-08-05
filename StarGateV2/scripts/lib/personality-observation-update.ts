import { isDeepStrictEqual } from "node:util";

import type { ClientSession, Collection, Document } from "mongodb";

import {
  dossierPersonalityObservationSchema,
  dossierPersonalityObservationsSchema,
} from "@stargate/shared-db/schemas";
import type { DossierPersonalityObservation } from "@stargate/shared-db/types";

export const PERSONALITY_OBSERVATIONS_PATH =
  "lore.personalityObservations" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function touchesPersonalityObservationPath(key: string): boolean {
  return (
    key === "lore" ||
    key === PERSONALITY_OBSERVATIONS_PATH ||
    key.startsWith(`${PERSONALITY_OBSERVATIONS_PATH}.`)
  );
}

function valueTargetsPersonalityObservationPath(value: unknown): boolean {
  if (typeof value === "string") {
    return touchesPersonalityObservationPath(value);
  }
  if (Array.isArray(value)) {
    return value.some(valueTargetsPersonalityObservationPath);
  }
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      touchesPersonalityObservationPath(key) ||
      valueTargetsPersonalityObservationPath(child),
  );
}

function objectKeysTouchPersonalityObservationPath(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(objectKeysTouchPersonalityObservationPath);
  }
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      touchesPersonalityObservationPath(key) ||
      objectKeysTouchPersonalityObservationPath(child),
  );
}

function parseObservation(value: unknown): DossierPersonalityObservation {
  const parsed = dossierPersonalityObservationSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `[seed-payload] ${PERSONALITY_OBSERVATIONS_PATH} 형식 오류: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ")}`,
    );
  }
  return parsed.data;
}

/**
 * 세션 동기화 update에서 한 번에 관찰 하나만 추출한다.
 * 전체 배열 교체와 `$each`는 ID 기반 CAS를 우회하므로 거부한다.
 */
export function extractPersonalityObservationUpdate(
  update: Record<string, unknown> | Record<string, unknown>[],
): DossierPersonalityObservation | null {
  if (Array.isArray(update)) {
    const replacesRoot = update.some(
      (stage) => "$replaceRoot" in stage || "$replaceWith" in stage,
    );
    const unsetsProtectedPath = update.some((stage) =>
      valueTargetsPersonalityObservationPath(stage.$unset),
    );
    if (
      replacesRoot ||
      unsetsProtectedPath ||
      objectKeysTouchPersonalityObservationPath(update)
    ) {
      throw new Error(
        `[seed-payload] pipeline update는 ${PERSONALITY_OBSERVATIONS_PATH} 또는 상위 lore를 변경할 수 없습니다. 관찰별 $addToSet envelope를 사용하세요.`,
      );
    }
    return null;
  }

  for (const [operator, value] of Object.entries(update)) {
    if (touchesPersonalityObservationPath(operator)) {
      throw new Error(
        `[seed-payload] replacement update로 상위 lore를 변경할 수 없습니다.`,
      );
    }
    if (!isRecord(value)) continue;
    for (const [path, operand] of Object.entries(value)) {
      const exactAllowedAdd =
        operator === "$addToSet" && path === PERSONALITY_OBSERVATIONS_PATH;
      if (
        !exactAllowedAdd &&
        (touchesPersonalityObservationPath(path) ||
          (operator === "$rename" &&
            valueTargetsPersonalityObservationPath(operand)))
      ) {
        throw new Error(
          `[seed-payload] ${operator} ${path} 금지: ${PERSONALITY_OBSERVATIONS_PATH}는 관찰별 $addToSet으로만 변경하세요.`,
        );
      }
    }
  }

  const addToSet = update.$addToSet;
  if (!isRecord(addToSet) || !(PERSONALITY_OBSERVATIONS_PATH in addToSet)) {
    return null;
  }

  const value = addToSet[PERSONALITY_OBSERVATIONS_PATH];
  if (isRecord(value) && "$each" in value) {
    throw new Error(
      `[seed-payload] ${PERSONALITY_OBSERVATIONS_PATH}의 $each는 지원하지 않습니다. 불변 ID별 envelope로 분리하세요.`,
    );
  }
  const observation = parseObservation(value);
  const hasCompanionMutation = Object.entries(update).some(
    ([operator, operatorValue]) =>
      operator !== "$addToSet" ||
      !isRecord(operatorValue) ||
      Object.keys(operatorValue).some(
        (path) => path !== PERSONALITY_OBSERVATIONS_PATH,
      ),
  );
  if (hasCompanionMutation) {
    throw new Error(
      `[seed-payload] personality observation envelope에는 ${PERSONALITY_OBSERVATIONS_PATH} 단일 $addToSet만 허용합니다. 그래프/메타 갱신은 별도 envelope로 분리하세요.`,
    );
  }
  return observation;
}

/** 검증·trim·unknown-key 제거가 반영된 관찰을 실제 Mongo update에 다시 주입한다. */
export function withParsedPersonalityObservation(
  update: Record<string, unknown>,
  observation: DossierPersonalityObservation,
): Record<string, unknown> {
  const addToSet = update.$addToSet;
  if (!isRecord(addToSet)) return update;
  return {
    ...update,
    $addToSet: {
      ...addToSet,
      [PERSONALITY_OBSERVATIONS_PATH]: observation,
    },
  };
}

/** 최초 create payload에도 검증된 배열을 주입해 schema transform을 저장값에 반영한다. */
export function withParsedInitialPersonalityObservations(
  payload: Record<string, unknown>,
  observations: DossierPersonalityObservation[],
): Record<string, unknown> {
  const lore = payload.lore;
  if (!isRecord(lore)) return payload;
  for (const key of Object.keys(payload)) {
    if (
      key === PERSONALITY_OBSERVATIONS_PATH ||
      key.startsWith(`${PERSONALITY_OBSERVATIONS_PATH}.`)
    ) {
      throw new Error(
        `[seed-payload] 최초 observation은 nested lore.personalityObservations 배열로만 지정하세요: ${key}`,
      );
    }
  }
  for (const key of Object.keys(lore)) {
    if (key.startsWith("personalityObservations.")) {
      throw new Error(
        `[seed-payload] 최초 observation 배열의 dotted child key를 허용하지 않습니다: lore.${key}`,
      );
    }
  }
  return {
    ...payload,
    lore: { ...lore, personalityObservations: observations },
  };
}

/**
 * 기존 character에 full/partial payload를 재적용해도 lore root를 교체하지 않도록
 * 중첩 lore를 dot-path `$set` 필드로 변환한다. 관찰 배열은 전용 create/append 경로만 쓴다.
 */
export function toProtectedCharacterSetPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const lore = payload.lore;
  for (const key of Object.keys(payload)) {
    if (
      key !== "lore" &&
      (key === PERSONALITY_OBSERVATIONS_PATH ||
        key.startsWith(`${PERSONALITY_OBSERVATIONS_PATH}.`))
    ) {
      throw new Error(
        `[seed-payload] ${key}는 일반 character payload $set으로 갱신할 수 없습니다.`,
      );
    }
  }
  if (!("lore" in payload)) return payload;
  if (!isRecord(lore)) {
    throw new Error(
      `[seed-payload] character payload.lore는 객체여야 하며 전체 lore 교체/삭제는 허용하지 않습니다.`,
    );
  }
  if ("personalityObservations" in lore) {
    throw new Error(
      `[seed-payload] ${PERSONALITY_OBSERVATIONS_PATH}는 일반 character payload $set으로 갱신할 수 없습니다.`,
    );
  }

  const protectedPayload: Record<string, unknown> = { ...payload };
  delete protectedPayload.lore;
  for (const [field, value] of Object.entries(lore)) {
    const path = `lore.${field}`;
    if (
      path === PERSONALITY_OBSERVATIONS_PATH ||
      path.startsWith(`${PERSONALITY_OBSERVATIONS_PATH}.`)
    ) {
      throw new Error(
        `[seed-payload] ${path}는 일반 character payload $set으로 갱신할 수 없습니다.`,
      );
    }
    if (path in protectedPayload) {
      throw new Error(
        `[seed-payload] character payload에 중첩/점 경로가 중복되었습니다: ${path}`,
      );
    }
    protectedPayload[path] = value;
  }
  return protectedPayload;
}

/** full character create payload의 최초 관찰 배열을 검증한다. */
export function validateInitialPersonalityObservations(
  payload: Record<string, unknown>,
): DossierPersonalityObservation[] | null {
  const lore = payload.lore;
  if (!isRecord(lore) || !("personalityObservations" in lore)) return null;

  const parsed = dossierPersonalityObservationsSchema.safeParse(
    lore.personalityObservations,
  );
  if (!parsed.success) {
    throw new Error(
      `[seed-payload] ${PERSONALITY_OBSERVATIONS_PATH} 형식 오류: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ")}`,
    );
  }
  return parsed.data;
}

function canonicalId(id: string): string {
  return id.toLocaleLowerCase("en-US");
}

function getExistingObservations(doc: Document): DossierPersonalityObservation[] {
  const lore = doc.lore;
  if (!isRecord(lore) || lore.personalityObservations === undefined) return [];

  const parsed = dossierPersonalityObservationsSchema.safeParse(
    lore.personalityObservations,
  );
  if (!parsed.success) {
    throw new Error(
      `[seed-payload] DB의 ${PERSONALITY_OBSERVATIONS_PATH}가 유효하지 않습니다. 자동 append를 중단합니다.`,
    );
  }
  return parsed.data;
}

/**
 * 같은 ID가 없으면 append, 내용까지 같으면 idempotent no-op이다.
 * 같은 ID에 다른 내용은 명시적 repair 없이는 변경하지 않는다.
 */
export function classifyPersonalityObservationWrite(
  doc: Document,
  candidate: DossierPersonalityObservation,
): "append" | "unchanged" {
  const candidateId = canonicalId(candidate.id);
  const matches = getExistingObservations(doc).filter(
    (observation) => canonicalId(observation.id) === candidateId,
  );

  if (matches.length === 0) return "append";
  if (matches.length > 1) {
    throw new Error(
      `[seed-payload] DB에 중복 personality observation id가 있습니다: ${candidate.id}`,
    );
  }
  if (isDeepStrictEqual(matches[0], candidate)) return "unchanged";
  throw new Error(
    `[seed-payload] personality observation id 충돌: ${candidate.id}. 기존 관찰은 불변이며 별도 repair가 필요합니다.`,
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 같은 ID의 동시 append를 막는 원자 조건을 원래 대상 필터에 결합한다. */
export function withPersonalityObservationGuard(
  filter: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  return {
    $and: [
      filter,
      {
        [PERSONALITY_OBSERVATIONS_PATH]: {
          $not: {
            $elemMatch: {
              id: { $regex: `^${escapeRegex(id)}$`, $options: "i" },
            },
          },
        },
      },
    ],
  };
}

export async function appendPersonalityObservation(
  collection: Pick<Collection<Document>, "findOne" | "updateOne">,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  candidate: DossierPersonalityObservation,
  session?: ClientSession,
): Promise<{ status: "updated" | "unchanged"; id: unknown }> {
  const projection = { _id: 1, "lore.personalityObservations": 1 };
  const existing = await collection.findOne(filter, { projection, session });
  if (!existing) {
    throw new Error(
      `[seed-payload] personality observation 대상 character가 없습니다: ${JSON.stringify(filter)}`,
    );
  }

  if (classifyPersonalityObservationWrite(existing, candidate) === "unchanged") {
    return { status: "unchanged", id: existing._id };
  }

  const result = await collection.updateOne(
    withPersonalityObservationGuard(filter, candidate.id),
    update,
    { upsert: false, session },
  );
  if (result.matchedCount === 1) {
    return { status: "updated", id: existing._id };
  }

  // 같은 ID가 경합 중 먼저 들어온 경우를 재조회해 exact rerun만 no-op으로 인정한다.
  const concurrent = await collection.findOne(filter, { projection, session });
  if (
    concurrent &&
    classifyPersonalityObservationWrite(concurrent, candidate) === "unchanged"
  ) {
    return { status: "unchanged", id: concurrent._id };
  }
  throw new Error(
    `[seed-payload] personality observation CAS 불일치: ${JSON.stringify(filter)}`,
  );
}
