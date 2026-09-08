import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../FactionsClient.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../[code]/page.tsx", import.meta.url), "utf8");

test("페데라치오만 우호도 조정과 접선 대신 신원조회로 연결한다", () => {
  assert.match(client, /const isPersonnelOnly = selectedNode\?\.code === "FEDERATIO"/);
  assert.match(client, /data\.canEditFavorability && !isPersonnelOnly \? \(/);
  assert.match(client, /if \(\s*!selectedNode \|\|\s*isPersonnelOnly \|\|\s*!data\.canEditFavorability/);
  assert.match(client, /href=\{\s*isPersonnelOnly\s*\? "\/erp\/personnel\?group=FEDERATIO"/);
  assert.match(client, /isPersonnelOnly \? "신원조회" : "접선 페이지"/);
});

test("기존 세력은 접선 URL과 GM 우호도 조정 경로를 유지한다", () => {
  assert.match(client, /href=\{\s*isPersonnelOnly[\s\S]*?: `\/erp\/factions\/\$\{selectedNode\.code\.toLowerCase\(\)\}`\s*\}/);
  assert.match(client, /data\.canEditFavorability && !isPersonnelOnly \? \([\s\S]*?<form[\s\S]*?onSubmit=\{handleFavorabilitySubmit\}/);
  assert.match(client, /fetch\("\/api\/erp\/factions\/favorability", \{\s*method: "PATCH"/);
});

test("페데라치오 상세 직행은 인증과 노드 확인 후 게임·활동 조회보다 먼저 이동한다", () => {
  const guard = detail.indexOf('if (node.code === "FEDERATIO")');
  assert.ok(guard > detail.indexOf('if (!session?.user) redirect("/login")'));
  assert.ok(guard > detail.indexOf("if (!node) notFound()"));
  assert.match(detail.slice(guard), /^if \(node\.code === "FEDERATIO"\) \{\s*redirect\("\/erp\/personnel\?group=FEDERATIO"\);\s*\}/);
  for (const boundary of [
    "const profile = getFactionGameProfile(",
    "listFactionRelationLogs(node.code)",
    "listFactionQuestProgress(node.code)",
    "<FactionContactClient",
  ]) {
    assert.ok(guard < detail.indexOf(boundary), `${boundary} 전에 이동해야 한다`);
  }
});
