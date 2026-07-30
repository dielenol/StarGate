import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CLIENT_URL = new URL(
  "../../../app/(erp)/erp/equipment-shop/simulator/EquipmentSimulatorClient.tsx",
  import.meta.url,
);
const PAGE_URL = new URL(
  "../../../app/(erp)/erp/equipment-shop/simulator/page.tsx",
  import.meta.url,
);
const STYLES_URL = new URL(
  "../../../app/(erp)/erp/equipment-shop/simulator/page.module.css",
  import.meta.url,
);
const SIMULATOR_URL = new URL("../simulator.ts", import.meta.url);
const TURN_END_SFX_URL = new URL(
  "../../../public/assets/equipment-shop/sfx/ui-notice-level-up.mp3",
  import.meta.url,
);
const DEFAULT_AGENT_URL = new URL(
  "../../../public/assets/npcs/Sector-C-Field-Agent-profile.webp",
  import.meta.url,
);
const DEFAULT_TARGET_URL = new URL(
  "../../../public/assets/npcs/General-Combatant-profile.webp",
  import.meta.url,
);

test("comparison UI is removed and the attack log remains as the bottom section", async () => {
  const [client, styles] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
  ]);

  assert.doesNotMatch(client, /EXPECTED OUTPUT|현재 배치 기준 비교|comparePanel/);
  assert.doesNotMatch(styles, /\.compare(?:Panel|Table|Header|Row|SelectButton)/);
  assert.match(client, /className=\{styles\.bottomGrid\} aria-label="공격 로그"/);
  assert.match(client, /<strong>공격 로그<\/strong>/);
  assert.match(client, /log\.details\?\.length[\s\S]*<details>/);
  assert.match(styles, /\.logItem summary/);
});

test("action controls wrap inside the board at desktop and mobile widths", async () => {
  const styles = await readFile(STYLES_URL, "utf8");

  assert.match(
    styles,
    /\.actionRow\s*\{[^}]*display: grid;[^}]*repeat\(auto-fit, minmax\(128px, 1fr\)\)/s,
  );
  assert.match(
    styles,
    /\.actionRow button\s*\{[^}]*width: 100%;[^}]*min-width: 0;/s,
  );
  assert.doesNotMatch(styles, /\.nextTurnButton\s*\{[^}]*margin-left: auto;/s);
  assert.match(
    styles,
    /@media \(max-width: 720px\)[\s\S]*\.actionRow\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/,
  );
});

test("the standard 5x5 battlefield can switch to vertical 1x5 and horizontal 5x1 boards", async () => {
  const [client, styles] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
  ]);

  assert.match(client, /type BattlefieldId = "5x5" \| "1x5" \| "5x1"/);
  assert.match(client, /const DEFAULT_BATTLEFIELD = BATTLEFIELDS\[0\]/);
  assert.match(client, /id: "5x5"[\s\S]*description: "표준 전장"/);
  assert.match(client, /id: "1x5"[\s\S]*columns: \["A"\]/);
  assert.match(client, /id: "5x1"[\s\S]*rows: \[1\]/);
  assert.match(client, /aria-label="전장 규격 선택"/);
  assert.match(client, /handleBattlefieldChange\(candidate\.id\)/);
  assert.match(client, /boardRows\.map\(\(row\)/);
  assert.match(client, /boardColumns\.map\(\(col\)/);
  assert.match(client, /resetTrainingState\(\s*nextBattlefield/);
  assert.match(
    client,
    /boardColumnTemplate = `repeat\(\$\{boardColumns\.length\}, minmax\(46px, 1fr\)\)`/,
  );
  assert.match(
    client,
    /boardRowTemplate = `repeat\(\$\{boardRows\.length\}, minmax\(78px, 1fr\)\)`/,
  );
  assert.doesNotMatch(client, /minmax\(160px, 240px\)|minmax\(96px, 120px\)/);
  assert.match(styles, /\.battlefieldSelector/);
  assert.match(styles, /\.battlefieldSelector__button--active/);
  assert.match(
    styles,
    /\.boardCell--attackable\s*\{[^}]*rgba\(255, 72, 72, 0\.88\)[^}]*repeating-linear-gradient/s,
  );
});

test("the weapon rack prioritizes and initially selects the main character's equipped weapon", async () => {
  const [page, client, simulator, styles] = await Promise.all([
    readFile(PAGE_URL, "utf8"),
    readFile(CLIENT_URL, "utf8"),
    readFile(SIMULATOR_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
  ]);

  assert.match(page, /listCharacterInventoryEntries\(mainCharacterId\)/);
  assert.match(page, /getSimulatorEquippedWeapons\(entries\)/);
  assert.match(page, /equippedWeapons=\{equippedWeapons\}/);
  assert.match(simulator, /entry\.equippedSlot !== "WEAPON"/);
  assert.match(simulator, /getSimulatorWeaponRule\(entry\.slug\)/);
  assert.match(client, /equippedWeapons: SimulatorEquippedWeapon\[\]/);
  assert.match(client, /Number\(b\.isEquipped\) - Number\(a\.isEquipped\)/);
  assert.match(client, /find\(\(item\) => item\.isEquipped\)\?\.slug/);
  assert.match(client, /"현재 장착 중"/);
  assert.match(client, /훈련 규칙 미등록/);
  assert.match(client, /styles\["itemButton--equipped"\]/);
  assert.match(client, /styles\["itemButton--unsupported"\]/);
  assert.match(styles, /\.itemButton--equipped/);
  assert.match(styles, /\.itemButton--unsupported/);
  assert.match(styles, /\.itemEquippedBadge/);
});

test("the main-character token uses final sheet stats, mapped art, and safe fallbacks", async () => {
  const [page, client, simulator, defaultAgent, defaultTarget] = await Promise.all([
    readFile(PAGE_URL, "utf8"),
    readFile(CLIENT_URL, "utf8"),
    readFile(SIMULATOR_URL, "utf8"),
    readFile(DEFAULT_AGENT_URL),
    readFile(DEFAULT_TARGET_URL),
  ]);

  assert.match(simulator, /portraitUrl\?: string/);
  assert.match(simulator, /characterUrl\?: string/);
  assert.match(page, /value\?\.trim\(\)/);
  assert.doesNotMatch(page, /mainCharacter\.previewImage\.trim\(\)/);
  assert.match(page, /Registrar-pixel-profile\.webp/);
  assert.match(page, /Registrar-pixel-character\.webp/);
  assert.match(page, /getPixelProfilePath\(character\.codename\)/);
  assert.match(page, /getPixelCharacterPath\(character\.codename\)/);
  assert.match(page, /function simulatorStat\(base: number, delta\?: number\)/);
  assert.match(page, /mainCharacter\.play\.atkDelta/);
  assert.match(page, /mainCharacter\.play\.defDelta/);
  assert.match(page, /mainCharacter\.play\.hpDelta/);
  assert.match(page, /mainCharacter\.play\.sanDelta/);
  assert.match(page, /optimizedAssetPath\(character\.pixelCharacterImage\)/);
  assert.match(page, /const assets = simulatorCharacterAssets\(\{ codename \}\)/);
  assert.match(page, /portraitUrl: assets\.portraitUrl \?\? DEFAULT_TRAINING_AGENT_PORTRAIT/);
  assert.match(page, /Sector-C-Field-Agent-profile\.webp/);
  assert.match(client, /General-Combatant-profile\.webp/);
  assert.match(client, /src=\{DEFAULT_TARGET_PORTRAIT\}/);
  assert.match(client, /attacker\.portraitUrl \?\? attacker\.characterUrl/);
  assert.match(client, /src=\{attackerTokenUrl\}/);
  assert.match(client, /styles\.token__character/);
  assert.match(client, /나, \$\{attacker\.codename\} 위치 토큰/);
  assert.match(client, /ATK \$\{attacker\.atk\}, DEF \$\{attacker\.def\}/);
  assert.match(client, /atk=\{attacker\.atk\}/);
  assert.match(client, /def=\{attacker\.def\}/);
  assert.match(client, /className=\{styles\.token__fallback\}/);
  assert.match(client, /\{attackerTokenInitial\}/);
  assert.match(client, /\? "이미지 미등록"/);
  assert.ok(defaultAgent.byteLength > 0);
  assert.ok(defaultTarget.byteLength > 0);
});

test("the board exposes real token dragging, weapon range cells, and turn-consuming HMG setup", async () => {
  const [client, simulator, styles] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(SIMULATOR_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
  ]);

  assert.match(client, /setPointerCapture\(event\.pointerId\)/);
  assert.match(client, /elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(
    client,
    /handleTokenPointerUp\(event, \{ kind: "attacker" \}\)/,
  );
  assert.match(client, /className=\{styles\.dragGhost\}/);
  assert.match(client, /Math\.hypot\(event\.clientX - origin\.x/);
  assert.match(
    client,
    /const didDrag = origin[\s\S]*Math\.hypot\(event\.clientX - origin\.x/,
  );
  assert.doesNotMatch(client, /draggable=\{enemyPositionConfirmed\}/);
  assert.match(client, /isSimulatorAttackableCell\(/);
  assert.match(client, /중기관총 설치 \(1턴\)/);
  assert.match(client, /중기관총 해체 \(1턴\)/);
  assert.match(client, /advanceTurnForAction\(/);
  assert.match(simulator, /attackAxis\?: "horizontal" \| "vertical" \| "diamond"/);
  assert.match(simulator, /getManhattanRange/);
  assert.match(styles, /\.boardCell--attackable/);
  assert.match(styles, /\.boardCell--dropTarget/);
});

test("melee range copy requires overlap while preserving the dagger throw exception", async () => {
  const [client, simulator] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(SIMULATOR_URL, "utf8"),
  ]);

  assert.match(simulator, /function getMeleeRange/);
  assert.match(simulator, /rule\.role === "냉병기"/);
  assert.match(
    simulator,
    /근접무기는 적과 같은 칸에 있을 때만 공격할 수 있습니다/,
  );
  assert.match(client, /근접무기는 적과 같은 칸에서만 공격 가능/);
  assert.match(client, /단검은 같은 칸에서 근접 공격하거나 2칸 이내로 투척 가능/);
  assert.match(client, /0칸 근접 공격만 가능/);
  assert.match(client, /meleeOutOfRange/);
  assert.match(client, /적과 같은 칸 필요/);
  assert.match(client, /function handleEnemyTokenClick/);
  assert.match(client, /function handleAttackerTokenClick/);
  assert.match(client, /suppressTokenClickRef/);
  assert.doesNotMatch(client, /가로 칸은 냉병기 사거리 계산에서 제외/);
});

test("encounter modes, editable targets, bosses, and blast previews are wired into the simulator", async () => {
  const [client, simulator, styles] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(SIMULATOR_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
  ]);

  assert.match(client, /useState<SimulatorEncounterMode>\("duel"\)/);
  assert.match(client, /duel: \{ label: "1:1"/);
  assert.match(client, /horde: \{ label: "다수 표적"/);
  assert.match(client, /boss: \{ label: "대형몹"/);
  assert.match(client, /const MAX_HORDE_ENEMIES = 8/);
  assert.match(client, /updateSelectedEnemyField\("hp"/);
  assert.match(client, /표적 회복/);
  assert.match(client, /기본값 복원/);
  assert.match(client, /\(turn > 1 \|\| logs\.length > 1\)/);
  assert.match(client, /수동 조정/);
  assert.match(client, /다음 표적을 직접 선택하세요/);
  assert.match(
    client,
    /encounterMode !== "horde" && livingEnemies\.length === 1/,
  );
  assert.match(client, /className=\{styles\.bossStage\}/);
  assert.match(client, /mammoth-boss\.webp/);
  assert.match(client, /DEFAULT_BOSS_FOOTPRINT/);
  assert.match(client, /전장 점유 크기/);
  assert.match(client, /getSimulatorEnemyOccupiedCells/);
  assert.match(client, /setPointerCapture\(event\.pointerId\)/);
  assert.match(
    client,
    /if \(activeToken === "aim"\) \{\s*handleCellActivate\(position\)/,
  );
  assert.match(client, /적 위치 조정 버튼을 누른 뒤 전투판을 클릭하거나/);
  assert.match(client, /<details className=\{styles\.targetControl\} open>/);
  assert.match(client, /selectedRule\?\.requiresSetup \?/);
  assert.doesNotMatch(
    client,
    /disabled=\{selectedRule\?\.slug !== "basic-heavy-machine-gun"\}/,
  );
  assert.match(simulator, /"military-fragment-grenade"/);
  assert.match(simulator, /"rocket-launcher"/);
  assert.match(simulator, /interface SimulatorActionResolution/);
  assert.match(simulator, /function getSimulatorBlastCells/);
  assert.match(simulator, /function distributeSimulatorBossDamage/);
  assert.match(simulator, /function fitSimulatorEnemyPosition/);
  assert.match(simulator, /function getSimulatorEnemyOccupiedCells/);
  assert.match(
    client,
    /selectedActionKind !== "incendiary-line"[\s\S]*!selectedRule\.blast[\s\S]*!selectedEnemy/,
  );
  assert.match(styles, /\.encounterSelector/);
  assert.match(styles, /\.targetEditor/);
  assert.match(styles, /\.bossStage/);
  assert.match(styles, /\.bossFootprintEditor/);
  assert.match(styles, /\.token__bossPortrait/);
  assert.match(styles, /\.boardCell--blastCenter/);
});

test("destructive simulator changes use the NOVUS reset dialog instead of native confirm", async () => {
  const [client, styles] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
  ]);

  assert.doesNotMatch(client, /window\.confirm/);
  assert.match(client, /useState<PendingTrainingReset \| null>\(null\)/);
  assert.match(client, /role="dialog"/);
  assert.match(client, /aria-modal="true"/);
  assert.match(client, /R-05 \/ RESET AUTHORIZATION/);
  assert.match(client, /초기화하고 변경/);
  assert.match(client, /event\.key === "Escape"/);
  assert.match(styles, /\.resetModalLayer/);
  assert.match(styles, /\.resetModalBackdrop/);
  assert.match(styles, /\.resetModal__transition/);
  assert.match(styles, /\.resetModal__confirm/);
});

test("the ranged weapon rule card exposes canonical statuses and special actions", async () => {
  const [client, simulator, styles] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(SIMULATOR_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
  ]);

  assert.match(simulator, /뜨거운 물질\(물, 기름, 불\)/);
  assert.match(simulator, /매 라운드 동안 N의 수치에 해당하는 지속 피해/);
  assert.match(simulator, /방어력에 적용되는 -N이 누적/);
  assert.match(simulator, /다음 1라운드 동안 원거리 공격 피해가 20% 감소/);
  assert.match(simulator, /name: "넉백"/);
  assert.match(simulator, /name: "광역 난사"/);
  assert.match(simulator, /name: "소이선"/);
  assert.match(client, /SIMULATOR_STATUS_RULES/);
  assert.match(client, /상태이상 규칙/);
  assert.match(client, /className=\{styles\.statusRule\}/);
  assert.match(client, /handleSpecialAction/);
  assert.match(client, /className=\{styles\.actionRule\}/);
  assert.match(client, /boardCell--fireZone/);
  assert.match(
    client,
    /selectedRule\?\.description\s*\?\?\s*selectedItem\?\.catalogDescription/,
  );
  assert.match(styles, /\.statusRule/);
  assert.match(styles, /\.actionRule/);
  assert.match(styles, /\.boardCell--fireZone/);
});

test("nochichim-style combat tokens own HP, status, and hover stats without a duplicate side status card", async () => {
  const [client, styles] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
  ]);

  assert.match(client, /className=\{styles\.token__hp\}/);
  assert.match(client, /<TokenStatPopover/);
  assert.match(client, /className=\{styles\.token__status\}/);
  assert.match(client, /aria-label="선택 장비 룰 카드"/);
  assert.doesNotMatch(client, /className=\{styles\.profileBlock\}/);
  assert.doesNotMatch(client, /className=\{styles\.targetMeters\}/);
  assert.doesNotMatch(client, /aria-label="적 상태이상"/);
  assert.match(styles, /\.token\s*\{[^}]*border-radius: 50%;/s);
  assert.match(styles, /\.token__hp\s*\{[^}]*bottom: -8px;/s);
  assert.match(styles, /\.tokenStats\s*\{[^}]*opacity: 0;/s);
  assert.match(
    styles,
    /\.token:hover \.tokenStats,[\s\S]*opacity: 1;/,
  );
});

test("attacks expose detailed formulas, token damage floats, and explicit direct targets", async () => {
  const [client, styles] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
  ]);

  assert.match(client, /function attackDamageDetails\(/);
  assert.match(
    client,
    /장비 피해 \$\{formatDamageValue\(baseDamage\)\} \+ 캐릭터 ATK/,
  );
  assert.match(client, /- DEF \$\{formatDamageValue\(result\.mitigation\)\}/);
  assert.match(client, /function showTokenDamageFloat\(/);
  assert.match(client, /styles\.tokenDamageFloat/);
  assert.match(client, /entry\.targetStat\.toUpperCase\(\)/);
  assert.match(client, /aria-label="사거리 내 공격 대상 선택"/);
  assert.match(client, /inRangeDirectAttackTargets\.map/);
  assert.match(client, /aria-label="대형몹 공격 부위 선택"/);
  assert.match(client, /livingBossParts\.length === 1/);
  assert.match(styles, /\.tokenDamageFloat/);
  assert.match(styles, /@keyframes tokenDamageFloat/);
  assert.match(styles, /\.attackTargetPicker/);
  assert.match(styles, /\.attackTargetPicker__target--active/);
});

test("turn end uses the nochichim reveal timing and only the copied notice SFX", async () => {
  const [client, styles, sfx] = await Promise.all([
    readFile(CLIENT_URL, "utf8"),
    readFile(STYLES_URL, "utf8"),
    readFile(TURN_END_SFX_URL),
  ]);

  assert.match(
    client,
    /TURN_END_SFX_SRC\s*=\s*[\s\S]*"\/assets\/equipment-shop\/sfx\/ui-notice-level-up\.mp3"/,
  );
  assert.match(client, /const TURN_REVEAL_OUT_MS = 1900/);
  assert.match(client, /const TURN_REVEAL_END_MS = 2400/);
  assert.match(client, /playTurnEndSound\(\);\s*showTurnEndReveal\(endedTurn\)/);
  assert.match(client, /\{ sound: false \}/);
  assert.match(client, /aria-label=\{`\$\{turnReveal\.endedTurn\} 턴 종료`\}/);
  assert.match(styles, /@keyframes trb-in/);
  assert.match(styles, /@keyframes trb-out/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.equal(
    createHash("sha256").update(sfx).digest("hex"),
    "63d3ed13b0de5f1506aa4f8d8cfe47999fcd54882831440fbc12ae7212c75439",
  );
});
