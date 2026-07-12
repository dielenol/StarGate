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

test("research GET is lock-gated and read-only", async () => {
  const source = await readFile(RESEARCH_ROUTE, "utf8");

  assert.match(source, /requireResearchAccess\(\)/);
  assert.doesNotMatch(source, /applyReadyEquipmentResearchProjects/);
  assert.doesNotMatch(source, /export async function POST/);
});

test("equipment-shop page loader never applies completed research", async () => {
  const source = await readFile(PAGE_DATA, "utf8");

  assert.doesNotMatch(source, /applyReadyEquipmentResearchProjects/);
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
