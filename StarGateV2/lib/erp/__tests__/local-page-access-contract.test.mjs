import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const EQUIPMENT_ACCESS = new URL(
  "../../../app/(erp)/erp/equipment-shop/_access.ts",
  import.meta.url,
);
const EQUIPMENT_PAGES = [
  { path: "page.tsx", loadsPageData: true, requiresPreviewGuard: true },
  { path: "lab/page.tsx", loadsPageData: true, requiresPreviewGuard: true },
  { path: "acheron/page.tsx", loadsPageData: true, requiresPreviewGuard: true },
  { path: "strategic/page.tsx", loadsPageData: true, requiresPreviewGuard: true },
  { path: "custom/page.tsx", loadsPageData: true, requiresPreviewGuard: false },
  { path: "simulator/page.tsx", loadsPageData: false, requiresPreviewGuard: true },
].map(({ path, loadsPageData, requiresPreviewGuard }) => ({
  file: new URL(
    `../../../app/(erp)/erp/equipment-shop/${path}`,
    import.meta.url,
  ),
  loadsPageData,
  requiresPreviewGuard,
}));
const FACTION_PAGES = [
  new URL("../../../app/(erp)/erp/factions/page.tsx", import.meta.url),
  new URL("../../../app/(erp)/erp/factions/[code]/page.tsx", import.meta.url),
];
const ADMIN_LAYOUT = new URL(
  "../../../app/(erp)/erp/admin/layout.tsx",
  import.meta.url,
);

test("병기부 준비중 화면은 GM·JTEST·로컬 미리보기에서 실제 페이지를 연다", async () => {
  const access = await readFile(EQUIPMENT_ACCESS, "utf8");
  assert.match(
    access,
    /hasPlayerServiceTestPathAccess\(session\.user, lockPath\)/,
  );
  assert.match(access, /hasLocalErpPreviewAccess\(\)/);

  for (const page of EQUIPMENT_PAGES) {
    const source = await readFile(page.file, "utf8");
    if (page.requiresPreviewGuard) {
      assert.match(source, /canPreview/);
    }
    assert.doesNotMatch(source, /if \(!isGM\)/);
    if (page.loadsPageData) {
      assert.match(
        source,
        /loadEquipmentShopPageData\(\{[\s\S]*?requireGm: false,?[\s\S]*?\}\)/,
      );
    }
  }
});

test("세력도 목록과 상세 화면도 로컬 미리보기 요청을 허용한다", async () => {
  for (const page of FACTION_PAGES) {
    const source = await readFile(page, "utf8");
    assert.match(source, /hasLocalErpPreviewAccess\(\)/);
    assert.match(source, /if \(!canPreview\)/);
  }
});

test("JTEST·로컬 미리보기는 관리자 RBAC를 우회하지 않는다", async () => {
  const source = await readFile(ADMIN_LAYOUT, "utf8");

  assert.match(source, /hasRole\(session\.user\.role, "GM"\)/);
  assert.doesNotMatch(source, /hasLocalErpPreviewAccess/);
  assert.doesNotMatch(source, /hasPlayerServiceTestAccess/);
});
