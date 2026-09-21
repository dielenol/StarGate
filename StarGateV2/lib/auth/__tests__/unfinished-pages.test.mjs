import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import * as pageLockPolicy from "../../erp/page-lock-policy.ts";

const root = new URL("../../../", import.meta.url);
const routes = [
  "app/(erp)/erp/admin/unfinished/page.tsx",
  "app/(erp)/erp/missions/page.tsx",
  "app/(erp)/erp/chronicle/page.tsx",
  "app/(public)/world/b/page.tsx",
  "app/(public)/world/c/page.tsx",
];

function loadModule(path, imports) {
  const source = readFileSync(new URL(path, root), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: (name) => {
      if (name in imports) return imports[name];
      if (name.endsWith(".css") || name.startsWith("@/components/") || name === "next/link") {
        return { default: {} };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports;
}

function guardFor(session) {
  return loadModule("lib/auth/require-gm-page.ts", {
    "server-only": {},
    "@/lib/auth/active-session": { getActiveSession: async () => session },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
  });
}

const blockedSessions = [
  null,
  ...["V", "A", "M", "H", "G", "J", "U"].map((role) => ({ user: { role } })),
  { user: { role: "U", isGuest: true } },
  { user: { role: "GM", isGuest: true } },
];

for (const path of routes) {
  test(`${path}: 비GM·게스트·미인증 요청은 본문 렌더 전에 차단한다`, async () => {
    for (const session of blockedSessions) {
      let rendered = false;
      const render = () => { rendered = true; return {}; };
      const page = loadModule(path, {
        "@/lib/auth/require-gm-page": guardFor(session),
        "react/jsx-runtime": { jsx: render, jsxs: render },
      });
      await assert.rejects(page.default(), { message: "NOT_FOUND" });
      assert.equal(rendered, false);
    }
  });

  test(`${path}: GM은 보관된 화면을 열람한다`, async () => {
    const page = loadModule(path, {
      "@/lib/auth/require-gm-page": guardFor({ user: { role: "GM" } }),
      "react/jsx-runtime": { jsx: () => ({}), jsxs: () => ({}) },
    });
    assert.ok(await page.default());
    if (path.includes("/(public)/")) assert.equal(page.dynamic, "force-dynamic");
  });
}

test("미완성 메뉴는 GM 관리 그룹에 하나만 있고 기존 일반 메뉴에서는 제거된다", () => {
  const { NAV_GROUPS } = loadModule("components/erp/nav-config.ts", {
    "@/lib/erp/page-lock-policy": pageLockPolicy,
  });
  const entries = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ group, item })));
  const archives = entries.filter(({ item }) => item.href === "/erp/admin/unfinished");
  assert.equal(archives.length, 1);
  assert.equal(archives[0].group.minRole, "GM");
  assert.equal(archives[0].item.minRole, "GM");
  const hrefs = pageLockPolicy.flattenLockableNavItems(entries.map(({ item }) => item))
    .flatMap((item) => [item.href, item.gmHref]);
  for (const retired of ["/erp/missions", "/erp/chronicle", "/world/b", "/world/c"]) {
    assert.equal(hrefs.includes(retired), false);
  }
  for (const retained of ["/erp/gallery", "/erp/factions", "/erp/equipment-shop/lab", "/erp/equipment-shop/simulator"]) {
    assert.ok(hrefs.includes(retained));
  }
});
