import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("활성 복권 이벤트는 소다·복권 이미지와 일일 한도를 포함한 포스터를 노출한다", async () => {
  const [client, styles, queries, mutations, checkout, poster] =
    await Promise.all([
    readWeb("app/(erp)/erp/shop/ShopClient.tsx"),
    readWeb("app/(erp)/erp/shop/page.module.css"),
    readWeb("hooks/queries/useShopQuery.ts"),
    readWeb("hooks/mutations/useShopMutation.ts"),
    readWeb("app/api/erp/shop/checkout/route.ts"),
    stat(
      new URL(
        "public/assets/shop/events/mrbeast-soda-lottery-poster.png",
        WEB_ROOT,
      ),
    ),
  ]);

  assert.match(client, /lotteryState\?\.active/);
  assert.match(client, /mrbeast-soda-lottery-poster\.png/);
  assert.match(client, /assets\/shop\/items\/mrbeast_soda\.png/);
  assert.match(client, /assets\/shop\/events\/mrbeast-lottery-transparent\.png/);
  assert.match(client, /사용자당 하루 최대 10개/);
  assert.match(client, /0등 100,000 CR/);
  assert.match(styles, /\.lotteryPromotion/);
  assert.match(queries, /MRBEAST_SODA_DAILY_LIMIT_EXCEEDED/);
  assert.match(mutations, /expectsLotteryTickets\?: boolean/);
  assert.match(mutations, /idempotencyKey: string/);
  assert.match(mutations, /"Idempotency-Key": idempotencyKey/);
  assert.match(client, /retainIdempotencyOperation/);
  assert.match(client, /checkoutOperationRef/);
  assert.match(
    client,
    /checkoutFingerprint = JSON\.stringify\(\{ items \}\)[\s\S]*retainIdempotencyOperation\([\s\S]*"shop-checkout"[\s\S]*checkoutFingerprint/,
  );
  assert.match(
    client,
    /expectsLotteryTickets: currentLotteryExpectation[\s\S]*idempotencyKey: operation\.key[\s\S]*expectsLotteryTickets: operation\.expectsLotteryTickets/,
  );
  assert.match(
    client,
    /onSuccess:[\s\S]*checkoutOperationRef\.current\?\.key === operation\.key[\s\S]*checkoutOperationRef\.current = null/,
  );
  assert.match(
    client,
    /err\.code === "LOTTERY_DISABLED"[\s\S]*checkoutOperationRef\.current\?\.key === operation\.key[\s\S]*checkoutOperationRef\.current = null/,
  );
  assert.match(
    client,
    /const currentLotteryExpectation =[\s\S]*lotteryState\?\.active === true[\s\S]*mrbeast_soda/,
  );
  assert.match(
    checkout,
    /payload: \{[\s\S]*items: normalizedItems[\s\S]*expectsLotteryTickets \? \{ expectsLotteryTickets: true \} : \{\}[\s\S]*run: async \(mongoSession\) => \{[\s\S]*fenceActiveMrBeastLotteryConfigForGrant\([\s\S]*expectsLotteryTickets[\s\S]*!lotteryEventUnchanged[\s\S]*throw new ShopLotteryStateChangedError/,
  );
  assert.match(
    checkout,
    /err instanceof ShopLotteryStateChangedError[\s\S]*code: "LOTTERY_DISABLED"/,
  );
  assert.ok(poster.size > 0, "생성된 이벤트 포스터 파일이 비어 있으면 안 된다");
});
