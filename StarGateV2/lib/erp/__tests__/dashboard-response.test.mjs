import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../dashboard.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Execute the real orchestration with only its IO replaced. No DB or credentials.
function dashboard({ main = null, display = null, refs = [], mainError = null } = {}) {
  const calls = [];
  const tracked = (name, value) => async (...args) => {
    calls.push({ name, args });
    if (name === "main" && mainError) throw new Error(mainError);
    return value;
  };
  const sessionOverview = {
    myRsvpUpcoming: [{ _id: "rsvp", source: "trpg", href: "/erp/sessions?sessionId=rsvp" }],
    pendingResponse: [{ _id: "pending", href: "/erp/sessions?sessionId=pending" }],
    pendingResponseCount: 27,
    unavailableSources: ["trpg"],
  };
  const actionSummary = { items: [], totalCount: 11, domains: [], unavailableDomains: ["research"] };
  const stubs = {
    "@/lib/db/characters": {
      findMainDashboardCharacterByOwnerCached: tracked("main", main),
      findDisplayDashboardCharacterByOwnerCached: tracked("display", display),
      findDashboardCharacterById: tracked("fallback", display),
      listCharactersByOwner: tracked("refs", refs),
    },
    "@/lib/db/credits": { getCharacterBalance: tracked("balance", 120) },
    "@/lib/db/dashboard-sessions": { getDashboardSessionOverview: tracked("sessions", sessionOverview) },
    "./dashboard-actions": { getDashboardActionSummary: tracked("actions", actionSummary) },
    "@/lib/db/notifications": { countUnread: tracked("unread", 2), listUserNotifications: tracked("notifications", []) },
    "@/lib/db/sessions": { countMergedSessionsOnKstDate: tracked("today", 1), countParticipationForUser: tracked("participation", 5) },
    "@/lib/db/users": { findUserById: tracked("user", { username: "TEST-USER", role: "GM", status: "ACTIVE", createdAt: new Date("2026-01-01") }) },
    "@/lib/db/wiki": { listRecentWikiPagesLite: tracked("wiki", []) },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Error,
    process: { env: { GUILD_ID: "test-guild" } },
    require: (id) => {
      assert(id in stubs, `Unexpected dependency: ${id}`);
      return stubs[id];
    },
  });
  return { get: exports.getErpDashboardResponse, calls, sessionOverview, actionSummary };
}

const input = { userId: "owner", viewerRole: "GM", viewerDiscordId: "discord-owner" };
const character = (id, type) => ({ _id: id, type, codename: id, lore: { name: id }, play: type === "AGENT" ? { hp: 20, hpDelta: -5, san: 30, sanDelta: 10, points: 7 } : undefined });

test("guest dashboard never invokes personal IO or action/session summary loaders", async () => {
  const harness = dashboard();
  const result = await harness.get({ ...input, userId: null });
  assert.equal(result.isGuest, true);
  assert.equal(result.actionSummary.totalCount, 0);
  assert.equal(result.pendingResponseCount, 0);
  assert.equal(result.displayCharacter, null);
  assert.deepEqual(harness.calls.map(({ name }) => name).sort(), ["today", "wiki"]);
});

test("GM display NPC does not become the economic action identity", async () => {
  const main = character("main-agent", "AGENT");
  const display = character("display-npc", "NPC");
  const harness = dashboard({ main, display });
  const result = await harness.get(input);
  assert.equal(result.displayCharacter._id, "display-npc");
  assert.equal(result.characterPointBalance, null);
  const actionInput = harness.calls.find(({ name }) => name === "actions").args[0];
  assert.equal(actionInput.mainCharacterId, "main-agent");
  assert.equal(actionInput.userId, input.userId);
  assert.equal(actionInput.username, "TEST-USER");
  assert.deepEqual(harness.calls.find(({ name }) => name === "balance").args, ["main-agent"]);
  assert.equal(result.actionSummary, harness.actionSummary);
  assert.equal(result.pendingResponseCount, 27, "count must not shrink to preview length");
  assert.equal(result.myRsvpUpcoming, harness.sessionOverview.myRsvpUpcoming);
  assert.equal(result.sessionUnavailableSources, harness.sessionOverview.unavailableSources);
});

test("missing or invalid MAIN never falls back to display NPC for business actions", async () => {
  for (const mainError of [null, "duplicate MAIN"]) {
    const harness = dashboard({ display: character("npc", "NPC"), mainError });
    const result = await harness.get(input);
    assert.equal(harness.calls.find(({ name }) => name === "actions").args[0].mainCharacterId, null);
    assert.equal(harness.calls.some(({ name }) => name === "balance"), false);
    assert.equal(result.mainIntegrityError, mainError);
  }
});

test("player stats preserve projected deltas and fallback stays scoped to the owner", async () => {
  const main = character("main", "AGENT");
  const harness = dashboard({ main });
  const result = await harness.get({ ...input, viewerRole: "J" });
  assert.equal(result.displayCharacter.play.hpDelta, -5);
  assert.equal(result.displayCharacter.play.sanDelta, 10);
  assert.equal(harness.calls.some(({ name }) => name === "display"), false);

  const fallback = dashboard({ refs: [{ _id: "first" }], display: character("first", "NPC") });
  await fallback.get({ ...input, viewerRole: "J" });
  assert.deepEqual(fallback.calls.find(({ name }) => name === "fallback").args, ["first", "owner"]);
  assert.equal(fallback.calls.find(({ name }) => name === "actions").args[0].mainCharacterId, null);
});
