"use client";

/* eslint-disable @next/next/no-img-element */

import { type CSSProperties, useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  IconAffinity,
  IconArrowRight,
  IconContact,
  IconCredit,
  IconFactionBriefing,
  IconReportDocument,
} from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import type { AgentLevel } from "@/types/character";

import {
  FACTION_SUPPORT_OPTIONS,
  getFactionActionDelta,
  getFactionQuestCompletionDelta,
  getFactionSupportDelta,
} from "../_game";
import type {
  FactionAccessBand,
  FactionActionPreview,
  FactionDialogueLine,
  FactionGameProfile,
  FactionRankDialogue,
  FactionQuestPreview,
  FactionStoryChoice,
} from "../_game";
import OrgIcon, {
  getExternalSubOrgIcon,
} from "../../personnel/_components/OrgIcon";
import styles from "./page.module.css";

interface FactionContactClientProps {
  code: string;
  logoUrl: string;
  favorability: number | null;
  hostile: boolean;
  canEditFavorability: boolean;
  contactActor: ContactActor | null;
  profile: FactionGameProfile;
  initialLogs: SerializedFactionRelationLog[];
  initialQuestProgress: SerializedFactionQuestProgress[];
}

type FactionActivityKind =
  | "ACTION"
  | "SUPPORT"
  | "QUEST_ACCEPT"
  | "QUEST_COMPLETE";

interface SerializedFactionRelationLog {
  id: string;
  kind: FactionActivityKind;
  title: string;
  detail: string;
  delta: number;
  favorabilityBefore: number;
  favorabilityAfter: number;
  actorName: string;
  createdAt: string;
  characterCodename: string | null;
  creditCost: number | null;
  questId: string | null;
}

interface SerializedFactionQuestProgress {
  id: string;
  questId: string;
  status: "ACTIVE" | "COMPLETED";
  title: string;
  actorName: string;
  startedAt: string;
  updatedAt: string;
  characterCodename: string | null;
  completedAt: string | null;
}

interface ContactSelection {
  id: string;
  kind: "talk" | "action" | "support" | "quest";
  channel: string;
  label: string;
  detail: string;
  delta: number;
  cost?: number;
  minimumFavorability?: number;
  questStatus?: SerializedFactionQuestProgress["status"];
  effectLabel?: string;
}

interface ContactActor {
  codename: string;
  agentLevel: AgentLevel | null;
}

const FAVORABILITY_MIN = -10;
const FAVORABILITY_MAX = 10;

function clampFavorability(value: number) {
  return Math.max(FAVORABILITY_MIN, Math.min(FAVORABILITY_MAX, value));
}

function displayCode(code: string) {
  return code.replace(/_/g, " ");
}

function sigilFor(code: string) {
  return displayCode(code)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  return delta.toString();
}

function formatActivityDate(value: string) {
  return value.slice(5, 16).replace("T", " ");
}

function activityTypeLabel(kind: FactionActivityKind) {
  switch (kind) {
    case "ACTION":
      return "접선";
    case "SUPPORT":
      return "후원";
    case "QUEST_ACCEPT":
      return "수락";
    case "QUEST_COMPLETE":
      return "완료";
  }
}

function selectionKindLabel(kind: ContactSelection["kind"]) {
  switch (kind) {
    case "talk":
      return "대화";
    case "action":
      return "접선";
    case "support":
      return "후원";
    case "quest":
      return "의뢰";
  }
}

function dialogueForFavorability(
  lines: readonly FactionDialogueLine[],
  favorability: number,
) {
  return (
    lines.find(
      (line) => favorability >= line.min && favorability <= line.max,
    ) ?? lines[0]
  );
}

function accessBandForAgentLevel(
  agentLevel: AgentLevel | null | undefined,
): FactionAccessBand {
  switch (agentLevel) {
    case "V":
    case "A":
      return "command";
    case "M":
    case "H":
      return "senior";
    case "G":
      return "field";
    case "J":
    case "U":
      return "junior";
    default:
      return "unassigned";
  }
}

function rankDialogueForActor(
  lines: readonly FactionRankDialogue[],
  actor: ContactActor | null,
) {
  const band = accessBandForAgentLevel(actor?.agentLevel);
  return (
    lines.find((line) => line.band === band) ??
    lines.find((line) => line.band === "unassigned") ??
    lines[0]
  );
}

function stableIndex(seed: string, length: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

function pickDialogueText(
  primary: string,
  variants: readonly string[] | undefined,
  seed: string,
) {
  const lines = variants?.length ? [primary, ...variants] : [primary];
  return lines[stableIndex(seed, lines.length)];
}

function selectionDelta(
  selection: ContactSelection,
  currentFavorability: number,
) {
  if (selection.kind === "action") {
    return getFactionActionDelta(currentFavorability);
  }

  if (selection.kind === "support") {
    return getFactionSupportDelta(selection.id, currentFavorability);
  }

  if (selection.kind === "quest" && selection.questStatus === "ACTIVE") {
    return getFactionQuestCompletionDelta(currentFavorability);
  }

  return 0;
}

function storyChoiceSelection(choice: FactionStoryChoice): ContactSelection {
  return {
    id: choice.id,
    kind: "talk",
    channel: choice.tone,
    label: choice.label,
    detail: choice.response,
    delta: 0,
    minimumFavorability: choice.minimumFavorability,
    effectLabel: choice.effectLabel,
  };
}

function actionSelection(action: FactionActionPreview): ContactSelection {
  return {
    id: action.id,
    kind: "action",
    channel: action.channel,
    label: action.label,
    detail: action.detail,
    delta: 0,
    effectLabel: action.effectLabel,
  };
}

function questSelection(
  quest: FactionQuestPreview,
  progress?: SerializedFactionQuestProgress,
): ContactSelection {
  const completed = progress?.status === "COMPLETED";
  const active = progress?.status === "ACTIVE";
  return {
    id: quest.id,
    kind: "quest",
    channel: "QUEST",
    label: quest.title,
    detail: quest.summary,
    delta: 0,
    minimumFavorability: quest.minimumFavorability,
    questStatus: completed ? "COMPLETED" : active ? "ACTIVE" : undefined,
    effectLabel: completed
      ? "완료 기록"
      : active
        ? "완료 시 +1"
        : quest.reward,
  };
}

export default function FactionContactClient({
  code,
  logoUrl,
  favorability,
  hostile,
  canEditFavorability,
  contactActor,
  profile,
  initialLogs,
  initialQuestProgress,
}: FactionContactClientProps) {
  const router = useRouter();
  const [currentFavorability, setCurrentFavorability] = useState(
    favorability ?? 0,
  );
  const [logs, setLogs] = useState(initialLogs);
  const [questProgress, setQuestProgress] = useState(initialQuestProgress);
  const [selected, setSelected] = useState<ContactSelection>(() =>
    storyChoiceSelection(profile.scene.storyChoices[0]),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const questProgressById = useMemo(
    () =>
      new Map(
        questProgress.map((progress) => [progress.questId, progress] as const),
      ),
    [questProgress],
  );

  const supportSelections = useMemo(
    () =>
      FACTION_SUPPORT_OPTIONS.map<ContactSelection>((option) => ({
        id: option.id,
        kind: "support",
        channel: hostile ? "COUNTER-FUND" : "CREDIT",
        label: hostile ? option.hostileLabel : option.label,
        detail: hostile
          ? `${option.amount.toLocaleString()} CR을 추적 예산으로 책정합니다. 우호도 ${option.improvesUntil} 미만에서만 통제도가 1 상승합니다.`
          : `${option.amount.toLocaleString()} CR을 관계 개선 예산으로 책정합니다. 우호도 ${option.improvesUntil} 미만에서만 관계가 1 상승합니다.`,
        delta: 0,
        cost: option.amount,
        effectLabel: `조건부 +1 · ${option.improvesUntil} 미만`,
      })),
    [hostile],
  );

  const selectedDelta = selectionDelta(selected, currentFavorability);
  const projectedFavorability = clampFavorability(
    currentFavorability + selectedDelta,
  );
  const cappedDelta = projectedFavorability - currentFavorability;
  const activeDialogue = dialogueForFavorability(
    profile.scene.dialogue,
    currentFavorability,
  );
  const activeRankDialogue = rankDialogueForActor(
    profile.scene.rankDialogues,
    contactActor,
  );
  const dialogueSeed = [
    code,
    currentFavorability,
    selected.id,
    contactActor?.agentLevel ?? "NO_LEVEL",
  ].join(":");
  const selectionLocked =
    currentFavorability < (selected.minimumFavorability ?? FAVORABILITY_MIN);
  const questLocked =
    selected.kind === "quest" && selectionLocked;
  const talkLocked = selected.kind === "talk" && selectionLocked;
  const questCompleted =
    selected.kind === "quest" && selected.questStatus === "COMPLETED";
  const canApply =
    canEditFavorability &&
    !isSaving &&
    selected.kind !== "talk" &&
    (selected.kind === "quest"
      ? !questLocked && !questCompleted
      : cappedDelta !== 0 && selectedDelta > 0);
  const sceneStyle = {
    "--scene-bg-image": profile.scene.sceneBackgroundUrl
      ? `url(${JSON.stringify(profile.scene.sceneBackgroundUrl)})`
      : "none",
  } as CSSProperties;
  const baseDialogueLine =
    selected.kind === "talk"
      ? pickDialogueText(
          activeDialogue.line,
          activeDialogue.lineVariants,
          `${dialogueSeed}:idle`,
        )
      : pickDialogueText(
          activeDialogue.afterActionLine,
          activeDialogue.afterActionLineVariants,
          `${dialogueSeed}:action`,
        );
  const rankDialogueLine =
    selected.kind === "talk"
      ? activeRankDialogue.line
      : activeRankDialogue.afterActionLine;
  const dialogueLine = talkLocked || questLocked
    ? profile.scene.lockedLine
    : selected.kind === "quest" && selected.questStatus === "COMPLETED"
      ? profile.scene.successLine
      : selected.detail;
  const resultLabel = questCompleted
    ? "완료"
    : questLocked || talkLocked
      ? "잠김"
      : selected.kind !== "talk" && cappedDelta === 0
        ? "관계 변화 없음"
        : selected.effectLabel ?? formatDelta(cappedDelta);

  function getActivityType(): FactionActivityKind {
    if (selected.kind === "talk") {
      throw new Error("대화 선택지는 활동 로그로 반영하지 않습니다.");
    }
    if (selected.kind === "support") return "SUPPORT";
    if (selected.kind === "quest") {
      return selected.questStatus === "ACTIVE"
        ? "QUEST_COMPLETE"
        : "QUEST_ACCEPT";
    }
    return "ACTION";
  }

  function getApplyLabel() {
    if (isSaving) return "실행 중";
    if (selected.kind === "talk") return "대화 선택됨";
    if (selected.kind === "support") return "후원 실행";
    if (selected.kind === "quest") {
      if (questCompleted) return "완료됨";
      if (selected.questStatus === "ACTIVE") return "완료 반영";
      return "의뢰 수락";
    }
    return "접선 실행";
  }

  async function handleApply() {
    if (!canApply) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const activityType = getActivityType();
      const res = await fetch(
        `/api/erp/factions/${code.toLowerCase()}/activity`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: activityType,
            id: selected.id,
            label: selected.label,
            detail: selected.detail,
          }),
        },
      );

      const payload = (await res.json()) as {
        favorability?: number;
        logs?: SerializedFactionRelationLog[];
        questProgress?: SerializedFactionQuestProgress[];
        error?: string;
      };

      if (!res.ok || typeof payload.favorability !== "number") {
        throw new Error(payload.error ?? "세력 활동 반영에 실패했습니다.");
      }

      setCurrentFavorability(payload.favorability);
      if (payload.logs) setLogs(payload.logs);
      if (payload.questProgress) setQuestProgress(payload.questProgress);

      if (selected.kind === "quest") {
        setSelected((prev) => ({
          ...prev,
          delta: 0,
          questStatus:
            activityType === "QUEST_ACCEPT" ? "ACTIVE" : "COMPLETED",
        }));
      }

      setMessage("세력 활동이 기록되었습니다.");
      router.refresh();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "세력 활동 반영에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div data-pixel-font="ui">
      <Box className={styles.contactPanel}>
        <PanelTitle
          right={<span className={styles.panelCode}>{profile.operatorLabel}</span>}
        >
          <span className={styles.panelLabel}>
            <IconContact aria-hidden />
            <span>접선 콘솔</span>
          </span>
        </PanelTitle>

        <section
          className={styles.sceneFrame}
          data-tone={profile.scene.sceneTone}
          style={sceneStyle}
        >
          <div className={styles.sceneFrame__backdrop} aria-hidden />
          <div className={styles.sceneFrame__scanline} aria-hidden />

          <div className={styles.sceneFrame__main}>
            <div className={styles.scenePortrait}>
              <div className={styles.scenePortrait__plate}>
                {profile.scene.operatorPortraitUrl ? (
                  <img
                    src={profile.scene.operatorPortraitUrl}
                    alt=""
                    className={styles.scenePortrait__image}
                  />
                ) : logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className={[
                      styles.scenePortrait__logo,
                      code === "SPACE_ZERO"
                        ? styles["scenePortrait__logo--spaceZero"]
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                ) : getExternalSubOrgIcon(code) ? (
                  <OrgIcon
                    code={getExternalSubOrgIcon(code)!}
                    size={40}
                    className={styles.scenePortrait__sigilIcon}
                  />
                ) : (
                  <span>{sigilFor(code)}</span>
                )}
              </div>
              <div className={styles.scenePortrait__caption}>
                <span>{profile.scene.operatorRole}</span>
                <strong>{profile.scene.operatorName}</strong>
              </div>
            </div>

            <div className={styles.sceneDialogue}>
              <div className={styles.sceneDialogue__top}>
                <span>{profile.scene.operatorCodename}</span>
                <b>{activeDialogue.mood}</b>
              </div>
              <div className={styles.affectionRail}>
                <span>RELATION</span>
                <div className={styles.affectionRail__bar} aria-hidden>
                  <i
                    style={{
                      width: `${((currentFavorability + 10) / 20) * 100}%`,
                    }}
                  />
                </div>
                <b>{currentFavorability} / 10</b>
              </div>
              <strong className={styles.sceneDialogue__speaker}>
                {profile.scene.operatorName}
              </strong>
              <p className={styles.sceneDialogue__line}>{baseDialogueLine}</p>
              <p className={styles.sceneDialogue__rank}>{rankDialogueLine}</p>
              <div className={styles.sceneDialogue__reply}>
                <span>
                  {selectionKindLabel(selected.kind)} · {selected.channel}
                </span>
                <strong>{selected.label}</strong>
                <p>{dialogueLine}</p>
              </div>
              <p className={styles.sceneDialogue__sub}>{profile.contactLine}</p>

              <div className={styles.sceneDialogue__meta}>
                <span>
                  {contactActor
                    ? `${contactActor.codename} · ${contactActor.agentLevel ?? "등급 미등록"}`
                    : "접근 요원 미확인"}
                </span>
                <span>{activeRankDialogue.label}</span>
                <span>현재 {currentFavorability}</span>
                <span>
                  {selected.kind === "talk"
                    ? "대화 선택"
                    : `예상 ${projectedFavorability} (${formatDelta(cappedDelta)})`}
                </span>
                <span>{resultLabel}</span>
                {selected.cost ? (
                  <span>{selected.cost.toLocaleString()} CR</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.choiceDeck}>
            <div className={styles.choiceGroup}>
              <div className={styles.choiceGroup__head}>
                <span>TALK</span>
                <b>{profile.scene.idleLine}</b>
              </div>
              <div className={styles.talkGrid}>
                {profile.scene.storyChoices.map((choice) => {
                  const active =
                    selected.kind === "talk" && selected.id === choice.id;
                  const locked =
                    currentFavorability <
                    (choice.minimumFavorability ?? FAVORABILITY_MIN);
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      className={[
                        styles.talkCard,
                        active ? styles["talkCard--active"] : "",
                        locked ? styles["talkCard--locked"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSelected(storyChoiceSelection(choice))}
                      aria-pressed={active}
                    >
                      <span>{choice.tone}</span>
                      <strong>{choice.label}</strong>
                      <p>{locked ? profile.scene.lockedLine : choice.prompt}</p>
                      <small>{choice.effectLabel}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.choiceGroup}>
              <div className={styles.choiceGroup__head}>
                <span>CONTACT</span>
                <b>{profile.scene.openingLine}</b>
              </div>
              <div className={styles.actionGrid}>
                {profile.actions.map((action) => {
                  const active =
                    selected.kind === "action" && selected.id === action.id;
                  const actionDelta = getFactionActionDelta(currentFavorability);
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className={[
                        styles.actionCard,
                        active ? styles["actionCard--active"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSelected(actionSelection(action))}
                      aria-pressed={active}
                    >
                      <span>{action.channel}</span>
                      <strong>{action.label}</strong>
                      <p>{action.detail}</p>
                      <small>
                        {actionDelta > 0
                          ? action.effectLabel
                          : "협조 단계 이후 기록만"}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.choiceGroup}>
              <div className={styles.choiceGroup__head}>
                <span>SUPPORT</span>
                <b>{hostile ? "추적 자원을 투입합니다." : "관계 개선 예산을 투입합니다."}</b>
              </div>
              <div className={styles.supportGrid}>
                {supportSelections.map((option) => {
                  const active =
                    selected.kind === "support" && selected.id === option.id;
                  const optionDelta = selectionDelta(
                    option,
                    currentFavorability,
                  );
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={[
                        styles.supportCard,
                        active ? styles["supportCard--active"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSelected(option)}
                      aria-pressed={active}
                    >
                      <IconCredit aria-hidden />
                      <span>{option.label}</span>
                      <strong>{option.cost?.toLocaleString()} CR</strong>
                      <small>
                        {optionDelta > 0 ? formatDelta(optionDelta) : "조건 미달"}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <div className={styles.applyConsole}>
          <IconFactionBriefing aria-hidden />
          <div>
            <strong>{canEditFavorability ? "GM 반영 대기" : "GM 검토 후보"}</strong>
            <p>
              {canEditFavorability
                ? "선택한 접선 결과를 현재 보상 규칙에 따라 세력 우호도에 반영할 수 있습니다."
                : "접선 결과는 후보로만 표시됩니다."}
            </p>
          </div>
          <button type="button" onClick={handleApply} disabled={!canApply}>
            {getApplyLabel()}
          </button>
        </div>
        {message ? <p className={styles.applyMessage}>{message}</p> : null}

        <div className={styles.activityLogList}>
          <div className={styles.activityLogList__head}>
            <span>최근 신호</span>
            <b>{logs.length}</b>
          </div>
          {logs.length > 0 ? (
            logs.map((log) => (
              <div key={log.id} className={styles.activityLog}>
                <div>
                  <span>{activityTypeLabel(log.kind)}</span>
                  <strong>{log.title}</strong>
                </div>
                <p>{log.detail}</p>
                <small>
                  {formatActivityDate(log.createdAt)} · {log.actorName}
                  {log.characterCodename ? ` · ${log.characterCodename}` : ""}
                  {log.creditCost
                    ? ` · ${log.creditCost.toLocaleString()} CR`
                    : ""}
                  {log.delta !== 0 ? ` · ${formatDelta(log.delta)}` : ""}
                </small>
              </div>
            ))
          ) : (
            <p className={styles.activityLogEmpty}>
              아직 기록된 접선 신호가 없습니다.
            </p>
          )}
        </div>
      </Box>

      <Box className={styles.questPanel}>
        <PanelTitle right={<span className={styles.panelCode}>QUEST</span>}>
          <span className={styles.panelLabel}>
            <IconReportDocument aria-hidden />
            <span>의뢰 게시판</span>
          </span>
        </PanelTitle>

        <div className={styles.questGrid}>
          {profile.quests.map((quest) => {
            const progress = questProgressById.get(quest.id);
            const selection = questSelection(quest, progress);
            const active =
              selected.kind === "quest" && selected.id === selection.id;
            const locked = currentFavorability < quest.minimumFavorability;
            const completed = progress?.status === "COMPLETED";
            const inProgress = progress?.status === "ACTIVE";
            return (
              <button
                key={quest.id}
                type="button"
                className={[
                  styles.questCard,
                  active ? styles["questCard--active"] : "",
                  locked ? styles["questCard--locked"] : "",
                  completed ? styles["questCard--completed"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelected(selection)}
                aria-pressed={active}
              >
                <div className={styles.questCard__head}>
                  <span>{quest.minimumFavorability}+</span>
                  <strong>{quest.title}</strong>
                </div>
                <p>{quest.summary}</p>
                <small>
                  {completed
                    ? "완료됨"
                    : inProgress
                      ? "진행 중 · 완료 시 +1"
                      : locked
                        ? "관계 단계 부족"
                        : quest.reward}
                </small>
              </button>
            );
          })}
        </div>

        <Link className={styles.returnCta} href="/erp/factions">
          <IconAffinity aria-hidden />
          <span>세력도로 복귀</span>
          <IconArrowRight aria-hidden />
        </Link>
      </Box>
    </div>
  );
}
