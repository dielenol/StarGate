import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sidebarSource = await readFile(
  new URL("../../../components/erp/ERPSidebar/ERPSidebar.tsx", import.meta.url),
  "utf8",
);
const dashboardSource = await readFile(
  new URL("../../../app/(erp)/erp/DashboardClient.tsx", import.meta.url),
  "utf8",
);

const dashboardData = await readFile(new URL("../dashboard.ts", import.meta.url), "utf8");
const responseTypes = await readFile(new URL("../../../types/erp-realtime.ts", import.meta.url), "utf8");

test("sidebar prefetches only after pointer, touch, or keyboard intent", () => {
  assert.equal(sidebarSource.match(/prefetch=\{false\}/g)?.length, 3);
  assert.equal(sidebarSource.match(/onTouchStart=/g)?.length, 3);
  assert.doesNotMatch(sidebarSource, /\n\s+prefetch\n/);
  assert.match(sidebarSource, /onFocus=\{\(\) => prefetchHref\(href\)\}/);
  assert.match(sidebarSource, /onMouseEnter=\{\(\) => prefetchHref\(href\)\}/);
  assert.match(sidebarSource, /onTouchStart=\{\(\) => prefetchHref\(href\)\}/);
});

test("dashboard hero image is loaded eagerly as the LCP candidate", () => {
  assert.match(
    dashboardSource,
    /loading=\{variant === "hero" \? "eager" : undefined\}/,
  );
});

test("dashboard reads and serializes only its projected character view", () => {
  assert.match(dashboardData, /findMainDashboardCharacterByOwnerCached as findMainCharacterByOwner/);
  assert.match(dashboardData, /findDisplayDashboardCharacterByOwnerCached as findDisplayCharacterByOwner/);
  assert.match(dashboardData, /findDashboardCharacterById\(firstCharId\)/);
  assert.doesNotMatch(dashboardData, /JSON\.parse\(JSON\.stringify\(displayCharacter\)\)/);
  assert.match(dashboardData, /_id: String\(displayCharacter\._id\)/);
  assert.match(responseTypes, /displayCharacter: ErpDashboardCharacter \| null/);
});

test("dashboard notification preview is limited to five rows at the DB boundary", () => {
  assert.match(dashboardData, /const NOTIFICATION_PREVIEW_LIMIT = 5/);
  assert.match(dashboardData, /listUserNotifications\(userId, NOTIFICATION_PREVIEW_LIMIT\)/);
  assert.doesNotMatch(dashboardData, /notifications\.slice\(/);
});
