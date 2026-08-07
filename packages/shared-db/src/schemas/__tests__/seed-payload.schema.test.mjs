import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateSeedInsertCandidate,
  validateSeedPayloadPatch,
  validateSeedStoredDocument,
  validateSeedUpdate,
} from "../../../dist/schemas/seed-payload.schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAYLOAD_DIR = resolve(
  __dirname,
  "../../../../../StarGateV2/scripts/seed-payloads",
);

test("seed payload corpus 전체가 collection별 계약을 통과", () => {
  let envelopeCount = 0;
  for (const file of readdirSync(PAYLOAD_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const raw = JSON.parse(readFileSync(resolve(PAYLOAD_DIR, file), "utf8"));
    const envelopes = Array.isArray(raw) ? raw : [raw];
    for (const envelope of envelopes) {
      if (envelope.payload) {
        assert.doesNotThrow(() =>
          validateSeedPayloadPatch(envelope.collection, envelope.payload),
        );
      }
      if (envelope.update) {
        assert.doesNotThrow(() =>
          validateSeedUpdate(envelope.collection, envelope.update),
        );
      }
      envelopeCount += 1;
    }
  }
  assert.ok(envelopeCount >= 602);
});

test("collection에 없는 payload 필드는 거부", () => {
  assert.throws(
    () => validateSeedPayloadPatch("wiki_pages", { unexpected: true }),
    /Unrecognized key|schema 오류/,
  );
});

test("session report minRole은 공유 ERP 역할 도메인만 허용", () => {
  for (const minRole of ["GM", "V", "A", "M", "H", "G", "J", "U"]) {
    assert.doesNotThrow(() =>
      validateSeedPayloadPatch("session_reports", { minRole }),
    );
  }
  assert.throws(
    () => validateSeedPayloadPatch("session_reports", { minRole: "R" }),
    /schema 오류|Invalid option/u,
  );
  assert.doesNotThrow(() =>
    validateSeedUpdate("session_reports", { $set: { minRole: "U" } }),
  );
  assert.doesNotThrow(() =>
    validateSeedUpdate("session_reports", { $unset: { minRole: "" } }),
  );
});

test("허용되지 않은 update operator와 root field를 거부", () => {
  assert.throws(
    () => validateSeedUpdate("wiki_pages", { $rename: { title: "name" } }),
    /허용되지 않은 update 연산자/,
  );
  assert.throws(
    () => validateSeedUpdate("wiki_pages", { $set: { ownerId: "x" } }),
    /허용되지 않은 필드/,
  );
});

test("classic update의 동일·부모-자식 경로 충돌을 실행 전에 거부", () => {
  assert.throws(
    () =>
      validateSeedUpdate("characters", {
        $setOnInsert: { "lore.appearsInEvents": [] },
        $addToSet: { "lore.appearsInEvents": "SESSION-1" },
      }),
    /update 경로 충돌/,
  );
  assert.throws(
    () =>
      validateSeedUpdate("wiki_pages", {
        $set: { tags: [] },
        $unset: { "tags.0": "" },
      }),
    /update 경로 충돌/,
  );
  assert.doesNotThrow(() =>
    validateSeedUpdate("characters", {
      $set: { lifeStatus: "DECEASED" },
      $addToSet: { "lore.appearsInEvents": "SESSION-1" },
    }),
  );
});

test("partial patch를 신규 문서로 upsert하지 못하게 막는다", () => {
  assert.throws(
    () =>
      validateSeedInsertCandidate("wiki_pages", {
        slug: "partial-wiki",
        title: "불완전 문서",
      }),
    /신규 문서 필수 필드 누락/,
  );
});

test("기존 문서 update도 collection 필수 root를 제거하지 못한다", () => {
  for (const [collection, field] of [
    ["session_reports", "summary"],
    ["wiki_pages", "content"],
    ["master_items", "price"],
    ["characters", "role"],
  ]) {
    assert.throws(
      () => validateSeedUpdate(collection, { $unset: { [field]: "" } }),
      /필수 필드는 제거할 수 없습니다/,
    );
  }
});

test("stored-document 검증은 다른 도메인 root를 보존하되 필수 누락은 거부한다", () => {
  const report = {
    sessionId: "SESSION-1",
    sessionTitle: "세션",
    summary: "요약",
    highlights: [],
    participants: [],
    gmId: "gm",
    gmName: "GM",
    createdAt: new Date(),
    updatedAt: new Date(),
    runtimeFenceVersion: 3,
  };
  assert.doesNotThrow(() =>
    validateSeedStoredDocument("session_reports", report),
  );
  const { summary: _summary, ...missing } = report;
  assert.throws(
    () => validateSeedStoredDocument("session_reports", missing),
    /필수 필드 누락/,
  );
});

test("character stored-document는 생사 상태 증거 묶음의 일부 저장을 거부", () => {
  const character = {
    codename: "LIFE_STATUS_EVIDENCE",
    type: "NPC",
    role: "기록 보존 대상",
    previewImage: "",
    ownerId: null,
    isPublic: true,
    lore: {
      name: "생사 상태 검증 인원",
      mainImage: "",
      quote: "",
      gender: "",
      age: "",
      height: "",
      weight: "",
      appearance: "",
      personality: "",
      background: "",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const evidence = {
    lifeStatus: "DECEASED",
    lifeStatusAt: new Date("2026-07-12T00:00:00.000Z"),
    lifeStatusEventId: "NOSB-S1E5-EVIL-PART2",
  };

  assert.doesNotThrow(() =>
    validateSeedStoredDocument("characters", character),
  );
  assert.doesNotThrow(() =>
    validateSeedStoredDocument("characters", {
      ...character,
      ...evidence,
    }),
  );
  assert.doesNotThrow(() =>
    validateSeedInsertCandidate("characters", {
      ...character,
      ...evidence,
    }),
  );
  assert.doesNotThrow(() =>
    validateSeedPayloadPatch("characters", {
      lifeStatus: evidence.lifeStatus,
    }),
  );
  for (const incomplete of [
    { lifeStatus: evidence.lifeStatus },
    { lifeStatusAt: evidence.lifeStatusAt },
    { lifeStatusEventId: evidence.lifeStatusEventId },
  ]) {
    assert.throws(
      () =>
        validateSeedStoredDocument("characters", {
          ...character,
          ...incomplete,
        }),
      /모두 함께 존재하거나 모두 없어야/,
    );
    assert.throws(
      () =>
        validateSeedInsertCandidate("characters", {
          ...character,
          ...incomplete,
        }),
      /모두 함께 존재하거나 모두 없어야/,
    );
  }
});

test("경제·공방 nested payload는 알 수 없는 필드를 fail-closed로 거부", () => {
  assert.throws(
    () =>
      validateSeedPayloadPatch("master_items", {
        shopMeta: {
          stockMin: 0,
          stockMax: 10,
          appearRate: 0.5,
          unexpected: true,
        },
      }),
    /Unrecognized key|schema 오류/,
  );
  assert.throws(
    () =>
      validateSeedPayloadPatch("equipment_workshop_blueprints", {
        applicability: {
          kinds: ["upgrade"],
          sourceSlugs: [],
          sourceCategories: ["WEAPON"],
          resultCategory: "WEAPON",
          unexpected: true,
        },
      }),
    /Unrecognized key|schema 오류/,
  );
});

test("경제·공방 cross-field invariant와 보고서 reference 중복을 거부", () => {
  assert.throws(
    () =>
      validateSeedPayloadPatch("master_items", {
        shopMeta: {
          stockMin: 11,
          stockMax: 10,
          appearRate: 0.5,
        },
      }),
    /stockMax/,
  );
  assert.throws(
    () =>
      validateSeedPayloadPatch("equipment_workshop_blueprints", {
        defaults: {
          creditCost: 10,
          durationMinutes: 1_440,
          specialistCodename: "VERNIER",
          modificationDomain: "GENERAL",
          materials: [],
          result: {
            name: "테스트 장비",
            description: "테스트",
            equipmentAction: {
              code: "U1",
              name: "고정 자세",
              description: "테스트",
              effect: "테스트",
              kind: "STANCE",
              actionCost: 1,
              chargeCost: 1,
              maxCharges: 1,
              reloadCreditCost: 0,
              reloadApproval: "GM",
              reloadable: false,
            },
          },
        },
      }),
    /STANCE/,
  );
  assert.throws(
    () =>
      validateSeedPayloadPatch("session_reports", {
        relatedWikiSlugs: ["black-pyramid", " black-pyramid "],
      }),
    /중복/,
  );
});
