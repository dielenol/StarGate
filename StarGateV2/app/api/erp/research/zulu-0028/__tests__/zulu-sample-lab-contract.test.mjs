import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DB_MODULE = new URL(
  "../../../../../../lib/db/zulu-sample-lab.ts",
  import.meta.url,
);
const DOMAIN_MODULE = new URL(
  "../../../../../../lib/research/zulu-sample-lab.ts",
  import.meta.url,
);
const SUBMIT_ROUTE = new URL("../submit/route.ts", import.meta.url);
const EXTRACT_ROUTE = new URL("../extract/route.ts", import.meta.url);
const QUERY_HOOK = new URL(
  "../../../../../../hooks/queries/useResearchQuery.ts",
  import.meta.url,
);
const MUTATION_HOOK = new URL(
  "../../../../../../hooks/mutations/useResearchMutation.ts",
  import.meta.url,
);
const CLIENT = new URL(
  "../../../../../../app/(erp)/erp/research/ResearchClient.tsx",
  import.meta.url,
);
const XENO_GUIDE = new URL(
  "../../../../../../app/(erp)/erp/research/XenoGuide.tsx",
  import.meta.url,
);

test("레시피 registry는 확정된 ZULU-0028 라인만 등록한다", async () => {
  const source = await readFile(DOMAIN_MODULE, "utf8");
  const { getZuluExtractionRecipe } = await import(DOMAIN_MODULE);

  assert.match(source, /export const ZULU_EXTRACTION_RECIPES/);
  assert.match(source, /"ZULU-0028": \{/);
  assert.match(source, /creditCost: 500/);
  assert.match(source, /quantity: 1/);
  assert.match(source, /category: "SPECIAL"/);
  assert.match(source, /category: "MATERIAL"/);
  assert.match(source, /initialQuantity: 1/);
  assert.match(source, /extractionQuantity: 1/);
  assert.match(
    source,
    /"\/assets\/catalog\/special\/zulu-0028-contained-entity\.webp"/,
  );
  assert.match(
    source,
    /"\/assets\/catalog\/samples\/broken-syllable\.webp"/,
  );
  assert.match(source, /getZuluExtractionRecipe/);
  assert.match(source, /Object\.hasOwn\(ZULU_EXTRACTION_RECIPES, recipeId\)/);
  assert.match(source, /isValidRecipe\(recipeId, recipe\)/);
  assert.match(source, /return null/);
  assert.doesNotMatch(source, /ZULU-0113|검열된 비명 왕관/);
  assert.equal(getZuluExtractionRecipe("ZULU-0028")?.extraction.creditCost, 500);
  assert.equal(getZuluExtractionRecipe("ZULU-0113"), null);
  assert.equal(getZuluExtractionRecipe("toString"), null);
});

test("GM 최초 제출은 멱등 operation 안에서 권한을 재검증하고 공용 수량을 조건부 차감한다", async () => {
  const [route, db] = await Promise.all([
    readFile(SUBMIT_ROUTE, "utf8"),
    readFile(DB_MODULE, "utf8"),
  ]);

  const idempotencyIndex = route.indexOf("readIdempotencyKey(request)");
  const operationIndex = route.indexOf(
    "executeEconomicOperationResult<UnlockZuluSampleLineResponse>",
  );
  const runIndex = route.indexOf("run: async (mongoSession)", operationIndex);
  const unlockIndex = route.indexOf("unlockZuluSampleLine({", runIndex);
  assert.ok(idempotencyIndex >= 0, "멱등 키 검증 누락");
  assert.ok(operationIndex > idempotencyIndex, "검증 전 operation 실행 금지");
  assert.ok(runIndex > operationIndex, "transaction callback 누락");
  assert.ok(unlockIndex > runIndex, "transaction 밖 라인 개방 금지");

  const gmIndex = db.indexOf("requireActiveGm(args.actor, args.session)");
  const itemIndex = db.indexOf("resolveLabItems(recipe, args.session)", gmIndex);
  const decrementIndex = db.indexOf("removeSharedItem(", itemIndex);
  const insertIndex = db.indexOf("lines.insertOne(line, { session: args.session })");
  const rewardIndex = db.indexOf("addSharedItem(", insertIndex);
  assert.ok(gmIndex >= 0, "transaction 내부 ACTIVE GM 재검증 누락");
  assert.ok(itemIndex > gmIndex, "권한 재검증 전 아이템 mutation 금지");
  assert.ok(decrementIndex > itemIndex, "공용 격리 개체 차감 누락");
  assert.ok(insertIndex > decrementIndex, "라인 유일 상태 저장 누락");
  assert.ok(rewardIndex > insertIndex, "최초 샘플 지급 누락");
  assert.match(db, /quantity: \{ \$gte: quantity \}/);
  assert.match(db, /recipe\.source\.quantity/);
  assert.match(db, /recipe\.output\.initialQuantity/);
  assert.match(db, /source\.category !== recipe\.source\.category/);
  assert.match(db, /sample\.category !== recipe\.output\.category/);
  assert.match(db, /returnDocument: "after", session/);
  assert.match(db, /error instanceof MongoServerError && error\.code === 11000/);
  assert.match(db, /"LINE_ALREADY_UNLOCKED"/);
});

test("플레이어 추출은 MAIN 소유권·잔액을 transaction 안에서 재검증하고 PURCHASE와 공용 지급을 묶는다", async () => {
  const [route, db] = await Promise.all([
    readFile(EXTRACT_ROUTE, "utf8"),
    readFile(DB_MODULE, "utf8"),
  ]);

  assert.match(route, /findMainCharacterByOwner\(session\.user\.id\)/);
  assert.match(
    route,
    /executeEconomicOperationResult<ExtractZuluSampleResponse>/,
  );
  assert.match(route, /run: async \(mongoSession\)/);
  assert.match(route, /extractZuluSample\(\{[\s\S]*session: mongoSession/);

  const lineIndex = db.indexOf("LINE_LOCKED");
  const ownerIndex = db.indexOf("requireActiveMainAgent({", lineIndex);
  const creditIndex = db.indexOf("debit = await addCredit({", ownerIndex);
  const purchaseIndex = db.indexOf('type: "PURCHASE"', creditIndex);
  const creditSessionIndex = db.indexOf("session: args.session", purchaseIndex);
  const grantIndex = db.indexOf("addSharedItem(", creditSessionIndex);
  assert.ok(ownerIndex > lineIndex, "라인 개방 확인 뒤 소유권 재검증 누락");
  assert.ok(creditIndex > ownerIndex, "소유권 재검증 전 차감 금지");
  assert.ok(purchaseIndex > creditIndex, "PURCHASE 원장 누락");
  assert.ok(creditSessionIndex > purchaseIndex, "크레딧 transaction session 누락");
  assert.ok(grantIndex > creditSessionIndex, "결제와 공용 지급 원자성 누락");
  assert.match(db, /status: "ACTIVE"/);
  assert.match(db, /type: "AGENT"/);
  assert.match(db, /\$or: \[\{ tier: "MAIN" \}, \{ tier: \{ \$exists: false \} \}\]/);
  assert.match(db, /amount: -recipe\.extraction\.creditCost/);
  assert.match(db, /quantity: recipe\.output\.extractionQuantity/);
});

test("Query 훅은 연구 상태를 조회하고 mutation 성공 시 관련 캐시만 무효화한다", async () => {
  const [query, mutation] = await Promise.all([
    readFile(QUERY_HOOK, "utf8"),
    readFile(MUTATION_HOOK, "utf8"),
  ]);

  assert.match(query, /queryKey: researchKeys\.zulu0028/);
  assert.match(query, /cache: "no-store"/);
  assert.match(mutation, /"Idempotency-Key": input\.operationId/);
  assert.match(mutation, /retry: \(failureCount, error\)/);
  assert.match(mutation, /researchKeys\.all/);
  assert.match(mutation, /inventoryKeys\.all/);
  assert.match(mutation, /adminInventoryOverviewKeys\.all/);
  assert.match(mutation, /creditKeys\.all/);
  assert.doesNotMatch(mutation, /router\.refresh/);
});

test("연구 UI는 등록 레시피만 실행하고 XENO 이미지 실패 시 안전한 fallback을 표시한다", async () => {
  const [source, xeno] = await Promise.all([
    readFile(CLIENT, "utf8"),
    readFile(XENO_GUIDE, "utf8"),
  ]);

  assert.match(source, /src=\{data\.source\.image\}/);
  assert.match(source, /src=\{data\.sample\.image\}/);
  assert.match(source, /hasRegisteredRecipeContract\(data\)/);
  assert.match(source, /recipe\.id === ZULU_SAMPLE_LINE_ID/);
  assert.match(source, /data\.source\.slug === recipe\.source\.slug/);
  assert.match(source, /data\.sample\.slug === recipe\.output\.slug/);
  assert.match(source, /data\.extractionCost === recipe\.extraction\.creditCost/);
  assert.match(source, /연구 작업은 실행되지 않습니다/);
  assert.match(source, /data\.recipe\.sourceQuantity/);
  assert.match(source, /data\.recipe\.extractionOutputQuantity/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /retainIdempotencyOperation/);
  assert.match(source, /clearRetainedIdempotencyOperation/);
  assert.match(source, /useUnlockZuluSampleLine/);
  assert.match(source, /useExtractZuluSample/);
  assert.match(xeno, /"\/assets\/npcs\/Xeno-profile\.webp"/);
  assert.match(xeno, /onError=\{\(\) => setImageUnavailable\(true\)\}/);
  assert.match(xeno, /xenoPortraitFallback/);
  assert.match(xeno, /<h3 id="xeno-guide-name">제노<\/h3>/);
  assert.match(xeno, /영문 표기·신원·등급·\s*소속은 아직 등록되지 않았습니다/);
  assert.doesNotMatch(xeno, />XENO</);
  assert.doesNotMatch(xeno, /agentLevel|factionCode|institutionCode/);
});
