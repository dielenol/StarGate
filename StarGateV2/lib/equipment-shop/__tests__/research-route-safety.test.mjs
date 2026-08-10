import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const RESEARCH_ROUTE = new URL(
  "../../../app/api/erp/equipment-shop/research/route.ts",
  import.meta.url,
);
const PAGE_DATA = new URL(
  "../../../app/(erp)/erp/equipment-shop/_data.ts",
  import.meta.url,
);
const RESEARCH_DB = new URL("../../db/equipment-research.ts", import.meta.url);
const SHARED_INDEXES = new URL(
  "../../../../packages/shared-db/src/indexes.ts",
  import.meta.url,
);
const RESEARCH_CLIENT = new URL(
  "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
  import.meta.url,
);
const RESEARCH_QUERY = new URL(
  "../../../hooks/queries/useEquipmentShopQuery.ts",
  import.meta.url,
);
const RESEARCH_MUTATION = new URL(
  "../../../hooks/mutations/useEquipmentShopMutation.ts",
  import.meta.url,
);
const RESEARCH_ROUTE_LIB = new URL(
  "../../../app/api/erp/equipment-shop/research/_lib.ts",
  import.meta.url,
);
const RESEARCH_APPLICATION = new URL(
  "../research-application.ts",
  import.meta.url,
);
const RESEARCH_DISCORD_PAYLOAD = new URL(
  "../../notifications/equipment-research-discord.ts",
  import.meta.url,
);
const WORKER_CONFIG = new URL(
  "../../../../stargate-worker/src/config.ts",
  import.meta.url,
);

test("research GET is lock-gated and read-only", async () => {
  const source = await readFile(RESEARCH_ROUTE, "utf8");

  assert.match(source, /requireResearchAccess\(\)/);
  assert.match(
    source,
    /listEquipmentResearchProjects\(\{ mainCharacterId \}\)/,
  );
  assert.doesNotMatch(source, /applyReadyEquipmentResearchProjects/);
  assert.doesNotMatch(source, /export async function POST/);
});

test("equipment-shop page loader never applies completed research", async () => {
  const source = await readFile(PAGE_DATA, "utf8");

  assert.doesNotMatch(source, /applyReadyEquipmentResearchProjects/);
  assert.doesNotMatch(source, /const mainAgent =/);
  assert.match(source, /type: mainCharacter\.type/);
  assert.match(source, /mainCharacter\.type === "AGENT"/);
  assert.match(
    source,
    /buildEquipmentResearchOverviewResponse\(mainCharacterId\)/,
  );
  assert.match(
    source,
    /listEquipmentResearchProjects\(\{ mainCharacterId \}\)/,
  );
});

test("research project list filters personal visibility before applying its limit", async () => {
  const source = await readFile(RESEARCH_DB, "utf8");
  const functionStart = source.indexOf(
    "export async function listEquipmentResearchProjects",
  );
  const functionEnd = source.indexOf(
    "export async function listReadyEquipmentResearchProjects",
    functionStart,
  );
  const functionSource = source.slice(functionStart, functionEnd);

  assert.ok(functionStart >= 0);
  assert.ok(functionEnd > functionStart);
  assert.match(
    functionSource,
    /scope: "personal",[\s\S]*targetCharacterIds: options\.mainCharacterId/,
  );
  assert.match(functionSource, /\.find\(visibilityFilter\)[\s\S]*\.limit\(/);
});

for (const action of ["start", "contribute", "rush"]) {
  test(`research ${action} mutation is lock-gated`, async () => {
    const source = await readFile(
      new URL(
        `../../../app/api/erp/equipment-shop/research/${action}/route.ts`,
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(source, /requireResearchAccess\(\)/);
    assert.match(source, /readIdempotencyKey\(request\)/);
    assert.doesNotMatch(source, /requireResearchUser\(\)/);
  });
}

test("research rush stores the requestId on the project update", async () => {
  const source = await readFile(
    new URL(
      "../../../app/api/erp/equipment-shop/research/rush/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /updateEquipmentResearchProjectRush\([\s\S]*requestId/);
});

test("team research mutations queue one durable Discord card revision in their transaction", async () => {
  const [contribute, rush, apply] = await Promise.all([
    readFile(
      new URL(
        "../../../app/api/erp/equipment-shop/research/contribute/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/api/erp/equipment-shop/research/rush/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(RESEARCH_APPLICATION, "utf8"),
  ]);

  assert.equal(
    (contribute.match(/requestEquipmentResearchDiscordCardSync\(/g) ?? [])
      .length,
    1,
  );
  assert.match(
    contribute,
    /withTransaction[\s\S]*requestEquipmentResearchDiscordCardSync\(node\.key,[\s\S]*session: mongoSession/,
  );
  assert.match(
    rush,
    /withTransaction[\s\S]*requestEquipmentResearchDiscordCardSync\(project\.key,[\s\S]*session: mongoSession/,
  );
  assert.match(
    apply,
    /insertEquipmentResearchContribution\([\s\S]*requestEquipmentResearchDiscordCardSync\(project\.key, \{ session \}\)/,
  );
  for (const source of [contribute, rush, apply]) {
    assert.doesNotMatch(source, /notifyEquipmentResearchEvent/);
    assert.doesNotMatch(source, /scheduleEquipmentResearchDiscordCardSync/);
    assert.doesNotMatch(source, /\bafter\(/);
  }
});

test("research lifecycle queues workflow tracking and GM audit in its mutation transaction", async () => {
  const [start, contribute, rush, apply] = await Promise.all([
    readFile(
      new URL(
        "../../../app/api/erp/equipment-shop/research/start/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/api/erp/equipment-shop/research/contribute/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/api/erp/equipment-shop/research/rush/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(RESEARCH_APPLICATION, "utf8"),
  ]);

  assert.match(
    start,
    /withTransaction[\s\S]*enqueueEquipmentResearchWorkflowStatus\([\s\S]*stage: "STARTED"[\s\S]*scheduleGmAdminAudit\([\s\S]*session: mongoSession/,
  );
  assert.match(
    contribute,
    /withTransaction[\s\S]*enqueueEquipmentResearchWorkflowStatus\([\s\S]*stage: "STARTED"[\s\S]*scheduleGmAdminAudit\([\s\S]*session: mongoSession/,
  );
  assert.match(
    rush,
    /withTransaction[\s\S]*enqueueEquipmentResearchWorkflowStatus\([\s\S]*stage: "RUSHED"[\s\S]*scheduleGmAdminAudit\([\s\S]*session: mongoSession/,
  );
  assert.match(
    apply,
    /markEquipmentResearchProjectApplied\([\s\S]*enqueueEquipmentResearchWorkflowStatus\([\s\S]*stage: "APPLIED"[\s\S]*scheduleGmAdminAudit\([\s\S]*\{ session \}/,
  );
});

test("research Discord card delivery is left to the long-running worker", async () => {
  const [syncSource, workerConfig] = await Promise.all([
    readFile(RESEARCH_DISCORD_PAYLOAD, "utf8"),
    readFile(WORKER_CONFIG, "utf8"),
  ]);

  assert.doesNotMatch(syncSource, /syncPendingEquipmentResearchDiscordCards/);
  assert.doesNotMatch(syncSource, /fetch\(|createDiscord|deleteDiscord/);
  assert.match(workerConfig, /"research-card"/);
});

test("legacy team projects without funding pools use project cost fallback", async () => {
  const source = await readFile(RESEARCH_DISCORD_PAYLOAD, "utf8");

  assert.match(source, /if \(!pool && !project\)/);
  assert.match(source, /targetCost: pool\?\.targetCost \?\? project!\.cost/);
  assert.match(source, /fundedAmount: pool\?\.fundedAmount \?\? project!\.cost/);
});

test("research rush blocks effects without an operational consumer", async () => {
  const source = await readFile(
    new URL(
      "../../../app/api/erp/equipment-shop/research/rush/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /isEquipmentResearchEffectOperational/);
  assert.match(source, /RESEARCH_NOT_READY/);
});

test("research apply commits target effects and project status in one transaction", async () => {
  const source = await readFile(
    new URL("../research-application.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /session\.withTransaction/);
  assert.match(source, /markEquipmentResearchProjectApplied\(projectId,[\s\S]*session/);
  assert.match(
    source,
    /character\.type === "NPC"[\s\S]*ownerId === project\.createdBy[\s\S]*role: "GM"[\s\S]*status: "ACTIVE"[\s\S]*session/,
  );
});

test("personal research accepts GM NPC economy effects but keeps stat effects AGENT-only", async () => {
  const source = await readFile(
    new URL(
      "../../../app/api/erp/equipment-shop/research/start/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /canCharacterReceivePersonalEquipmentResearchEffect/);
  assert.match(
    source,
    /target\.type === "NPC" && targetId !== args\.fallbackCharacterId/,
  );
  assert.match(source, /능력치·포인트 개인 연구는 AGENT 캐릭터에만 적용/);
});

test("research credit charge revalidates GM NPC ownership in the transaction", async () => {
  const source = await readFile(RESEARCH_ROUTE_LIB, "utf8");

  assert.match(source, /type: args\.budget\.type/);
  assert.match(
    source,
    /character\.type === "NPC"[\s\S]*role: "GM"[\s\S]*status: "ACTIVE"[\s\S]*session: args\.mongoSession/,
  );
  assert.match(source, /if \(err instanceof ResearchMutationError\) throw err/);
});

test("research apply lets participants apply team projects and owners apply personal projects", async () => {
  const source = await readFile(
    new URL(
      "../../../app/api/erp/equipment-shop/research/apply/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /canViewerApplyEquipmentResearchProject/);
  assert.match(source, /FORBIDDEN_RESEARCH_PROJECT/);
});

test("team funding pools enforce one active pool per research key", async () => {
  const [dbSource, indexSource] = await Promise.all([
    readFile(RESEARCH_DB, "utf8"),
    readFile(SHARED_INDEXES, "utf8"),
  ]);

  assert.match(
    indexSource,
    /research_team_funding_pools_key_funding_unique[\s\S]*unique: true[\s\S]*status: "funding"/,
  );
  assert.match(dbSource, /error instanceof MongoServerError/);
  assert.match(dbSource, /error\.code !== 11000/);
  assert.match(dbSource, /concurrentPool = await col\.findOne/);
});

test("team funding pool upsert does not update targetCost through conflicting operators", async () => {
  const source = await readFile(RESEARCH_DB, "utf8");
  const functionStart = source.indexOf(
    "export async function getOrCreateTeamFundingPool",
  );
  const functionEnd = source.indexOf(
    "export async function listTeamFundingPools",
    functionStart,
  );
  const functionSource = source.slice(functionStart, functionEnd);
  const setOnInsertStart = functionSource.indexOf("$setOnInsert:");
  const setStart = functionSource.indexOf("$set:", setOnInsertStart);
  const setOnInsertSource = functionSource.slice(setOnInsertStart, setStart);

  assert.ok(functionStart >= 0);
  assert.ok(functionEnd > functionStart);
  assert.ok(setOnInsertStart >= 0);
  assert.ok(setStart > setOnInsertStart);
  assert.doesNotMatch(setOnInsertSource, /targetCost/);
  assert.match(
    functionSource.slice(setStart),
    /targetCost:\s*args\.targetCost/,
  );
});

test("stale applying reservations can be claimed without mutating research GET", async () => {
  const source = await readFile(RESEARCH_DB, "utf8");

  assert.match(source, /EQUIPMENT_RESEARCH_APPLY_LEASE_MS/);
  assert.match(
    source,
    /status: "applying", updatedAt: \{ \$lte: staleBefore \}/,
  );
});

test("research UI keeps every active project reachable and blocks stale-data mutations", async () => {
  const source = await readFile(RESEARCH_CLIENT, "utf8");

  assert.doesNotMatch(source, /activeResearchProjects\.slice\(/);
  assert.match(source, /researchDataUnavailable/);
  assert.match(source, /researchQuery\.isRefetchError/);
  assert.match(source, /isEquipmentResearchApplyLeaseStale\(project\.updatedAt\)/);
  assert.match(source, /canViewerApplyEquipmentResearchProject/);
  assert.match(
    source,
    /filterEquipmentResearchProjectsForCharacter\(\s*research\.projects/,
  );
  assert.match(
    source,
    /enabled: mode === "hub" \|\| initialZone === "lab"/,
  );
  assert.match(source, /characterId: mainCharacter\?\.id \?\? null/);
  assert.match(source, /팀 연구 시작 ·/);
  assert.doesNotMatch(source, />\s*자동 반영\s*</);
});

test("research query cache is scoped by character and mutations invalidate its root", async () => {
  const [querySource, mutationSource] = await Promise.all([
    readFile(RESEARCH_QUERY, "utf8"),
    readFile(RESEARCH_MUTATION, "utf8"),
  ]);

  assert.match(
    querySource,
    /research: \(characterId: string \| null\)[\s\S]*characterId \?\? "unassigned"/,
  );
  assert.match(
    querySource,
    /queryKey: equipmentShopKeys\.research\(characterId\)/,
  );
  assert.doesNotMatch(
    mutationSource,
    /queryKey: equipmentShopKeys\.research[),]/,
  );
  assert.equal(
    (
      mutationSource.match(
        /queryKey: equipmentShopKeys\.researchRoot/g,
      ) ?? []
    ).length,
    4,
  );
});

test("research economy mutations require confirmation and GM can preview every Suture mood", async () => {
  const source = await readFile(RESEARCH_CLIENT, "utf8");
  const confirmations = source.match(/window\.confirm\(/g) ?? [];

  assert.equal(confirmations.length, 4);
  for (const mood of [
    "welcome",
    "assessment",
    "protocol",
    "funding",
    "procedure",
    "recovery",
    "blocked",
    "idle",
  ]) {
    assert.match(source, new RegExp(`value: "${mood}"`));
  }
  assert.match(source, /SUTURE PORTRAIT SANDBOX \/ DB WRITE 0/);
});
