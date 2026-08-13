import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("메인 캐릭터 인벤토리만 미스터비스트 복권 사용을 허용한다", async () => {
  const page = await readWeb(
    "app/(erp)/erp/inventory/[characterId]/page.tsx",
  );

  assert.match(page, /findMainCharacterDisplayLiteByOwnerCached/);
  assert.match(
    page,
    /mainCharacter !== null && String\(mainCharacter\._id\) === characterId/,
  );
  assert.match(
    page,
    /variant="personal"[\s\S]*canUseMrBeastLottery=\{canUseMrBeastLottery\}/,
  );
  assert.doesNotMatch(
    page,
    /variant="shared"[\s\S]*canUseMrBeastLottery=\{canUseMrBeastLottery\}/,
  );
});

test("복권 인벤토리 버튼은 기존 원장 기반 사용·긁기 흐름을 재사용한다", async () => {
  const client = await readWeb(
    "app/(erp)/erp/inventory/[characterId]/InventoryClient.tsx",
  );

  assert.match(client, /entry\.slug === MRBEAST_LOTTERY_SLUG/);
  assert.match(client, /useStartMrBeastLotteryClaim\(\)/);
  assert.match(client, /useShopLotteryState\(\{/);
  assert.match(client, /expectedCharacterId: characterId/);
  assert.match(client, /className=\{styles\.equipButton\}[\s\S]*"사용"/);
  assert.match(client, /<MrBeastLotteryModal[\s\S]*claim=\{lotteryClaim\}/);
  assert.match(client, /pendingLotteryClaim[\s\S]*복권 이어하기/);
  assert.match(client, /void lotteryQuery\.refetch\(\)/);
  assert.match(client, /void inventoryQuery\.refetch\(\)/);
});

test("복권 사용은 화면 캐릭터를 서버 mutation과 캐시 무효화에 바인딩한다", async () => {
  const [route, mutations] = await Promise.all([
    readWeb("app/api/erp/shop/lottery/route.ts"),
    readWeb("hooks/mutations/useShopMutation.ts"),
  ]);

  assert.match(
    route,
    /ObjectId\.isValid\(expectedCharacterId\)[\s\S]*characterId !== expectedCharacterId/,
  );
  assert.match(
    route,
    /payload: \{ action: "start-or-resume", expectedCharacterId, ticketSlug \}/,
  );
  assert.match(
    mutations,
    /body: JSON\.stringify\(\{[\s\S]*expectedCharacterId: input\.expectedCharacterId/,
  );
  assert.match(
    mutations,
    /inventoryKeys\.byCharacter\(input\.expectedCharacterId\)/,
  );
  assert.match(
    mutations,
    /useRevealMrBeastLotteryClaim[\s\S]*inventoryKeys\.all/,
  );
});
