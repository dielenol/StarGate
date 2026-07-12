import assert from "node:assert/strict";
import test from "node:test";

import {
  getPageLockKey,
  isPageLocked,
  isResolvedPageLocked,
  resolvePageLockHref,
  resolvePageLockItem,
} from "../page-lock-policy.ts";

const items = [
  { label: "대시보드", href: "/erp" },
  {
    label: "병기부",
    href: "/erp/equipment-shop/towaski",
    gmHref: "/erp/equipment-shop",
    preparing: true,
    children: [
      {
        label: "토와스키 건샵",
        href: "/erp/equipment-shop/towaski",
      },
    ],
  },
  {
    label: "기록보관소",
    href: "/erp/wiki/catalog/all",
    lockKey: "/erp/wiki/catalog",
  },
];

test("준비중 또는 href null 메뉴는 기본 잠금이고 override로 해제된다", () => {
  const preparing = { label: "병기부", href: "/erp/equipment-shop", preparing: true };
  const unavailable = { label: "미션", href: null, gmHref: "/erp/missions" };

  assert.equal(isPageLocked(preparing), true);
  assert.equal(isPageLocked(preparing, false), false);
  assert.equal(isPageLocked(unavailable), true);
  assert.equal(isPageLocked(unavailable, false), false);
});

test("로컬 우회는 준비중 실제 경로를 열되 GM 경로 우선순위를 보존한다", () => {
  const preparing = { href: null, gmHref: "/erp/missions" };
  const splitRoute = {
    href: "/erp/equipment-shop/towaski",
    gmHref: "/erp/equipment-shop",
  };

  assert.equal(
    resolvePageLockHref(preparing, {
      isGM: false,
      locked: true,
      bypassLocks: false,
    }),
    null,
  );
  assert.equal(
    resolvePageLockHref(preparing, {
      isGM: false,
      locked: true,
      bypassLocks: true,
    }),
    "/erp/missions",
  );
  assert.equal(
    resolvePageLockHref(splitRoute, {
      isGM: true,
      locked: true,
      bypassLocks: true,
    }),
    "/erp/equipment-shop",
  );
});

test("잠금 키는 명시값, GM 경로, 일반 경로 순서로 결정된다", () => {
  assert.equal(getPageLockKey(items[2]), "/erp/wiki/catalog");
  assert.equal(getPageLockKey(items[1]), "/erp/equipment-shop");
  assert.equal(getPageLockKey(items[0]), "/erp");
});

test("상세 경로는 가장 구체적인 하위 메뉴 잠금으로 결정된다", () => {
  assert.equal(
    resolvePageLockItem(items, "/erp/equipment-shop/towaski")?.label,
    "토와스키 건샵",
  );
  assert.equal(
    resolvePageLockItem(items, "/erp/wiki/catalog/item/weapon")?.label,
    "기록보관소",
  );
});

test("부모 메뉴와 하위 페이지 잠금은 각각 독립적으로 적용된다", () => {
  assert.equal(
    isResolvedPageLocked(items, "/erp/equipment-shop/towaski"),
    false,
  );
  assert.equal(
    isResolvedPageLocked(items, "/erp/equipment-shop/towaski", {
      "/erp/equipment-shop": true,
    }),
    false,
  );
  assert.equal(
    isResolvedPageLocked(items, "/erp/equipment-shop/towaski", {
      "/erp/equipment-shop/towaski": true,
    }),
    true,
  );
});

test("대시보드 /erp는 알 수 없는 하위 경로의 fallback 잠금이 아니다", () => {
  assert.equal(resolvePageLockItem(items, "/erp")?.label, "대시보드");
  assert.equal(resolvePageLockItem(items, "/erp/not-in-sidebar"), null);
});
