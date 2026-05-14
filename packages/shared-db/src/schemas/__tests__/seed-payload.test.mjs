/**
 * seed 스크립트가 생성하는 payload 형태가 실제로 factionDocSchema/institutionDocSchema를
 * 통과하는지 sanity check. scripts/seed-factions.ts / seed-institutions.ts 의 buildPayload
 * 로직을 거울로 복제하여 검증한다.
 *
 * Phase 4 변경이 Phase 1 스키마와 drift가 나면 여기서 잡힌다.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  FACTIONS,
  INSTITUTIONS,
} from "../../../dist/types/index.js";
import { factionDocSchema } from "../../../dist/schemas/faction.schema.js";
import { institutionDocSchema } from "../../../dist/schemas/institution.schema.js";

/* ── helpers: seed 스크립트 거울 ── */

function codeToSlug(code) {
  return code.toLowerCase().replace(/_/g, "-");
}

const FACTION_DEFAULT_SUMMARIES = {
  MILITARY: "노부스 오르도 군사 계열. 작전·무장 조직을 총괄한다.",
  COUNCIL: "노부스 오르도 세계이사회. 정책·행정·재무를 총괄한다.",
  CIVIL: "노부스 오르도와 연결된 민간 협력 계열. 상업·보급·외부 네트워크 축.",
};

function buildFactionPayload(entry) {
  return {
    code: entry.code,
    slug: codeToSlug(entry.code),
    label: entry.label,
    labelEn: entry.labelEn,
    summary: FACTION_DEFAULT_SUMMARIES[entry.code] ?? "TBD",
    isPublic: true,
    source: "manual",
    tags: [],
  };
}

const INSTITUTION_DEFAULT_SUMMARIES = {
  SECRETARIAT:
    "세계이사회 직속 사무국. 연구·행정·국제·통제·재무 기구를 총괄하는 실무 허브.",
  MANUS:
    "노부스 오르도의 현장 집행 기관. 외부 기구·범죄조직·특수부대 등에서 차출된 인력을 섹터 A~E 로 분류 배치한다.",
};
const PARENT_FACTION_BY_CODE = {
  SECRETARIAT: "COUNCIL",
  MANUS: "COUNCIL",
};

function buildInstitutionPayload(entry) {
  const subUnits = entry.subUnits.map((su) => ({
    code: su.code,
    label: su.label,
  }));
  return {
    code: entry.code,
    slug: codeToSlug(entry.code),
    label: entry.label,
    labelEn: entry.labelEn,
    parentFactionCode: PARENT_FACTION_BY_CODE[entry.code],
    subUnits: subUnits.length > 0 ? subUnits : undefined,
    summary: INSTITUTION_DEFAULT_SUMMARIES[entry.code] ?? "TBD",
    isPublic: true,
    source: "manual",
    tags: [],
  };
}

/* ── Tests ── */

test("SEED: FACTIONS 3종 buildPayload → factionDocSchema 통과", () => {
  const now = new Date();
  for (const entry of FACTIONS) {
    const payload = buildFactionPayload(entry);
    // createFaction()가 추가하는 metadata 주입 후 parse
    const result = factionDocSchema.safeParse({
      ...payload,
      createdAt: now,
      updatedAt: now,
    });
    assert.ok(
      result.success,
      `${entry.code} payload가 factionDocSchema에 통과하지 못함: ${result.success ? "" : JSON.stringify(result.error.issues)}`,
    );
  }
});

test("SEED: INSTITUTIONS 2종 buildPayload → institutionDocSchema 통과", () => {
  const now = new Date();
  for (const entry of INSTITUTIONS) {
    const payload = buildInstitutionPayload(entry);
    const result = institutionDocSchema.safeParse({
      ...payload,
      createdAt: now,
      updatedAt: now,
    });
    assert.ok(
      result.success,
      `${entry.code} payload가 institutionDocSchema에 통과하지 못함: ${result.success ? "" : JSON.stringify(result.error.issues)}`,
    );
  }
});

test("SEED: FACTION codeToSlug는 slugSchema 규약(^[a-z0-9-]+$) 준수", () => {
  for (const entry of FACTIONS) {
    const slug = codeToSlug(entry.code);
    assert.match(slug, /^[a-z0-9-]+$/, `slug invalid for ${entry.code}: ${slug}`);
    assert.ok(slug.length >= 1 && slug.length <= 60, `slug 길이 범위 위반: ${slug}`);
  }
});

test("SEED: INSTITUTION codeToSlug는 slugSchema 규약 준수", () => {
  for (const entry of INSTITUTIONS) {
    const slug = codeToSlug(entry.code);
    assert.match(slug, /^[a-z0-9-]+$/, `slug invalid for ${entry.code}: ${slug}`);
  }
});

test("SEED: INSTITUTION subUnits의 code는 codeSchema 규약 준수", () => {
  for (const entry of INSTITUTIONS) {
    const payload = buildInstitutionPayload(entry);
    for (const su of payload.subUnits ?? []) {
      assert.match(su.code, /^[A-Z_][A-Z0-9_]*$/, `subUnit code invalid: ${su.code}`);
    }
  }
});
