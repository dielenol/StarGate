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

test("research GET is GM-only and read-only", async () => {
  const source = await readFile(RESEARCH_ROUTE, "utf8");

  assert.match(source, /requireResearchGm\(\)/);
  assert.doesNotMatch(source, /applyReadyEquipmentResearchProjects/);
  assert.doesNotMatch(source, /export async function POST/);
});

test("equipment-shop page loader never applies completed research", async () => {
  const source = await readFile(PAGE_DATA, "utf8");

  assert.doesNotMatch(source, /applyReadyEquipmentResearchProjects/);
});

for (const action of ["start", "contribute", "rush"]) {
  test(`research ${action} mutation is GM-only`, async () => {
    const source = await readFile(
      new URL(
        `../../../app/api/erp/equipment-shop/research/${action}/route.ts`,
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(source, /requireResearchGm\(\)/);
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

test("research apply commits target effects and project status in one transaction", async () => {
  const source = await readFile(
    new URL("../research-application.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /session\.withTransaction/);
  assert.match(source, /markEquipmentResearchProjectApplied\(projectId,[\s\S]*session/);
});
