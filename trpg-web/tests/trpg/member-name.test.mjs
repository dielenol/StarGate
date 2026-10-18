import assert from "node:assert/strict";
import test from "node:test";

import { resolveMemberName } from "../../lib/trpg/member-name.ts";

const membersById = new Map([["u2", { displayName: "라이언" }]]);
const me = { discordId: "u1", name: "필렁" };

test("resolveMemberName prefers the guild member cache", () => {
  assert.equal(resolveMemberName(membersById, "u2", me), "라이언");
});

test("resolveMemberName falls back to the session name for the current user", () => {
  assert.equal(resolveMemberName(membersById, "u1", me), "필렁");
});

test("resolveMemberName shows the id in parentheses when nothing better exists", () => {
  assert.equal(resolveMemberName(membersById, "u9", me), "(u9)");
  assert.equal(
    resolveMemberName(membersById, "u1", { discordId: "u1", name: null }),
    "(u1)",
  );
  assert.equal(
    resolveMemberName(membersById, "u1", { discordId: "u1", name: "" }),
    "(u1)",
  );
});
