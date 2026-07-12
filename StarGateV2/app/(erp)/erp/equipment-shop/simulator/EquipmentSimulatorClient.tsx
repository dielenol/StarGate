"use client";

import Image from "next/image";
import {
  type DragEvent,
  type KeyboardEvent,
  useMemo,
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
  getSimulatorWeaponRule,
  isNewSimulatorCadenceCycle,
  resolveSimulatorAttack,
  SIMULATOR_BOARD_COLUMNS,
  SIMULATOR_BOARD_ROWS,
  SIMULATOR_RANGE_BANDS,
  SIMULATOR_RANGE_LABELS,
  SIMULATOR_STATUS_LABELS,
  SIMULATOR_TARGET_STAT_LABELS,
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

type GuideStep = {
  label: string;
  title: string;
  dialogue: string;
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

const DEFAULT_ATTACKER_POSITION: SimulatorBoardCoord = { col: "C", row: 1 };
const DEFAULT_TARGET_POSITION: SimulatorBoardCoord = { col: "C", row: 3 };
const DEFAULT_TARGET: SimulatorTargetStats = {
  hp: 60,
  maxHp: 60,
  san: 40,
  maxSan: 40,
  def: 2,
  statuses: [],
};

const GUIDE_STEPS: GuideStep[] = [
  {
    label: "01 장비",
    title: "시험 장비 선택",
    dialogue:
      "왼쪽 보급형 장비 목록에서 시험할 장비를 선택하십시오. 선택한 장비의 피해와 운용 조건은 오른쪽 룰 카드에 표시됩니다.",
  },
  {
    label: "02 배치",
    title: "공격자와 표적 배치",
    dialogue:
      "공격자 또는 표적을 선택한 뒤 전투판의 칸을 누르십시오. 토큰을 직접 끌어서 이동할 수도 있습니다. 사거리는 두 토큰의 세로 칸 차이만 사용합니다.",
  },
  {
    label: "03 판정",
    title: "예상 피해 확인",
    dialogue:
      "공격 전 조작 패널의 피해 판정과 오른쪽 사거리별 피해를 확인하십시오. 냉병기는 공격자의 ATK를 사용하고, 물리 피해는 표적의 DEF를 적용합니다.",
  },
  {
    label: "04 운용",
    title: "자원과 특수 조건 시험",
    dialogue:
      "공격을 실행하면 표적의 HP 또는 정신력과 상태가 갱신됩니다. 재장전, 중기관총 설치, 다음 턴 기능으로 탄환과 사격 주기를 시험할 수 있습니다.",
  },
  {
    label: "05 비교",
    title: "장비 비교와 초기화",
    dialogue:
      "아래 비교표는 현재 배치에서 모든 장비의 예상 결과를 보여줍니다. 장비 이름을 누르면 바로 선택됩니다. 초기화는 훈련장 상태만 되돌립니다.",
  },
];

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
  const [activeToken, setActiveToken] = useState<ActiveToken>("target");
  const [attackerPosition, setAttackerPosition] = useState(
    DEFAULT_ATTACKER_POSITION,
  );
  const [targetPosition, setTargetPosition] = useState(DEFAULT_TARGET_POSITION);
  const [targetStats, setTargetStats] =
    useState<SimulatorTargetStats>(DEFAULT_TARGET);
  const [resourceBySlug, setResourceBySlug] = useState(() =>
    getInitialSimulatorResources(),
  );
  const [hmgInstalled, setHmgInstalled] = useState(false);
  const [hmgShotsInCycle, setHmgShotsInCycle] = useState(0);
  const [turn, setTurn] = useState(1);
  const [sequence, setSequence] = useState(1);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [logs, setLogs] = useState<SimLog[]>([
    {
      id: 0,
      tone: "info",
      text: "5x5 훈련장 준비. 표적 토큰을 움직여 사거리를 확인하세요.",
    },
  ]);

  const selectedItem =
    simulatorItems.find((item) => item.slug === selectedSlug) ??
    simulatorItems[0];
  const selectedRule = getSimulatorWeaponRule(selectedSlug);
  const range = getSimulatorRange(attackerPosition, targetPosition);
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
  const rangeRows = [attackerPosition.row, targetPosition.row].sort(
    (a, b) => a - b,
  );
  const guideStep = GUIDE_STEPS[guideStepIndex];

  function pushLog(text: string, tone: SimLogTone) {
    setLogs((prev) => [{ id: sequence, text, tone }, ...prev].slice(0, 8));
    setSequence((prev) => prev + 1);
  }

  function moveToken(token: ActiveToken, coord: SimulatorBoardCoord) {
    if (token === "attacker") {
      setAttackerPosition(coord);
      return;
    }
    setTargetPosition(coord);
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

  function handleTokenDragStart(
    event: DragEvent<HTMLSpanElement>,
    token: ActiveToken,
  ) {
    event.dataTransfer.setData("text/plain", token);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleCellDrop(
    event: DragEvent<HTMLDivElement>,
    coord: SimulatorBoardCoord,
  ) {
    event.preventDefault();
    const token = event.dataTransfer.getData("text/plain");
    if (token !== "attacker" && token !== "target") return;
    setActiveToken(token);
    moveToken(token, coord);
  }

  function handleReload() {
    if (!selectedRule?.resource) return;
    setResourceBySlug((prev) => ({
      ...prev,
      [selectedRule.slug]: selectedRule.resource?.max ?? 0,
    }));
    pushLog(`${selectedRule.name} ${controlReloadLabel(selectedRule)} 완료`, "info");
  }

  function handleInstallHmg() {
    if (selectedRule?.slug !== "basic-heavy-machine-gun") return;
    setHmgInstalled(true);
    setHmgShotsInCycle(0);
    pushLog("중기관총 설치 완료. 현재 3턴 주기에서 2회 사격 가능합니다.", "info");
  }

  function handleNextTurn() {
    const nextTurn = turn + 1;
    const resetCycle = isNewSimulatorCadenceCycle(turn, nextTurn);
    setTurn(nextTurn);
    if (resetCycle) {
      setHmgShotsInCycle(0);
    }
    pushLog(
      resetCycle
        ? `${nextTurn}턴 진입. 중기관총 사격 주기가 갱신되었습니다.`
        : `${nextTurn}턴 진입.`,
      "info",
    );
  }

  function handleReset() {
    setAttackerPosition(DEFAULT_ATTACKER_POSITION);
    setTargetPosition(DEFAULT_TARGET_POSITION);
    setTargetStats(DEFAULT_TARGET);
    setResourceBySlug(getInitialSimulatorResources());
    setHmgInstalled(false);
    setHmgShotsInCycle(0);
    setTurn(1);
    setActiveToken("target");
    setLogs([
      {
        id: sequence,
        tone: "info",
        text: "시험장 상태를 초기화했습니다.",
      },
    ]);
    setSequence((prev) => prev + 1);
  }

  function handleAttack() {
    if (!selectedRule || !selectedResult) return;

    if (!selectedResult.ok) {
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

      <section className={styles.stageHeader}>
        <div>
          <Eyebrow>ARMORY TEST GRID</Eyebrow>
          <h1>5x5 전투판 장비 훈련</h1>
        </div>
        <div className={styles.stageBadges} aria-label="훈련장 상태">
          <Tag tone="info">실데이터 미반영</Tag>
          <Tag tone="gold">세로 사거리 판정</Tag>
        </div>
      </section>

      <section className={styles.guidePanel} aria-labelledby="range-guide-title">
        <div className={styles.guideNpc} aria-hidden>
          <span>R-05</span>
        </div>
        <div className={styles.guideContent}>
          <div className={styles.guideHeading}>
            <div>
              <Eyebrow>VIRTUAL RANGE INSTRUCTOR</Eyebrow>
              <strong id="range-guide-title">가상 교관 R-05</strong>
            </div>
            <span>
              {guideStepIndex + 1} / {GUIDE_STEPS.length}
            </span>
          </div>
          <p className={styles.guideDialogue} aria-live="polite">
            <strong>{guideStep?.title}</strong>
            {guideStep?.dialogue}
          </p>
          <div className={styles.guideSteps} aria-label="훈련장 기능 안내 단계">
            {GUIDE_STEPS.map((step, index) => (
              <button
                key={step.label}
                type="button"
                aria-pressed={index === guideStepIndex}
                className={
                  index === guideStepIndex ? styles.guideStepActive : ""
                }
                onClick={() => setGuideStepIndex(index)}
              >
                {step.label}
              </button>
            ))}
          </div>
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
                  onClick={() => setSelectedSlug(item.slug)}
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

        <section className={styles.boardPanel} aria-label="5x5 전투판">
          <div className={styles.boardToolbar}>
            <div>
              <Eyebrow>TACTICAL BOARD</Eyebrow>
              <strong>
                {formatSimulatorCoord(attackerPosition)} →{" "}
                {formatSimulatorCoord(targetPosition)}
              </strong>
            </div>
            <div className={styles.tokenToggle} aria-label="이동할 토큰 선택">
              <button
                type="button"
                className={activeToken === "attacker" ? styles.activeToggle : ""}
                aria-pressed={activeToken === "attacker"}
                onClick={() => setActiveToken("attacker")}
              >
                공격자
              </button>
              <button
                type="button"
                className={activeToken === "target" ? styles.activeToggle : ""}
                aria-pressed={activeToken === "target"}
                onClick={() => setActiveToken("target")}
              >
                표적
              </button>
            </div>
          </div>

          <div className={styles.rangeStrip} aria-live="polite">
            <span>{SIMULATOR_RANGE_LABELS[range.band]}</span>
            <strong>세로 {range.verticalDistance}칸</strong>
            <em>가로 칸은 사거리 계산에서 제외</em>
          </div>

          <div className={styles.boardFrame}>
            <div className={styles.cornerLabel} aria-hidden />
            {SIMULATOR_BOARD_COLUMNS.map((col) => (
              <div key={col} className={styles.columnLabel} aria-hidden>
                {col}
              </div>
            ))}
            {SIMULATOR_BOARD_ROWS.map((row) => (
              <div key={`row-${row}`} className={styles.rowLabel} aria-hidden>
                {row}
              </div>
            ))}
            <div className={styles.boardGrid}>
              {SIMULATOR_BOARD_ROWS.map((row) =>
                SIMULATOR_BOARD_COLUMNS.map((col) => {
                  const coord: SimulatorBoardCoord = { col, row };
                  const hasAttacker = sameCoord(coord, attackerPosition);
                  const hasTarget = sameCoord(coord, targetPosition);
                  const inVerticalLane =
                    row >= rangeRows[0] && row <= rangeRows[1];
                  return (
                    <div
                      key={cellKey(coord)}
                      role="button"
                      tabIndex={0}
                      className={[
                        styles.boardCell,
                        inVerticalLane ? styles["boardCell--lane"] : "",
                        hasAttacker ? styles["boardCell--attacker"] : "",
                        hasTarget ? styles["boardCell--target"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleCellActivate(coord)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleCellDrop(event, coord)}
                      onKeyDown={(event) => handleCellKeyDown(event, coord)}
                      aria-label={`${cellKey(coord)} 칸으로 ${activeToken === "attacker" ? "공격자" : "표적"} 이동`}
                    >
                      <span className={styles.cellCoord}>{cellKey(coord)}</span>
                      {hasAttacker ? (
                        <span
                          draggable
                          className={[
                            styles.token,
                            styles["token--attacker"],
                          ].join(" ")}
                          onDragStart={(event) =>
                            handleTokenDragStart(event, "attacker")
                          }
                          aria-label="공격자 토큰"
                        >
                          ATK
                        </span>
                      ) : null}
                      {hasTarget ? (
                        <span
                          draggable
                          className={[
                            styles.token,
                            styles["token--target"],
                          ].join(" ")}
                          onDragStart={(event) =>
                            handleTokenDragStart(event, "target")
                          }
                          aria-label="표적 토큰"
                        >
                          TGT
                        </span>
                      ) : null}
                    </div>
                  );
                }),
              )}
            </div>
          </div>

          <section className={styles.controlPanel} aria-label="조작 패널">
            <div className={styles.controlReadouts}>
              <div>
                <span>선택 장비</span>
                <strong>{selectedItem?.name ?? selectedRule?.name ?? "-"}</strong>
              </div>
              <div>
                <span>피해 판정</span>
                <strong>
                  {selectedResult?.ok
                    ? selectedResult.summary
                    : selectedResult?.reasonLabel ?? "--"}
                </strong>
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
                <span>턴</span>
                <strong>
                  {turn}턴 · 중기관총 {hmgShotsInCycle}/2
                </strong>
              </div>
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.fireButton}
                onClick={handleAttack}
                disabled={!selectedRule}
              >
                공격
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
                onClick={handleInstallHmg}
                disabled={
                  selectedRule?.slug !== "basic-heavy-machine-gun" ||
                  hmgInstalled
                }
              >
                중기관총 설치
              </button>
              <button
                type="button"
                className={styles.controlButton}
                onClick={handleNextTurn}
              >
                다음 턴
              </button>
              <button
                type="button"
                className={styles.controlButton}
                onClick={handleReset}
              >
                초기화
              </button>
            </div>
          </section>
        </section>

        <aside className={styles.targetPanel} aria-label="표적 상태와 룰 카드">
          <div className={styles.panelIntro}>
            <Eyebrow>RULE CARD</Eyebrow>
            <strong>{selectedRule?.name ?? "장비 없음"}</strong>
          </div>

          <div className={styles.profileBlock}>
            <span>공격자</span>
            <strong>{attacker.codename}</strong>
            <em>
              ATK {attacker.atk} · {attacker.source === "agent" ? "MAIN AGENT" : "SANDBOX"}
            </em>
          </div>

          <div className={styles.targetMeters}>
            <div>
              <span>HP</span>
              <strong>
                {targetStats.hp}/{targetStats.maxHp}
              </strong>
              <meter min={0} max={targetStats.maxHp} value={targetStats.hp} />
            </div>
            <div>
              <span>정신력</span>
              <strong>
                {targetStats.san}/{targetStats.maxSan}
              </strong>
              <meter min={0} max={targetStats.maxSan} value={targetStats.san} />
            </div>
            <div>
              <span>DEF</span>
              <strong>{targetStats.def}</strong>
            </div>
          </div>

          <div className={styles.statusList} aria-label="상태이상">
            {targetStats.statuses.length > 0 ? (
              targetStats.statuses.map((status) => (
                <Tag key={status} tone="danger">
                  {SIMULATOR_STATUS_LABELS[status]}
                </Tag>
              ))
            ) : (
              <Tag tone="success">정상</Tag>
            )}
            {hmgInstalled ? <Tag tone="gold">중기관총 설치됨</Tag> : null}
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

      <section className={styles.bottomGrid} aria-label="로그와 장비 비교">
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

        <div className={styles.comparePanel}>
          <div className={styles.panelIntro}>
            <Eyebrow>EXPECTED OUTPUT</Eyebrow>
            <strong>현재 배치 기준 비교</strong>
          </div>
          <div className={styles.compareTable} role="table">
            <div className={styles.compareHeader} role="row">
              <span role="columnheader">장비</span>
              <span role="columnheader">판정</span>
              <span role="columnheader">결과</span>
            </div>
            {simulatorItems.map((item) => {
              const rule = getSimulatorWeaponRule(item.slug);
              if (!rule) return null;
              const result = resolveSimulatorAttack({
                weaponSlug: item.slug,
                attacker: attackerPosition,
                target: targetPosition,
                attackerStats: attacker,
                targetStats,
                runtime: attackRuntimeFor(
                  rule,
                  resourceBySlug,
                  hmgInstalled,
                  hmgShotsInCycle,
                  turn,
                ),
              });
              return (
                <div
                  key={item.slug}
                  className={[
                    styles.compareRow,
                    item.slug === selectedSlug ? styles["compareRow--active"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="row"
                >
                  <span role="cell">
                    <button
                      type="button"
                      className={styles.compareSelectButton}
                      aria-pressed={item.slug === selectedSlug}
                      onClick={() => setSelectedSlug(item.slug)}
                    >
                      {item.name}
                    </button>
                  </span>
                  <span role="cell">{SIMULATOR_RANGE_LABELS[result.range.band]}</span>
                  <span role="cell">
                    {result.ok && result.targetStat
                      ? `${result.damageApplied} ${SIMULATOR_TARGET_STAT_LABELS[result.targetStat]}`
                      : result.reasonLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
