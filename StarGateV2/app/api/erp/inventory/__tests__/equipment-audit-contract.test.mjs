import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const EQUIPMENT_ROUTE = new URL(
  "../[characterId]/equipment/route.ts",
  import.meta.url,
);

test("GM 장비 교체는 성공 후 공용 감사 채널에 기록한다", async () => {
  const source = await readFile(EQUIPMENT_ROUTE, "utf8");
  const mutationIndex = source.indexOf("equipCharacterInventoryItem(");
  const auditIndex = source.indexOf("scheduleGmAdminAudit({");
  const refreshIndex = source.indexOf(
    "listCharacterInventoryEntries(characterId)",
    auditIndex,
  );
  const responseIndex = source.indexOf("return NextResponse.json({", auditIndex);

  assert.notEqual(mutationIndex, -1, "장비 교체 mutation 누락");
  assert.ok(auditIndex > mutationIndex, "감사 기록은 장비 교체 성공 후여야 함");
  assert.ok(
    refreshIndex > auditIndex,
    "후속 목록 재조회가 실패해도 감사 예약은 누락되지 않아야 함",
  );
  assert.ok(responseIndex > auditIndex, "감사 예약은 성공 응답 전에 실행되어야 함");
  assert.match(source, /action: "캐릭터 장비 교체"/);
  assert.match(source, /previousItemId/);
  assert.match(source, /masterItem\.name/);
});
