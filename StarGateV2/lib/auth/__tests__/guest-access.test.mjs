import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ERP_GUEST_USER,
  GUEST_READ_ONLY_ERROR_CODE,
  getOwnedDataViewerId,
  isGuestRestrictedErpRequest,
} from "../guest.ts";
import {
  readAuthSecrets,
  resolveAuthSessionCookieName,
} from "../session-runtime.ts";
import {
  filterAgentCharacterCardForGuest,
  filterCharacterForGuest,
  filterCharacterForListForGuest,
  getEffectivePersonnelClearance,
} from "../../personnel.ts";
import { canViewPersonalInventory } from "../access-policy.ts";
import { projectSessionsForGuest } from "../../session-guest-view.ts";

test("게스트 신원은 U 등급이며 owner 조회에서는 구조적으로 null 처리한다", () => {
  assert.equal(ERP_GUEST_USER.role, "U");
  assert.equal(ERP_GUEST_USER.isGuest, true);
  assert.doesNotMatch(ERP_GUEST_USER.id, /^[a-f\d]{24}$/i);
  assert.equal(getOwnedDataViewerId(ERP_GUEST_USER), null);
  assert.equal(
    getOwnedDataViewerId({ id: "real-user", isGuest: false }),
    "real-user",
  );
  assert.equal(GUEST_READ_ONLY_ERROR_CODE, "GUEST_READ_ONLY");
});

test("게스트 합성 ID와 같은 ownerId가 있어도 소유자 권한으로 승격되지 않는다", () => {
  const character = {
    ownerId: ERP_GUEST_USER.id,
    isPublic: true,
    type: "AGENT",
  };
  assert.equal(
    getEffectivePersonnelClearance(null, "U", character),
    "U",
  );
  assert.equal(canViewPersonalInventory(null, "U", character), false);
});

test("게스트 신원조회 목록은 clearance override 운영 메타를 제거한다", () => {
  const projected = filterCharacterForListForGuest({
    _id: "character-1",
    codename: "TEST",
    type: "NPC",
    role: "테스트",
    previewImage: "",
    isPublic: true,
    clearanceOverrides: { identity: "GM", meta: "V" },
    lore: {
      name: "실명",
      nickname: "별칭",
      loreTags: ["공개"],
      mainImage: "/secret.png",
    },
  });

  assert.equal(projected.clearanceOverrides, undefined);
  assert.equal(projected.lore.name, "[CLASSIFIED]");
  assert.equal(projected.lore.mainImage, "");
});

test("ERP 조회는 허용하고 모든 비조회 메서드는 제한한다", () => {
  assert.equal(isGuestRestrictedErpRequest("/api/erp/wiki", "GET"), false);
  assert.equal(isGuestRestrictedErpRequest("/api/erp/wiki", "HEAD"), false);
  assert.equal(isGuestRestrictedErpRequest("/api/erp/wiki", "OPTIONS"), false);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(isGuestRestrictedErpRequest("/api/erp/wiki", method), true);
  }
});

test("GET 기반 계정 연동 흐름과 ERP 밖 API 경계를 구분한다", () => {
  assert.equal(
    isGuestRestrictedErpRequest(
      "/api/erp/account/discord/link/start",
      "GET",
    ),
    true,
  );
  assert.equal(
    isGuestRestrictedErpRequest(
      "/api/erp/account/discord/link/callback",
      "GET",
    ),
    true,
  );
  assert.equal(
    isGuestRestrictedErpRequest(
      "/api/erp/account/discord/link/start/",
      "GET",
    ),
    true,
  );
  assert.equal(
    isGuestRestrictedErpRequest(
      "/api/erp/equipment-shop/license-test",
      "GET",
    ),
    true,
  );
  assert.equal(
    isGuestRestrictedErpRequest(
      "/api/erp/characters/507f1f77bcf86cd799439011/edit-quota",
      "GET",
    ),
    true,
  );
  assert.equal(isGuestRestrictedErpRequest("/api/erplease", "POST"), false);
  assert.equal(isGuestRestrictedErpRequest("/api/contact", "POST"), false);
});

test("proxy는 게스트 JWT를 검증하고 ERP API 쓰기를 공통 차단한다", async () => {
  const source = await readFile(new URL("../../../proxy.ts", import.meta.url), "utf8");
  assert.match(source, /getToken\(\{/);
  assert.match(source, /resolveAuthSessionCookieName\(\{/);
  assert.match(source, /authToken\.token\.isGuest === true/);
  assert.match(source, /headers\.append\("Vary", "Cookie"\)/);
  assert.match(source, /status: 403/);
  assert.match(source, /"\/api\/erp\/:path\*"/);
});

test("Auth.js secret rotation과 secure cookie 선택 순서를 공유한다", () => {
  assert.deepEqual(
    readAuthSecrets({
      AUTH_SECRET: "base",
      AUTH_SECRET_1: "old",
      AUTH_SECRET_2: "newer",
      AUTH_SECRET_3: "newest",
    }),
    ["newest", "newer", "old", "base"],
  );
  assert.equal(
    resolveAuthSessionCookieName({
      authUrl: "https://erp.example.com",
      forwardedProto: "http",
      requestProtocol: "http:",
    }),
    "__Secure-authjs.session-token",
  );
  assert.equal(
    resolveAuthSessionCookieName({
      forwardedProto: "https, http",
      requestProtocol: "http:",
    }),
    "__Secure-authjs.session-token",
  );
  assert.equal(
    resolveAuthSessionCookieName({ requestProtocol: "http:" }),
    "authjs.session-token",
  );
});

test("게스트 캐릭터 투영은 계정 연결과 상위 clearance 정보를 제거한다", () => {
  const card = {
    _id: "character-1",
    codename: "TEST_AGENT",
    type: "AGENT",
    role: "요원",
    agentLevel: "H",
    previewImage: "/agent.png",
    ownerId: "user-1",
    isPublic: true,
    clearanceOverrides: { identity: "GM", meta: "U" },
    lore: {
      name: "실명",
      nickname: "별칭",
      loreTags: ["내부"],
    },
    play: {
      className: "군인",
      hp: 50,
      hpDelta: 5,
      san: 40,
      sanDelta: 4,
      def: 30,
      defDelta: 3,
      atk: 20,
      atkDelta: 2,
    },
  };

  const projectedCard = filterAgentCharacterCardForGuest(card);
  assert.equal(projectedCard.ownerId, null);
  assert.equal(projectedCard.clearanceOverrides, undefined);
  assert.equal(projectedCard.lore.name, "[CLASSIFIED]");
  assert.equal(projectedCard.lore.nickname, "[CLASSIFIED]");
  assert.equal(projectedCard.play.hp, 0);
  assert.equal(projectedCard.play.atk, 0);
  assert.equal(card.ownerId, "user-1");

  const character = {
    ...card,
    clearanceOverrides: undefined,
    source: "manual",
    loreMd: "internal source",
    rawText: "internal raw text",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    lore: {
      name: "실명",
      gender: "미상",
      age: "미상",
      height: "미상",
      weight: "미상",
      appearance: "외형",
      personality: "성격",
      background: "배경",
      quote: "대사",
      mainImage: "/agent.png",
    },
    play: {
      ...card.play,
      points: 3,
      abilityType: "기밀",
      weaponTraining: ["기밀"],
      skillTraining: ["기밀"],
      credit: "기밀",
      equipment: [{ name: "기밀 장비" }],
      abilities: [{ slot: "P", name: "기밀 능력" }],
    },
  };
  const projectedDetail = filterCharacterForGuest(character);
  assert.equal(projectedDetail.ownerId, null);
  assert.equal(projectedDetail.loreMd, undefined);
  assert.equal(projectedDetail.rawText, undefined);
  assert.equal(projectedDetail.source, undefined);
  assert.equal(projectedDetail.play.hp, 0);
  assert.deepEqual(projectedDetail.play.abilities, []);
});

test("게스트 세션 투영은 일정과 익명 집계만 남긴다", () => {
  const sessions = [
    {
      _id: "session-1",
      guildId: "guild-secret",
      channelId: "channel-secret",
      messageId: "message-secret",
      title: "공개 일정",
      targetDateTime: "2026-08-10T00:00:00.000Z",
      closeDateTime: "2026-08-09T00:00:00.000Z",
      status: "OPEN",
      participants: [
        { status: "YES", displayName: "회원", codename: "AGENT" },
      ],
      counts: { yes: 1, no: 0 },
      myRsvp: "YES",
      source: "registra",
    },
  ];

  const [projected] = projectSessionsForGuest(sessions);
  assert.equal(projected.title, "공개 일정");
  assert.deepEqual(projected.counts, { yes: 1, no: 0 });
  assert.deepEqual(projected.participants, []);
  assert.equal(projected.myRsvp, null);
  assert.equal(projected.guildId, "");
  assert.equal(projected.channelId, "");
  assert.equal(projected.messageId, "");
  assert.equal(sessions[0].participants.length, 1);
});

test("게스트 상점 조회는 일일 재고 갱신을 건너뛴다", async () => {
  const [builder, page, route] = await Promise.all([
    readFile(
      new URL(
        "../../../app/(erp)/erp/shop/_data.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/(erp)/erp/shop/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/api/erp/shop/catalog/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(builder, /options\.readOnly\s*\?\s*getAllDailyStocks\(\)/);
  assert.match(page, /readOnly: session\.user\.isGuest/);
  assert.match(route, /readOnly: session\.user\.isGuest/);
});

test("개인 데이터 GET 경계는 게스트 합성 ID 대신 nullable owner ID를 사용한다", async () => {
  const [dashboard, inventory, lore, research, researchLab] = await Promise.all([
    readFile(new URL("../../erp/dashboard.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../app/api/erp/inventory/[characterId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../../db/lore-search.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../app/api/erp/equipment-shop/research/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/api/erp/research/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(dashboard, /if \(userId === null\)/);
  assert.match(inventory, /getOwnedDataViewerId\(session\.user\)/);
  assert.match(lore, /userId: string \| null/);
  assert.match(research, /session\.ownedDataViewerId/);
  assert.match(researchLab, /getOwnedDataViewerId\(session\.user\)/);
});
