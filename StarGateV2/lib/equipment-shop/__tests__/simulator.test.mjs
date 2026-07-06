import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getInitialSimulatorResources,
  getSimulatorRange,
  isNewSimulatorCadenceCycle,
  resolveSimulatorAttack,
} from "../simulator.ts";

const attackerStats = { atk: 0 };
const targetStats = { def: 0 };

test("range uses vertical distance only on the 5x5 board", () => {
  assert.deepEqual(
    getSimulatorRange({ col: "A", row: 1 }, { col: "E", row: 1 }),
    { verticalDistance: 0, band: "near" },
  );
  assert.deepEqual(
    getSimulatorRange({ col: "A", row: 1 }, { col: "A", row: 3 }),
    { verticalDistance: 2, band: "mid" },
  );
  assert.deepEqual(
    getSimulatorRange({ col: "A", row: 1 }, { col: "E", row: 5 }),
    { verticalDistance: 4, band: "far" },
  );
});

test("physical damage is reduced by DEF while ranged weapons ignore ATK", () => {
  const result = resolveSimulatorAttack({
    weaponSlug: "basic-pistol",
    attacker: { col: "A", row: 1 },
    target: { col: "E", row: 1 },
    attackerStats: { atk: 99 },
    targetStats: { def: 2 },
    runtime: { resourceRemaining: 5 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.rawDamage, 7);
  assert.equal(result.mitigation, 2);
  assert.equal(result.damageApplied, 5);
  assert.equal(result.targetStat, "hp");
  assert.equal(result.nextResourceRemaining, 4);
});

test("melee weapons apply ATK bonus before physical DEF mitigation", () => {
  const result = resolveSimulatorAttack({
    weaponSlug: "basic-longsword",
    attacker: { col: "B", row: 2 },
    target: { col: "D", row: 2 },
    attackerStats: { atk: 3 },
    targetStats: { def: 4 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.rawDamage, 13);
  assert.equal(result.mitigation, 4);
  assert.equal(result.damageApplied, 9);
});

test("sonic emitter damages sanity and ignores DEF", () => {
  const result = resolveSimulatorAttack({
    weaponSlug: "basic-sonic-emitter",
    attacker: { col: "A", row: 1 },
    target: { col: "E", row: 3 },
    attackerStats,
    targetStats: { def: 99 },
    runtime: { resourceRemaining: 3 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.damageApplied, 15);
  assert.equal(result.targetStat, "san");
  assert.equal(result.nextResourceRemaining, 2);
});

test("flamethrower applies burn on supported range", () => {
  const result = resolveSimulatorAttack({
    weaponSlug: "basic-flamethrower",
    attacker: { col: "A", row: 1 },
    target: { col: "B", row: 2 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: 4 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.damageApplied, 8);
  assert.deepEqual(result.statusesApplied, ["burn"]);
});

test("chainsaw consumes start charge and blocks when charge is empty", () => {
  const resources = getInitialSimulatorResources();
  assert.equal(resources["basic-chainsaw"], 5);

  const first = resolveSimulatorAttack({
    weaponSlug: "basic-chainsaw",
    attacker: { col: "C", row: 1 },
    target: { col: "C", row: 1 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: resources["basic-chainsaw"] },
  });
  assert.equal(first.ok, true);
  assert.equal(first.damageApplied, 15);
  assert.equal(first.nextResourceRemaining, 4);

  const empty = resolveSimulatorAttack({
    weaponSlug: "basic-chainsaw",
    attacker: { col: "C", row: 1 },
    target: { col: "C", row: 1 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: 0 },
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "NO_RESOURCE");
});

test("heavy machine gun requires setup and is limited to two shots per 3-turn cycle", () => {
  const beforeSetup = resolveSimulatorAttack({
    weaponSlug: "basic-heavy-machine-gun",
    attacker: { col: "A", row: 1 },
    target: { col: "A", row: 3 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: 10, installed: false, shotsInCycle: 0 },
  });
  assert.equal(beforeSetup.ok, false);
  assert.equal(beforeSetup.reason, "SETUP_REQUIRED");

  const firstShot = resolveSimulatorAttack({
    weaponSlug: "basic-heavy-machine-gun",
    attacker: { col: "A", row: 1 },
    target: { col: "A", row: 3 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: 10, installed: true, shotsInCycle: 0 },
  });
  assert.equal(firstShot.ok, true);
  assert.equal(firstShot.damageApplied, 15);
  assert.equal(firstShot.nextShotsInCycle, 1);

  const locked = resolveSimulatorAttack({
    weaponSlug: "basic-heavy-machine-gun",
    attacker: { col: "A", row: 1 },
    target: { col: "A", row: 3 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: 9, installed: true, shotsInCycle: 2 },
  });
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, "CADENCE_LOCKED");
  assert.equal(isNewSimulatorCadenceCycle(3, 4), true);
});

test("unsupported range returns an explicit out-of-range result", () => {
  const result = resolveSimulatorAttack({
    weaponSlug: "basic-sniper-rifle",
    attacker: { col: "A", row: 1 },
    target: { col: "A", row: 3 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: 3 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "OUT_OF_RANGE");
});
