import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../../../../", import.meta.url);
const MONOREPO_ROOT = new URL("../../../../../../../", import.meta.url);

function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

function readRepo(relativePath) {
  return readFile(new URL(relativePath, MONOREPO_ROOT), "utf8");
}

test("CENSOR-3 고정 안건은 제작 권한과 공방 집행 경계를 REGISTRAR 문체로 고정한다", async () => {
  const preset = await readWeb("lib/bureaucrat-votes/presets.ts");
  assert.match(preset, /ZULU-0028 파쇄음절탄 「CENSOR-3」 제작 승인/);
  assert.match(preset, /깨진 음절 ×3/);
  assert.match(preset, /「CENSOR-3」 ×3 제작/);
  assert.match(preset, /전용 운용자 · 네베드/);
  assert.match(preset, /패시브가 반영된 「피안의 보루」의 거리별 기본 물리 피해/);
  assert.match(preset, /방어 수단과 DEF를 무시하고 SAN을 고정 15 감소/);
  assert.match(preset, /별도의 HP 추가 피해가 아니라 SAN 감소량/);
  assert.doesNotMatch(preset, /SAN(?:을)?\s*추가/);
  assert.match(preset, /가결은 제작 권한 부여를 의미합니다/);
  assert.match(preset, /재료 차감·제작 착수·완성품 지급/);
  assert.match(preset, /공방 운영 절차에서 별도로 처리/);
});

test("ERP API는 GM·멱등 키·고정 preset만 받아 원장을 queue하고 Discord를 직접 호출하지 않는다", async () => {
  const route = await readWeb("app/api/erp/admin/bureaucrat-votes/route.ts");
  const authIndex = route.indexOf("const auth = await requireGm()");
  const keyIndex = route.indexOf("readIdempotencyKey(request)");
  const presetIndex = route.indexOf("findBureaucratVotePreset(presetKey)");
  const createIndex = route.indexOf("await createBureaucratVote(");
  assert.ok(authIndex >= 0);
  assert.ok(keyIndex > authIndex);
  assert.ok(presetIndex > keyIndex);
  assert.ok(createIndex > presetIndex);
  assert.match(route, /source: "ERP_PRESET"/);
  assert.match(route, /requestKey: `erp:\$\{guildId\}:\$\{idempotencyKey\}`/);
  assert.doesNotMatch(route, /REGISTRAR_DISCORD_BOT_TOKEN|discord\.com\/api|webhook/);
  assert.doesNotMatch(route, /removeFromInventory|creditTransactions|workshop.*action/i);
});

test("진행 중 같은 preset은 partial unique 계약으로 중복 등재를 막는다", async () => {
  const [indexes, crud] = await Promise.all([
    readRepo("packages/shared-db/src/indexes.ts"),
    readRepo("packages/shared-db/src/crud/bureaucrat-votes.ts"),
  ]);
  assert.match(indexes, /bureaucrat_votes_activePresetKey_unique/);
  assert.match(indexes, /partialFilterExpression:[\s\S]*status: "OPEN"/);
  assert.match(crud, /conflict: "ACTIVE_PRESET"/);
  assert.match(crud, /activePresetKey: presetKey/);
});

test("투표 운영 query는 진행 원장을 polling하고 mutation은 같은 query key를 무효화한다", async () => {
  const [query, mutation] = await Promise.all([
    readWeb("hooks/queries/useBureaucratVotesQuery.ts"),
    readWeb("hooks/mutations/useBureaucratVoteMutation.ts"),
  ]);
  assert.match(query, /vote\.status === "OPEN"/);
  assert.match(query, /\? 30_000/);
  assert.match(mutation, /"Idempotency-Key": input\.operationId/);
  assert.match(
    mutation,
    /invalidateQueries\(\{ queryKey: bureaucratVoteKeys\.all \}\)/,
  );
});

test("GM 투표 운영 화면은 발행 전 확인과 재시도 안정 멱등 키를 사용한다", async () => {
  const [page, client, nav] = await Promise.all([
    readWeb("app/(erp)/erp/admin/bureaucrat-votes/page.tsx"),
    readWeb("app/(erp)/erp/admin/bureaucrat-votes/BureaucratVotesAdminClient.tsx"),
    readWeb("components/erp/nav-config.ts"),
  ]);
  assert.match(page, /hasRole\(session\.user\.role, "GM"\)/);
  assert.match(client, /window\.confirm/);
  assert.match(client, /retainIdempotencyOperation/);
  assert.match(client, /clearRetainedIdempotencyOperation/);
  assert.match(client, /가결은 권한 승인만 기록합니다/);
  assert.match(nav, /href: "\/erp\/admin\/bureaucrat-votes"/);
});

test("CENSOR-3 U2는 발사 투표 없이 실물 1발만 원자 차감한다", async () => {
  const [snapshots, itemType] = await Promise.all([
    readWeb("app/api/vtt/nochichim/_lib/snapshots.ts"),
    readRepo("packages/shared-db/src/types/inventory.ts"),
  ]);
  assert.match(snapshots, /cost\.slug !== CENSOR_3_CONSUMABLE_SLUG/);
  assert.match(snapshots, /removeFromInventory\([\s\S]*cost\.quantity/);
  assert.doesNotMatch(snapshots, /claimApprovedCensorUseVote|APPROVAL_UNAVAILABLE/);
  assert.doesNotMatch(itemType, /REGISTRA_MAJORITY/);
});
