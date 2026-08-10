import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ERP_GUEST_USER,
  isMemberErpViewer,
} from "../guest.ts";
import {
  filterAgentCharacterCardForClient,
  filterAgentCharacterCardForGuest,
} from "../../personnel.ts";
import { buildGuestEquipmentResearchOverviewResponse } from "../../equipment-shop/guest-research.ts";
import { toPublicMasterItemDto } from "../../inventory/public-master-item.ts";
import { toWikiPageClient } from "../../wiki/client-page.ts";

test("게스트 세션은 계정 회원 전용 콘텐츠의 인증 주체가 아니다", () => {
  assert.equal(isMemberErpViewer(ERP_GUEST_USER), false);
  assert.equal(isMemberErpViewer({ isGuest: false }), true);
  assert.equal(isMemberErpViewer({}), true);
});

test("캐릭터 카드의 clearance override는 모든 클라이언트 응답에서 제거한다", () => {
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

  const memberCard = filterAgentCharacterCardForClient(card);
  const guestCard = filterAgentCharacterCardForGuest(card);

  assert.equal(memberCard.clearanceOverrides, undefined);
  assert.equal(memberCard.ownerId, "user-1");
  assert.equal(guestCard.clearanceOverrides, undefined);
  assert.equal(guestCard.ownerId, null);
  assert.deepEqual(card.clearanceOverrides, { identity: "GM", meta: "U" });
});

test("위키 클라이언트 DTO는 작성자 계정 ID를 직렬화하지 않는다", () => {
  const page = toWikiPageClient({
    slug: "public-page",
    title: "공개 문서",
    content: "본문",
    category: "기록",
    tags: ["공개"],
    isPublic: true,
    authorId: "private-user-id",
    authorName: "기록관",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
  });

  assert.equal("authorId" in page, false);
  assert.equal(page.authorName, "기록관");
  assert.equal(page.createdAt, "2026-08-01T00:00:00.000Z");
});

test("공개 카탈로그 DTO는 표시 필드만 남기고 운영 메타를 제거한다", () => {
  const item = toPublicMasterItemDto({
    name: "테스트 장비",
    category: "WEAPON",
    description: "표시 설명",
    price: 100,
    damage: "1D6",
    effect: "공개 효과",
    isAvailable: true,
    isPublic: true,
    source: "manual",
    authorId: "private-user-id",
    authorName: "운영자",
    loreMd: "운영 원문",
    shopMeta: { stockMin: 1, stockMax: 2, appearRate: 1 },
    workshop: {
      requestId: "request-id",
      ownerId: "owner-id",
      characterId: "character-id",
      characterCodename: "TEST",
      specialistCodename: "TEMPER",
      generation: 1,
      lifecycle: "operational",
      balanceStatus: "approved",
    },
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
  });

  assert.equal(item.name, "테스트 장비");
  for (const field of [
    "source",
    "authorId",
    "authorName",
    "loreMd",
    "shopMeta",
    "workshop",
    "createdAt",
    "updatedAt",
  ]) {
    assert.equal(field in item, false, `${field} must not be public`);
  }
});

test("게스트 연구 응답은 구조만 유지하고 운영 원장을 비운다", () => {
  const overview = buildGuestEquipmentResearchOverviewResponse();

  assert.ok(overview.tree.length > 0);
  assert.deepEqual(overview.projects, []);
  assert.deepEqual(overview.fundingPools, []);
  assert.deepEqual(overview.recentContributions, []);
  assert.deepEqual(overview.contributionRankings, []);
});

test("API와 RSC 소비자가 동일한 게스트 공개 경계를 사용한다", async () => {
  const root = new URL("../../../", import.meta.url);
  const paths = {
    reportListApi: "app/api/erp/session-reports/route.ts",
    reportDetailApi: "app/api/erp/session-reports/[id]/route.ts",
    reportListPage: "app/(erp)/erp/sessions/report/page.tsx",
    reportDetailPage: "app/(erp)/erp/sessions/report/[id]/page.tsx",
    loreSearch: "lib/db/lore-search.ts",
    personnelApi: "app/api/erp/personnel/[id]/route.ts",
    personnelPage: "app/(erp)/erp/personnel/[id]/page.tsx",
    wikiApi: "app/api/erp/wiki/[id]/route.ts",
    wikiPage: "app/(erp)/erp/wiki/[id]/page.tsx",
    catalogApi: "app/api/erp/inventory/items/route.ts",
    catalogPage: "app/(erp)/erp/wiki/catalog/[category]/page.tsx",
    researchApi: "app/api/erp/equipment-shop/research/route.ts",
    researchPageData: "app/(erp)/erp/equipment-shop/_data.ts",
    characterApi: "app/api/erp/characters/route.ts",
    characterPage: "app/(erp)/erp/characters/page.tsx",
  };
  const source = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([key, path]) => [
        key,
        await readFile(new URL(path, root), "utf8"),
      ]),
    ),
  );

  for (const key of [
    "reportListApi",
    "reportDetailApi",
    "reportListPage",
    "reportDetailPage",
  ]) {
    assert.match(source[key], /isMemberErpViewer/u);
  }
  assert.match(source.reportListApi, /\{ reports: \[\] \}/u);
  assert.match(source.reportDetailApi, /status: 404/u);
  assert.match(source.loreSearch, /isAuthenticated: viewer\.isAuthenticated/u);
  assert.ok(
    source.loreSearch.match(/viewer\.isAuthenticated\s*\?/gu)?.length >= 2,
  );
  for (const key of ["personnelApi", "personnelPage"]) {
    assert.match(source[key], /filterCharacterForGuest/u);
  }
  for (const key of ["wikiApi", "wikiPage"]) {
    assert.match(source[key], /toWikiPageClient/u);
  }
  for (const key of ["catalogApi", "catalogPage"]) {
    assert.match(source[key], /toPublicMasterItemDto/u);
  }
  for (const key of ["researchApi", "researchPageData"]) {
    assert.match(source[key], /buildGuestEquipmentResearchOverviewResponse/u);
  }
  for (const key of ["characterApi", "characterPage"]) {
    assert.match(source[key], /filterAgentCharacterCardForClient/u);
  }
});
