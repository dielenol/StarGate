import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const APP_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ROUTE_ROOTS = [
  "app/api/erp/equipment-shop",
  "app/api/erp/admin/equipment-workshop",
];
const MUTATION_GUARD =
  "  const armorySuspended = armoryBureauMutationBlockedResponse();\n" +
  "  if (armorySuspended) return armorySuspended;";

/** 변경이 없는 조회·드라이런 핸들러. 중지 중에도 GM 에게는 열어 둔다. */
const READ_HANDLERS = new Map([
  ["app/api/erp/equipment-shop/catalog/route.ts:GET", "read-guard"],
  ["app/api/erp/equipment-shop/license-test/route.ts:GET", "read-guard"],
  ["app/api/erp/equipment-shop/workshop-request/route.ts:GET", "read-guard"],
  ["app/api/erp/equipment-shop/research/route.ts:GET", "research-access"],
  // 아래 셋은 기존 가드가 이미 GM 전용이다.
  ["app/api/erp/equipment-shop/license-test/debug/route.ts:POST", "gm-only"],
  ["app/api/erp/equipment-shop/quote/route.ts:POST", "gm-only"],
  ["app/api/erp/admin/equipment-workshop/blueprints/route.ts:GET", "gm-only"],
]);

function routeFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === "route.ts" ? [path] : [];
  });
}

function handlers(source) {
  return [
    ...source.matchAll(
      /^export async function (GET|POST|PUT|PATCH|DELETE)\([^)]*\) \{\n([\s\S]*?)(?=^export async function |(?![\s\S]))/gm,
    ),
  ].map((match) => ({ method: match[1], body: match[2] }));
}

test("병기부 변경 API는 운영 중지 가드를 첫 문장으로 실행한다", () => {
  const seenReadHandlers = new Set();
  let mutationHandlers = 0;

  for (const root of ROUTE_ROOTS) {
    for (const file of routeFiles(join(APP_ROOT, root))) {
      const key = relative(APP_ROOT, file).split(sep).join("/");
      const source = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
      const found = handlers(source);
      assert.ok(found.length > 0, `${key}: handler 를 찾지 못했습니다.`);

      for (const { method, body } of found) {
        const readKind = READ_HANDLERS.get(`${key}:${method}`);
        if (!readKind) {
          mutationHandlers += 1;
          assert.ok(
            body.startsWith(MUTATION_GUARD),
            `${key} ${method}: 운영 중지 변경 가드가 첫 문장이어야 합니다.`,
          );
          continue;
        }
        seenReadHandlers.add(`${key}:${method}`);
        if (readKind === "read-guard") {
          assert.match(
            body,
            /armoryBureauReadBlockedResponse\(session\.user\.role\)/,
            `${key} ${method}: GM 열람 가드가 필요합니다.`,
          );
        } else if (readKind === "research-access") {
          assert.match(body, /requireResearchAccess\(\)/);
        } else {
          assert.match(body, /hasRole\(session\.user\.role, "GM"\)|requireGm\(\)/);
        }
      }
    }
  }

  assert.equal(mutationHandlers, 16);
  assert.deepEqual([...seenReadHandlers].sort(), [...READ_HANDLERS.keys()].sort());
});

test("연구소 공통 가드와 페이지 가드는 중지 중 GM 열람만 허용한다", () => {
  const researchLib = readFileSync(
    join(APP_ROOT, "app/api/erp/equipment-shop/research/_lib.ts"),
    "utf8",
  );
  const gmPass = researchLib.indexOf('hasRole(authResult.session.role, "GM")');
  const suspendedGuard = researchLib.indexOf("armoryBureauReadBlockedResponse(");
  const localPreview = researchLib.indexOf("await hasLocalErpPreviewAccess()");
  assert.ok(gmPass > 0 && suspendedGuard > gmPass && localPreview > suspendedGuard);

  const access = readFileSync(
    join(APP_ROOT, "app/(erp)/erp/equipment-shop/_access.ts"),
    "utf8",
  );
  assert.match(
    access,
    /if \(suspended\) \{\s+return \{\s+session,\s+isGM,\s+canPreview: isGM,\s+suspended,\s+\};\s+\}/,
  );

  for (const zone of ["", "lab", "towaski", "acheron", "strategic", "custom", "simulator"]) {
    const page = readFileSync(
      join(APP_ROOT, "app/(erp)/erp/equipment-shop", zone, "page.tsx"),
      "utf8",
    );
    assert.match(page, /requireEquipmentShopSession\(/, `${zone || "hub"} page`);
    assert.match(page, /<EquipmentShopComingSoon suspended/, `${zone || "hub"} page`);
    assert.match(page, /<EquipmentShopSuspendedNotice \/>/, `${zone || "hub"} page`);
  }
});

test("운영 중지 중 병기부 잠금은 override 보다 우선하고 해제 요청을 거부한다", () => {
  const locks = readFileSync(join(APP_ROOT, "lib/db/erp-page-locks.ts"), "utf8");
  assert.match(
    locks,
    /return applyArmoryBureauSuspensionToLocks\(\s+overrides,[\s\S]*?isArmoryBureauSuspended\(\),\s+\);/,
  );

  const route = readFileSync(
    join(APP_ROOT, "app/api/erp/page-locks/route.ts"),
    "utf8",
  );
  const refusal = route.indexOf(
    "if (!locked && isArmoryBureauSuspended() && isArmoryBureauLockKey(lockKey))",
  );
  assert.ok(refusal > 0 && refusal < route.indexOf("await setErpPageLockOverride({"));
});
