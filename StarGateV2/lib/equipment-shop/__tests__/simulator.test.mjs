import { test } from "node:test";
import assert from "node:assert/strict";

import {
  advanceSimulatorTargetRound,
  applySimulatorStatuses,
  getSimulatorEquippedWeapons,
  getSimulatorEffectiveDef,
  getInitialSimulatorResources,
  getSimulatorIncendiaryLineCells,
  getSimulatorKnockbackTarget,
  getSimulatorRange,
  getSimulatorRangedDamageMultiplier,
  getSimulatorWeaponRule,
  isSimulatorAttackableCell,
  isNewSimulatorCadenceCycle,
  resolveSimulatorAreaSpray,
  resolveSimulatorAttack,
  SIMULATOR_STATUS_RULES,
} from "../simulator.ts";

const attackerStats = { atk: 0 };
const targetStats = { def: 0 };

test("equipped simulator weapons keep inventory art and expose unsupported weapons", () => {
  assert.deepEqual(
    getSimulatorEquippedWeapons([
      {
        itemName: "내 보급형 돌격소총",
        slug: "basic-assault-rifle",
        previewImage: "/equipped-rifle.webp",
        equippedSlot: "WEAPON",
      },
      {
        itemName: "훈련 규칙 없는 커스텀 무기",
        slug: "custom-weapon",
        equippedSlot: "WEAPON",
      },
      {
        itemName: "보급형 방탄복",
        slug: "basic-armor",
        equippedSlot: "ARMOR",
      },
    ]),
    [
      {
        key: "basic-assault-rifle",
        slug: "basic-assault-rifle",
        name: "내 보급형 돌격소총",
        previewImage: "/equipped-rifle.webp",
      },
      {
        key: "custom-weapon",
        name: "훈련 규칙 없는 커스텀 무기",
      },
    ],
  );
});

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
    target: { col: "A", row: 2 },
    attackerStats: { atk: 99 },
    targetStats: { def: 2 },
    runtime: { resourceRemaining: 5 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.rawDamage, 5);
  assert.equal(result.mitigation, 2);
  assert.equal(result.damageApplied, 3);
  assert.equal(result.targetStat, "hp");
  assert.equal(result.nextResourceRemaining, 4);
});

test("melee weapons apply ATK bonus before physical DEF mitigation", () => {
  const result = resolveSimulatorAttack({
    weaponSlug: "basic-longsword",
    attacker: { col: "B", row: 2 },
    target: { col: "B", row: 2 },
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
    target: { col: "A", row: 3 },
    attackerStats,
    targetStats: { def: 99 },
    runtime: { resourceRemaining: 3 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.damageApplied, 15);
  assert.equal(result.targetStat, "san");
  assert.equal(result.nextResourceRemaining, 2);
  assert.deepEqual(result.statusesApplied, ["dazed"]);
});

test("dazed reduces outgoing ranged damage by 20% for one active round", () => {
  const dazed = {
    statuses: ["dazed"],
    statusRounds: { dazed: 1 },
  };
  assert.equal(getSimulatorRangedDamageMultiplier(dazed), 0.8);

  const result = resolveSimulatorAttack({
    weaponSlug: "basic-heavy-machine-gun",
    attacker: { col: "A", row: 1 },
    target: { col: "A", row: 3 },
    attackerStats,
    attackerStatuses: dazed,
    targetStats,
    runtime: { resourceRemaining: 10, installed: true },
  });
  assert.equal(result.ok, true);
  assert.equal(result.rawDamage, 12);
  assert.equal(result.damageApplied, 12);
});

test("flamethrower applies burn on supported range", () => {
  const result = resolveSimulatorAttack({
    weaponSlug: "basic-flamethrower",
    attacker: { col: "A", row: 1 },
    target: { col: "A", row: 2 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: 4 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.damageApplied, 8);
  assert.deepEqual(result.statusesApplied, ["burn"]);
  assert.match(
    SIMULATOR_STATUS_RULES.burn.description,
    /뜨거운 물질\(물, 기름, 불\)/,
  );
  assert.match(
    SIMULATOR_STATUS_RULES.burn.effect,
    /매 라운드 동안 N의 수치에 해당하는 지속 피해/,
  );
  assert.match(SIMULATOR_STATUS_RULES.burn.effect, /방어력은 -N만큼/);
});

test("burn persists until recovery without inventing an N value", () => {
  const baseTarget = {
    hp: 60,
    maxHp: 60,
    san: 40,
    maxSan: 40,
    def: 8,
    statuses: [],
    statusRounds: {},
  };
  const burning = applySimulatorStatuses(baseTarget, ["burn"]);
  assert.equal(burning.statusRounds.burn, 1);
  assert.equal(getSimulatorEffectiveDef(burning), 8);

  const afterOneRound = advanceSimulatorTargetRound(burning);
  assert.equal(afterOneRound.hp, 60);
  assert.equal(afterOneRound.statusRounds.burn, 1);
  assert.deepEqual(afterOneRound.statuses, ["burn"]);
  assert.equal(getSimulatorEffectiveDef(afterOneRound), 8);
});

test("sniper rifle penetrates 10 DEF before mitigation", () => {
  const result = resolveSimulatorAttack({
    weaponSlug: "basic-sniper-rifle",
    attacker: { col: "A", row: 1 },
    target: { col: "A", row: 5 },
    attackerStats,
    targetStats: { def: 15 },
    runtime: { resourceRemaining: 3 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.rawDamage, 20);
  assert.equal(result.mitigation, 5);
  assert.equal(result.damageApplied, 15);
  assert.equal(result.profile?.armorPenetration, 10);
});

test("special actions handle knockback, per-target spray rolls, and both fire-zone shapes", () => {
  assert.deepEqual(
    getSimulatorKnockbackTarget(
      { col: "A", row: 1 },
      { col: "C", row: 1 },
    ),
    { col: "D", row: 1 },
  );
  assert.equal(
    getSimulatorKnockbackTarget(
      { col: "A", row: 1 },
      { col: "A", row: 5 },
      ["A"],
      [1, 2, 3, 4, 5],
    ),
    null,
  );
  assert.deepEqual(
    getSimulatorIncendiaryLineCells(
      { col: "C", row: 1 },
      { col: "C", row: 5 },
    ),
    [
      { col: "C", row: 2 },
      { col: "C", row: 3 },
      { col: "C", row: 4 },
    ],
  );
  assert.deepEqual(
    getSimulatorIncendiaryLineCells(
      { col: "A", row: 1 },
      { col: "C", row: 3 },
    ),
    [{ col: "C", row: 3 }],
  );
  const sprayResults = resolveSimulatorAreaSpray(
    [
      { ok: true, summary: "대상 1" },
      { ok: true, summary: "대상 2" },
      { ok: true, summary: "대상 3" },
    ],
    (() => {
      const rolls = [2, 5, 4];
      return () => rolls.shift();
    })(),
  );
  assert.deepEqual(
    sprayResults.map(({ roll, hit }) => ({ roll, hit })),
    [
      { roll: 2, hit: true },
      { roll: 5, hit: false },
      { roll: 4, hit: true },
    ],
  );
  assert.equal(
    getSimulatorWeaponRule("basic-shotgun")?.actions?.[0]?.resourceCost,
    2,
  );
  assert.equal(
    getSimulatorWeaponRule("basic-heavy-machine-gun")?.actions?.[0]?.resourceCost,
    "all",
  );
});

test("firearms use distance along a shared row or column", () => {
  const horizontal = resolveSimulatorAttack({
    weaponSlug: "basic-assault-rifle",
    attacker: { col: "A", row: 1 },
    target: { col: "E", row: 1 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: 6 },
  });
  assert.equal(horizontal.ok, true);
  assert.equal(horizontal.range.band, "far");
  assert.equal(horizontal.range.attackAxis, "horizontal");
  assert.equal(horizontal.range.attackDistance, 4);
  assert.equal(horizontal.damageApplied, 7);

  const vertical = resolveSimulatorAttack({
    weaponSlug: "basic-assault-rifle",
    attacker: { col: "C", row: 1 },
    target: { col: "C", row: 3 },
    attackerStats,
    targetStats,
    runtime: { resourceRemaining: 6 },
  });
  assert.equal(vertical.ok, true);
  assert.equal(vertical.range.band, "mid");
  assert.equal(vertical.range.attackAxis, "vertical");
  assert.equal(vertical.range.attackDistance, 2);
  assert.equal(vertical.damageApplied, 10);
});

test("ordinary firearm roles reject diagonal attacks with a clear reason", () => {
  for (const weaponSlug of [
    "basic-pistol",
    "basic-flamethrower",
  ]) {
    const result = resolveSimulatorAttack({
      weaponSlug,
      attacker: { col: "A", row: 1 },
      target: { col: "B", row: 2 },
      attackerStats,
      targetStats,
      runtime: {
        resourceRemaining: 10,
        installed: true,
        shotsInCycle: 0,
      },
    });

    assert.equal(result.ok, false, weaponSlug);
    assert.equal(result.reason, "NOT_CARDINAL", weaponSlug);
    assert.match(result.reasonLabel, /같은 가로줄 또는 세로줄/, weaponSlug);
  }
});

test("installed heavy machine gun uses a four-cell Manhattan diamond", () => {
  for (const target of [
    { col: "A", row: 3 },
    { col: "B", row: 4 },
    { col: "C", row: 5 },
    { col: "D", row: 4 },
    { col: "E", row: 3 },
  ]) {
    const result = resolveSimulatorAttack({
      weaponSlug: "basic-heavy-machine-gun",
      attacker: { col: "C", row: 1 },
      target,
      attackerStats,
      targetStats,
      runtime: {
        resourceRemaining: 10,
        installed: true,
        shotsInCycle: 0,
      },
    });

    assert.equal(result.ok, true, `${target.col}${target.row}`);
    assert.equal(result.range.attackAxis, "diamond");
    assert.equal(result.range.attackDistance, 4);
    assert.equal(result.range.band, "far");
    assert.equal(result.damageApplied, 10);
    assert.equal(
      isSimulatorAttackableCell(
        "basic-heavy-machine-gun",
        { col: "C", row: 1 },
        target,
      ),
      true,
    );
  }

  const beyondRange = resolveSimulatorAttack({
    weaponSlug: "basic-heavy-machine-gun",
    attacker: { col: "C", row: 1 },
    target: { col: "A", row: 5 },
    attackerStats,
    targetStats,
    runtime: {
      resourceRemaining: 10,
      installed: true,
      shotsInCycle: 0,
    },
  });
  assert.equal(beyondRange.ok, false);
  assert.equal(beyondRange.reason, "OUT_OF_RANGE");
  assert.equal(
    isSimulatorAttackableCell(
      "basic-heavy-machine-gun",
      { col: "C", row: 1 },
      { col: "A", row: 5 },
    ),
    false,
  );
});

test("non-throwing melee weapons only attack targets in the same cell", () => {
  for (const weaponSlug of [
    "basic-katana",
    "basic-longsword",
    "basic-blunt-weapon",
    "basic-chainsaw",
  ]) {
    const result = resolveSimulatorAttack({
      weaponSlug,
      attacker: { col: "A", row: 1 },
      target: { col: "B", row: 1 },
      attackerStats,
      targetStats,
      runtime:
        weaponSlug === "basic-chainsaw"
          ? { resourceRemaining: 5 }
          : undefined,
    });

    assert.equal(result.ok, false, weaponSlug);
    assert.equal(result.reason, "OUT_OF_RANGE", weaponSlug);
    assert.equal(result.range.attackDistance, 1, weaponSlug);
    assert.equal(
      result.reasonLabel,
      "근접무기는 적과 같은 칸에 있을 때만 공격할 수 있습니다.",
      weaponSlug,
    );
    assert.equal(
      isSimulatorAttackableCell(
        weaponSlug,
        { col: "A", row: 1 },
        { col: "B", row: 1 },
      ),
      false,
      weaponSlug,
    );
  }
});

test("non-throwing melee highlights only the attacker cell on a horizontal row", () => {
  const attacker = { col: "C", row: 1 };
  const row = ["A", "B", "C", "D", "E"].map((col) => ({
    col,
    row: 1,
  }));

  for (const weaponSlug of [
    "basic-katana",
    "basic-longsword",
    "basic-blunt-weapon",
    "basic-chainsaw",
  ]) {
    assert.deepEqual(
      row
        .filter((target) =>
          isSimulatorAttackableCell(weaponSlug, attacker, target),
        )
        .map((target) => `${target.col}${target.row}`),
      ["C1"],
      weaponSlug,
    );
  }
});

test("dagger throws use total grid distance and keep the two-cell exception", () => {
  const result = resolveSimulatorAttack({
    weaponSlug: "basic-dagger",
    attacker: { col: "A", row: 1 },
    target: { col: "B", row: 2 },
    attackerStats,
    targetStats,
  });

  assert.equal(result.ok, true);
  assert.equal(result.range.band, "mid");
  assert.equal(result.range.verticalDistance, 1);
  assert.equal(result.range.attackDistance, 2);
  assert.equal(result.range.attackAxis, undefined);

  const beyondThrowRange = resolveSimulatorAttack({
    weaponSlug: "basic-dagger",
    attacker: { col: "A", row: 1 },
    target: { col: "D", row: 1 },
    attackerStats,
    targetStats,
  });

  assert.equal(beyondThrowRange.ok, false);
  assert.equal(beyondThrowRange.reason, "OUT_OF_RANGE");
  assert.equal(beyondThrowRange.range.attackDistance, 3);
  assert.equal(
    beyondThrowRange.reasonLabel,
    "단검 투척은 적과 2칸 이내일 때만 공격할 수 있습니다.",
  );
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

test("heavy machine gun requires setup and is limited to two shots every turn", () => {
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
  assert.equal(isNewSimulatorCadenceCycle(1, 2), true);
  assert.equal(
    getSimulatorWeaponRule("basic-heavy-machine-gun")?.cadence?.cycleTurns,
    1,
  );
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
