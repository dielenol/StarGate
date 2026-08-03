"use client";

import Image from "next/image";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { COMBAT_TRAINING_MAP_PRESETS } from "@stargate/core/domain/combat-rules";

import type {
  EquipmentShopCatalogEntry,
  EquipmentShopCatalogResponse,
} from "@/hooks/queries/useEquipmentShopQuery";

import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import { formatCredits } from "@/lib/format/credit";
import {
  advanceSimulatorTargetRound,
  applySimulatorResolutionToEnemy,
  applySimulatorStatuses,
  formatSimulatorCoord,
  formatSimulatorDamage,
  fitSimulatorEnemyPosition,
  getSimulatorBlastCells,
  getSimulatorBossPartState,
  getSimulatorBossSummary,
  getSimulatorEnemyOccupiedCells,
  getInitialSimulatorResources,
  getSimulatorEffectiveDef,
  getSimulatorIncendiaryLineCells,
  getSimulatorKnockbackTarget,
  getSimulatorRange,
  isSimulatorAttackableCell,
  getSimulatorWeaponRule,
  isSimulatorEnemyDefeated,
  isNewSimulatorCadenceCycle,
  normalizeSimulatorEnemyFootprint,
  resolveSimulatorAreaSpray,
  resolveSimulatorAttack,
  resolveSimulatorDamageProfile,
  SIMULATOR_BOARD_COLUMNS,
  SIMULATOR_BOARD_ROWS,
  SIMULATOR_RANGE_BANDS,
  SIMULATOR_RANGE_LABELS,
  SIMULATOR_STATUS_LABELS,
  SIMULATOR_STATUS_RULES,
  SIMULATOR_WEAPON_ORDER,
  type SimulatorAttackerProfile,
  type SimulatorAttackResult,
  type SimulatorBoardCoord,
  type SimulatorBossPart,
  type SimulatorEncounterMode,
  type SimulatorEnemy,
  type SimulatorEnemyFootprint,
  type SimulatorEquippedWeapon,
  type SimulatorWeaponActionKind,
  type SimulatorStatusKind,
  type SimulatorTargetStat,
  type SimulatorTargetStats,
  type SimulatorWeaponRule,
  type SimulatorWeaponSlug,
} from "@/lib/equipment-shop/simulator";

import styles from "./page.module.css";

type ActiveToken = "attacker" | "target" | "aim";
type DraggedToken =
  | { kind: "attacker" }
  | { kind: "enemy"; enemyId: string };
type SimLogTone = "hit" | "miss" | "info";
type SimLog = {
  id: number;
  tone: SimLogTone;
  text: string;
  details?: string[];
};

type TrainingFeedbackTone = "info" | "success" | "error";
type TrainingFeedback = {
  id: number;
  tone: TrainingFeedbackTone;
  title: string;
  detail: string;
};
type TokenDamageFloat = {
  id: number;
  enemyId: string;
  amount: number;
  targetStat: SimulatorTargetStat;
  detail?: string;
};

type TrainingEvent =
  | "ready"
  | "weapon"
  | "position"
  | "attack"
  | "blocked"
  | "reload"
  | "install"
  | "uninstall"
  | "turn";

type TrainingStep = {
  label: string;
  title: string;
  hint: string;
};

interface SimulatorDisplayItem {
  slug: SimulatorWeaponSlug;
  name: string;
  price: number;
  previewImage?: string;
  catalogDescription?: string;
  isEquipped: boolean;
}

interface Props {
  attacker: SimulatorAttackerProfile;
  equippedWeapons: SimulatorEquippedWeapon[];
  initialCatalog: EquipmentShopCatalogResponse;
}

type BattlefieldId = "5x5" | "1x5" | "5x1";
type PendingTrainingReset =
  | { kind: "battlefield"; battlefieldId: BattlefieldId }
  | { kind: "encounter"; mode: SimulatorEncounterMode };

interface BattlefieldConfig {
  id: BattlefieldId;
  label: string;
  description: string;
  columns: readonly SimulatorBoardCoord["col"][];
  rows: readonly SimulatorBoardCoord["row"][];
  attackerPosition: SimulatorBoardCoord;
  targetPosition: SimulatorBoardCoord;
}

const BATTLEFIELD_INITIAL_POSITIONS: Record<
  BattlefieldId,
  Pick<BattlefieldConfig, "attackerPosition" | "targetPosition">
> = {
  "5x5": {
    attackerPosition: { col: "C", row: 1 },
    targetPosition: { col: "C", row: 3 },
  },
  "1x5": {
    attackerPosition: { col: "A", row: 1 },
    targetPosition: { col: "A", row: 3 },
  },
  "5x1": {
    attackerPosition: { col: "A", row: 1 },
    targetPosition: { col: "C", row: 1 },
  },
};

const BATTLEFIELDS: readonly BattlefieldConfig[] =
  COMBAT_TRAINING_MAP_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    columns: SIMULATOR_BOARD_COLUMNS.slice(0, preset.columns),
    rows: SIMULATOR_BOARD_ROWS.slice(0, preset.rows),
    ...BATTLEFIELD_INITIAL_POSITIONS[preset.id],
  }));
const DEFAULT_BATTLEFIELD = BATTLEFIELDS[0];
const DEFAULT_TARGET: SimulatorTargetStats = {
  hp: 60,
  maxHp: 60,
  san: 40,
  maxSan: 40,
  def: 2,
  statuses: [],
  statusRounds: {},
};
const MAX_HORDE_ENEMIES = 8;
const ENCOUNTER_MODE_META: Record<
  SimulatorEncounterMode,
  { label: string; description: string }
> = {
  duel: { label: "1:1", description: "기본 표적 훈련" },
  horde: { label: "다수 표적", description: "최대 8기 교전" },
  boss: { label: "대형몹", description: "부위 파괴 훈련" },
};
const DEFAULT_BOSS_PARTS: SimulatorBossPart[] = [
  {
    id: "boss-part-core",
    name: "본체",
    hp: 60,
    maxHp: 60,
    note: "",
    x: 50,
    y: 50,
  },
];
const TURN_END_SFX_SRC =
  "/assets/equipment-shop/sfx/ui-notice-level-up.mp3";
const DEFAULT_TRAINING_AGENT_PORTRAIT =
  "/assets/npcs/Sector-C-Field-Agent-profile.webp";
const DEFAULT_TARGET_PORTRAIT =
  "/assets/npcs/General-Combatant-profile.webp";
const DEFAULT_BOSS_PORTRAIT =
  "/assets/equipment-shop/simulator/mammoth-boss.webp";
const DEFAULT_BOSS_FOOTPRINT: SimulatorEnemyFootprint = {
  columns: 2,
  rows: 2,
};
const TURN_REVEAL_OUT_MS = 1900;
const TURN_REVEAL_END_MS = 2400;

const TRAINING_STEPS: TrainingStep[] = [
  {
    label: "STEP 01",
    title: "교전 모드",
    hint: "1:1·다수·대형몹 선택",
  },
  {
    label: "STEP 02",
    title: "표적 설정",
    hint: "수치와 부위 구성",
  },
  {
    label: "STEP 03",
    title: "배치 조정",
    hint: "클릭 또는 토큰 드래그",
  },
  {
    label: "STEP 04",
    title: "행동 선택",
    hint: "장비와 특수행동 선택",
  },
  {
    label: "STEP 05",
    title: "조준·실행",
    hint: "표적·부위·착탄점 확인",
  },
  {
    label: "STEP 06",
    title: "결과 확인",
    hint: "피해·자원·다음 턴",
  },
];

function cloneTargetStats(stats: SimulatorTargetStats = DEFAULT_TARGET) {
  return {
    ...stats,
    statuses: [...stats.statuses],
    statusRounds: { ...stats.statusRounds },
  };
}

function createStandardEnemy(
  id: string,
  name: string,
  position: SimulatorBoardCoord,
): SimulatorEnemy {
  return {
    id,
    kind: "standard",
    name,
    position,
    stats: cloneTargetStats(),
  };
}

function createBossEnemy(
  position: SimulatorBoardCoord,
  columns: BattlefieldConfig["columns"],
  rows: BattlefieldConfig["rows"],
): SimulatorEnemy {
  const summary = getSimulatorBossSummary(DEFAULT_BOSS_PARTS);
  const footprint = normalizeSimulatorEnemyFootprint(
    DEFAULT_BOSS_FOOTPRINT,
    columns,
    rows,
  );
  return {
    id: "boss-target",
    kind: "boss",
    name: "대형 훈련 표적",
    position: fitSimulatorEnemyPosition(position, footprint, columns, rows),
    stats: {
      ...cloneTargetStats(),
      hp: summary.hp,
      maxHp: summary.maxHp,
    },
    bossParts: DEFAULT_BOSS_PARTS.map((part) => ({ ...part })),
    footprint,
  };
}

function createEncounterEnemies(
  mode: SimulatorEncounterMode,
  battlefield: BattlefieldConfig,
): SimulatorEnemy[] {
  if (mode === "boss") {
    return [
      createBossEnemy(
        battlefield.targetPosition,
        battlefield.columns,
        battlefield.rows,
      ),
    ];
  }
  return [
    createStandardEnemy(
      "training-target-1",
      mode === "duel" ? "훈련 표적" : "훈련 표적 1",
      battlefield.targetPosition,
    ),
  ];
}

function dragTokenKey(token: DraggedToken): string {
  return token.kind === "attacker" ? "attacker" : `enemy:${token.enemyId}`;
}

const TRAINING_SOUND_PATTERNS: Record<
  TrainingFeedbackTone,
  readonly { delay: number; duration: number; frequency: number }[]
> = {
  info: [{ delay: 0, duration: 0.06, frequency: 520 }],
  success: [
    { delay: 0, duration: 0.07, frequency: 660 },
    { delay: 0.09, duration: 0.09, frequency: 880 },
  ],
  error: [
    { delay: 0, duration: 0.11, frequency: 220 },
    { delay: 0.1, duration: 0.14, frequency: 165 },
  ],
};

const TRAINING_FEEDBACK_LABELS: Record<TrainingFeedbackTone, string> = {
  info: "훈련 안내",
  success: "실행 완료",
  error: "실행 실패",
};

function playTrainingTone(
  context: AudioContext,
  tone: TrainingFeedbackTone,
) {
  const baseTime = context.currentTime + 0.01;
  const peakGain = tone === "info" ? 0.025 : 0.035;

  TRAINING_SOUND_PATTERNS[tone].forEach((note) => {
    const start = baseTime + note.delay;
    const end = start + note.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = tone === "error" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(note.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  });
}

function createTurnEndAudio(): HTMLAudioElement {
  const audio = new Audio(TURN_END_SFX_SRC);
  audio.volume = 0.42;
  return audio;
}

function restartTurnEndAudio(audio: HTMLAudioElement): Promise<void> {
  audio.currentTime = 0;
  return audio.play();
}

function buildSimulatorItems(
  catalogItems: EquipmentShopCatalogEntry[],
  equippedWeapons: SimulatorEquippedWeapon[],
): SimulatorDisplayItem[] {
  const catalogBySlug = new Map(
    catalogItems
      .filter(
        (item) =>
          item.category === "WEAPON" || item.category === "CONSUMABLE",
      )
      .map((item) => [item.slug ?? item.key, item]),
  );
  const equippedBySlug = new Map<SimulatorWeaponSlug, SimulatorEquippedWeapon>();
  for (const item of equippedWeapons) {
    if (item.slug) equippedBySlug.set(item.slug, item);
  }

  return SIMULATOR_WEAPON_ORDER.map((slug) => {
    const rule = getSimulatorWeaponRule(slug);
    const catalogItem = catalogBySlug.get(slug);
    const equippedItem = equippedBySlug.get(slug);
    return {
      slug,
      name: equippedItem?.name ?? catalogItem?.name ?? rule?.name ?? slug,
      price: catalogItem?.price ?? rule?.price ?? 0,
      ...(equippedItem?.previewImage ?? catalogItem?.previewImage
        ? {
            previewImage:
              equippedItem?.previewImage ?? catalogItem?.previewImage,
          }
        : {}),
      ...(catalogItem?.description
        ? { catalogDescription: catalogItem.description }
        : {}),
      isEquipped: Boolean(equippedItem),
    };
  }).sort((a, b) => Number(b.isEquipped) - Number(a.isEquipped));
}

function cellKey(coord: SimulatorBoardCoord): string {
  return formatSimulatorCoord(coord);
}

function sameCoord(a: SimulatorBoardCoord, b: SimulatorBoardCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

function getEnemyAttackTargetPosition(
  enemy: SimulatorEnemy,
  attackerPosition: SimulatorBoardCoord,
  weaponSlug: SimulatorWeaponSlug | null,
  boardColumns: readonly SimulatorBoardCoord["col"][],
  boardRows: readonly SimulatorBoardCoord["row"][],
): SimulatorBoardCoord {
  const occupiedCells = getSimulatorEnemyOccupiedCells(
    enemy,
    boardColumns,
    boardRows,
  );
  const attackableCells = weaponSlug
    ? occupiedCells.filter((coord) =>
        isSimulatorAttackableCell(weaponSlug, attackerPosition, coord),
      )
    : [];

  return (
    (attackableCells.length ? attackableCells : occupiedCells).reduce<
      SimulatorBoardCoord | null
    >((nearest, coord) => {
      if (!nearest) return coord;
      const nearestRange = getSimulatorRange(attackerPosition, nearest);
      const coordRange = getSimulatorRange(attackerPosition, coord);
      return (coordRange.attackDistance ?? coordRange.verticalDistance) <
        (nearestRange.attackDistance ?? nearestRange.verticalDistance)
        ? coord
        : nearest;
    }, null) ?? enemy.position
  );
}

type TokenVitalTone = "healthy" | "warn" | "danger";

interface TokenStatPopoverProps {
  name: string;
  tag: string;
  hp: number;
  maxHp: number;
  san: number;
  maxSan: number;
  atk?: number;
  def?: number;
  statuses?: SimulatorStatusKind[];
  statusRounds?: Partial<Record<SimulatorStatusKind, number>>;
}

function tokenVitalPercent(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (current / max) * 100));
}

function formatDamageValue(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
}

function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function tokenVitalTone(current: number, max: number): TokenVitalTone {
  const percent = tokenVitalPercent(current, max);
  if (percent <= 30) return "danger";
  if (percent <= 60) return "warn";
  return "healthy";
}

function TokenStatBar({
  label,
  current,
  max,
  kind,
}: {
  label: string;
  current: number;
  max: number;
  kind: "hp" | "san";
}) {
  const tone = kind === "hp" ? tokenVitalTone(current, max) : "san";

  return (
    <div className={styles.tokenStats__bar}>
      <span>{label}</span>
      <div className={styles.tokenStats__track}>
        <i
          className={[
            styles.tokenStats__fill,
            styles[`tokenStats__fill--${tone}`],
          ].join(" ")}
          style={{ width: `${tokenVitalPercent(current, max)}%` }}
        />
        <strong>
          {current}/{max}
        </strong>
      </div>
    </div>
  );
}

function TokenStatPopover({
  name,
  tag,
  hp,
  maxHp,
  san,
  maxSan,
  atk,
  def,
  statuses = [],
  statusRounds = {},
}: TokenStatPopoverProps) {
  return (
    <div className={styles.tokenStats} aria-hidden>
      <span className={styles.tokenStats__head}>
        <strong>{name}</strong>
        <b>{tag}</b>
      </span>
      <div className={styles.tokenStats__bars}>
        <TokenStatBar label="HP" current={hp} max={maxHp} kind="hp" />
        <TokenStatBar label="SAN" current={san} max={maxSan} kind="san" />
      </div>
      <span className={styles.tokenStats__chips}>
        {typeof atk === "number" ? (
          <span>
            ATK <b>{atk}</b>
          </span>
        ) : null}
        {typeof def === "number" ? (
          <span>
            DEF <b>{def}</b>
          </span>
        ) : null}
      </span>
      <span className={styles.tokenStats__statuses}>
        <b>상태</b>
        <span>
          {statuses.length > 0
            ? statuses
                .map(
                  (status) =>
                    SIMULATOR_STATUS_RULES[status].persistentUntilRecovery
                      ? `${SIMULATOR_STATUS_LABELS[status]} · 회복 전 지속`
                      : `${SIMULATOR_STATUS_LABELS[status]} ${statusRounds[status] ?? 0}R`,
                )
                .join(" · ")
            : "정상"}
        </span>
      </span>
    </div>
  );
}

function resultTone(result: SimulatorAttackResult): SimLogTone {
  if (result.ok) return "hit";
  return result.reason === "SETUP_REQUIRED" || result.reason === "NO_RESOURCE"
    ? "miss"
    : "info";
}

function attackRuntimeFor(
  rule: SimulatorWeaponRule,
  resourceBySlug: Record<string, number>,
  hmgInstalled: boolean,
  hmgShotsInCycle: number,
  turn: number,
) {
  return {
    ...(rule.resource
      ? { resourceRemaining: resourceBySlug[rule.slug] ?? rule.resource.max }
      : {}),
    ...(rule.requiresSetup ? { installed: hmgInstalled } : {}),
    ...(rule.cadence ? { shotsInCycle: hmgShotsInCycle, turn } : {}),
  };
}

function resourceLabel(rule: SimulatorWeaponRule, remaining: number): string {
  if (!rule.resource) return "FREE";
  return `${remaining}/${rule.resource.max}`;
}

function controlReloadLabel(rule: SimulatorWeaponRule | null): string {
  if (!rule?.resource) return "재장전";
  if (rule.resource.kind === "charge") return "재시동";
  if (rule.resource.kind === "consumable") return "보충";
  return "재장전";
}

export default function EquipmentSimulatorClient({
  attacker,
  equippedWeapons,
  initialCatalog,
}: Props) {
  const simulatorItems = useMemo(
    () => buildSimulatorItems(initialCatalog.items, equippedWeapons),
    [equippedWeapons, initialCatalog.items],
  );
  const [selectedSlug, setSelectedSlug] = useState<SimulatorWeaponSlug>(
    simulatorItems.find((item) => item.isEquipped)?.slug ??
      simulatorItems.find((item) => item.slug === "basic-pistol")?.slug ??
      simulatorItems[0]?.slug ??
      "basic-pistol",
  );
  const [battlefieldId, setBattlefieldId] =
    useState<BattlefieldId>(DEFAULT_BATTLEFIELD.id);
  const [encounterMode, setEncounterMode] =
    useState<SimulatorEncounterMode>("duel");
  const [pendingTrainingReset, setPendingTrainingReset] =
    useState<PendingTrainingReset | null>(null);
  const [activeToken, setActiveToken] = useState<ActiveToken>("target");
  const [enemyPositionConfirmed, setEnemyPositionConfirmed] = useState(true);
  const [attackerPosition, setAttackerPosition] = useState(
    DEFAULT_BATTLEFIELD.attackerPosition,
  );
  const [enemies, setEnemies] = useState<SimulatorEnemy[]>(() => [
    createStandardEnemy(
      "training-target-1",
      "훈련 표적",
      DEFAULT_BATTLEFIELD.targetPosition,
    ),
  ]);
  const [selectedEnemyId, setSelectedEnemyId] = useState<string>(
    "training-target-1",
  );
  const [selectedBossPartId, setSelectedBossPartId] = useState<string | null>(
    null,
  );
  const [selectedActionKind, setSelectedActionKind] = useState<
    "attack" | SimulatorWeaponActionKind
  >("attack");
  const [blastImpact, setBlastImpact] =
    useState<SimulatorBoardCoord | null>(null);
  const [resourceBySlug, setResourceBySlug] = useState(() =>
    getInitialSimulatorResources(),
  );
  const [hmgInstalled, setHmgInstalled] = useState(false);
  const [hmgShotsInCycle, setHmgShotsInCycle] = useState(0);
  const [fireZones, setFireZones] = useState<
    {
      id: number;
      cells: string[];
      rounds: number;
    }[]
  >([]);
  const [draggedToken, setDraggedToken] = useState<DraggedToken | null>(null);
  const [dragOverlay, setDragOverlay] = useState<{
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [turn, setTurn] = useState(1);
  const [sequence, setSequence] = useState(1);
  const [trainingEvent, setTrainingEvent] = useState<TrainingEvent>("ready");
  const [activeStep, setActiveStep] = useState(0);
  const [feedback, setFeedback] = useState<TrainingFeedback | null>(null);
  const [tokenDamageFloats, setTokenDamageFloats] = useState<
    TokenDamageFloat[]
  >([]);
  const [turnReveal, setTurnReveal] = useState<{
    endedTurn: number;
    phase: "in" | "out";
  } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const turnEndAudioRef = useRef<HTMLAudioElement | null>(null);
  const dragDestinationRef = useRef<SimulatorBoardCoord | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const draggedBossPartRef = useRef<string | null>(null);
  const suppressTokenClickRef = useRef<string | null>(null);
  const enemySequenceRef = useRef(2);
  const feedbackSequenceRef = useRef(0);
  const damageFloatSequenceRef = useRef(0);
  const damageFloatTimersRef = useRef<number[]>([]);
  const resetCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const turnRevealOutTimerRef = useRef<number | null>(null);
  const turnRevealEndTimerRef = useRef<number | null>(null);
  const [logs, setLogs] = useState<SimLog[]>([
    {
      id: 0,
      tone: "info",
      text: "5×5 1:1 기본 훈련 준비. 표적 수치와 위치를 바로 조정할 수 있습니다.",
    },
  ]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      if (turnRevealOutTimerRef.current !== null) {
        window.clearTimeout(turnRevealOutTimerRef.current);
      }
      if (turnRevealEndTimerRef.current !== null) {
        window.clearTimeout(turnRevealEndTimerRef.current);
      }
      damageFloatTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      damageFloatTimersRef.current = [];
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
      const turnEndAudio = turnEndAudioRef.current;
      turnEndAudioRef.current = null;
      if (turnEndAudio) {
        turnEndAudio.pause();
        turnEndAudio.removeAttribute("src");
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingTrainingReset) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      resetCancelButtonRef.current?.focus();
    });
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingTrainingReset(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingTrainingReset]);

  const battlefield =
    BATTLEFIELDS.find((candidate) => candidate.id === battlefieldId) ??
    DEFAULT_BATTLEFIELD;
  const pendingBattlefield =
    pendingTrainingReset?.kind === "battlefield"
      ? BATTLEFIELDS.find(
          (candidate) =>
            candidate.id === pendingTrainingReset.battlefieldId,
        ) ?? DEFAULT_BATTLEFIELD
      : null;
  const resetConfirmation = pendingTrainingReset
    ? pendingTrainingReset.kind === "battlefield"
      ? {
          eyebrow: "BATTLEFIELD RECONFIGURATION",
          title: "전장 규격을 변경할까요?",
          current: `${battlefield.label} ${battlefield.description}`,
          next: `${pendingBattlefield?.label ?? DEFAULT_BATTLEFIELD.label} ${pendingBattlefield?.description ?? DEFAULT_BATTLEFIELD.description}`,
          detail:
            "새 전장 규격의 기본 배치로 전환하며 현재 훈련 진행 상태를 정리합니다.",
        }
      : {
          eyebrow: "ENCOUNTER RECONFIGURATION",
          title: "교전 모드를 변경할까요?",
          current: `${ENCOUNTER_MODE_META[encounterMode].label} · ${ENCOUNTER_MODE_META[encounterMode].description}`,
          next: `${ENCOUNTER_MODE_META[pendingTrainingReset.mode].label} · ${ENCOUNTER_MODE_META[pendingTrainingReset.mode].description}`,
          detail:
            "새 교전 모드의 기본 표적 구성으로 전환하며 현재 훈련 진행 상태를 정리합니다.",
        }
    : null;
  const boardColumns = battlefield.columns;
  const boardRows = battlefield.rows;
  const boardColumnTemplate = `repeat(${boardColumns.length}, minmax(46px, 1fr))`;
  const boardRowTemplate = `repeat(${boardRows.length}, minmax(78px, 1fr))`;
  const selectedItem =
    simulatorItems.find((item) => item.slug === selectedSlug) ??
    simulatorItems[0];
  const selectedRule = getSimulatorWeaponRule(selectedSlug);
  const livingEnemies = enemies.filter(
    (enemy) => !isSimulatorEnemyDefeated(enemy),
  );
  const selectedEnemy =
    enemies.find((enemy) => enemy.id === selectedEnemyId) ??
    (encounterMode !== "horde" && livingEnemies.length === 1
      ? livingEnemies[0]
      : selectedEnemyId
        ? enemies[0] ?? null
        : null);
  const targetPosition = selectedEnemy
    ? getEnemyAttackTargetPosition(
        selectedEnemy,
        attackerPosition,
        selectedRule?.slug ?? null,
        boardColumns,
        boardRows,
      )
    : battlefield.targetPosition;
  const targetStats = selectedEnemy?.stats ?? DEFAULT_TARGET;
  const selectedBossPart =
    selectedEnemy?.bossParts?.find(
      (part) => part.id === selectedBossPartId,
    ) ?? null;
  const livingBossParts =
    selectedEnemy?.kind === "boss"
      ? (selectedEnemy.bossParts ?? []).filter((part) => part.hp > 0)
      : [];
  const attackBossPart =
    selectedBossPart && selectedBossPart.hp > 0
      ? selectedBossPart
      : livingBossParts.length === 1
        ? livingBossParts[0]
        : null;
  const selectedBossFootprint =
    selectedEnemy?.kind === "boss"
      ? normalizeSimulatorEnemyFootprint(
          selectedEnemy.footprint ?? DEFAULT_BOSS_FOOTPRINT,
          boardColumns,
          boardRows,
        )
      : DEFAULT_BOSS_FOOTPRINT;
  const draggedEnemy =
    draggedToken?.kind === "enemy"
      ? enemies.find((enemy) => enemy.id === draggedToken.enemyId) ?? null
      : null;

  const selectedAction =
    selectedActionKind === "attack"
      ? null
      : (selectedRule?.actions?.find(
          (action) => action.kind === selectedActionKind,
        ) ?? null);
  const selectedStatusKinds = selectedRule
    ? Array.from(
        new Set(
          SIMULATOR_RANGE_BANDS.flatMap(
            (band) => selectedRule.ranges[band]?.statuses ?? [],
          ),
        ),
      )
    : [];
  const attackerTokenUrl = attacker.portraitUrl ?? attacker.characterUrl;
  const attackerTokenIsPortrait = Boolean(attacker.portraitUrl);
  const attackerUsesFieldAgentPortrait =
    attacker.portraitUrl === DEFAULT_TRAINING_AGENT_PORTRAIT;
  const attackerTokenInitial =
    attacker.codename.trim().charAt(0).toUpperCase() || "요";
  const attackTargetPosition =
    selectedRule?.blast && blastImpact ? blastImpact : targetPosition;
  const defaultRange = getSimulatorRange(
    attackerPosition,
    attackTargetPosition,
  );
  const targetEffectiveDef = getSimulatorEffectiveDef(targetStats);
  const selectedRuntime = selectedRule
    ? attackRuntimeFor(
        selectedRule,
        resourceBySlug,
        hmgInstalled,
        hmgShotsInCycle,
        turn,
      )
    : undefined;
  const selectedResult = selectedRule
    ? resolveSimulatorAttack({
        weaponSlug: selectedRule.slug,
        attacker: attackerPosition,
        target: attackTargetPosition,
        attackerStats: attacker,
        targetStats: { def: targetEffectiveDef },
        runtime: selectedRuntime,
      })
    : null;
  const directAttackTargets =
    selectedRule && !selectedRule.blast
      ? livingEnemies.map((enemy) => {
          const occupiedCells = getSimulatorEnemyOccupiedCells(
            enemy,
            boardColumns,
            boardRows,
          );
          return {
            enemy,
            targetPosition: getEnemyAttackTargetPosition(
              enemy,
              attackerPosition,
              selectedRule.slug,
              boardColumns,
              boardRows,
            ),
            inRange: occupiedCells.some((coord) =>
              isSimulatorAttackableCell(
                selectedRule.slug,
                attackerPosition,
                coord,
              ),
            ),
          };
        })
      : [];
  const inRangeDirectAttackTargets = directAttackTargets.filter(
    (candidate) => candidate.inRange,
  );
  const selectedResource =
    selectedRule?.resource && selectedRule.slug in resourceBySlug
      ? resourceBySlug[selectedRule.slug]
      : 0;
  const range = selectedResult?.range ?? defaultRange;
  const usesCardinalDirections =
    selectedRule !== null &&
    (selectedRule.blast?.aim === "cardinal" ||
      (!selectedRule.blast &&
        selectedRule.role !== "냉병기" &&
        selectedRule.slug !== "basic-heavy-machine-gun"));
  const usesDiamondRange =
    selectedRule?.slug === "basic-heavy-machine-gun";
  const usesMeleeRange = selectedRule?.role === "냉병기";
  const usesDaggerThrow = selectedRule?.slug === "basic-dagger";
  const isCardinallyAligned =
    attackerPosition.row === attackTargetPosition.row ||
    attackerPosition.col === attackTargetPosition.col;
  const attackDistance = range.attackDistance ?? range.verticalDistance;
  const meleeOutOfRange =
    usesMeleeRange && !usesDaggerThrow && attackDistance > 0;
  const attackAxisLabel =
    range.attackAxis === "horizontal"
      ? "가로"
      : range.attackAxis === "vertical"
        ? "세로"
        : range.attackAxis === "diamond"
          ? "다이아몬드"
          : usesMeleeRange
            ? "거리"
            : "세로";
  const selectedName = selectedItem?.name ?? selectedRule?.name ?? "장비";
  const blastCells =
    selectedRule?.blast && blastImpact
      ? getSimulatorBlastCells(blastImpact, boardColumns, boardRows)
      : [];
  const resultSummary = selectedRule?.blast && !blastImpact
    ? "착탄점 선택 필요"
    : !selectedEnemy && !selectedRule?.blast
      ? "표적 선택 필요"
      : selectedEnemy &&
          isSimulatorEnemyDefeated(selectedEnemy) &&
          !selectedRule?.blast
        ? "표적 전투불능"
      : selectedEnemy?.kind === "boss" &&
          selectedResult?.profile?.targetStat === "hp" &&
          !selectedRule?.blast &&
          selectedActionKind !== "area-spray" &&
          !attackBossPart
        ? "부위 선택 필요"
        : !enemyPositionConfirmed
    ? "적 위치 지정 필요"
    : selectedResult?.ok
      ? selectedResult.summary
      : selectedResult?.reasonLabel ?? "판정 대기";
  const resultSentence = /[.!?]$/.test(resultSummary)
    ? resultSummary
    : `${resultSummary}.`;
  const executionBlockedReason = !selectedRule
    ? "장비 미선택"
    : selectedAction &&
        typeof selectedAction.resourceCost === "number" &&
        selectedResource < selectedAction.resourceCost
      ? `${selectedRule.resource?.label ?? "자원"} 부족`
      : selectedActionKind === "attack" &&
          selectedRule.resource &&
          selectedResource <= 0
        ? `${selectedRule.resource.label} 부족`
        : selectedRule.requiresSetup && !hmgInstalled
          ? "설치 필요"
          : selectedActionKind === "attack" && selectedRule.blast && !blastImpact
            ? "착탄점 미선택"
            : selectedActionKind === "incendiary-line" && !blastImpact
              ? "지점 미선택"
              : selectedActionKind !== "area-spray" &&
                  selectedActionKind !== "incendiary-line" &&
                  !selectedRule.blast &&
                  !selectedEnemy
                ? "표적 미선택"
                : selectedActionKind !== "area-spray" &&
                    selectedActionKind !== "incendiary-line" &&
                    !selectedRule.blast &&
                    selectedEnemy &&
                    isSimulatorEnemyDefeated(selectedEnemy)
                  ? "표적 전투불능"
                : selectedActionKind !== "area-spray" &&
                    selectedActionKind !== "incendiary-line" &&
                    selectedEnemy?.kind === "boss" &&
                    selectedResult?.profile?.targetStat === "hp" &&
                    !selectedRule.blast &&
                    !attackBossPart
                  ? "부위 미선택"
                  : selectedActionKind !== "area-spray" &&
                      selectedActionKind !== "incendiary-line" &&
                      selectedResult &&
                      !selectedResult.ok
                    ? selectedResult.reasonLabel ?? "사거리 밖"
                    : null;
  const instructorBrief = (() => {
    switch (trainingEvent) {
      case "weapon":
        return {
          title: `${selectedName} 선택 완료`,
          text: selectedRule?.blast
            ? `${resultSentence} 전투판의 붉은 셀에서 착탄점을 선택하고 중심·주변 범위를 확인하십시오.`
            : `현재 ${SIMULATOR_RANGE_LABELS[range.band]}입니다. 예상 판정: ${resultSentence} 표적과 부위를 확인한 뒤 공격을 실행하십시오.`,
        };
      case "position":
        return {
          title: `${formatSimulatorCoord(attackerPosition)} → ${formatSimulatorCoord(targetPosition)} 배치 확인`,
          text:
            usesCardinalDirections && !isCardinallyAligned
              ? `나와 적이 대각선에 있습니다. 화기는 같은 가로줄 또는 세로줄에 놓아야 합니다. 예상 판정: ${resultSentence}`
              : meleeOutOfRange
                ? `적과 ${attackDistance}칸 떨어져 있습니다. 이 근접무기는 적과 같은 칸에 있어야 공격할 수 있습니다.`
              : usesDiamondRange
                ? `가로·세로 이동 칸의 합 ${attackDistance}칸은 ${SIMULATOR_RANGE_LABELS[range.band]} 판정입니다. 예상 판정: ${resultSentence} 준비되면 공격을 실행하십시오.`
              : `${attackAxisLabel} ${attackDistance}칸은 ${SIMULATOR_RANGE_LABELS[range.band]} 판정입니다. 예상 판정: ${resultSentence} 준비되면 공격을 실행하십시오.`,
        };
      case "attack":
        return {
          title: "공격 결과 반영 완료",
          text: `${resultSummary}. 표적별 로그와 남은 자원을 확인한 뒤 다시 공격하거나 다음 턴으로 진행하십시오.`,
        };
      case "blocked":
        return {
          title: "현재 조건에서는 공격할 수 없습니다",
          text: `${resultSummary} 오른쪽 룰 카드와 조작 버튼에서 필요한 조건을 확인하십시오.`,
        };
      case "reload":
        return {
          title: `${controlReloadLabel(selectedRule)} 완료`,
          text: `${selectedName} 자원이 복구되었습니다. 현재 배치에서 공격을 다시 실행할 수 있습니다.`,
        };
      case "install":
        return {
          title: "중기관총 설치 완료",
          text: `설치에 1턴을 사용해 ${turn}턴이 시작되었습니다. 수평 전투의 대각선 사거리를 포함해 매 턴 2회 사격할 수 있습니다.`,
        };
      case "uninstall":
        return {
          title: "중기관총 해체 완료",
          text: `해체에 1턴을 사용해 ${turn}턴이 시작되었습니다. 이제 내 토큰을 다시 이동할 수 있습니다.`,
        };
      case "turn":
        return {
          title: `${turn}턴 행동 대기`,
          text: "일반 장비는 같은 턴에도 반복 시험할 수 있습니다. 턴 진행 시 중기관총의 2회 사격 한도와 상태이상 지속 라운드를 갱신합니다.",
        };
      default:
        return {
          title: `${ENCOUNTER_MODE_META[encounterMode].label} 훈련 준비 완료`,
          text: `현재 내 위치 ${formatSimulatorCoord(attackerPosition)}, ${selectedEnemy?.name ?? "표적"} 위치 ${formatSimulatorCoord(targetPosition)}입니다. 우측에서 표적 수치를 조정하고, 위치 조정 버튼이나 토큰 드래그를 사용하십시오.`,
        };
    }
  })();

  function attackDamageDetails(
    result: SimulatorAttackResult,
    enemy: SimulatorEnemy,
  ): string[] {
    const profile = result.profile;
    const rule = result.rule;
    if (!profile || !rule) return [result.summary];

    const baseDamage = profile.amount;
    const atkBonus = rule.usesAtkBonus ? Math.max(0, attacker.atk) : 0;
    const subtotal = baseDamage + atkBonus;
    const multiplier = subtotal > 0 ? result.rawDamage / subtotal : 1;
    const effectiveDef = getSimulatorEffectiveDef(enemy.stats);
    const armorPenetration = profile.armorPenetration ?? 0;
    const defAfterPenetration = Math.max(
      0,
      effectiveDef - armorPenetration,
    );
    const targetLabel =
      result.targetStat === "san" ? "정신력" : "HP";
    const details = [
      `${SIMULATOR_RANGE_LABELS[result.range.band]} · ${profile.label} → ${targetLabel}`,
      rule.usesAtkBonus
        ? `장비 피해 ${formatDamageValue(baseDamage)} + 캐릭터 ATK ${formatDamageValue(atkBonus)} = ${formatDamageValue(subtotal)}`
        : `장비 피해 ${formatDamageValue(baseDamage)} · 캐릭터 ATK 미적용`,
    ];

    if (multiplier !== 1) {
      details.push(
        `상태 보정 ${formatDamageValue(subtotal)} × ${formatDamageValue(multiplier * 100)}% = 원 피해 ${formatDamageValue(result.rawDamage)}`,
      );
    } else {
      details.push(`합산 원 피해 ${formatDamageValue(result.rawDamage)}`);
    }

    if (!profile.appliesDef) {
      details.push(
        `DEF 미적용 · 최종 ${formatDamageValue(result.damageApplied)} ${targetLabel} 피해`,
      );
    } else if (armorPenetration > 0) {
      details.push(
        `DEF ${formatDamageValue(effectiveDef)} - 관통 ${formatDamageValue(armorPenetration)} = 적용 DEF ${formatDamageValue(defAfterPenetration)}`,
      );
      details.push(
        `${formatDamageValue(result.rawDamage)} - ${formatDamageValue(result.mitigation)} = 최종 ${formatDamageValue(result.damageApplied)} ${targetLabel} 피해`,
      );
    } else {
      details.push(
        `${formatDamageValue(result.rawDamage)} - DEF ${formatDamageValue(result.mitigation)} = 최종 ${formatDamageValue(result.damageApplied)} ${targetLabel} 피해`,
      );
    }
    return details;
  }

  function attackDamageFormula(result: SimulatorAttackResult): string {
    const profile = result.profile;
    const rule = result.rule;
    if (!profile || !rule) return result.summary;
    const atkBonus = rule.usesAtkBonus ? Math.max(0, attacker.atk) : 0;
    const subtotal = profile.amount + atkBonus;
    const multiplier = subtotal > 0 ? result.rawDamage / subtotal : 1;
    const attackTerms = rule.usesAtkBonus
      ? `장비 ${formatDamageValue(profile.amount)} + ATK ${formatDamageValue(atkBonus)}`
      : `장비 ${formatDamageValue(profile.amount)}`;
    const adjustedTerms =
      multiplier === 1
        ? attackTerms
        : `(${attackTerms}) × ${formatDamageValue(multiplier * 100)}%`;
    const targetLabel = result.targetStat === "san" ? "정신력" : "HP";
    return profile.appliesDef
      ? `${adjustedTerms} - DEF ${formatDamageValue(result.mitigation)} = ${formatDamageValue(result.damageApplied)} ${targetLabel} 피해`
      : `${adjustedTerms} = ${formatDamageValue(result.damageApplied)} ${targetLabel} 피해`;
  }

  function showTokenDamageFloat(
    enemyId: string,
    amount: number,
    targetStat: SimulatorTargetStat,
    detail?: string,
  ) {
    if (amount <= 0) return;
    const id = damageFloatSequenceRef.current + 1;
    damageFloatSequenceRef.current = id;
    setTokenDamageFloats((current) => [
      ...current,
      { id, enemyId, amount, targetStat, ...(detail ? { detail } : {}) },
    ]);
    const timer = window.setTimeout(() => {
      setTokenDamageFloats((current) =>
        current.filter((entry) => entry.id !== id),
      );
      damageFloatTimersRef.current =
        damageFloatTimersRef.current.filter((entry) => entry !== timer);
    }, 1500);
    damageFloatTimersRef.current.push(timer);
  }

  function pushLog(
    text: string,
    tone: SimLogTone,
    details?: string[],
  ) {
    setLogs((prev) =>
      [{ id: sequence, text, tone, ...(details?.length ? { details } : {}) }, ...prev].slice(
        0,
        10,
      ),
    );
    setSequence((prev) => prev + 1);
  }

  function playFeedbackSound(tone: TrainingFeedbackTone) {
    try {
      const audioWindow = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextConstructor =
        audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
      if (!AudioContextConstructor) return;

      const context =
        audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;
      if (context.state === "suspended") {
        void context
          .resume()
          .then(() => playTrainingTone(context, tone))
          .catch(() => undefined);
        return;
      }
      playTrainingTone(context, tone);
    } catch {
      // Ignore unsupported audio environments and browser playback policies.
    }
  }

  function showFeedback(
    tone: TrainingFeedbackTone,
    title: string,
    detail: string,
    options: { sound?: boolean } = {},
  ) {
    const id = feedbackSequenceRef.current + 1;
    feedbackSequenceRef.current = id;
    setFeedback({ id, tone, title, detail });
    if (options.sound !== false) {
      playFeedbackSound(tone);
    }

    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(
      () => {
        setFeedback((current) => (current?.id === id ? null : current));
        feedbackTimerRef.current = null;
      },
      tone === "error" ? 4200 : 2800,
    );
  }

  function dismissFeedback() {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setFeedback(null);
  }

  function playTurnEndSound() {
    try {
      const audio = turnEndAudioRef.current ?? createTurnEndAudio();
      turnEndAudioRef.current = audio;
      void restartTurnEndAudio(audio).catch(() => undefined);
    } catch {
      // Ignore unsupported audio environments and browser playback policies.
    }
  }

  function showTurnEndReveal(endedTurn: number) {
    if (turnRevealOutTimerRef.current !== null) {
      window.clearTimeout(turnRevealOutTimerRef.current);
    }
    if (turnRevealEndTimerRef.current !== null) {
      window.clearTimeout(turnRevealEndTimerRef.current);
    }

    setTurnReveal({ endedTurn, phase: "in" });
    turnRevealOutTimerRef.current = window.setTimeout(() => {
      setTurnReveal((current) =>
        current?.endedTurn === endedTurn
          ? { ...current, phase: "out" }
          : current,
      );
      turnRevealOutTimerRef.current = null;
    }, TURN_REVEAL_OUT_MS);
    turnRevealEndTimerRef.current = window.setTimeout(() => {
      setTurnReveal((current) =>
        current?.endedTurn === endedTurn ? null : current,
      );
      turnRevealEndTimerRef.current = null;
    }, TURN_REVEAL_END_MS);
  }

  function updateEnemy(
    enemyId: string,
    updater: (enemy: SimulatorEnemy) => SimulatorEnemy,
  ) {
    setEnemies((current) =>
      current.map((enemy) => (enemy.id === enemyId ? updater(enemy) : enemy)),
    );
  }

  function isEnemyCellOccupied(
    coord: SimulatorBoardCoord,
    movingEnemyId?: string,
  ) {
    return enemies.some(
      (enemy) =>
        enemy.id !== movingEnemyId &&
        getSimulatorEnemyOccupiedCells(
          enemy,
          boardColumns,
          boardRows,
        ).some((occupied) => sameCoord(occupied, coord)),
    );
  }

  function isEnemyPlacementBlocked(
    enemy: SimulatorEnemy,
    position: SimulatorBoardCoord,
  ) {
    const candidateCells = getSimulatorEnemyOccupiedCells(
      { ...enemy, position },
      boardColumns,
      boardRows,
    );
    return candidateCells.some((coord) =>
      isEnemyCellOccupied(coord, enemy.id),
    );
  }

  function moveToken(token: DraggedToken, coord: SimulatorBoardCoord) {
    if (token.kind === "attacker" && hmgInstalled) {
      showFeedback(
        "error",
        "중기관총 해체 필요",
        "설치 중에는 내 위치를 바꿀 수 없습니다. 중기관총을 해체한 뒤 이동하세요.",
      );
      return;
    }

    const movingEnemy =
      token.kind === "enemy"
        ? enemies.find((enemy) => enemy.id === token.enemyId)
        : null;
    if (token.kind === "enemy" && !movingEnemy) return;
    const fittedCoord = movingEnemy
      ? fitSimulatorEnemyPosition(
          coord,
          movingEnemy.footprint,
          boardColumns,
          boardRows,
        )
      : coord;
    if (
      token.kind === "enemy" &&
      movingEnemy &&
      isEnemyPlacementBlocked(movingEnemy, fittedCoord)
    ) {
      showFeedback(
        "error",
        "배치할 수 없는 칸",
        "다른 적이 점유한 칸에는 적을 겹쳐 배치할 수 없습니다.",
      );
      return;
    }

    const currentCoord =
      token.kind === "attacker"
        ? attackerPosition
        : (movingEnemy?.position ?? coord);
    if (token.kind === "attacker") {
      setAttackerPosition(coord);
    } else {
      updateEnemy(token.enemyId, (enemy) => {
        const occupiedCells = getSimulatorEnemyOccupiedCells(
          { ...enemy, position: fittedCoord },
          boardColumns,
          boardRows,
        );
        const isBurningCell = fireZones.some((zone) =>
          occupiedCells.some((occupied) =>
            zone.cells.includes(cellKey(occupied)),
          ),
        );
        return {
          ...enemy,
          position: fittedCoord,
          stats: isBurningCell
            ? applySimulatorStatuses(enemy.stats, ["burn"])
            : enemy.stats,
        };
      });
      setSelectedEnemyId(token.enemyId);
      setEnemyPositionConfirmed(true);
    }

    setTrainingEvent("position");
    setActiveStep(2);
    const label =
      token.kind === "attacker"
        ? "내 캐릭터"
        : movingEnemy?.name ?? "적";
    const detail = `${formatSimulatorCoord(currentCoord)} → ${formatSimulatorCoord(fittedCoord)}`;
    showFeedback(
      "info",
      `${label} 위치 ${sameCoord(currentCoord, fittedCoord) ? "확인" : "이동 완료"}`,
      detail,
    );
    if (!sameCoord(currentCoord, fittedCoord)) {
      pushLog(`${label} 이동 · ${detail}`, "info");
    }
  }

  function handleSelectWeapon(slug: SimulatorWeaponSlug) {
    setSelectedSlug(slug);
    setSelectedActionKind("attack");
    setBlastImpact(null);
    setActiveToken(getSimulatorWeaponRule(slug)?.blast ? "aim" : "target");
    setTrainingEvent("weapon");
    setActiveStep(3);
    const itemName =
      simulatorItems.find((item) => item.slug === slug)?.name ??
      getSimulatorWeaponRule(slug)?.name ??
      "장비";
    showFeedback(
      "info",
      "장비 선택 완료",
      `${itemName}을 시험 장비로 설정했습니다.`,
    );
  }

  function handleSelectActiveToken(token: ActiveToken) {
    if (token === "aim") return;
    setActiveToken(token);
    showFeedback(
      "info",
      token === "attacker" ? "내 위치 조정" : "적 위치 조정",
      token === "attacker"
        ? "전투판에서 내가 이동할 칸을 선택하세요."
        : `${selectedEnemy?.name ?? "적"}을 이동할 칸을 선택하거나 토큰을 직접 드래그하세요.`,
    );
  }

  function handleCellActivate(coord: SimulatorBoardCoord) {
    if (activeToken === "aim") {
      const canAim =
        selectedActionKind === "incendiary-line" ||
        (selectedRule?.blast &&
          isSimulatorAttackableCell(
            selectedRule.slug,
            attackerPosition,
            coord,
          ));
      if (!canAim) {
        showFeedback(
          "error",
          "조준할 수 없는 칸",
          selectedRule?.blast
            ? `${selectedRule.name}의 착탄 가능 범위를 벗어났습니다.`
            : "현재 행동의 유효 범위를 확인하세요.",
        );
        return;
      }
      setBlastImpact(coord);
      setTrainingEvent("position");
      setActiveStep(4);
      showFeedback(
        "info",
        selectedActionKind === "incendiary-line"
          ? "소이선 방향 선택"
          : "착탄점 선택",
        `${formatSimulatorCoord(coord)} 기준 예상 범위를 확인한 뒤 실행하세요.`,
      );
      return;
    }
    if (activeToken === "attacker") {
      moveToken({ kind: "attacker" }, coord);
      return;
    }
    if (selectedEnemy) {
      moveToken({ kind: "enemy", enemyId: selectedEnemy.id }, coord);
    }
  }

  function handleCellKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    coord: SimulatorBoardCoord,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleCellActivate(coord);
  }

  function handleTokenPointerDown(
    event: PointerEvent<HTMLDivElement>,
    token: DraggedToken,
  ) {
    if (!event.isPrimary || event.button !== 0) return;
    if (
      token.kind === "attacker" &&
      hmgInstalled
    ) {
      if (hmgInstalled) {
        showFeedback(
          "error",
          "중기관총 해체 필요",
          "설치 중에는 내 토큰을 드래그할 수 없습니다.",
        );
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDestinationRef.current = null;
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedToken(token);
    setDragOverlay({ x: event.clientX, y: event.clientY, active: false });
  }

  function coordFromPointer(
    event: PointerEvent<HTMLDivElement>,
  ): SimulatorBoardCoord | null {
    const cell = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-simulator-cell]");
    const col = cell?.dataset.simulatorCol;
    const row = Number(cell?.dataset.simulatorRow);
    if (
      !col ||
      !SIMULATOR_BOARD_COLUMNS.some((value) => value === col) ||
      !SIMULATOR_BOARD_ROWS.some((value) => value === row)
    ) {
      return null;
    }
    return {
      col: col as SimulatorBoardCoord["col"],
      row: row as SimulatorBoardCoord["row"],
    };
  }

  function handleTokenPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const origin = dragOriginRef.current;
    const active = origin
      ? Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= 6
      : false;
    const coord = coordFromPointer(event);
    dragDestinationRef.current = coord;
    setDragOverlay({ x: event.clientX, y: event.clientY, active });
    setDragOverCell(active && coord ? cellKey(coord) : null);
  }

  function handleTokenPointerUp(
    event: PointerEvent<HTMLDivElement>,
    token: DraggedToken,
  ) {
    const coord = coordFromPointer(event) ?? dragDestinationRef.current;
    const origin = dragOriginRef.current;
    const didDrag = origin
      ? Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= 6
      : dragOverlay?.active === true;
    dragDestinationRef.current = null;
    dragOriginRef.current = null;
    const key = dragTokenKey(token);
    suppressTokenClickRef.current = didDrag ? key : null;
    if (didDrag) {
      window.setTimeout(() => {
        if (suppressTokenClickRef.current === key) {
          suppressTokenClickRef.current = null;
        }
      }, 0);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.stopPropagation();
    setDraggedToken(null);
    setDragOverlay(null);
    setDragOverCell(null);
    if (didDrag && coord) moveToken(token, coord);
  }

  function handleAttackerTokenClick(
    event: MouseEvent<HTMLDivElement>,
  ) {
    event.stopPropagation();
    if (suppressTokenClickRef.current === "attacker") {
      suppressTokenClickRef.current = null;
      return;
    }
    if (activeToken === "aim") {
      handleCellActivate(attackerPosition);
      return;
    }
    setActiveToken("attacker");
  }

  function handleEnemyTokenClick(
    event: MouseEvent<HTMLDivElement>,
    enemyId: string,
    position: SimulatorBoardCoord,
  ) {
    event.stopPropagation();
    const key = `enemy:${enemyId}`;
    if (suppressTokenClickRef.current === key) {
      suppressTokenClickRef.current = null;
      return;
    }
    if (activeToken === "aim") {
      handleCellActivate(position);
      return;
    }
    setSelectedEnemyId(enemyId);
    setSelectedBossPartId(null);
    setActiveToken("target");
    setTrainingEvent("position");
    setActiveStep(3);
  }

  function handleTokenPointerCancel(
    event: PointerEvent<HTMLDivElement>,
  ) {
    dragDestinationRef.current = null;
    dragOriginRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggedToken(null);
    setDragOverlay(null);
    setDragOverCell(null);
  }

  function handleTokenPointerCaptureLost() {
    dragDestinationRef.current = null;
    dragOriginRef.current = null;
    setDraggedToken(null);
    setDragOverlay(null);
    setDragOverCell(null);
  }

  function handleReload() {
    if (!selectedRule?.resource) return;
    setResourceBySlug((prev) => ({
      ...prev,
      [selectedRule.slug]: selectedRule.resource?.max ?? 0,
    }));
    setTrainingEvent("reload");
    setActiveStep(2);
    showFeedback(
      "success",
      `${controlReloadLabel(selectedRule)} 완료`,
      `${selectedRule.name} ${selectedRule.resource.label} ${selectedRule.resource.max}/${selectedRule.resource.max}`,
    );
    pushLog(`${selectedRule.name} ${controlReloadLabel(selectedRule)} 완료`, "info");
  }

  function applyAttackResult(
    result: SimulatorAttackResult,
    enemyId = selectedEnemy?.id,
    options: { partId?: string; distributeBossDamage?: boolean } = {},
  ): { enemyDefeated: boolean; partDestroyed: boolean } | null {
    if (!enemyId || !result.targetStat) return null;
    const enemy = enemies.find((candidate) => candidate.id === enemyId);
    if (!enemy) return null;
    const targetStat = result.targetStat;
    const nextEnemy = applySimulatorResolutionToEnemy(
      enemy,
      {
        damageApplied: result.damageApplied,
        targetStat,
        statusesApplied: result.statusesApplied,
      },
      options,
    );
    updateEnemy(enemyId, () => nextEnemy);
    const enemyDefeated = isSimulatorEnemyDefeated(nextEnemy);
    const partDestroyed = Boolean(
      options.partId &&
        nextEnemy.bossParts?.find((part) => part.id === options.partId)?.hp === 0,
    );
    if (enemyDefeated && selectedEnemyId === enemyId) {
      setSelectedEnemyId("");
      setSelectedBossPartId(null);
    } else if (partDestroyed && selectedBossPartId === options.partId) {
      setSelectedBossPartId(null);
    }
    return { enemyDefeated, partDestroyed };
  }

  function advanceRoundEffects() {
    setEnemies((current) =>
      current.map((enemy) => ({
        ...enemy,
        stats: advanceSimulatorTargetRound(enemy.stats),
      })),
    );
    setFireZones((current) =>
      current
        .map((zone) => ({ ...zone, rounds: zone.rounds - 1 }))
        .filter((zone) => zone.rounds > 0),
    );
  }

  function advanceTurnForAction(
    event: Extract<TrainingEvent, "install" | "uninstall" | "turn">,
    title: string,
    detail: string,
    log: string,
  ) {
    const endedTurn = turn;
    const nextTurn = turn + 1;
    const resetCycle = isNewSimulatorCadenceCycle(turn, nextTurn);
    playTurnEndSound();
    showTurnEndReveal(endedTurn);
    advanceRoundEffects();
    setTurn(nextTurn);
    if (resetCycle) {
      setHmgShotsInCycle(0);
    }
    setTrainingEvent(event);
    setActiveStep(2);
    showFeedback("success", title, `${detail} ${nextTurn}턴 시작.`, {
      sound: false,
    });
    pushLog(`${log} · ${nextTurn}턴 시작.`, "info");
  }

  function handleToggleHmg() {
    if (selectedRule?.slug !== "basic-heavy-machine-gun") return;
    const nextInstalled = !hmgInstalled;
    setHmgInstalled(nextInstalled);
    advanceTurnForAction(
      nextInstalled ? "install" : "uninstall",
      nextInstalled ? "중기관총 설치 완료" : "중기관총 해체 완료",
      nextInstalled
        ? "설치에 1턴을 사용했습니다."
        : "해체에 1턴을 사용했습니다.",
      nextInstalled ? "중기관총 설치 완료" : "중기관총 해체 완료",
    );
  }

  function handleNextTurn() {
    const endedTurn = turn;
    const nextTurn = turn + 1;
    const resetCycle = isNewSimulatorCadenceCycle(turn, nextTurn);
    playTurnEndSound();
    showTurnEndReveal(endedTurn);
    advanceRoundEffects();
    setTurn(nextTurn);
    if (resetCycle) {
      setHmgShotsInCycle(0);
    }
    setTrainingEvent("turn");
    setActiveStep(2);
    showFeedback(
      resetCycle ? "success" : "info",
      `${nextTurn}턴 시작`,
      resetCycle
        ? "중기관총 사격 주기가 갱신되었습니다."
        : "장비와 배치를 유지한 채 다음 행동을 진행합니다.",
      { sound: false },
    );
    pushLog(
      resetCycle
        ? `${nextTurn}턴 진입. 중기관총 사격 주기가 갱신되었습니다.`
        : `${nextTurn}턴 진입.`,
      "info",
    );
  }

  function resetTrainingState(
    nextBattlefield: BattlefieldConfig,
    logText: string,
    nextMode: SimulatorEncounterMode = encounterMode,
  ) {
    if (turnRevealOutTimerRef.current !== null) {
      window.clearTimeout(turnRevealOutTimerRef.current);
      turnRevealOutTimerRef.current = null;
    }
    if (turnRevealEndTimerRef.current !== null) {
      window.clearTimeout(turnRevealEndTimerRef.current);
      turnRevealEndTimerRef.current = null;
    }
    setAttackerPosition(nextBattlefield.attackerPosition);
    const nextEnemies = createEncounterEnemies(nextMode, nextBattlefield);
    setEnemies(nextEnemies);
    setSelectedEnemyId(nextEnemies[0]?.id ?? "");
    setSelectedBossPartId(null);
    enemySequenceRef.current = 2;
    setResourceBySlug(getInitialSimulatorResources());
    setHmgInstalled(false);
    setHmgShotsInCycle(0);
    setFireZones([]);
    setBlastImpact(null);
    setSelectedActionKind("attack");
    dragDestinationRef.current = null;
    dragOriginRef.current = null;
    draggedBossPartRef.current = null;
    setDraggedToken(null);
    setDragOverlay(null);
    setDragOverCell(null);
    setTurn(1);
    setActiveToken("target");
    setEnemyPositionConfirmed(true);
    setTrainingEvent("ready");
    setActiveStep(0);
    setTurnReveal(null);
    setLogs([
      {
        id: sequence,
        tone: "info",
        text: logText,
      },
    ]);
    setSequence((prev) => prev + 1);
  }

  function applyBattlefieldChange(nextBattlefieldId: BattlefieldId) {
    const nextBattlefield =
      BATTLEFIELDS.find((candidate) => candidate.id === nextBattlefieldId) ??
      DEFAULT_BATTLEFIELD;
    setBattlefieldId(nextBattlefield.id);
    resetTrainingState(
      nextBattlefield,
      `${nextBattlefield.label} ${nextBattlefield.description}으로 전환했습니다.`,
    );
    showFeedback(
      "success",
      `${nextBattlefield.label} 전장 선택`,
      `${nextBattlefield.description} 기본 배치로 훈련 상태를 초기화했습니다.`,
    );
  }

  function handleBattlefieldChange(nextBattlefieldId: BattlefieldId) {
    if (nextBattlefieldId === battlefieldId) return;
    if (turn > 1 || logs.length > 1) {
      setPendingTrainingReset({
        kind: "battlefield",
        battlefieldId: nextBattlefieldId,
      });
      return;
    }
    applyBattlefieldChange(nextBattlefieldId);
  }

  function handleReset() {
    resetTrainingState(battlefield, "시험장 상태를 초기화했습니다.");
    showFeedback(
      "info",
      "훈련장 초기화 완료",
      `${battlefield.label} 전장의 1턴 기본 배치와 모든 장비 자원을 복구했습니다.`,
    );
  }

  function applyEncounterModeChange(nextMode: SimulatorEncounterMode) {
    setEncounterMode(nextMode);
    resetTrainingState(
      battlefield,
      `${ENCOUNTER_MODE_META[nextMode].label} 모드로 전환했습니다.`,
      nextMode,
    );
    setActiveStep(1);
    showFeedback(
      "success",
      `${ENCOUNTER_MODE_META[nextMode].label} 모드`,
      `${ENCOUNTER_MODE_META[nextMode].description} 기본 구성을 불러왔습니다.`,
    );
  }

  function handleEncounterModeChange(nextMode: SimulatorEncounterMode) {
    if (nextMode === encounterMode) return;
    if (turn > 1 || logs.length > 1) {
      setPendingTrainingReset({ kind: "encounter", mode: nextMode });
      return;
    }
    applyEncounterModeChange(nextMode);
  }

  function handleConfirmTrainingReset() {
    const pendingReset = pendingTrainingReset;
    if (!pendingReset) return;
    setPendingTrainingReset(null);
    if (pendingReset.kind === "battlefield") {
      applyBattlefieldChange(pendingReset.battlefieldId);
      return;
    }
    applyEncounterModeChange(pendingReset.mode);
  }

  function findFreeEnemyCell(): SimulatorBoardCoord | null {
    const candidates = boardRows.flatMap((row) =>
      boardColumns.map((col) => ({ col, row }) as SimulatorBoardCoord),
    );
    return (
      candidates.find(
        (coord) =>
          !sameCoord(coord, attackerPosition) &&
          !isEnemyCellOccupied(coord),
      ) ??
      candidates.find((coord) => !isEnemyCellOccupied(coord)) ??
      null
    );
  }

  function handleAddEnemy(copySelected = false) {
    if (encounterMode !== "horde") return;
    if (enemies.length >= MAX_HORDE_ENEMIES) {
      showFeedback(
        "error",
        "표적 상한 도달",
        `다수 표적전은 최대 ${MAX_HORDE_ENEMIES}기까지 배치할 수 있습니다.`,
      );
      return;
    }
    const position = findFreeEnemyCell();
    if (!position) {
      showFeedback(
        "error",
        "빈 칸 없음",
        "적을 추가하려면 다른 적이 점유하지 않은 칸이 필요합니다.",
      );
      return;
    }
    const number = enemySequenceRef.current;
    enemySequenceRef.current += 1;
    const id = `training-target-${number}`;
    const source = copySelected ? selectedEnemy : null;
    const enemy: SimulatorEnemy = source
      ? {
          ...source,
          id,
          kind: "standard",
          name: `${source.name} 복제 ${number}`,
          position,
          stats: cloneTargetStats(source.stats),
          bossParts: undefined,
        }
      : createStandardEnemy(id, `훈련 표적 ${number}`, position);
    setEnemies((current) => [...current, enemy]);
    setSelectedEnemyId(id);
    setSelectedBossPartId(null);
    setActiveStep(1);
    pushLog(`${enemy.name} 추가 · ${formatSimulatorCoord(position)}`, "info");
  }

  function handleRemoveEnemy(enemyId: string) {
    if (encounterMode !== "horde" || enemies.length <= 1) return;
    const enemy = enemies.find((candidate) => candidate.id === enemyId);
    const next = enemies.filter((candidate) => candidate.id !== enemyId);
    setEnemies(next);
    if (selectedEnemyId === enemyId) {
      setSelectedEnemyId(next[0]?.id ?? "");
      setSelectedBossPartId(null);
    }
    pushLog(`${enemy?.name ?? "표적"} 제거`, "info");
  }

  function updateSelectedEnemyField(
    field: "name" | "hp" | "maxHp" | "san" | "maxSan" | "def",
    rawValue: string,
  ) {
    if (!selectedEnemy) return;
    updateEnemy(selectedEnemy.id, (enemy) => {
      if (field === "name") {
        return {
          ...enemy,
          name: rawValue.slice(0, 48) || enemy.name,
        };
      }
      const value = Math.max(
        field === "maxHp" || field === "maxSan" ? 1 : 0,
        Math.min(99_999, Math.round(Number(rawValue) || 0)),
      );
      const stats = { ...enemy.stats, [field]: value };
      if (field === "maxHp") stats.hp = Math.min(stats.hp, value);
      if (field === "maxSan") stats.san = Math.min(stats.san, value);
      if (field === "hp") stats.hp = Math.min(value, stats.maxHp);
      if (field === "san") stats.san = Math.min(value, stats.maxSan);
      return { ...enemy, stats };
    });
  }

  function logSelectedEnemyAdjustment() {
    if (!selectedEnemy) return;
    pushLog(
      `${selectedEnemy.name} 수동 조정`,
      "info",
      [
        `HP ${selectedEnemy.stats.hp}/${selectedEnemy.stats.maxHp} · SAN ${selectedEnemy.stats.san}/${selectedEnemy.stats.maxSan} · DEF ${selectedEnemy.stats.def}`,
      ],
    );
  }

  function handleRecoverTarget() {
    if (!selectedEnemy) return;
    updateEnemy(selectedEnemy.id, (enemy) => {
      if (enemy.kind === "boss" && enemy.bossParts?.length) {
        const bossParts = enemy.bossParts.map((part) => ({
          ...part,
          hp: part.maxHp,
        }));
        const summary = getSimulatorBossSummary(bossParts);
        return {
          ...enemy,
          bossParts,
          stats: {
            ...enemy.stats,
            hp: summary.hp,
            maxHp: summary.maxHp,
            san: enemy.stats.maxSan,
            statuses: [],
            statusRounds: {},
          },
        };
      }
      return {
        ...enemy,
        stats: {
          ...enemy.stats,
          hp: enemy.stats.maxHp,
          san: enemy.stats.maxSan,
          statuses: [],
          statusRounds: {},
        },
      };
    });
    pushLog(`${selectedEnemy.name} 회복 · HP/SAN/상태 초기화`, "info");
  }

  function handleRestoreTargetDefaults() {
    if (!selectedEnemy || selectedEnemy.kind === "boss") return;
    updateEnemy(selectedEnemy.id, (enemy) => ({
      ...enemy,
      name:
        encounterMode === "duel"
          ? "훈련 표적"
          : `훈련 표적 ${enemy.id.split("-").at(-1) ?? "1"}`,
      stats: cloneTargetStats(),
    }));
    pushLog(`${selectedEnemy.name} 기본 수치 복원`, "info");
  }

  function syncBossParts(
    enemy: SimulatorEnemy,
    bossParts: SimulatorBossPart[],
  ): SimulatorEnemy {
    const summary = getSimulatorBossSummary(bossParts);
    return {
      ...enemy,
      bossParts,
      stats: { ...enemy.stats, hp: summary.hp, maxHp: summary.maxHp },
    };
  }

  function handleBossFootprintChange(
    axis: keyof SimulatorEnemyFootprint,
    rawValue: string,
  ) {
    if (selectedEnemy?.kind !== "boss") return;
    const value = Number(rawValue);
    updateEnemy(selectedEnemy.id, (enemy) => {
      const footprint = normalizeSimulatorEnemyFootprint(
        {
          ...DEFAULT_BOSS_FOOTPRINT,
          ...enemy.footprint,
          [axis]: Number.isFinite(value) ? value : 1,
        },
        boardColumns,
        boardRows,
      );
      return {
        ...enemy,
        footprint,
        position: fitSimulatorEnemyPosition(
          enemy.position,
          footprint,
          boardColumns,
          boardRows,
        ),
      };
    });
  }

  function logBossFootprintAdjustment() {
    if (selectedEnemy?.kind !== "boss") return;
    const footprint = normalizeSimulatorEnemyFootprint(
      selectedEnemy.footprint ?? DEFAULT_BOSS_FOOTPRINT,
      boardColumns,
      boardRows,
    );
    pushLog(
      `${selectedEnemy.name} 점유 크기 · ${footprint.columns}×${footprint.rows}`,
      "info",
    );
  }

  function handleAddBossPart(x = 50, y = 50) {
    if (selectedEnemy?.kind !== "boss") return;
    const parts = selectedEnemy.bossParts ?? [];
    if (parts.length >= 16) {
      showFeedback("error", "부위 상한 도달", "부위는 최대 16개입니다.");
      return;
    }
    const id = `boss-part-${Date.now()}-${parts.length + 1}`;
    const part: SimulatorBossPart = {
      id,
      name: `부위 ${parts.length + 1}`,
      hp: 50,
      maxHp: 50,
      note: "",
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
    updateEnemy(selectedEnemy.id, (enemy) =>
      syncBossParts(enemy, [...(enemy.bossParts ?? []), part]),
    );
    setSelectedBossPartId(id);
  }

  function updateBossPart(
    partId: string,
    patch: Partial<SimulatorBossPart>,
  ) {
    if (selectedEnemy?.kind !== "boss") return;
    updateEnemy(selectedEnemy.id, (enemy) => {
      const bossParts = (enemy.bossParts ?? []).map((part) => {
        if (part.id !== partId) return part;
        const maxHp =
          patch.maxHp === undefined
            ? part.maxHp
            : Math.max(1, Math.min(99_999, Math.round(patch.maxHp)));
        return {
          ...part,
          ...patch,
          name: (patch.name ?? part.name).slice(0, 48),
          note: (patch.note ?? part.note).slice(0, 160),
          maxHp,
          hp: Math.max(
            0,
            Math.min(maxHp, Math.round(patch.hp ?? part.hp)),
          ),
          x: Math.max(0, Math.min(100, patch.x ?? part.x)),
          y: Math.max(0, Math.min(100, patch.y ?? part.y)),
        };
      });
      return syncBossParts(enemy, bossParts);
    });
  }

  function handleRemoveBossPart(partId: string) {
    if (selectedEnemy?.kind !== "boss") return;
    const parts = selectedEnemy.bossParts ?? [];
    if (parts.length <= 1) {
      showFeedback(
        "error",
        "부위 유지 필요",
        "대형몹에는 최소 한 개의 부위가 필요합니다.",
      );
      return;
    }
    updateEnemy(selectedEnemy.id, (enemy) =>
      syncBossParts(
        enemy,
        (enemy.bossParts ?? []).filter((part) => part.id !== partId),
      ),
    );
    if (selectedBossPartId === partId) setSelectedBossPartId(null);
  }

  function bossPartCoordFromPointer(
    event: PointerEvent<HTMLElement>,
  ): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100,
    };
  }

  function handleBossStagePointerMove(event: PointerEvent<HTMLElement>) {
    const draggedBossPartId = draggedBossPartRef.current;
    if (!draggedBossPartId) return;
    const coord = bossPartCoordFromPointer(event);
    updateBossPart(draggedBossPartId, coord);
  }

  function handleBossStagePointerUp(event: PointerEvent<HTMLElement>) {
    const draggedBossPartId = draggedBossPartRef.current;
    if (!draggedBossPartId) return;
    const coord = bossPartCoordFromPointer(event);
    updateBossPart(draggedBossPartId, coord);
    draggedBossPartRef.current = null;
  }

  function handleAttack() {
    if (selectedActionKind !== "attack") {
      handleSpecialAction();
      return;
    }
    if (!selectedRule || !selectedResult) return;

    if (selectedRule.blast) {
      handleBlastAttack();
      return;
    }
    if (!selectedEnemy) return;

    if (!selectedResult.ok) {
      setTrainingEvent("blocked");
      setActiveStep(4);
      showFeedback(
        "error",
        "공격 실행 실패",
        selectedResult.reasonLabel ?? selectedResult.summary,
      );
      pushLog(selectedResult.reasonLabel ?? selectedResult.summary, resultTone(selectedResult));
      return;
    }
    if (
      selectedEnemy.kind === "boss" &&
      selectedResult.targetStat === "hp" &&
      !attackBossPart
    ) {
      setTrainingEvent("blocked");
      setActiveStep(4);
      showFeedback(
        "error",
        "공격 부위 선택 필요",
        "대형몹 부위도에서 파괴되지 않은 부위를 선택하세요.",
      );
      return;
    }

    if (selectedResult.nextResourceRemaining !== undefined) {
      setResourceBySlug((prev) => ({
        ...prev,
        [selectedRule.slug]: selectedResult.nextResourceRemaining ?? 0,
      }));
    }
    if (selectedResult.nextShotsInCycle !== undefined) {
      setHmgShotsInCycle(selectedResult.nextShotsInCycle);
    }
    setTrainingEvent("attack");
    setActiveStep(5);

    const targetOutcome = applyAttackResult(selectedResult, selectedEnemy.id, {
      ...(attackBossPart ? { partId: attackBossPart.id } : {}),
    });
    if (selectedResult.targetStat) {
      showTokenDamageFloat(
        selectedEnemy.id,
        selectedResult.damageApplied,
        selectedResult.targetStat,
        attackBossPart?.name,
      );
    }
    const defeatText = targetOutcome?.enemyDefeated
      ? " · 전투불능. 다음 표적을 직접 선택하세요."
      : targetOutcome?.partDestroyed
        ? " · 부위 파괴. 다음 부위를 선택하세요."
        : "";

    const statusText = selectedResult.statusesApplied.length
      ? ` · ${selectedResult.statusesApplied
          .map((status) => SIMULATOR_STATUS_LABELS[status])
          .join(", ")}`
      : "";
    const damageFormula = attackDamageFormula(selectedResult);
    showFeedback(
      "success",
      "공격 실행 완료",
      `${selectedRule.name} · ${selectedEnemy.name}${attackBossPart ? ` ${attackBossPart.name}` : ""} · ${damageFormula}${statusText}${defeatText}`,
    );
    pushLog(
      `${selectedRule.name} 기본 공격 · ${selectedEnemy.name}${attackBossPart ? ` / ${attackBossPart.name}` : ""}`,
      "hit",
      [
        ...attackDamageDetails(selectedResult, selectedEnemy),
        ...(statusText ? [`상태이상${statusText}`] : []),
        ...(defeatText ? [defeatText.replace(/^ · /, "")] : []),
      ],
    );
  }

  function handleSelectAction(
    kind: "attack" | SimulatorWeaponActionKind,
  ) {
    setSelectedActionKind(kind);
    setBlastImpact(null);
    const needsCell =
      kind === "incendiary-line" ||
      (kind === "attack" && Boolean(selectedRule?.blast));
    setActiveToken(needsCell ? "aim" : "target");
    setTrainingEvent("weapon");
    setActiveStep(3);
    const actionName =
      kind === "attack"
        ? selectedRule?.blast
          ? "착탄 공격"
          : "기본 공격"
        : selectedRule?.actions?.find((action) => action.kind === kind)?.name ??
          "특수행동";
    showFeedback(
      "info",
      `${actionName} 선택`,
      needsCell
        ? "전투판에서 공격 지점을 선택하세요."
        : "대상과 예상 판정을 확인한 뒤 공격 실행을 누르세요.",
    );
  }

  function handleBlastAttack() {
    if (!selectedRule?.blast || !selectedResult || !blastImpact) {
      setTrainingEvent("blocked");
      setActiveStep(4);
      showFeedback(
        "error",
        "착탄점 선택 필요",
        "전투판에서 붉은 공격 가능 셀을 착탄점으로 선택하세요.",
      );
      return;
    }
    if (!selectedResult.ok) {
      setTrainingEvent("blocked");
      setActiveStep(4);
      showFeedback(
        "error",
        "공격 실행 실패",
        selectedResult.reasonLabel ?? selectedResult.summary,
      );
      return;
    }

    const affectedKeys = new Set(blastCells.map(cellKey));
    const details: string[] = [];
    const damageNotices: Array<{
      enemyId: string;
      amount: number;
      targetStat: SimulatorTargetStat;
      detail: string;
    }> = [];
    let affectedCount = 0;
    const nextEnemies = enemies.map((enemy) => {
        if (isSimulatorEnemyDefeated(enemy)) return enemy;
        const occupiedCells = getSimulatorEnemyOccupiedCells(
          enemy,
          boardColumns,
          boardRows,
        );
        if (
          !occupiedCells.some((coord) => affectedKeys.has(cellKey(coord)))
        ) {
          return enemy;
        }
        const isCenter = occupiedCells.some((coord) =>
          sameCoord(coord, blastImpact),
        );
        const profile = isCenter
          ? selectedRule.blast?.center
          : selectedRule.blast?.splash;
        if (!profile) return enemy;
        const resolution = resolveSimulatorDamageProfile(
          profile,
          getSimulatorEffectiveDef(enemy.stats),
        );
        affectedCount += 1;
        details.push(
          `${enemy.name} · ${isCenter ? "중심" : "주변"} · 원 피해 ${formatDamageValue(resolution.rawDamage)} - DEF ${formatDamageValue(resolution.mitigation)} = 최종 ${formatDamageValue(resolution.damageApplied)} ${resolution.targetStat === "san" ? "정신력" : "HP"} 피해`,
        );
        damageNotices.push({
          enemyId: enemy.id,
          amount: resolution.damageApplied,
          targetStat: resolution.targetStat,
          detail: isCenter ? "폭발 중심" : "폭발 주변",
        });
        return applySimulatorResolutionToEnemy(enemy, resolution, {
          distributeBossDamage: enemy.kind === "boss",
        });
      });
    setEnemies(nextEnemies);
    damageNotices.forEach((notice) =>
      showTokenDamageFloat(
        notice.enemyId,
        notice.amount,
        notice.targetStat,
        notice.detail,
      ),
    );
    const selectedAfterBlast = nextEnemies.find(
      (enemy) => enemy.id === selectedEnemyId,
    );
    const selectedDefeatedByBlast = Boolean(
      selectedAfterBlast && isSimulatorEnemyDefeated(selectedAfterBlast),
    );
    if (selectedDefeatedByBlast) {
      setSelectedEnemyId("");
      setSelectedBossPartId(null);
    }
    if (selectedResult.nextResourceRemaining !== undefined) {
      setResourceBySlug((current) => ({
        ...current,
        [selectedRule.slug]: selectedResult.nextResourceRemaining ?? 0,
      }));
    }
    setTrainingEvent("attack");
    setActiveStep(5);
    showFeedback(
      affectedCount > 0 ? "success" : "info",
      `${selectedRule.name} 폭발`,
      `${formatSimulatorCoord(blastImpact)} 착탄 · ${affectedCount}기 피해 · 자원 1회 소모${selectedDefeatedByBlast ? " · 선택 표적 전투불능. 다음 표적을 직접 선택하세요." : ""}`,
    );
    pushLog(
      `${selectedRule.name} 폭발 · ${formatSimulatorCoord(blastImpact)} · ${affectedCount}기`,
      affectedCount > 0 ? "hit" : "info",
      details.length ? details : ["피해 범위 안에 적이 없습니다."],
    );
  }

  function handleSpecialAction() {
    if (!selectedRule || !selectedAction) return;

    const fail = (detail: string) => {
      setTrainingEvent("blocked");
      setActiveStep(4);
      showFeedback("error", `${selectedAction.name} 실행 실패`, detail);
      pushLog(`${selectedAction.name} 실패 · ${detail}`, "miss");
    };
    const actionResourceCost =
      selectedAction.resourceCost === "all"
        ? selectedResource
        : selectedAction.resourceCost;

    if (
      selectedAction.resourceCost !== "all" &&
      selectedResource < selectedAction.resourceCost
    ) {
      fail(`${selectedRule.resource?.label ?? "자원"}이 부족합니다.`);
      return;
    }
    if (selectedAction.resourceCost === "all" && selectedResource <= 0) {
      fail(`${selectedRule.resource?.label ?? "자원"}이 부족합니다.`);
      return;
    }

    if (selectedAction.kind === "knockback") {
      if (!selectedEnemy) {
        fail("밀어낼 적을 선택하세요.");
        return;
      }
      if (battlefield.id === "1x5") {
        fail("세로 전장에서는 넉백을 사용할 수 없습니다.");
        return;
      }
      if (!selectedResult?.ok) {
        fail(selectedResult?.reasonLabel ?? "현재 표적을 명중시킬 수 없습니다.");
        return;
      }
      if (
        selectedEnemy.kind === "boss" &&
        selectedResult.targetStat === "hp" &&
        !attackBossPart
      ) {
        fail("공격할 대형몹 부위를 선택하세요.");
        return;
      }
      const nextTarget = getSimulatorKnockbackTarget(
        attackerPosition,
        targetPosition,
        boardColumns,
        boardRows,
      );
      if (!nextTarget) {
        fail("대상을 뒤로 밀어낼 빈 칸이 없습니다.");
        return;
      }
      const knockbackPosition =
        selectedEnemy.kind === "boss"
          ? fitSimulatorEnemyPosition(
              {
                col:
                  boardColumns[
                    boardColumns.indexOf(selectedEnemy.position.col) +
                      (boardColumns.indexOf(nextTarget.col) -
                        boardColumns.indexOf(targetPosition.col))
                  ] ?? selectedEnemy.position.col,
                row:
                  boardRows[
                    boardRows.indexOf(selectedEnemy.position.row) +
                      (boardRows.indexOf(nextTarget.row) -
                        boardRows.indexOf(targetPosition.row))
                  ] ?? selectedEnemy.position.row,
              },
              selectedEnemy.footprint,
              boardColumns,
              boardRows,
            )
          : nextTarget;
      if (sameCoord(knockbackPosition, selectedEnemy.position)) {
        fail("전장 경계 밖으로는 대상을 밀어낼 수 없습니다.");
        return;
      }
      if (isEnemyPlacementBlocked(selectedEnemy, knockbackPosition)) {
        fail("밀려날 칸을 다른 적이 점유하고 있습니다.");
        return;
      }
      setResourceBySlug((prev) => ({
        ...prev,
        [selectedRule.slug]: selectedResource - actionResourceCost,
      }));
      updateEnemy(selectedEnemy.id, (enemy) => ({
        ...applySimulatorResolutionToEnemy(
          enemy,
          {
            damageApplied: selectedResult.damageApplied,
            targetStat: selectedResult.targetStat ?? "hp",
            statusesApplied: selectedResult.statusesApplied,
          },
          { ...(attackBossPart ? { partId: attackBossPart.id } : {}) },
        ),
        position: knockbackPosition,
      }));
      if (selectedResult.targetStat) {
        showTokenDamageFloat(
          selectedEnemy.id,
          selectedResult.damageApplied,
          selectedResult.targetStat,
          attackBossPart?.name ?? "넉백",
        );
      }
      setTrainingEvent("attack");
      setActiveStep(5);
      showFeedback(
        "success",
        "넉백 실행 완료",
        `${attackDamageFormula(selectedResult)} · ${selectedEnemy.name} ${formatSimulatorCoord(knockbackPosition)}로 1칸 후퇴`,
      );
      pushLog(
        `${selectedRule.name} 넉백 · ${selectedEnemy.name}${attackBossPart ? ` / ${attackBossPart.name}` : ""}`,
        "hit",
        [
          ...attackDamageDetails(selectedResult, selectedEnemy),
          `${formatSimulatorCoord(selectedEnemy.position)} → ${formatSimulatorCoord(knockbackPosition)}`,
        ],
      );
      return;
    }

    if (selectedAction.kind === "area-spray") {
      const candidates = enemies
        .filter((enemy) => !isSimulatorEnemyDefeated(enemy))
        .flatMap((enemy) => {
          const occupiedCells = getSimulatorEnemyOccupiedCells(
            enemy,
            boardColumns,
            boardRows,
          );
          const target =
            occupiedCells.find((coord) =>
              isSimulatorAttackableCell(
                selectedRule.slug,
                attackerPosition,
                coord,
              ),
            ) ?? enemy.position;
          const result = resolveSimulatorAttack({
            weaponSlug: selectedRule.slug,
            attacker: attackerPosition,
            target,
            attackerStats: attacker,
            targetStats: { def: getSimulatorEffectiveDef(enemy.stats) },
            runtime: selectedRuntime,
          });
          return result.ok ? [{ enemy, result }] : [];
        });
      if (candidates.length === 0) {
        fail("사거리 안에 공격 가능한 적이 없습니다.");
        return;
      }
      const outcomes = resolveSimulatorAreaSpray(
        candidates.map((candidate) => candidate.result),
        rollD6,
      );
      const details: string[] = [];
      const damageNotices: Array<{
        enemyId: string;
        amount: number;
        targetStat: SimulatorTargetStat;
      }> = [];
      let hitCount = 0;
      const nextEnemies = enemies.map((enemy) => {
          const candidateIndex = candidates.findIndex(
            (candidate) => candidate.enemy.id === enemy.id,
          );
          if (candidateIndex < 0) return enemy;
          const outcome = outcomes[candidateIndex];
          if (!outcome?.hit) {
            details.push(`${enemy.name} · 1d6=${outcome?.roll ?? "-"} · 회피`);
            return enemy;
          }
          hitCount += 1;
          details.push(
            `${enemy.name} · 1d6=${outcome.roll} · 명중`,
            ...attackDamageDetails(outcome.result, enemy).map(
              (detail) => `└ ${detail}`,
            ),
          );
          damageNotices.push({
            enemyId: enemy.id,
            amount: outcome.result.damageApplied,
            targetStat: outcome.result.targetStat ?? "hp",
          });
          return applySimulatorResolutionToEnemy(
            enemy,
            {
              damageApplied: outcome.result.damageApplied,
              targetStat: outcome.result.targetStat ?? "hp",
              statusesApplied: outcome.result.statusesApplied,
            },
            { distributeBossDamage: enemy.kind === "boss" },
          );
        });
      setEnemies(nextEnemies);
      damageNotices.forEach((notice) =>
        showTokenDamageFloat(
          notice.enemyId,
          notice.amount,
          notice.targetStat,
          "광역 난사",
        ),
      );
      const selectedAfterSpray = nextEnemies.find(
        (enemy) => enemy.id === selectedEnemyId,
      );
      const selectedDefeatedBySpray = Boolean(
        selectedAfterSpray && isSimulatorEnemyDefeated(selectedAfterSpray),
      );
      if (selectedDefeatedBySpray) {
        setSelectedEnemyId("");
        setSelectedBossPartId(null);
      }
      setResourceBySlug((prev) => ({ ...prev, [selectedRule.slug]: 0 }));
      const firstResult = candidates[0]?.result;
      if (firstResult?.nextShotsInCycle !== undefined) {
        setHmgShotsInCycle(firstResult.nextShotsInCycle);
      }
      setTrainingEvent("attack");
      setActiveStep(5);
      showFeedback(
        hitCount > 0 ? "success" : "info",
        "광역 난사 완료",
        `${candidates.length}기 판정 · ${hitCount}기 명중 · 모든 탄환 소모${selectedDefeatedBySpray ? " · 선택 표적 전투불능. 다음 표적을 직접 선택하세요." : ""}`,
      );
      pushLog(
        `${selectedRule.name} 광역 난사 · ${hitCount}/${candidates.length}기 명중`,
        hitCount > 0 ? "hit" : "info",
        details,
      );
      return;
    }

    if (!blastImpact) {
      fail("소이선을 만들 셀 또는 방향을 선택하세요.");
      return;
    }
    const cells = getSimulatorIncendiaryLineCells(
      attackerPosition,
      blastImpact,
      boardColumns,
      boardRows,
    );
    if (cells.length === 0) {
      fail("나와 적을 같은 가로줄 또는 세로줄에 배치해야 합니다.");
      return;
    }
    const zoneCells = cells.map(cellKey);
    setResourceBySlug((prev) => ({
      ...prev,
      [selectedRule.slug]: selectedResource - actionResourceCost,
    }));
    setFireZones((current) => [
      ...current,
      { id: sequence, cells: zoneCells, rounds: 3 },
    ]);
    const burnedNames: string[] = [];
    const nextEnemies = enemies.map((enemy) => {
        if (isSimulatorEnemyDefeated(enemy)) return enemy;
        if (
          !getSimulatorEnemyOccupiedCells(
            enemy,
            boardColumns,
            boardRows,
          ).some((coord) => zoneCells.includes(cellKey(coord)))
        ) {
          return enemy;
        }
        burnedNames.push(enemy.name);
        return {
          ...enemy,
          stats: applySimulatorStatuses(enemy.stats, ["burn"]),
        };
      });
    setEnemies(nextEnemies);
    setTrainingEvent("attack");
    setActiveStep(5);
    showFeedback(
      "success",
      "소이선 생성 완료",
      `${zoneCells.join(", ")} · 3라운드 · ${burnedNames.length}기 화상`,
    );
    pushLog(
      `${selectedRule.name} 소이선 · ${zoneCells.join(", ")} · 3라운드`,
      "hit",
      burnedNames.length
        ? burnedNames.map((name) => `${name} · 화상`)
        : ["현재 지대 안에 적이 없습니다."],
    );
  }

  return (
    <div className={styles.simRoot} data-pixel-font="full">
      <PageHead
        hasVisibleHeading
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "자산", href: "/erp/inventory" },
          { label: "훈련장" },
        ]}
        title="훈련장"
      />

      {resetConfirmation ? (
        <div className={styles.resetModalLayer}>
          <button
            type="button"
            className={styles.resetModalBackdrop}
            onClick={() => setPendingTrainingReset(null)}
            aria-label="훈련 상태 초기화 확인창 닫기"
          />
          <section
            className={styles.resetModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="simulator-reset-title"
            aria-describedby="simulator-reset-description"
          >
            <div className={styles.resetModal__topline}>
              <span>R-05 / RESET AUTHORIZATION</span>
              <b>LOCAL SIMULATION</b>
            </div>
            <button
              type="button"
              className={styles.resetModal__close}
              onClick={() => setPendingTrainingReset(null)}
              aria-label="취소하고 확인창 닫기"
            >
              ×
            </button>
            <header className={styles.resetModal__header}>
              <span className={styles.resetModal__icon} aria-hidden>
                !
              </span>
              <div>
                <Eyebrow>{resetConfirmation.eyebrow}</Eyebrow>
                <h2 id="simulator-reset-title">{resetConfirmation.title}</h2>
                <p id="simulator-reset-description">
                  {resetConfirmation.detail}
                </p>
              </div>
            </header>
            <div
              className={styles.resetModal__transition}
              aria-label={`현재 ${resetConfirmation.current}, 다음 ${resetConfirmation.next}`}
            >
              <span>
                <small>CURRENT</small>
                <strong>{resetConfirmation.current}</strong>
              </span>
              <b aria-hidden>→</b>
              <span>
                <small>NEXT</small>
                <strong>{resetConfirmation.next}</strong>
              </span>
            </div>
            <div className={styles.resetModal__resetScope}>
              <strong>초기화되는 훈련 항목</strong>
              <ul>
                <li>현재 턴과 공격·이동 로그</li>
                <li>탄환·충전·보충 수량과 설치 상태</li>
                <li>표적 상태이상과 화염 지대 및 행동 선택</li>
              </ul>
            </div>
            <p className={styles.resetModal__notice}>
              캐릭터·인벤토리 원본 데이터에는 영향을 주지 않습니다.
            </p>
            <footer className={styles.resetModal__actions}>
              <button
                ref={resetCancelButtonRef}
                type="button"
                className={styles.resetModal__cancel}
                onClick={() => setPendingTrainingReset(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.resetModal__confirm}
                onClick={handleConfirmTrainingReset}
              >
                초기화하고 변경
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {draggedToken && dragOverlay?.active ? (
        <div
          className={styles.dragGhost}
          style={{
            left: dragOverlay.x,
            top: dragOverlay.y,
          }}
          aria-hidden
        >
          <span>
            {draggedToken.kind === "attacker"
              ? attackerTokenInitial
              : draggedEnemy?.kind === "boss"
                ? (
                    <Image
                      src={DEFAULT_BOSS_PORTRAIT}
                      width={64}
                      height={64}
                      alt=""
                      className={styles.dragGhost__bossPortrait}
                      draggable={false}
                      unoptimized
                    />
                  )
                : "적"}
          </span>
          <strong>
            {draggedToken.kind === "attacker"
              ? attacker.codename
              : draggedEnemy?.name ?? "훈련 표적"}
          </strong>
        </div>
      ) : null}

      {feedback ? (
        <div
          className={[
            styles.feedbackToast,
            styles[`feedbackToast--${feedback.tone}`],
          ].join(" ")}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live={feedback.tone === "error" ? "assertive" : "polite"}
        >
          <span className={styles.feedbackToast__icon} aria-hidden>
            {feedback.tone === "success"
              ? "✓"
              : feedback.tone === "error"
                ? "!"
                : "i"}
          </span>
          <div className={styles.feedbackToast__body}>
            <span>{TRAINING_FEEDBACK_LABELS[feedback.tone]}</span>
            <strong>{feedback.title}</strong>
            <p>{feedback.detail}</p>
          </div>
          <button
            type="button"
            className={styles.feedbackToast__dismiss}
            onClick={dismissFeedback}
            aria-label="훈련 알림 닫기"
          >
            ×
          </button>
        </div>
      ) : null}

      {turnReveal ? (
        <div
          className={[
            styles["turn-reveal-banner"],
            styles["turn-reveal-banner--visible"],
            styles[
              turnReveal.phase === "in"
                ? "turn-reveal-banner--slide-in"
                : "turn-reveal-banner--slide-out"
            ],
          ].join(" ")}
          role="status"
          aria-live="polite"
          aria-label={`${turnReveal.endedTurn} 턴 종료`}
        >
          <div className={styles["trb-shell"]}>
            <div className={styles["trb-orbit"]} aria-hidden />
            <div className={styles["trb-mainline"]} aria-hidden>
              <b className={styles["trb-number"]}>{turnReveal.endedTurn}</b>
              <span className={styles["trb-word"]}>턴 종료</span>
            </div>
          </div>
        </div>
      ) : null}

      <section className={styles.stageHeader}>
        <div className={styles.stageIntro}>
          <Eyebrow>ARMORY TEST GRID</Eyebrow>
          <h1>전장 선택형 장비 훈련</h1>
          <p>
            기본 1:1부터 다수 표적과 대형몹 부위 파괴까지 장비의
            거리·피해·광역 효과를 턴 단위로 시험합니다. 실제 캐릭터와
            인벤토리는 변경되지 않습니다.
          </p>
          <div className={styles.stageBadges} aria-label="훈련장 상태">
            <Tag tone="gold">턴 단위 모의훈련</Tag>
            <Tag tone="info">
              {battlefield.label} {battlefield.description}
            </Tag>
            <Tag tone="info">
              {ENCOUNTER_MODE_META[encounterMode].label}
            </Tag>
            <Tag tone="info">실데이터 미반영</Tag>
          </div>
        </div>
        <ol className={styles.trainingFlow} aria-label="훈련 진행 순서">
          {TRAINING_STEPS.map((step, index) => (
            <li
              key={step.label}
              className={[
                index === activeStep ? styles["trainingFlow__step--active"] : "",
                index < activeStep ? styles["trainingFlow__step--done"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={index === activeStep ? "step" : undefined}
            >
              <span>{step.label}</span>
              <strong>{step.title}</strong>
              <em>{step.hint}</em>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.encounterSelector} aria-label="교전 모드 선택">
        <div>
          <Eyebrow>ENCOUNTER MODE</Eyebrow>
          <strong>교전 구성을 선택하세요</strong>
          <span>페이지 진입 기본값은 기존과 같은 1:1 훈련입니다.</span>
        </div>
        <div className={styles.encounterSelector__buttons} role="group">
          {(Object.keys(ENCOUNTER_MODE_META) as SimulatorEncounterMode[]).map(
            (mode) => (
              <button
                key={mode}
                type="button"
                className={
                  encounterMode === mode
                    ? styles["encounterSelector__button--active"]
                    : ""
                }
                aria-pressed={encounterMode === mode}
                onClick={() => handleEncounterModeChange(mode)}
              >
                <strong>{ENCOUNTER_MODE_META[mode].label}</strong>
                <span>{ENCOUNTER_MODE_META[mode].description}</span>
              </button>
            ),
          )}
        </div>
      </section>

      <section className={styles.guidePanel} aria-labelledby="range-guide-title">
        <div className={styles.guideNpc} aria-hidden>
          <span>R-05</span>
        </div>
        <div className={styles.guideContent}>
          <div className={styles.guideHeading}>
            <div>
              <Eyebrow>LIVE TRAINING ASSIST</Eyebrow>
              <strong id="range-guide-title">R-05 · 실시간 훈련 안내</strong>
            </div>
            <span>선택·거리·판정을 읽고 다음 행동을 안내합니다.</span>
          </div>
          <p className={styles.guideDialogue} aria-live="polite">
            <strong>{instructorBrief.title}</strong>
            {instructorBrief.text}
          </p>
        </div>
      </section>

      <section className={styles.simLayout} aria-label="훈련장">
        <aside className={styles.catalogPanel} aria-label="훈련 장비 목록">
          <div className={styles.panelIntro}>
            <Eyebrow>WEAPON RACK</Eyebrow>
            <strong>
              {equippedWeapons.length > 0 ? "장착 장비 우선" : "보급형 장비"}
            </strong>
          </div>
          <div className={styles.itemRail}>
            {equippedWeapons
              .filter((item) => !item.slug)
              .map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={[
                    styles.itemButton,
                    styles["itemButton--equipped"],
                    styles["itemButton--unsupported"],
                  ].join(" ")}
                  disabled
                >
                  <span className={styles.itemThumb}>
                    {item.previewImage ? (
                      <Image
                        src={item.previewImage}
                        width={54}
                        height={54}
                        alt=""
                        aria-hidden
                        unoptimized
                      />
                    ) : (
                      <span aria-hidden>?</span>
                    )}
                  </span>
                  <span className={styles.itemMain}>
                    <strong>{item.name}</strong>
                    <small>훈련 규칙 미등록</small>
                  </span>
                  <span className={styles.itemMeta}>
                    장착 무기
                    <span className={styles.itemEquippedBadge}>EQUIPPED</span>
                  </span>
                </button>
              ))}
            {simulatorItems.map((item) => {
              const rule = getSimulatorWeaponRule(item.slug);
              const active = selectedSlug === item.slug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  className={[
                    styles.itemButton,
                    item.isEquipped ? styles["itemButton--equipped"] : "",
                    active ? styles["itemButton--active"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={active}
                  onClick={() => handleSelectWeapon(item.slug)}
                >
                  <span className={styles.itemThumb}>
                    {item.previewImage ? (
                      <Image
                        src={item.previewImage}
                        width={54}
                        height={54}
                        alt=""
                        aria-hidden
                        unoptimized
                      />
                    ) : (
                      <span aria-hidden>{rule?.role.slice(0, 1) ?? "?"}</span>
                    )}
                  </span>
                  <span className={styles.itemMain}>
                    <strong>{item.name}</strong>
                    <small>
                      {item.isEquipped ? "현재 장착 중" : formatCredits(item.price)}
                    </small>
                  </span>
                  <span className={styles.itemMeta}>
                    {rule?.role ?? "장비"}
                    {item.isEquipped ? (
                      <span className={styles.itemEquippedBadge}>EQUIPPED</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          className={styles.boardPanel}
          aria-label={`${battlefield.label} ${battlefield.description}`}
        >
          <div className={styles.boardToolbar}>
            <div className={styles.boardIdentity}>
              <Eyebrow>TACTICAL BOARD</Eyebrow>
              <div
                className={styles.battlefieldSelector}
                role="group"
                aria-label="전장 규격 선택"
              >
                {BATTLEFIELDS.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={
                      battlefieldId === candidate.id
                        ? styles["battlefieldSelector__button--active"]
                        : ""
                    }
                    aria-pressed={battlefieldId === candidate.id}
                    onClick={() => handleBattlefieldChange(candidate.id)}
                  >
                    <strong>{candidate.label}</strong>
                    <span>{candidate.description}</span>
                  </button>
                ))}
              </div>
              <strong>
                {formatSimulatorCoord(attackerPosition)} →{" "}
                {formatSimulatorCoord(targetPosition)}
              </strong>
            </div>
            <div className={styles.boardToolbarActions}>
              <div className={styles.turnClock} aria-label={`현재 ${turn}턴`}>
                <span>TURN</span>
                <strong>{String(turn).padStart(2, "0")}</strong>
              </div>
              <div className={styles.placementControl}>
                <span
                  id="simulator-placement-status"
                  className={styles.placementStatus}
                  aria-live="polite"
                >
                  {activeToken === "attacker"
                    ? "내 위치 조정 중"
                    : activeToken === "aim"
                      ? "공격 지점 선택 중"
                      : `적 위치 조정 중 · ${selectedEnemy?.name ?? "표적 없음"}`}
                </span>
                <div
                  className={styles.placementButtons}
                  role="group"
                  aria-label="배치 단계 선택"
                >
                  <button
                    type="button"
                    className={
                      activeToken === "attacker" ? styles.activeToggle : ""
                    }
                    aria-pressed={activeToken === "attacker"}
                    onClick={() => handleSelectActiveToken("attacker")}
                  >
                    {activeToken === "attacker"
                      ? "내 위치 조정 중"
                      : "내 위치 조정"}
                  </button>
                  <button
                    type="button"
                    className={
                      activeToken === "target" ? styles.activeToggle : ""
                    }
                    aria-pressed={activeToken === "target"}
                    onClick={() => handleSelectActiveToken("target")}
                  >
                    {activeToken === "target"
                      ? "적 위치 지정 중"
                      : "적 위치 조정"}
                  </button>
                </div>
                <p className={styles.placementHelp}>
                  적 위치 조정 버튼을 누른 뒤 전투판을 클릭하거나, 토큰을
                  직접 드래그해 위치를 조정할 수 있습니다.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.rangeStrip} aria-live="polite">
            <span>
              {meleeOutOfRange
                ? "공격 불가"
                : usesCardinalDirections && !isCardinallyAligned
                  ? "사격 불가"
                  : SIMULATOR_RANGE_LABELS[range.band]}
            </span>
            <strong>
              {usesCardinalDirections && !isCardinallyAligned
                ? "직선 정렬 필요"
                : meleeOutOfRange
                  ? "적과 같은 칸 필요"
                : usesDiamondRange
                  ? `이동 합계 ${attackDistance}칸`
                  : `${attackAxisLabel} ${attackDistance}칸`}
            </strong>
            <em>
              {usesDiamondRange
                ? "중기관총은 가로·세로 이동 칸의 합으로 다이아몬드 사거리 계산"
                : usesCardinalDirections
                  ? isCardinallyAligned
                    ? "나와 적의 직선 거리로 사거리 계산"
                    : "화기는 같은 가로줄 또는 세로줄에서만 공격 가능"
                  : usesDaggerThrow
                    ? "단검은 같은 칸에서 근접 공격하거나 2칸 이내로 투척 가능"
                    : "근접무기는 적과 같은 칸에서만 공격 가능"}
            </em>
            <small>
              {usesMeleeRange
                ? usesDaggerThrow
                  ? "0칸 근접 · 1–2칸 투척"
                  : "0칸 근접 공격만 가능"
                : "0칸 근거리 · 1–2칸 중거리 · 3–4칸 장거리"}
            </small>
          </div>

          <section className={styles.controlPanel} aria-label="전투 조작 패널">
            <div className={styles.actionPicker} role="group" aria-label="행동 선택">
              <button
                type="button"
                className={
                  selectedActionKind === "attack" ? styles.activeToggle : ""
                }
                aria-pressed={selectedActionKind === "attack"}
                onClick={() => handleSelectAction("attack")}
              >
                {selectedRule?.blast ? "착탄 공격" : "기본 공격"}
              </button>
              {(selectedRule?.actions ?? []).map((action) => (
                <button
                  key={action.kind}
                  type="button"
                  className={
                    selectedActionKind === action.kind
                      ? styles.activeToggle
                      : ""
                  }
                  aria-pressed={selectedActionKind === action.kind}
                  onClick={() => handleSelectAction(action.kind)}
                >
                  {action.name}
                </button>
              ))}
            </div>
            {encounterMode === "horde" &&
            selectedRule &&
            !selectedRule.blast &&
            (selectedActionKind === "attack" ||
              selectedActionKind === "knockback") ? (
              <div
                className={styles.attackTargetPicker}
                aria-label="사거리 내 공격 대상 선택"
              >
                <div>
                  <span>ATTACK TARGET</span>
                  <strong>사거리 내 표적 선택</strong>
                </div>
                {inRangeDirectAttackTargets.length ? (
                  <div role="group" aria-label="공격 가능한 표적">
                    {inRangeDirectAttackTargets.map((candidate) => (
                      <button
                        key={candidate.enemy.id}
                        type="button"
                        className={
                          candidate.enemy.id === selectedEnemy?.id
                            ? styles["attackTargetPicker__target--active"]
                            : ""
                        }
                        aria-pressed={
                          candidate.enemy.id === selectedEnemy?.id
                        }
                        onClick={() => {
                          setSelectedEnemyId(candidate.enemy.id);
                          setSelectedBossPartId(null);
                          setActiveToken("target");
                          setTrainingEvent("weapon");
                          setActiveStep(4);
                        }}
                      >
                        <strong>{candidate.enemy.name}</strong>
                        <span>
                          {formatSimulatorCoord(candidate.targetPosition)} · HP{" "}
                          {candidate.enemy.stats.hp}/
                          {candidate.enemy.stats.maxHp}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>현재 장비의 사거리 안에 생존 표적이 없습니다.</p>
                )}
              </div>
            ) : null}
            {selectedEnemy?.kind === "boss" &&
            selectedResult?.targetStat === "hp" &&
            !selectedRule?.blast &&
            (selectedActionKind === "attack" ||
              selectedActionKind === "knockback") ? (
              <div
                className={styles.attackTargetPicker}
                aria-label="대형몹 공격 부위 선택"
              >
                <div>
                  <span>BOSS PART</span>
                  <strong>공격 부위 선택</strong>
                </div>
                {livingBossParts.length === 1 ? (
                  <p>
                    생존 부위가 하나이므로{" "}
                    <strong>{livingBossParts[0]?.name}</strong>에 자동
                    조준합니다.
                  </p>
                ) : livingBossParts.length > 1 ? (
                  <div role="group" aria-label="공격 가능한 대형몹 부위">
                    {livingBossParts.map((part) => (
                      <button
                        key={part.id}
                        type="button"
                        className={
                          part.id === attackBossPart?.id
                            ? styles["attackTargetPicker__target--active"]
                            : ""
                        }
                        aria-pressed={part.id === attackBossPart?.id}
                        onClick={() => {
                          setSelectedBossPartId(part.id);
                          setTrainingEvent("weapon");
                          setActiveStep(4);
                        }}
                      >
                        <strong>{part.name}</strong>
                        <span>
                          HP {part.hp}/{part.maxHp}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>공격 가능한 생존 부위가 없습니다.</p>
                )}
              </div>
            ) : null}
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.fireButton}
                onClick={handleAttack}
                disabled={Boolean(executionBlockedReason)}
                aria-describedby="simulator-placement-status"
              >
                {selectedAction?.name ?? "공격"} 실행
              </button>
              {selectedRule?.resource ? (
                <button
                  type="button"
                  className={styles.controlButton}
                  onClick={handleReload}
                  disabled={selectedResource >= selectedRule.resource.max}
                >
                  {controlReloadLabel(selectedRule)}
                </button>
              ) : null}
              {selectedRule?.requiresSetup ? (
                <button
                  type="button"
                  className={styles.controlButton}
                  onClick={handleToggleHmg}
                >
                  {hmgInstalled
                    ? "중기관총 해체 (1턴)"
                    : "중기관총 설치 (1턴)"}
                </button>
              ) : null}
              <button
                type="button"
                className={styles.nextTurnButton}
                onClick={handleNextTurn}
              >
                턴 종료 → {turn + 1}턴
              </button>
              <button
                type="button"
                className={styles.resetButton}
                onClick={handleReset}
              >
                초기화
              </button>
            </div>
            {executionBlockedReason ? (
              <p className={styles.actionBlocker} role="status">
                실행 대기 · {executionBlockedReason}
              </p>
            ) : (
              <p className={styles.actionReady} role="status">
                대상과 예상 범위를 확인했습니다. 실행할 수 있습니다.
              </p>
            )}

            <div className={styles.controlReadouts}>
              <div>
                <span>선택 장비</span>
                <strong>{selectedName}</strong>
              </div>
              <div>
                <span>공격 예상</span>
                <strong>{resultSummary}</strong>
              </div>
              <div>
                <span>{selectedRule?.resource?.label ?? "자원"}</span>
                <strong>
                  {selectedRule
                    ? resourceLabel(selectedRule, selectedResource)
                    : "--"}
                </strong>
              </div>
              <div>
                <span>턴 사용 규칙</span>
                <strong>
                  {selectedRule?.cadence
                    ? `${hmgInstalled ? "설치됨" : "미설치"} · 매 턴 ${selectedRule.cadence.shotsPerCycle}회 · 현재 ${hmgShotsInCycle}/${selectedRule.cadence.shotsPerCycle}`
                    : "같은 턴 연속 시험 가능"}
                </strong>
              </div>
            </div>
          </section>

          <div
            className={styles.boardFrame}
            style={{
              gridTemplateColumns: `34px ${boardColumnTemplate}`,
              gridTemplateRows: `28px ${boardRowTemplate}`,
            }}
          >
            <div className={styles.cornerLabel} aria-hidden />
            {boardColumns.map((col, columnIndex) => (
              <div
                key={col}
                className={styles.columnLabel}
                style={{ gridColumn: columnIndex + 2 }}
                aria-hidden
              >
                {col}
              </div>
            ))}
            {boardRows.map((row, rowIndex) => (
              <div
                key={`row-${row}`}
                className={styles.rowLabel}
                style={{ gridRow: rowIndex + 2 }}
                aria-hidden
              >
                {row}
              </div>
            ))}
            <div
              className={styles.boardGrid}
              style={{
                gridColumn: `2 / ${boardColumns.length + 2}`,
                gridRow: `2 / ${boardRows.length + 2}`,
                gridTemplateColumns: boardColumnTemplate,
                gridTemplateRows: boardRowTemplate,
              }}
            >
              {boardRows.map((row) =>
                boardColumns.map((col) => {
                  const coord: SimulatorBoardCoord = { col, row };
                  const hasAttacker = sameCoord(coord, attackerPosition);
                  const anchoredEnemies = enemies.filter((enemy) =>
                    sameCoord(coord, enemy.position),
                  );
                  const cellEnemies = enemies.filter((enemy) =>
                    getSimulatorEnemyOccupiedCells(
                      enemy,
                      boardColumns,
                      boardRows,
                    ).some((occupied) => sameCoord(occupied, coord)),
                  );
                  const hasTarget = cellEnemies.length > 0;
                  const isAttackable =
                    selectedRule !== null &&
                    isSimulatorAttackableCell(
                      selectedRule.slug,
                      attackerPosition,
                      coord,
                    );
                  const isDropTarget = dragOverCell === cellKey(coord);
                  const activeFireZones = fireZones.filter((zone) =>
                    zone.cells.includes(cellKey(coord)),
                  );
                  const isFireZone = activeFireZones.length > 0;
                  const isBlastArea = blastCells.some((cell) =>
                    sameCoord(cell, coord),
                  );
                  const isBlastCenter = Boolean(
                    blastImpact && sameCoord(blastImpact, coord),
                  );
                  return (
                    <div
                      key={cellKey(coord)}
                      role="button"
                      tabIndex={0}
                      data-simulator-cell
                      data-simulator-col={col}
                      data-simulator-row={row}
                      className={[
                        styles.boardCell,
                        isAttackable
                          ? styles["boardCell--attackable"]
                          : "",
                        isDropTarget
                          ? styles["boardCell--dropTarget"]
                          : "",
                        isFireZone ? styles["boardCell--fireZone"] : "",
                        isBlastArea ? styles["boardCell--blastArea"] : "",
                        isBlastCenter ? styles["boardCell--blastCenter"] : "",
                        hasAttacker ? styles["boardCell--attacker"] : "",
                        hasTarget ? styles["boardCell--target"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleCellActivate(coord)}
                      onKeyDown={(event) => handleCellKeyDown(event, coord)}
                      aria-label={
                        `${
                          activeToken === "attacker"
                            ? `나를 ${cellKey(coord)} 칸으로 이동`
                            : activeToken === "aim"
                              ? `${cellKey(coord)} 칸을 공격 지점으로 선택`
                              : `${selectedEnemy?.name ?? "적"}을 ${cellKey(coord)} 칸에 배치`
                        }${
                          isAttackable
                            ? `; ${selectedName} 공격 가능 범위`
                            : ""
                        }${
                          isFireZone
                            ? `; 소이선 화염 지대 ${Math.max(...activeFireZones.map((zone) => zone.rounds))}라운드`
                            : ""
                        }${
                          hasAttacker
                            ? `; 나 ${attacker.codename}, HP ${attacker.hp}/${attacker.hp}, 정신력 ${attacker.san}/${attacker.san}, ATK ${attacker.atk}, DEF ${attacker.def}`
                            : ""
                        }${
                          hasTarget
                            ? `; ${cellEnemies.map((enemy) => `${enemy.name} HP ${enemy.stats.hp}/${enemy.stats.maxHp}`).join(", ")}`
                            : ""
                        }`
                      }
                    >
                      <span className={styles.cellCoord}>{cellKey(coord)}</span>
                      {hasAttacker ? (
                        <div
                          className={[
                            styles.token,
                            styles["token--attacker"],
                            draggedToken?.kind === "attacker"
                              ? styles["token--dragging"]
                              : "",
                            attackerPosition.row <= 2
                              ? styles["token--popoverBelow"]
                              : "",
                            boardColumns.indexOf(attackerPosition.col) >=
                            Math.ceil(boardColumns.length / 2)
                              ? styles["token--popoverLeft"]
                              : "",
                          ].join(" ")}
                          onClick={handleAttackerTokenClick}
                          onPointerDown={(event) =>
                            handleTokenPointerDown(event, { kind: "attacker" })
                          }
                          onPointerMove={handleTokenPointerMove}
                          onPointerUp={(event) =>
                            handleTokenPointerUp(event, { kind: "attacker" })
                          }
                          onPointerCancel={handleTokenPointerCancel}
                          onLostPointerCapture={handleTokenPointerCaptureLost}
                          role="img"
                          aria-label={`나, ${attacker.codename} 위치 토큰. HP ${attacker.hp}/${attacker.hp}, 정신력 ${attacker.san}/${attacker.san}, ATK ${attacker.atk}, DEF ${attacker.def}`}
                        >
                          <span className={styles.token__inner} aria-hidden>
                            {attackerTokenUrl ? (
                              <Image
                                src={attackerTokenUrl}
                                width={64}
                                height={64}
                                alt=""
                                className={
                                  attackerTokenIsPortrait
                                    ? [
                                        styles.token__portrait,
                                        attackerUsesFieldAgentPortrait
                                          ? styles[
                                              "token__portrait--fieldAgent"
                                            ]
                                          : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")
                                    : styles.token__character
                                }
                                draggable={false}
                                loading="eager"
                                unoptimized
                              />
                            ) : (
                              <span className={styles.token__fallback}>
                                {attackerTokenInitial}
                              </span>
                            )}
                          </span>
                          <span
                            className={styles.token__hp}
                            title={`HP ${attacker.hp}/${attacker.hp}`}
                            aria-hidden
                          >
                            <i
                              className={[
                                styles.token__hpFill,
                                styles["token__hpFill--healthy"],
                              ].join(" ")}
                            />
                          </span>
                          <span className={styles.token__label} aria-hidden>
                            <b>나</b>
                            <span>{attacker.codename}</span>
                          </span>
                          <TokenStatPopover
                            name={attacker.codename}
                            tag={
                              attackerTokenUrl
                                ? "내 캐릭터"
                                : attacker.source === "agent"
                                  ? "이미지 미등록"
                                  : "훈련 요원"
                            }
                            hp={attacker.hp}
                            maxHp={attacker.hp}
                            san={attacker.san}
                            maxSan={attacker.san}
                            atk={attacker.atk}
                            def={attacker.def}
                          />
                        </div>
                      ) : null}
                      {anchoredEnemies.map((enemy) => {
                        const defeated = isSimulatorEnemyDefeated(enemy);
                        const enemyDef = getSimulatorEffectiveDef(enemy.stats);
                        const enemyFootprint =
                          normalizeSimulatorEnemyFootprint(
                            enemy.footprint,
                            boardColumns,
                            boardRows,
                          );
                        const enemyDamageFloats = tokenDamageFloats.filter(
                          (entry) => entry.enemyId === enemy.id,
                        );
                        const isSelected = enemy.id === selectedEnemy?.id;
                        const isDragging =
                          draggedToken?.kind === "enemy" &&
                          draggedToken.enemyId === enemy.id;
                        return (
                          <div
                            key={enemy.id}
                            className={[
                              styles.token,
                              styles["token--target"],
                              enemy.kind === "boss"
                                ? styles["token--boss"]
                                : "",
                              isSelected ? styles["token--selected"] : "",
                              defeated ? styles["token--defeated"] : "",
                              isDragging ? styles["token--dragging"] : "",
                              enemyDamageFloats.length
                                ? styles["token--takingDamage"]
                                : "",
                              enemy.position.row <= 2
                                ? styles["token--popoverBelow"]
                                : "",
                              boardColumns.indexOf(enemy.position.col) >=
                              Math.ceil(boardColumns.length / 2)
                                ? styles["token--popoverLeft"]
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={
                              enemy.kind === "boss"
                                ? ({
                                    "--boss-width": `calc(${enemyFootprint.columns * 100}% + ${(enemyFootprint.columns - 1) * 4}px - 8px)`,
                                    "--boss-height": `calc(${enemyFootprint.rows * 100}% + ${(enemyFootprint.rows - 1) * 4}px - 8px)`,
                                  } as CSSProperties)
                                : undefined
                            }
                            onClick={(event) =>
                              handleEnemyTokenClick(
                                event,
                                enemy.id,
                                enemy.position,
                              )
                            }
                            onPointerDown={(event) =>
                              handleTokenPointerDown(event, {
                                kind: "enemy",
                                enemyId: enemy.id,
                              })
                            }
                            onPointerMove={handleTokenPointerMove}
                            onPointerUp={(event) =>
                              handleTokenPointerUp(event, {
                                kind: "enemy",
                                enemyId: enemy.id,
                              })
                            }
                            onPointerCancel={handleTokenPointerCancel}
                            onLostPointerCapture={handleTokenPointerCaptureLost}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isSelected}
                            onKeyDown={(event) => {
                              if (
                                event.key !== "Enter" &&
                                event.key !== " "
                              ) {
                                return;
                              }
                              event.preventDefault();
                              if (activeToken === "aim") {
                                handleCellActivate(enemy.position);
                              } else {
                                setSelectedEnemyId(enemy.id);
                                setActiveToken("target");
                              }
                            }}
                            aria-label={`적, ${enemy.name} 위치 토큰${enemy.kind === "boss" ? `, ${enemyFootprint.columns}×${enemyFootprint.rows}칸 점유` : ""}. HP ${enemy.stats.hp}/${enemy.stats.maxHp}, 정신력 ${enemy.stats.san}/${enemy.stats.maxSan}, DEF ${enemyDef}, 상태 ${defeated ? "전투불능" : enemy.stats.statuses.map((status) => SIMULATOR_STATUS_LABELS[status]).join(", ") || "정상"}`}
                          >
                            <span className={styles.token__inner} aria-hidden>
                              {enemy.kind === "boss" ? (
                                <Image
                                  src={DEFAULT_BOSS_PORTRAIT}
                                  width={1024}
                                  height={683}
                                  alt=""
                                  className={styles.token__bossPortrait}
                                  draggable={false}
                                  loading="eager"
                                  unoptimized
                                />
                              ) : (
                                <Image
                                  src={DEFAULT_TARGET_PORTRAIT}
                                  width={64}
                                  height={64}
                                  alt=""
                                  className={[
                                    styles.token__portrait,
                                    styles["token__portrait--fieldAgent"],
                                  ].join(" ")}
                                  draggable={false}
                                  loading="eager"
                                  unoptimized
                                />
                              )}
                            </span>
                            {enemyDamageFloats.map((entry, index) => (
                              <span
                                key={entry.id}
                                className={[
                                  styles.tokenDamageFloat,
                                  styles[
                                    `tokenDamageFloat--${entry.targetStat}`
                                  ],
                                ].join(" ")}
                                style={
                                  {
                                    "--damage-float-index": index,
                                  } as CSSProperties
                                }
                                role="status"
                              >
                                <b>
                                  {entry.targetStat.toUpperCase()} -
                                  {formatDamageValue(entry.amount)}
                                </b>
                                {entry.detail ? (
                                  <small>{entry.detail}</small>
                                ) : null}
                              </span>
                            ))}
                            {enemy.kind === "boss"
                              ? (enemy.bossParts ?? []).slice(0, 6).map((part, index) => (
                                  <span
                                    key={part.id}
                                    className={[
                                      styles.token__bossPin,
                                      getSimulatorBossPartState(part) ===
                                      "destroyed"
                                        ? styles["token__bossPin--destroyed"]
                                        : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    style={{
                                      left: `${part.x}%`,
                                      top: `${part.y}%`,
                                    }}
                                    aria-hidden
                                  >
                                    {index + 1}
                                  </span>
                                ))
                              : null}
                            <span
                              className={styles.token__hp}
                              title={`HP ${enemy.stats.hp}/${enemy.stats.maxHp}`}
                              aria-hidden
                            >
                              <i
                                className={[
                                  styles.token__hpFill,
                                  styles[
                                    `token__hpFill--${tokenVitalTone(
                                      enemy.stats.hp,
                                      enemy.stats.maxHp,
                                    )}`
                                  ],
                                ].join(" ")}
                                style={{
                                  width: `${tokenVitalPercent(
                                    enemy.stats.hp,
                                    enemy.stats.maxHp,
                                  )}%`,
                                }}
                              />
                            </span>
                            <span className={styles.token__label} aria-hidden>
                              <b>{enemy.kind === "boss" ? "대형" : "적"}</b>
                              <span>{enemy.name}</span>
                            </span>
                            {enemy.stats.statuses.map((status) => (
                              <span
                                key={status}
                                className={styles.token__status}
                                title={`${SIMULATOR_STATUS_LABELS[status]}: ${SIMULATOR_STATUS_RULES[status].effect}`}
                                aria-hidden
                              >
                                {status === "burn" ? "화" : "멍"}
                              </span>
                            ))}
                            <TokenStatPopover
                              name={enemy.name}
                              tag={
                                defeated
                                  ? "전투불능"
                                  : enemy.kind === "boss"
                                    ? "대형몹"
                                    : "적"
                              }
                              hp={enemy.stats.hp}
                              maxHp={enemy.stats.maxHp}
                              san={enemy.stats.san}
                              maxSan={enemy.stats.maxSan}
                              def={enemyDef}
                              statuses={enemy.stats.statuses}
                              statusRounds={enemy.stats.statusRounds}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                }),
              )}
            </div>
          </div>

        </section>

        <aside className={styles.targetPanel} aria-label="선택 장비 룰 카드">
          <details className={styles.targetControl} open>
            <summary>
              <span>
                <Eyebrow>TARGET CONTROL</Eyebrow>
                <strong>표적 제어</strong>
              </span>
              <b>{enemies.length}기</b>
            </summary>

            {encounterMode === "horde" ? (
              <div className={styles.enemyRoster} aria-label="다수 표적 목록">
                {enemies.map((enemy, index) => (
                  <button
                    key={enemy.id}
                    type="button"
                    className={
                      enemy.id === selectedEnemyId
                        ? styles["enemyRoster__item--active"]
                        : ""
                    }
                    aria-pressed={enemy.id === selectedEnemyId}
                    onClick={() => {
                      setSelectedEnemyId(enemy.id);
                      setSelectedBossPartId(null);
                    }}
                  >
                    <span>{index + 1}</span>
                    <strong>{enemy.name}</strong>
                    <em>
                      HP {enemy.stats.hp}/{enemy.stats.maxHp}
                    </em>
                  </button>
                ))}
                <div className={styles.enemyRoster__actions}>
                  <button type="button" onClick={() => handleAddEnemy(false)}>
                    + 표적 추가
                  </button>
                  <button type="button" onClick={() => handleAddEnemy(true)}>
                    선택 복제
                  </button>
                  <button
                    type="button"
                    disabled={enemies.length <= 1 || !selectedEnemy}
                    onClick={() =>
                      selectedEnemy && handleRemoveEnemy(selectedEnemy.id)
                    }
                  >
                    선택 삭제
                  </button>
                </div>
              </div>
            ) : null}

            {selectedEnemy ? (
              <div className={styles.targetEditor}>
                <label className={styles.targetEditor__wide}>
                  <span>표적 이름</span>
                  <input
                    value={selectedEnemy.name}
                    maxLength={48}
                    onBlur={logSelectedEnemyAdjustment}
                    onChange={(event) =>
                      updateSelectedEnemyField("name", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>현재 HP</span>
                  <input
                    type="number"
                    min={0}
                    max={selectedEnemy.stats.maxHp}
                    value={selectedEnemy.stats.hp}
                    disabled={selectedEnemy.kind === "boss"}
                    onBlur={logSelectedEnemyAdjustment}
                    onChange={(event) =>
                      updateSelectedEnemyField("hp", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>최대 HP</span>
                  <input
                    type="number"
                    min={1}
                    max={99999}
                    value={selectedEnemy.stats.maxHp}
                    disabled={selectedEnemy.kind === "boss"}
                    onBlur={logSelectedEnemyAdjustment}
                    onChange={(event) =>
                      updateSelectedEnemyField("maxHp", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>현재 SAN</span>
                  <input
                    type="number"
                    min={0}
                    max={selectedEnemy.stats.maxSan}
                    value={selectedEnemy.stats.san}
                    onBlur={logSelectedEnemyAdjustment}
                    onChange={(event) =>
                      updateSelectedEnemyField("san", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>최대 SAN</span>
                  <input
                    type="number"
                    min={1}
                    max={99999}
                    value={selectedEnemy.stats.maxSan}
                    onBlur={logSelectedEnemyAdjustment}
                    onChange={(event) =>
                      updateSelectedEnemyField("maxSan", event.target.value)
                    }
                  />
                </label>
                <label className={styles.targetEditor__wide}>
                  <span>DEF</span>
                  <input
                    type="number"
                    min={0}
                    max={99999}
                    value={selectedEnemy.stats.def}
                    onBlur={logSelectedEnemyAdjustment}
                    onChange={(event) =>
                      updateSelectedEnemyField("def", event.target.value)
                    }
                  />
                </label>
                <div className={styles.targetEditor__actions}>
                  <button type="button" onClick={handleRecoverTarget}>
                    표적 회복
                  </button>
                  {selectedEnemy.kind === "standard" ? (
                    <button type="button" onClick={handleRestoreTargetDefaults}>
                      기본값 복원
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {selectedEnemy?.kind === "boss" ? (
              <section className={styles.bossEditor} aria-label="대형몹 부위 편집">
                <div className={styles.bossSummary}>
                  <span>합산 본체 HP</span>
                  <strong>
                    {getSimulatorBossSummary(selectedEnemy.bossParts ?? []).hp} /{" "}
                    {getSimulatorBossSummary(selectedEnemy.bossParts ?? []).maxHp}
                  </strong>
                  <em>
                    생존 부위{" "}
                    {getSimulatorBossSummary(selectedEnemy.bossParts ?? []).alive}/
                    {getSimulatorBossSummary(selectedEnemy.bossParts ?? []).total}
                  </em>
                </div>
                <div
                  className={styles.bossFootprintEditor}
                  aria-label="대형몹 전장 점유 크기"
                >
                  <div>
                    <strong>전장 점유 크기</strong>
                    <span>
                      현재 {selectedBossFootprint.columns}×
                      {selectedBossFootprint.rows}칸
                    </span>
                  </div>
                  <label>
                    가로
                    <input
                      type="number"
                      min={1}
                      max={boardColumns.length}
                      value={selectedBossFootprint.columns}
                      onChange={(event) =>
                        handleBossFootprintChange(
                          "columns",
                          event.target.value,
                        )
                      }
                      onBlur={logBossFootprintAdjustment}
                    />
                  </label>
                  <span aria-hidden>×</span>
                  <label>
                    세로
                    <input
                      type="number"
                      min={1}
                      max={boardRows.length}
                      value={selectedBossFootprint.rows}
                      onChange={(event) =>
                        handleBossFootprintChange("rows", event.target.value)
                      }
                      onBlur={logBossFootprintAdjustment}
                    />
                  </label>
                  <small>
                    전장 경계를 넘으면 위치와 크기가 자동으로 맞춰집니다.
                  </small>
                </div>
                <div
                  className={styles.bossStage}
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest("button")
                    ) {
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    handleAddBossPart(
                      ((event.clientX - rect.left) / rect.width) * 100,
                      ((event.clientY - rect.top) / rect.height) * 100,
                    );
                  }}
                  onPointerMove={handleBossStagePointerMove}
                  onPointerUp={handleBossStagePointerUp}
                  onPointerCancel={() => {
                    draggedBossPartRef.current = null;
                  }}
                  aria-label="대형몹 부위도. 빈 곳을 눌러 부위를 추가합니다."
                >
                  <Image
                    src={DEFAULT_BOSS_PORTRAIT}
                    fill
                    sizes="(max-width: 720px) 100vw, 340px"
                    alt=""
                    className={styles.bossStage__portrait}
                    draggable={false}
                    unoptimized
                  />
                  {(selectedEnemy.bossParts ?? []).map((part, index) => (
                    <button
                      key={part.id}
                      type="button"
                      className={[
                        styles.bossPin,
                        selectedBossPartId === part.id
                          ? styles["bossPin--selected"]
                          : "",
                        styles[
                          `bossPin--${getSimulatorBossPartState(part)}`
                        ],
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ left: `${part.x}%`, top: `${part.y}%` }}
                      aria-pressed={selectedBossPartId === part.id}
                      aria-label={`${part.name}, HP ${part.hp}/${part.maxHp}, ${getSimulatorBossPartState(part)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedBossPartId(part.id);
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setSelectedBossPartId(part.id);
                        draggedBossPartRef.current = part.id;
                      }}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
                <p className={styles.bossStageHelp}>
                  빈 곳을 눌러 부위를 추가하고, 핀을 드래그해 위치를
                  조정합니다. 전투에서는 선택된 핀에 직접 피해가 적용됩니다.
                </p>
                <div className={styles.bossPartList}>
                  {(selectedEnemy.bossParts ?? []).map((part, index) => (
                    <div
                      key={part.id}
                      className={[
                        styles.bossPartRow,
                        selectedBossPartId === part.id
                          ? styles["bossPartRow--selected"]
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <button
                        type="button"
                        className={styles.bossPartRow__select}
                        onClick={() => setSelectedBossPartId(part.id)}
                      >
                        {index + 1}
                      </button>
                      <input
                        aria-label={`${index + 1}번 부위 이름`}
                        value={part.name}
                        maxLength={48}
                        onChange={(event) =>
                          updateBossPart(part.id, { name: event.target.value })
                        }
                      />
                      <input
                        aria-label={`${part.name} 현재 HP`}
                        type="number"
                        min={0}
                        max={part.maxHp}
                        value={part.hp}
                        onChange={(event) =>
                          updateBossPart(part.id, {
                            hp: Number(event.target.value),
                          })
                        }
                      />
                      <input
                        aria-label={`${part.name} 최대 HP`}
                        type="number"
                        min={1}
                        max={99999}
                        value={part.maxHp}
                        onChange={(event) =>
                          updateBossPart(part.id, {
                            maxHp: Number(event.target.value),
                          })
                        }
                      />
                      <button
                        type="button"
                        className={styles.bossPartRow__remove}
                        disabled={(selectedEnemy.bossParts?.length ?? 0) <= 1}
                        onClick={() => handleRemoveBossPart(part.id)}
                        aria-label={`${part.name} 삭제`}
                      >
                        ×
                      </button>
                      <input
                        className={styles.bossPartRow__note}
                        aria-label={`${part.name} 메모`}
                        placeholder="부위 메모"
                        value={part.note}
                        maxLength={160}
                        onChange={(event) =>
                          updateBossPart(part.id, { note: event.target.value })
                        }
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.bossAddButton}
                  disabled={(selectedEnemy.bossParts?.length ?? 0) >= 16}
                  onClick={() => handleAddBossPart()}
                >
                  + 부위 추가
                </button>
              </section>
            ) : null}
          </details>

          <div className={styles.ruleDivider} />
          <div className={styles.panelIntro}>
            <Eyebrow>RULE CARD</Eyebrow>
            <strong>{selectedRule?.name ?? "장비 없음"}</strong>
          </div>

          <div className={styles.rangeMatrix} aria-label="사거리별 피해">
            {SIMULATOR_RANGE_BANDS.map((band) => {
              const profile = selectedRule?.ranges[band];
              return (
                <div key={band}>
                  <span>{SIMULATOR_RANGE_LABELS[band]}</span>
                  <strong>{profile ? formatSimulatorDamage(profile) : "--"}</strong>
                </div>
              );
            })}
          </div>

          <p className={styles.descriptionText}>
            {selectedRule?.description ??
              selectedItem?.catalogDescription ??
              "카탈로그 장비를 선택하면 운용 메모가 표시됩니다."}
          </p>

          <div className={styles.noteList}>
            {(selectedRule?.notes ?? []).map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>

          {(selectedRule?.actions ?? []).map((action) => (
            <section
              key={action.kind}
              className={styles.actionRule}
              aria-label={`${action.name} 행동 효과`}
            >
              <strong>[행동 효과] {action.name}</strong>
              <p>{action.description}</p>
            </section>
          ))}

          {selectedStatusKinds.map((status) => {
            const statusRule = SIMULATOR_STATUS_RULES[status];
            return (
              <section
                key={status}
                className={styles.statusRule}
                aria-label={`${SIMULATOR_STATUS_LABELS[status]} 상태이상 규칙`}
              >
                <strong>[{SIMULATOR_STATUS_LABELS[status]}]</strong>
                <p>
                  <b>설명</b>
                  {statusRule.description}
                </p>
                <p>
                  <b>효과</b>
                  {statusRule.effect}
                </p>
              </section>
            );
          })}
        </aside>
      </section>

      <section className={styles.bottomGrid} aria-label="공격 로그">
        <div className={styles.logPanel}>
          <div className={styles.panelIntro}>
            <Eyebrow>SIM LOG</Eyebrow>
            <strong>공격 로그</strong>
          </div>
          <div className={styles.logList} aria-live="polite">
            {logs.map((log) => (
              <div
                key={log.id}
                className={[styles.logItem, styles[`logItem--${log.tone}`]].join(
                  " ",
                )}
              >
                {log.details?.length ? (
                  <details>
                    <summary>
                      <strong>{log.text}</strong>
                    </summary>
                    <ul>
                      {log.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <strong>{log.text}</strong>
                )}
              </div>
            ))}
          </div>
        </div>

      </section>
    </div>
  );
}
