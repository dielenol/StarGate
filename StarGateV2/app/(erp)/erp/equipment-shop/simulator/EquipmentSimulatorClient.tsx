"use client";

import Image from "next/image";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  EquipmentShopCatalogEntry,
  EquipmentShopCatalogResponse,
} from "@/hooks/queries/useEquipmentShopQuery";

import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import { formatCredits } from "@/lib/format/credit";
import {
  formatSimulatorCoord,
  formatSimulatorDamage,
  getInitialSimulatorResources,
  getSimulatorRange,
  isSimulatorAttackableCell,
  getSimulatorWeaponRule,
  isNewSimulatorCadenceCycle,
  resolveSimulatorAttack,
  SIMULATOR_BOARD_COLUMNS,
  SIMULATOR_BOARD_ROWS,
  SIMULATOR_RANGE_BANDS,
  SIMULATOR_RANGE_LABELS,
  SIMULATOR_STATUS_LABELS,
  SIMULATOR_WEAPON_ORDER,
  type SimulatorAttackerProfile,
  type SimulatorAttackResult,
  type SimulatorBoardCoord,
  type SimulatorStatusKind,
  type SimulatorTargetStats,
  type SimulatorWeaponRule,
  type SimulatorWeaponSlug,
} from "@/lib/equipment-shop/simulator";

import styles from "./page.module.css";

type ActiveToken = "attacker" | "target";
type SimLogTone = "hit" | "miss" | "info";
type SimLog = {
  id: number;
  tone: SimLogTone;
  text: string;
};

type TrainingFeedbackTone = "info" | "success" | "error";
type TrainingFeedback = {
  id: number;
  tone: TrainingFeedbackTone;
  title: string;
  detail: string;
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
}

interface Props {
  attacker: SimulatorAttackerProfile;
  initialCatalog: EquipmentShopCatalogResponse;
}

type BattlefieldId = "5x5" | "1x5" | "5x1";

interface BattlefieldConfig {
  id: BattlefieldId;
  label: string;
  description: string;
  columns: readonly SimulatorBoardCoord["col"][];
  rows: readonly SimulatorBoardCoord["row"][];
  attackerPosition: SimulatorBoardCoord;
  targetPosition: SimulatorBoardCoord;
}

const BATTLEFIELDS: readonly BattlefieldConfig[] = [
  {
    id: "5x5",
    label: "5×5",
    description: "표준 전장",
    columns: SIMULATOR_BOARD_COLUMNS,
    rows: SIMULATOR_BOARD_ROWS,
    attackerPosition: { col: "C", row: 1 },
    targetPosition: { col: "C", row: 3 },
  },
  {
    id: "1x5",
    label: "1×5",
    description: "세로 전장",
    columns: ["A"],
    rows: SIMULATOR_BOARD_ROWS,
    attackerPosition: { col: "A", row: 1 },
    targetPosition: { col: "A", row: 3 },
  },
  {
    id: "5x1",
    label: "5×1",
    description: "가로 전장",
    columns: SIMULATOR_BOARD_COLUMNS,
    rows: [1],
    attackerPosition: { col: "A", row: 1 },
    targetPosition: { col: "C", row: 1 },
  },
] as const;
const DEFAULT_BATTLEFIELD = BATTLEFIELDS[0];
const DEFAULT_TARGET: SimulatorTargetStats = {
  hp: 60,
  maxHp: 60,
  san: 40,
  maxSan: 40,
  def: 2,
  statuses: [],
};
const TURN_END_SFX_SRC =
  "/assets/equipment-shop/sfx/ui-notice-level-up.mp3";
const DEFAULT_TRAINING_AGENT_PORTRAIT =
  "/assets/npcs/Sector-C-Field-Agent-profile.webp";
const DEFAULT_TARGET_PORTRAIT =
  "/assets/npcs/General-Combatant-profile.webp";
const TURN_REVEAL_OUT_MS = 1900;
const TURN_REVEAL_END_MS = 2400;

const TRAINING_STEPS: TrainingStep[] = [
  {
    label: "STEP 01",
    title: "장비 선택",
    hint: "왼쪽 목록에서 시험 장비 선택",
  },
  {
    label: "STEP 02",
    title: "거리 배치",
    hint: "적 배치 후 내 위치 조정",
  },
  {
    label: "STEP 03",
    title: "공격 실행",
    hint: "예상 피해 확인 후 공격",
  },
  {
    label: "STEP 04",
    title: "결과·다음 턴",
    hint: "피해·자원 확인 후 계속 진행",
  },
];

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
): SimulatorDisplayItem[] {
  const catalogBySlug = new Map(
    catalogItems
      .filter((item) => item.category === "WEAPON")
      .map((item) => [item.slug ?? item.key, item]),
  );

  return SIMULATOR_WEAPON_ORDER.map((slug) => {
    const rule = getSimulatorWeaponRule(slug);
    const catalogItem = catalogBySlug.get(slug);
    return {
      slug,
      name: catalogItem?.name ?? rule?.name ?? slug,
      price: catalogItem?.price ?? rule?.price ?? 0,
      ...(catalogItem?.previewImage
        ? { previewImage: catalogItem.previewImage }
        : {}),
      ...(catalogItem?.description
        ? { catalogDescription: catalogItem.description }
        : {}),
    };
  });
}

function uniqueStatuses(
  statuses: SimulatorStatusKind[],
  next: SimulatorStatusKind[],
): SimulatorStatusKind[] {
  return Array.from(new Set([...statuses, ...next]));
}

function cellKey(coord: SimulatorBoardCoord): string {
  return formatSimulatorCoord(coord);
}

function sameCoord(a: SimulatorBoardCoord, b: SimulatorBoardCoord): boolean {
  return a.col === b.col && a.row === b.row;
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
}

function tokenVitalPercent(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (current / max) * 100));
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
            ? statuses.map((status) => SIMULATOR_STATUS_LABELS[status]).join(" · ")
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
  if (rule.slug === "basic-flamethrower") return "연료 보충";
  if (rule.slug === "basic-sonic-emitter") return "출력 재충전";
  return "재장전";
}

export default function EquipmentSimulatorClient({
  attacker,
  initialCatalog,
}: Props) {
  const simulatorItems = useMemo(
    () => buildSimulatorItems(initialCatalog.items),
    [initialCatalog.items],
  );
  const [selectedSlug, setSelectedSlug] = useState<SimulatorWeaponSlug>(
    simulatorItems.find((item) => item.slug === "basic-pistol")?.slug ??
      simulatorItems[0]?.slug ??
      "basic-pistol",
  );
  const [battlefieldId, setBattlefieldId] =
    useState<BattlefieldId>(DEFAULT_BATTLEFIELD.id);
  const [activeToken, setActiveToken] = useState<ActiveToken>("target");
  const [enemyPositionConfirmed, setEnemyPositionConfirmed] = useState(false);
  const [attackerPosition, setAttackerPosition] = useState(
    DEFAULT_BATTLEFIELD.attackerPosition,
  );
  const [targetPosition, setTargetPosition] = useState(
    DEFAULT_BATTLEFIELD.targetPosition,
  );
  const [targetStats, setTargetStats] =
    useState<SimulatorTargetStats>(DEFAULT_TARGET);
  const [resourceBySlug, setResourceBySlug] = useState(() =>
    getInitialSimulatorResources(),
  );
  const [hmgInstalled, setHmgInstalled] = useState(false);
  const [hmgShotsInCycle, setHmgShotsInCycle] = useState(0);
  const [draggedToken, setDraggedToken] = useState<ActiveToken | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [turn, setTurn] = useState(1);
  const [sequence, setSequence] = useState(1);
  const [trainingEvent, setTrainingEvent] = useState<TrainingEvent>("ready");
  const [activeStep, setActiveStep] = useState(0);
  const [feedback, setFeedback] = useState<TrainingFeedback | null>(null);
  const [turnReveal, setTurnReveal] = useState<{
    endedTurn: number;
    phase: "in" | "out";
  } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const turnEndAudioRef = useRef<HTMLAudioElement | null>(null);
  const dragDestinationRef = useRef<SimulatorBoardCoord | null>(null);
  const feedbackSequenceRef = useRef(0);
  const feedbackTimerRef = useRef<number | null>(null);
  const turnRevealOutTimerRef = useRef<number | null>(null);
  const turnRevealEndTimerRef = useRef<number | null>(null);
  const [logs, setLogs] = useState<SimLog[]>([
    {
      id: 0,
      tone: "info",
      text: "5×5 표준 전장 준비. 먼저 적을 배치한 뒤 내 위치를 조정하세요.",
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

  const battlefield =
    BATTLEFIELDS.find((candidate) => candidate.id === battlefieldId) ??
    DEFAULT_BATTLEFIELD;
  const boardColumns = battlefield.columns;
  const boardRows = battlefield.rows;
  const boardColumnTemplate =
    boardColumns.length === 1
      ? "minmax(160px, 240px)"
      : `repeat(${boardColumns.length}, minmax(46px, 1fr))`;
  const boardRowTemplate =
    boardRows.length === 1
      ? "minmax(96px, 120px)"
      : `repeat(${boardRows.length}, minmax(78px, 1fr))`;

  const selectedItem =
    simulatorItems.find((item) => item.slug === selectedSlug) ??
    simulatorItems[0];
  const selectedRule = getSimulatorWeaponRule(selectedSlug);
  const attackerTokenUrl = attacker.portraitUrl ?? attacker.characterUrl;
  const attackerTokenIsPortrait = Boolean(attacker.portraitUrl);
  const attackerUsesFieldAgentPortrait =
    attacker.portraitUrl === DEFAULT_TRAINING_AGENT_PORTRAIT;
  const attackerTokenInitial =
    attacker.codename.trim().charAt(0).toUpperCase() || "요";
  const defaultRange = getSimulatorRange(attackerPosition, targetPosition);
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
        target: targetPosition,
        attackerStats: attacker,
        targetStats,
        runtime: selectedRuntime,
      })
    : null;
  const selectedResource =
    selectedRule?.resource && selectedRule.slug in resourceBySlug
      ? resourceBySlug[selectedRule.slug]
      : 0;
  const range = selectedResult?.range ?? defaultRange;
  const usesCardinalDirections =
    selectedRule !== null &&
    selectedRule.role !== "냉병기" &&
    selectedRule.slug !== "basic-heavy-machine-gun";
  const usesDiamondRange =
    selectedRule?.slug === "basic-heavy-machine-gun";
  const isCardinallyAligned =
    attackerPosition.row === targetPosition.row ||
    attackerPosition.col === targetPosition.col;
  const attackDistance = range.attackDistance ?? range.verticalDistance;
  const attackAxisLabel =
    range.attackAxis === "horizontal"
      ? "가로"
      : range.attackAxis === "vertical"
        ? "세로"
        : range.attackAxis === "diamond"
          ? "다이아몬드"
        : "세로";
  const selectedName = selectedItem?.name ?? selectedRule?.name ?? "장비";
  const resultSummary = !enemyPositionConfirmed
    ? "적 위치 지정 필요"
    : selectedResult?.ok
      ? selectedResult.summary
      : selectedResult?.reasonLabel ?? "판정 대기";
  const resultSentence = /[.!?]$/.test(resultSummary)
    ? resultSummary
    : `${resultSummary}.`;
  const instructorBrief = (() => {
    switch (trainingEvent) {
      case "weapon":
        return {
          title: `${selectedName} 선택 완료`,
          text: `현재 ${SIMULATOR_RANGE_LABELS[range.band]}입니다. 예상 판정: ${resultSentence} 토큰 위치를 조정하거나 공격을 실행하십시오.`,
        };
      case "position":
        return {
          title: `${formatSimulatorCoord(attackerPosition)} → ${formatSimulatorCoord(targetPosition)} 배치 확인`,
          text:
            usesCardinalDirections && !isCardinallyAligned
              ? `나와 적이 대각선에 있습니다. 화기는 같은 가로줄 또는 세로줄에 놓아야 합니다. 예상 판정: ${resultSentence}`
              : usesDiamondRange
                ? `가로·세로 이동 칸의 합 ${attackDistance}칸은 ${SIMULATOR_RANGE_LABELS[range.band]} 판정입니다. 예상 판정: ${resultSentence} 준비되면 공격을 실행하십시오.`
              : `${attackAxisLabel} ${attackDistance}칸은 ${SIMULATOR_RANGE_LABELS[range.band]} 판정입니다. 예상 판정: ${resultSentence} 준비되면 공격을 실행하십시오.`,
        };
      case "attack":
        return {
          title: "공격 결과 반영 완료",
          text: `${resultSummary}. 적 토큰 상태와 남은 자원을 확인한 뒤 다시 공격하거나 다음 턴으로 진행하십시오.`,
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
          text: `설치에 1턴을 사용해 ${turn}턴이 시작되었습니다. 다이아몬드 사거리 안에서 3턴 주기마다 2회 사격할 수 있습니다.`,
        };
      case "uninstall":
        return {
          title: "중기관총 해체 완료",
          text: `해체에 1턴을 사용해 ${turn}턴이 시작되었습니다. 이제 내 토큰을 다시 이동할 수 있습니다.`,
        };
      case "turn":
        return {
          title: `${turn}턴 행동 대기`,
          text: "일반 장비는 같은 턴에도 반복 시험할 수 있습니다. 턴 진행은 중기관총의 3턴 사격 주기를 갱신할 때 사용합니다.",
        };
      default:
        return {
          title: "먼저 적 위치를 지정하십시오",
          text: `전투판에서 적을 놓을 칸을 선택하면 바로 내 위치 조정 단계로 넘어갑니다. 기본 배치는 내 위치 ${formatSimulatorCoord(attackerPosition)}, 적 위치 ${formatSimulatorCoord(targetPosition)}입니다.`,
        };
    }
  })();

  function pushLog(text: string, tone: SimLogTone) {
    setLogs((prev) => [{ id: sequence, text, tone }, ...prev].slice(0, 8));
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

  function moveToken(token: ActiveToken, coord: SimulatorBoardCoord) {
    if (token === "attacker" && hmgInstalled) {
      showFeedback(
        "error",
        "중기관총 해체 필요",
        "설치 중에는 내 위치를 바꿀 수 없습니다. 중기관총을 해체한 뒤 이동하세요.",
      );
      return;
    }
    const currentCoord = token === "attacker" ? attackerPosition : targetPosition;
    const nextAttacker = token === "attacker" ? coord : attackerPosition;
    const nextTarget = token === "target" ? coord : targetPosition;
    const nextResult = selectedRule
      ? resolveSimulatorAttack({
          weaponSlug: selectedRule.slug,
          attacker: nextAttacker,
          target: nextTarget,
          attackerStats: attacker,
          targetStats,
          runtime: selectedRuntime,
        })
      : null;
    const nextRange =
      nextResult?.range ?? getSimulatorRange(nextAttacker, nextTarget);
    const nextDistance =
      nextRange.attackDistance ?? nextRange.verticalDistance;
    const nextAxisLabel =
      nextRange.attackAxis === "horizontal"
        ? "가로"
        : nextRange.attackAxis === "diamond"
          ? "다이아몬드"
          : "세로";
    if (token === "attacker") {
      setAttackerPosition(coord);
    } else {
      setTargetPosition(coord);
      setEnemyPositionConfirmed(true);
      setActiveToken("attacker");
    }
    setTrainingEvent("position");
    setActiveStep(2);
    showFeedback(
      "info",
      `${token === "attacker" ? "내" : "적"} 위치 ${sameCoord(currentCoord, coord) ? "확인" : "이동 완료"}`,
      token === "target"
        ? `${formatSimulatorCoord(coord)}에 적을 배치했습니다. 이제 전투판을 눌러 내 위치를 조정하세요.`
        : nextResult?.reason === "NOT_CARDINAL"
          ? `${formatSimulatorCoord(coord)} · ${nextResult.reasonLabel}`
          : `${formatSimulatorCoord(coord)} · ${SIMULATOR_RANGE_LABELS[nextRange.band]} · ${nextAxisLabel} ${nextDistance}칸`,
    );
  }

  function handleSelectWeapon(slug: SimulatorWeaponSlug) {
    setSelectedSlug(slug);
    setTrainingEvent("weapon");
    setActiveStep(1);
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
    if (token === "attacker" && !enemyPositionConfirmed) return;
    setActiveToken(token);
    showFeedback(
      "info",
      token === "attacker" ? "내 위치 조정" : "적 위치 다시 지정",
      token === "attacker"
        ? "전투판에서 내가 이동할 칸을 선택하세요."
        : "전투판에서 적을 다시 배치할 칸을 선택하세요. 배치 후 내 위치 조정으로 자동 전환됩니다.",
    );
  }

  function handleCellActivate(coord: SimulatorBoardCoord) {
    moveToken(activeToken, coord);
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
    token: ActiveToken,
  ) {
    if (!event.isPrimary || event.button !== 0) return;
    if (
      token === "attacker" &&
      (!enemyPositionConfirmed || hmgInstalled)
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
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedToken(token);
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
    const coord = coordFromPointer(event);
    dragDestinationRef.current = coord;
    setDragOverCell(coord ? cellKey(coord) : null);
  }

  function handleTokenPointerUp(
    event: PointerEvent<HTMLDivElement>,
    token: ActiveToken,
  ) {
    const coord = coordFromPointer(event) ?? dragDestinationRef.current;
    dragDestinationRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.stopPropagation();
    setDraggedToken(null);
    setDragOverCell(null);
    if (coord) moveToken(token, coord);
  }

  function handleTokenPointerCancel(
    event: PointerEvent<HTMLDivElement>,
  ) {
    dragDestinationRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggedToken(null);
    setDragOverCell(null);
  }

  function handleTokenPointerCaptureLost(token: ActiveToken) {
    const coord = dragDestinationRef.current;
    dragDestinationRef.current = null;
    setDraggedToken(null);
    setDragOverCell(null);
    if (coord) moveToken(token, coord);
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
    setTargetPosition(nextBattlefield.targetPosition);
    setTargetStats(DEFAULT_TARGET);
    setResourceBySlug(getInitialSimulatorResources());
    setHmgInstalled(false);
    setHmgShotsInCycle(0);
    dragDestinationRef.current = null;
    setDraggedToken(null);
    setDragOverCell(null);
    setTurn(1);
    setActiveToken("target");
    setEnemyPositionConfirmed(false);
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

  function handleBattlefieldChange(nextBattlefieldId: BattlefieldId) {
    if (nextBattlefieldId === battlefieldId) return;
    const nextBattlefield =
      BATTLEFIELDS.find(
        (candidate) => candidate.id === nextBattlefieldId,
      ) ?? DEFAULT_BATTLEFIELD;
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

  function handleReset() {
    resetTrainingState(battlefield, "시험장 상태를 초기화했습니다.");
    showFeedback(
      "info",
      "훈련장 초기화 완료",
      `${battlefield.label} 전장의 1턴 기본 배치와 모든 장비 자원을 복구했습니다.`,
    );
  }

  function handleAttack() {
    if (!enemyPositionConfirmed) {
      setTrainingEvent("blocked");
      setActiveStep(1);
      showFeedback(
        "error",
        "적 위치를 먼저 지정하세요",
        "전투판에서 적을 배치하면 내 위치 조정과 공격이 활성화됩니다.",
      );
      return;
    }
    if (!selectedRule || !selectedResult) return;

    if (!selectedResult.ok) {
      setTrainingEvent("blocked");
      setActiveStep(2);
      showFeedback(
        "error",
        "공격 실행 실패",
        selectedResult.reasonLabel ?? selectedResult.summary,
      );
      pushLog(selectedResult.reasonLabel ?? selectedResult.summary, resultTone(selectedResult));
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
    setActiveStep(3);

    setTargetStats((prev) => ({
      ...prev,
      hp:
        selectedResult.targetStat === "hp"
          ? Math.max(0, prev.hp - selectedResult.damageApplied)
          : prev.hp,
      san:
        selectedResult.targetStat === "san"
          ? Math.max(0, prev.san - selectedResult.damageApplied)
          : prev.san,
      statuses: uniqueStatuses(prev.statuses, selectedResult.statusesApplied),
    }));

    const statusText = selectedResult.statusesApplied.length
      ? ` · ${selectedResult.statusesApplied
          .map((status) => SIMULATOR_STATUS_LABELS[status])
          .join(", ")}`
      : "";
    showFeedback(
      "success",
      "공격 실행 완료",
      `${selectedRule.name} · ${selectedResult.summary}${statusText}`,
    );
    pushLog(
      `${selectedRule.name} ${selectedResult.summary}${statusText}`,
      "hit",
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
            5×5·1×5·5×1 전장을 선택해 장비의 거리·피해·자원 소모를
            턴 단위로 시험합니다. 실제 캐릭터와 인벤토리는 변경되지
            않습니다.
          </p>
          <div className={styles.stageBadges} aria-label="훈련장 상태">
            <Tag tone="gold">턴 단위 모의훈련</Tag>
            <Tag tone="info">
              {battlefield.label} {battlefield.description}
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
        <aside className={styles.catalogPanel} aria-label="보급형 장비 목록">
          <div className={styles.panelIntro}>
            <Eyebrow>WEAPON RACK</Eyebrow>
            <strong>보급형 장비</strong>
          </div>
          <div className={styles.itemRail}>
            {simulatorItems.map((item) => {
              const rule = getSimulatorWeaponRule(item.slug);
              const active = selectedSlug === item.slug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  className={[
                    styles.itemButton,
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
                    <small>{formatCredits(item.price)}</small>
                  </span>
                  <span className={styles.itemMeta}>{rule?.role ?? "장비"}</span>
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
                  {activeToken === "target"
                    ? "1 · 적 위치 지정"
                    : "2 · 내 위치 조정"}
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
                    disabled={!enemyPositionConfirmed}
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
                      : "적 위치 다시 지정"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.rangeStrip} aria-live="polite">
            <span>
              {usesCardinalDirections && !isCardinallyAligned
                ? "사격 불가"
                : SIMULATOR_RANGE_LABELS[range.band]}
            </span>
            <strong>
              {usesCardinalDirections && !isCardinallyAligned
                ? "직선 정렬 필요"
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
                  : "가로 칸은 냉병기 사거리 계산에서 제외"}
            </em>
            <small>0칸 근거리 · 1–2칸 중거리 · 3–4칸 장거리</small>
          </div>

          <section className={styles.controlPanel} aria-label="전투 조작 패널">
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.fireButton}
                onClick={handleAttack}
                disabled={!selectedRule || !enemyPositionConfirmed}
                aria-describedby="simulator-placement-status"
              >
                공격 실행
              </button>
              <button
                type="button"
                className={styles.controlButton}
                onClick={handleReload}
                disabled={!selectedRule?.resource}
              >
                {controlReloadLabel(selectedRule)}
              </button>
              <button
                type="button"
                className={styles.controlButton}
                onClick={handleToggleHmg}
                disabled={selectedRule?.slug !== "basic-heavy-machine-gun"}
              >
                {hmgInstalled
                  ? "중기관총 해체 (1턴)"
                  : "중기관총 설치 (1턴)"}
              </button>
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
                    ? `${hmgInstalled ? "설치됨" : "미설치"} · 3턴당 ${selectedRule.cadence.shotsPerCycle}회 · 현재 ${hmgShotsInCycle}/2`
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
              minHeight:
                boardRows.length === 1
                  ? "190px"
                  : boardColumns.length === 1
                    ? "530px"
                    : undefined,
              justifyContent:
                boardColumns.length === 1 ? "center" : undefined,
              alignContent: boardRows.length === 1 ? "center" : undefined,
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
                  const hasTarget = sameCoord(coord, targetPosition);
                  const isAttackable =
                    selectedRule !== null &&
                    isSimulatorAttackableCell(
                      selectedRule.slug,
                      attackerPosition,
                      coord,
                    );
                  const isDropTarget = dragOverCell === cellKey(coord);
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
                            : `적을 ${cellKey(coord)} 칸에 배치`
                        }${
                          isAttackable
                            ? `; ${selectedName} 공격 가능 범위`
                            : ""
                        }${
                          hasAttacker
                            ? `; 나 ${attacker.codename}, HP ${attacker.hp}/${attacker.hp}, 정신력 ${attacker.san}/${attacker.san}, ATK ${attacker.atk}`
                            : ""
                        }${
                          hasTarget
                            ? `; 적 훈련 표적, HP ${targetStats.hp}/${targetStats.maxHp}, 정신력 ${targetStats.san}/${targetStats.maxSan}, DEF ${targetStats.def}`
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
                            draggedToken === "attacker"
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
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) =>
                            handleTokenPointerDown(event, "attacker")
                          }
                          onPointerMove={handleTokenPointerMove}
                          onPointerUp={(event) =>
                            handleTokenPointerUp(event, "attacker")
                          }
                          onPointerCancel={handleTokenPointerCancel}
                          onLostPointerCapture={() =>
                            handleTokenPointerCaptureLost("attacker")
                          }
                          role="img"
                          aria-label={`나, ${attacker.codename} 위치 토큰. HP ${attacker.hp}/${attacker.hp}, 정신력 ${attacker.san}/${attacker.san}, ATK ${attacker.atk}`}
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
                          />
                        </div>
                      ) : null}
                      {hasTarget ? (
                        <div
                          className={[
                            styles.token,
                            styles["token--target"],
                            draggedToken === "target"
                              ? styles["token--dragging"]
                              : "",
                            targetPosition.row <= 2
                              ? styles["token--popoverBelow"]
                              : "",
                            boardColumns.indexOf(targetPosition.col) >=
                            Math.ceil(boardColumns.length / 2)
                              ? styles["token--popoverLeft"]
                              : "",
                          ].join(" ")}
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) =>
                            handleTokenPointerDown(event, "target")
                          }
                          onPointerMove={handleTokenPointerMove}
                          onPointerUp={(event) =>
                            handleTokenPointerUp(event, "target")
                          }
                          onPointerCancel={handleTokenPointerCancel}
                          onLostPointerCapture={() =>
                            handleTokenPointerCaptureLost("target")
                          }
                          role="img"
                          aria-label={`적, 훈련 표적 위치 토큰. HP ${targetStats.hp}/${targetStats.maxHp}, 정신력 ${targetStats.san}/${targetStats.maxSan}, DEF ${targetStats.def}, 상태 ${
                            targetStats.statuses.length > 0
                              ? targetStats.statuses
                                  .map(
                                    (status) =>
                                      SIMULATOR_STATUS_LABELS[status],
                                  )
                                  .join(", ")
                              : "정상"
                          }`}
                        >
                          <span className={styles.token__inner} aria-hidden>
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
                          </span>
                          <span
                            className={styles.token__hp}
                            title={`HP ${targetStats.hp}/${targetStats.maxHp}`}
                            aria-hidden
                          >
                            <i
                              className={[
                                styles.token__hpFill,
                                styles[
                                  `token__hpFill--${tokenVitalTone(
                                    targetStats.hp,
                                    targetStats.maxHp,
                                  )}`
                                ],
                              ].join(" ")}
                              style={{
                                width: `${tokenVitalPercent(
                                  targetStats.hp,
                                  targetStats.maxHp,
                                )}%`,
                              }}
                            />
                          </span>
                          <span className={styles.token__label} aria-hidden>
                            <b>적</b>
                            <span>훈련 표적</span>
                          </span>
                          {targetStats.statuses.map((status) => (
                            <span
                              key={status}
                              className={styles.token__status}
                              title={SIMULATOR_STATUS_LABELS[status]}
                              aria-hidden
                            >
                              {status === "burn" ? "화" : "!"}
                            </span>
                          ))}
                          <TokenStatPopover
                            name="훈련 표적"
                            tag="적"
                            hp={targetStats.hp}
                            maxHp={targetStats.maxHp}
                            san={targetStats.san}
                            maxSan={targetStats.maxSan}
                            def={targetStats.def}
                            statuses={targetStats.statuses}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                }),
              )}
            </div>
          </div>

        </section>

        <aside className={styles.targetPanel} aria-label="선택 장비 룰 카드">
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
            {selectedItem?.catalogDescription ??
              selectedRule?.description ??
              "카탈로그 장비를 선택하면 운용 메모가 표시됩니다."}
          </p>

          <div className={styles.noteList}>
            {(selectedRule?.notes ?? []).map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>
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
                {log.text}
              </div>
            ))}
          </div>
        </div>

      </section>
    </div>
  );
}
