import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLoreProjection,
  loreAliasLogicalKey,
  loreClaimLogicalKey,
  loreEdgeLogicalKey,
  sameActiveAssertionPayload,
} from "../lore-index-projection.ts";

const createdAt = new Date("2026-08-05T00:00:00.000Z");

test("supersession lineage가 추가된 active assertion은 동일 재실행에서 no-op이다", () => {
  const desired = {
    aliasId: "idx-alias:a2",
    entityRef: "character:ALPHA",
    alias: "알파",
    logicalKey: "character:ALPHA|canonical-name|알파",
    lineage: { state: "active" },
    updatedAt: createdAt,
  };
  const stored = {
    ...desired,
    lineage: { state: "active", supersedesIds: ["idx-alias:a1"] },
  };
  assert.equal(sameActiveAssertionPayload(stored, desired), true);
  assert.equal(
    sameActiveAssertionPayload({ ...stored, alias: "변조" }, desired),
    false,
  );
});

function snapshot() {
  return {
    characters: [
      {
        _id: "character-1",
        codename: "ALPHA",
        type: "NPC",
        role: "연구원",
        factionCode: "COUNCIL",
        institutionCode: "SECRETARIAT",
        isPublic: false,
        lore: {
          name: "알파",
          background: "블랙 피라미드 연구원",
          loreTags: ["연구"],
          appearsInEvents: ["SESSION-1"],
        },
        createdAt,
        updatedAt: createdAt,
      },
    ],
    wikiPages: [
      {
        _id: "wiki-1",
        slug: "black-pyramid",
        title: "블랙 피라미드",
        content: "[[알파]]가 근무하는 본부.",
        category: "장소",
        tags: ["본부"],
        isPublic: true,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    sessionReports: [
      {
        _id: "report-1",
        sessionId: "SESSION-1",
        sessionTitle: "작전 보고서 1",
        summary: "알파가 참여했다.",
        highlights: [],
        participants: ["ALPHA"],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    masterItems: [
      {
        _id: "item-1",
        slug: "sample-item",
        name: "샘플",
        category: "MATERIAL",
        description: "연구 샘플",
        isAvailable: false,
        isPublic: true,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    factions: [
      {
        _id: "faction-1",
        code: "COUNCIL",
        slug: "council",
        label: "세계이사회",
        summary: "세계 의결 기구",
        scope: "external",
        isPublic: true,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    institutions: [
      {
        _id: "institution-1",
        code: "SECRETARIAT",
        slug: "secretariat",
        label: "사무국",
        summary: "행정 기관",
        parentFactionCode: "COUNCIL",
        isPublic: true,
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}

test("6개 도메인을 source/alias/edge/claim/search projection으로 변환", () => {
  const bundle = buildLoreProjection(snapshot());
  assert.equal(bundle.sources.length, 6);
  assert.equal(bundle.searchDocuments.length, 6);
  assert.ok(bundle.aliases.length >= 12);
  assert.ok(bundle.claims.length >= 6);

  const edges = new Set(bundle.edges.map(loreEdgeLogicalKey));
  assert.ok(edges.has("character:ALPHA|member-of|faction:COUNCIL"));
  assert.ok(edges.has("character:ALPHA|member-of|institution:SECRETARIAT"));
  assert.ok(edges.has("character:ALPHA|appeared-in|report:SESSION-1"));
  assert.ok(edges.has("report:SESSION-1|mentions|character:ALPHA"));
  assert.ok(edges.has("wiki:black-pyramid|references|character:ALPHA"));

  const privateCharacter = bundle.searchDocuments.find(
    (doc) => doc.entityRef === "character:ALPHA",
  );
  assert.deepEqual(privateCharacter?.access, {
    visibility: "restricted",
    allowedRoles: ["V"],
  });
  const publicWikiToPrivateCharacter = bundle.edges.find(
    (edge) =>
      edge.fromRef === "wiki:black-pyramid" &&
      edge.toRef === "character:ALPHA",
  );
  assert.deepEqual(publicWikiToPrivateCharacter?.access, {
    visibility: "restricted",
    allowedRoles: ["V"],
  });
  assert.equal(bundle.warnings.length, 0);
});

test("제한 보고서의 lore projection도 같은 최소 역할을 강제", () => {
  const input = snapshot();
  input.sessionReports[0].minRole = "V";
  const bundle = buildLoreProjection(input);
  const report = bundle.searchDocuments.find(
    (doc) => doc.entityRef === "report:SESSION-1",
  );
  assert.deepEqual(report?.access, {
    visibility: "restricted",
    allowedRoles: ["V"],
  });
});

test("catalog sourceClass가 design-proposal이면 lore graph도 후보 상태를 보존한다", () => {
  const input = snapshot();
  input.masterItems[0].sourceClass = "design-proposal";
  const bundle = buildLoreProjection(input);
  const catalog = bundle.searchDocuments.find(
    (document) => document.entityRef === "catalog:sample-item",
  );
  assert.equal(catalog?.status, "design-proposal");
  assert.ok(
    bundle.claims
      .filter((claim) => claim.subjectRef === "catalog:sample-item")
      .every((claim) => claim.status === "design-proposal"),
  );
});

test("같은 snapshot은 stable IDs와 logical keys를 재현", () => {
  const first = buildLoreProjection(snapshot());
  const second = buildLoreProjection(snapshot());
  assert.deepEqual(
    first.sources.map((source) => source.sourceId),
    second.sources.map((source) => source.sourceId),
  );
  assert.deepEqual(
    first.aliases.map(loreAliasLogicalKey),
    second.aliases.map(loreAliasLogicalKey),
  );
  assert.deepEqual(
    first.claims.map(loreClaimLogicalKey),
    second.claims.map(loreClaimLogicalKey),
  );
});

test("보고서 참조 concurrency metadata는 lore provenance ID를 바꾸지 않는다", () => {
  const base = snapshot();
  const locked = snapshot();
  locked.characters[0].__sessionReportReferenceVersion = 3;
  locked.wikiPages[0].__sessionReportReferenceLockAt = new Date(
    "2026-08-05T00:00:00.000Z",
  );
  locked.masterItems[0].__sessionReportReferenceLockAt = new Date(
    "2026-08-05T01:00:00.000Z",
  );
  locked.sessionReports[0].provenanceSourceIds = [
    "seed-payload:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ];

  assert.deepEqual(
    buildLoreProjection(locked).sources.map((source) => source.sourceId),
    buildLoreProjection(base).sources.map((source) => source.sourceId),
  );
});

test("public Dossier도 field-level clearance 때문에 auxiliary projection은 제한한다", () => {
  const input = snapshot();
  input.characters[0].isPublic = true;
  input.characters[0].ownerId = "owner-1";
  const bundle = buildLoreProjection(input);
  const searchDocument = bundle.searchDocuments.find(
    (document) => document.entityRef === "character:ALPHA",
  );
  assert.deepEqual(searchDocument?.access, {
    visibility: "restricted",
    allowedRoles: ["V"],
    allowedUserIds: ["owner-1"],
  });
  assert.ok(
    bundle.aliases
      .filter((alias) => alias.entityRef === "character:ALPHA")
      .every((alias) => alias.access.visibility === "restricted"),
  );
});

test("claim 값 변경은 같은 logical identity의 successor로 연결된다", () => {
  const first = buildLoreProjection(snapshot()).claims.find(
    (claim) => claim.predicate === "identity.role",
  );
  const changed = snapshot();
  changed.characters[0].role = "감독관";
  const second = buildLoreProjection(changed).claims.find(
    (claim) => claim.predicate === "identity.role",
  );
  assert.ok(first);
  assert.ok(second);
  assert.equal(loreClaimLogicalKey(first), loreClaimLogicalKey(second));
  assert.notEqual(first.claimId, second.claimId);
});

test("미해결 explicit wiki link는 edge를 추측하지 않고 경고", () => {
  const input = snapshot();
  input.wikiPages[0].content = "[[존재하지 않는 문서]]";
  const bundle = buildLoreProjection(input);
  assert.match(bundle.warnings[0], /unresolved wiki link/);
  assert.equal(
    bundle.edges.some(
      (edge) =>
        edge.fromRef === "wiki:black-pyramid" && edge.relation === "references",
    ),
    false,
  );
});

test("typed explicit link는 renderer와 같은 kind로 해석", () => {
  const input = snapshot();
  input.wikiPages[0].content = [
    "[[personnel:ALPHA|알파]]",
    "[[report:SESSION-1|작전 보고서 1]]",
    "[[catalog:sample-item|샘플]]",
    "[[wiki:black-pyramid|블랙 피라미드]]",
  ].join("\n");

  const bundle = buildLoreProjection(input);
  const edges = new Set(bundle.edges.map(loreEdgeLogicalKey));
  assert.ok(edges.has("wiki:black-pyramid|references|character:ALPHA"));
  assert.ok(edges.has("wiki:black-pyramid|references|report:SESSION-1"));
  assert.ok(edges.has("wiki:black-pyramid|references|catalog:sample-item"));
  assert.ok(edges.has("wiki:black-pyramid|references|wiki:black-pyramid"));
  assert.equal(bundle.warnings.length, 0);
});

test("검색 태그는 explicit link identity로 오인하지 않음", () => {
  const input = snapshot();
  input.wikiPages[0].content = "[[본부]]";

  const bundle = buildLoreProjection(input);
  assert.match(bundle.warnings[0], /unresolved wiki link/);
  assert.equal(
    bundle.edges.some(
      (edge) =>
        edge.fromRef === "wiki:black-pyramid" &&
        edge.toRef === "wiki:black-pyramid",
    ),
    false,
  );
});

test("graph ref에 쓸 수 없는 legacy codename도 실제 identity로 관계를 해석한다", () => {
  const input = snapshot();
  input.characters.push({
    _id: "character-legacy",
    codename: "LEE DONGSIK",
    type: "AGENT",
    role: "현장 요원",
    isPublic: true,
    lore: {
      name: "이동식",
      nickname: "GP03-RX780",
    },
    createdAt,
    updatedAt: createdAt,
  });
  input.characters[0].lore.relations = [
    { targetCodename: "LEE DONGSIK" },
  ];
  input.sessionReports[0].relatedPersonnelCodenames = ["LEE DONGSIK"];
  input.wikiPages[0].content = "[[personnel:LEE DONGSIK|이동식]]";

  const bundle = buildLoreProjection(input);
  const legacy = bundle.searchDocuments.find((document) =>
    document.aliases.includes("LEE DONGSIK"),
  );
  assert.equal(legacy?.entityRef, "character:character-legacy");
  const edges = new Set(bundle.edges.map(loreEdgeLogicalKey));
  assert.ok(
    edges.has(
      "character:ALPHA|related-to|character:character-legacy",
    ),
  );
  assert.ok(
    edges.has(
      "report:SESSION-1|mentions|character:character-legacy",
    ),
  );
  assert.ok(
    edges.has(
      "wiki:black-pyramid|references|character:character-legacy",
    ),
  );
  assert.equal(bundle.warnings.length, 0);
});
