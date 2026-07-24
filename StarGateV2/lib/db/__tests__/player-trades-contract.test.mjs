import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const crud = fs.readFileSync(
  new URL("../../../../packages/shared-db/src/crud/trades.ts", import.meta.url),
  "utf8",
);
const createRoute = fs.readFileSync(
  new URL("../../../app/api/erp/trades/route.ts", import.meta.url),
  "utf8",
);
const actionRoute = fs.readFileSync(
  new URL(
    "../../../app/api/erp/trades/[tradeId]/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const mutations = fs.readFileSync(
  new URL("../../../hooks/mutations/useTradesMutation.ts", import.meta.url),
  "utf8",
);
const tradesClient = fs.readFileSync(
  new URL(
    "../../../app/(erp)/erp/trades/TradesClient.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("모든 거래 mutation은 멱등 경제 operation 경계를 통과한다", () => {
  assert.match(createRoute, /readIdempotencyKey\(request\)/);
  assert.match(createRoute, /executeEconomicOperationResult/);
  assert.match(actionRoute, /readIdempotencyKey\(request\)/);
  assert.match(actionRoute, /executeEconomicOperationResult/);
});

test("거래 도메인 오류는 transaction 밖에서 4xx로 변환한다", () => {
  for (const source of [createRoute, actionRoute]) {
    const transactionStart = source.indexOf("run: async (dbSession)");
    const notificationStart = source.indexOf(
      "if (!operation.replayed",
      transactionStart,
    );
    assert.ok(transactionStart >= 0 && notificationStart > transactionStart);
    assert.doesNotMatch(
      source.slice(transactionStart, notificationStart),
      /tradeErrorResult/,
    );
    assert.match(source.slice(notificationStart), /tradeErrorResult\(error\)/);
  }
});

test("동일 revision 양측 확정만 정산하고 CAS로 완료 상태를 기록한다", () => {
  assert.match(
    crud,
    /otherConfirmed[\s\S]*settleTrade\(trade, actor, session\)/,
  );
  assert.match(
    crud,
    /_id: trade\._id, status: "OPEN", revision: expectedRevision/,
  );
  assert.match(crud, /status: "COMPLETED"/);
});

test("원본 자산 전체를 검증한 뒤 mutation을 시작한다", () => {
  const initiatorValidation = crud.indexOf(
    "const initiatorValidated = await validateOwnedOffer",
  );
  const counterpartyValidation = crud.indexOf(
    "const counterpartyValidated = await validateOwnedOffer",
  );
  const firstTransfer = crud.indexOf('await transferOffer(\n    tradeId');
  assert.ok(
    initiatorValidation >= 0 &&
      counterpartyValidation > initiatorValidation &&
      firstTransfer > counterpartyValidation,
  );
  assert.doesNotMatch(
    crud.slice(
      crud.indexOf("async function validateOwnedOffer"),
      crud.indexOf("async function transferOffer"),
    ),
    /Promise\.all/,
  );
  assert.match(crud, /entry\.equipmentCharge/);
  assert.match(crud, /master\.equipmentAction/);
  assert.match(crud, /master\.isPublic === false/);
  assert.match(crud, /master\.workshop/);
  assert.match(crud, /entry\.equippedSlot/);
});

test("교환방 생성도 transaction 안에서 상대 MAIN 자격을 재검증한다", () => {
  const createOpenStart = crud.indexOf(
    "export async function createOpenPlayerTrade",
  );
  const createGiftStart = crud.indexOf(
    "export async function createAndSettleGift",
  );
  const createOpenBody = crud.slice(createOpenStart, createGiftStart);
  assert.match(
    createOpenBody,
    /validateOwnedOffer\(counterparty, EMPTY_PLAYER_TRADE_OFFER, session\)/,
  );
});

test("credit ledger 파생 키와 전체 자산 Query invalidation을 보장한다", () => {
  assert.match(crud, /credit:\$\{label\}:out/);
  assert.match(crud, /credit:\$\{label\}:in/);
  assert.match(
    crud,
    /tradeId,[\s\S]*fromCharacterId: from\.characterId,[\s\S]*toCharacterId: to\.characterId/,
  );
  for (const key of [
    "tradeKeys.all",
    "inventoryKeys.all",
    "creditKeys.all",
    "stocksKeys.holdings",
    "notificationKeys.all",
  ]) {
    assert.match(mutations, new RegExp(key.replace(".", "\\.")));
  }
});

test("새 거래 제출은 렌더 전 빠른 중복 클릭도 동기 차단한다", () => {
  assert.match(tradesClient, /const createLockedRef = useRef\(false\)/);
  assert.match(tradesClient, /const createIntentRef = useRef</);
  assert.match(tradesClient, /if \(!targetUserId \|\| createLockedRef\.current\) return/);
  assert.match(tradesClient, /createLockedRef\.current = true/);
  assert.match(
    tradesClient,
    /createIntentRef\.current\?\.fingerprint === fingerprint/,
  );
  assert.match(tradesClient, /createIntentRef\.current = null/);
  assert.match(
    tradesClient,
    /onSettled:[\s\S]*createLockedRef\.current = false/,
  );
});

test("크레딧 입력은 초기 0을 비우고 방향키만 1 CR 단위로 증감한다", () => {
  assert.match(
    tradesClient,
    /initialOffer\.credits > 0 \? String\(initialOffer\.credits\) : ""/,
  );
  assert.match(
    tradesClient,
    /event\.key !== "ArrowUp" && event\.key !== "ArrowDown"/,
  );
  assert.match(tradesClient, /current \+ direction/);
  assert.match(tradesClient, /value\.replace\(\/\^0\+\(\?=\\d\)\//);
  assert.match(tradesClient, /step="any"/);
  assert.doesNotMatch(tradesClient, /step="0\.01"/);
});

test("거래 자산은 인벤토리 표시 정보와 카드 UI를 함께 제공한다", () => {
  for (const field of [
    "category: entry.category",
    "slug: entry.slug",
    "effect: entry.effect",
    "description: entry.description",
    "previewImage: entry.previewImage",
  ]) {
    assert.match(createRoute, new RegExp(field.replace(".", "\\.")));
  }
  assert.match(tradesClient, /getConsumableItemImageSrc\(slug\)/);
  assert.match(tradesClient, /<Image/);
  assert.match(tradesClient, /styles\.assetCard/);
  assert.match(tradesClient, /전달 수량/);
});

test("거래 성공은 현재 화면을 재조회하고 완료 토스트와 입력 초기화를 제공한다", () => {
  assert.match(
    mutations,
    /queryClient\.invalidateQueries\(\{[\s\S]*queryKey: tradeKeys\.all,[\s\S]*refetchType: "active"/,
  );
  assert.match(mutations, /creditsAdminKeys\.all/);
  assert.match(tradesClient, /자산 전달이 완료되었습니다\./);
  assert.match(tradesClient, /자산 교환이 완료되었습니다\./);
  assert.match(tradesClient, /role="status"/);
  assert.match(tradesClient, /const updateMutation = useUpdateTradeMutation\(\)/);
  assert.match(tradesClient, /setEditorVersion\(\(current\) => current \+ 1\)/);
});

test("거래 작성기는 선택 상태와 처리 상태를 분리하고 큰 편집기를 접어둔다", () => {
  assert.match(tradesClient, /role="tablist"/);
  assert.match(tradesClient, /event\.key !== "ArrowLeft"/);
  assert.match(tradesClient, /className=\{styles\.offerSummaryPanel\}/);
  assert.match(tradesClient, /requireAssets/);
  assert.match(tradesClient, /submitDisabled=\{!targetUserId\}/);
  assert.match(tradesClient, /busy=\{createMutation\.isPending\}/);
  assert.match(tradesClient, /const \[isEditing, setIsEditing\] = useState\(false\)/);
  assert.match(tradesClient, /aria-expanded=\{isEditing\}/);
});
