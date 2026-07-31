import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("GM 상점 영역에서만 복권 이벤트 설정 모달을 연다", async () => {
  const client = await readWeb("app/(erp)/erp/shop/ShopClient.tsx");
  const gmControlsStart = client.indexOf("{isGM ? (");
  const lotteryButton = client.indexOf("복권 이벤트 · GM");
  const gmControlsEnd = client.indexOf(") : null}", lotteryButton);

  assert.notEqual(gmControlsStart, -1);
  assert.ok(lotteryButton > gmControlsStart);
  assert.ok(gmControlsEnd > lotteryButton);
  assert.match(client, /lotteryAdminOpen[\s\S]*ShopLotteryAdminModal/);
});

test("GM 복권 설정은 전용 query key와 PATCH 후 공개 상태 무효화를 사용한다", async () => {
  const [queries, mutations] = await Promise.all([
    readWeb("hooks/queries/useShopQuery.ts"),
    readWeb("hooks/mutations/useShopMutation.ts"),
  ]);

  assert.match(queries, /lotteryAdmin: \["shop", "lottery", "admin"\]/);
  assert.match(queries, /fetch\("\/api\/erp\/shop\/admin\/lottery"/);
  assert.match(queries, /useShopLotteryAdminConfig/);
  assert.match(mutations, /method: "PATCH"/);
  assert.match(mutations, /expectedVersion: number/);
  assert.match(
    mutations,
    /setQueryData\(shopKeys\.lotteryAdmin, state\)/,
  );
  assert.match(
    mutations,
    /invalidateQueries\(\{ queryKey: shopKeys\.lottery \}\)/,
  );
  assert.doesNotMatch(`${queries}\n${mutations}`, /router\.refresh/);
});

test("GM 모달은 KST 기간·준비 상태·버전 충돌을 명시한다", async () => {
  const [component, css] = await Promise.all([
    readWeb("app/(erp)/erp/shop/ShopLotteryAdminModal.tsx"),
    readWeb("app/(erp)/erp/shop/ShopLotteryAdminModal.module.css"),
  ]);

  assert.match(component, /시작 시각 · KST/);
  assert.match(component, /종료 시각 · KST/);
  assert.match(component, /type="datetime-local"/);
  assert.match(component, /expectedVersion: config\.version/);
  assert.match(component, /error\.status === 409/);
  assert.match(component, /config\.readiness\.indexesReady/);
  assert.match(component, /config\.readiness\.masterItemReady/);
  assert.match(component, /재배포가 필요하지 않습니다/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[0-3])px/);
});
