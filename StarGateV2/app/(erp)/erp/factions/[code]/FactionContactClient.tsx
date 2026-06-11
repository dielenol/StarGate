"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

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

import type {
  FactionActionPreview,
  FactionGameProfile,
  FactionQuestPreview,
} from "../_game";
import styles from "./page.module.css";

interface FactionContactClientProps {
  code: string;
  label: string;
  logoUrl: string;
  favorability: number | null;
  hostile: boolean;
  canEditFavorability: boolean;
  profile: FactionGameProfile;
}

interface ContactSelection {
  id: string;
  kind: "action" | "support" | "quest";
  channel: string;
  label: string;
  detail: string;
  delta: number;
  cost?: number;
}

const FAVORABILITY_MIN = -10;
const FAVORABILITY_MAX = 10;

const SUPPORT_OPTIONS = [
  {
    id: "support-small",
    label: "현장 후원",
    hostileLabel: "추적 예산",
    amount: 150,
    delta: 1,
  },
  {
    id: "support-mid",
    label: "장기 협조금",
    hostileLabel: "감시망 확장",
    amount: 450,
    delta: 2,
  },
  {
    id: "support-large",
    label: "전략 후원",
    hostileLabel: "침투 작전비",
    amount: 900,
    delta: 3,
  },
] as const;

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

function actionSelection(action: FactionActionPreview): ContactSelection {
  return {
    id: action.id,
    kind: "action",
    channel: action.channel,
    label: action.label,
    detail: action.detail,
    delta: 1,
  };
}

function questSelection(quest: FactionQuestPreview): ContactSelection {
  return {
    id: quest.id,
    kind: "quest",
    channel: "QUEST",
    label: quest.title,
    detail: quest.summary,
    delta: 2,
  };
}

export default function FactionContactClient({
  code,
  label,
  logoUrl,
  favorability,
  hostile,
  canEditFavorability,
  profile,
}: FactionContactClientProps) {
  const router = useRouter();
  const [currentFavorability, setCurrentFavorability] = useState(
    favorability ?? 0,
  );
  const [selected, setSelected] = useState<ContactSelection>(() =>
    actionSelection(profile.actions[0]),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const supportSelections = useMemo(
    () =>
      SUPPORT_OPTIONS.map<ContactSelection>((option) => ({
        id: option.id,
        kind: "support",
        channel: hostile ? "COUNTER-FUND" : "CREDIT",
        label: hostile ? option.hostileLabel : option.label,
        detail: hostile
          ? `${option.amount.toLocaleString()} CR을 작전 예산으로 책정해 추적/차단망을 강화합니다.`
          : `${option.amount.toLocaleString()} CR을 관계 개선 예산으로 책정합니다.`,
        delta: option.delta,
        cost: option.amount,
      })),
    [hostile],
  );

  const projectedFavorability = clampFavorability(
    currentFavorability + selected.delta,
  );
  const cappedDelta = projectedFavorability - currentFavorability;
  const canApply =
    canEditFavorability && !isSaving && cappedDelta !== 0 && selected.delta > 0;

  async function handleApply() {
    if (!canApply) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/erp/factions/favorability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          favorability: projectedFavorability,
        }),
      });

      const payload = (await res.json()) as {
        code?: string;
        favorability?: number;
        error?: string;
      };

      if (!res.ok || typeof payload.favorability !== "number") {
        throw new Error(payload.error ?? "우호도 반영에 실패했습니다.");
      }

      setCurrentFavorability(payload.favorability);
      setMessage("우호도 변경이 반영되었습니다.");
      router.refresh();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "우호도 반영에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Box className={styles.contactPanel}>
        <PanelTitle
          right={<span className={styles.panelCode}>{profile.operatorLabel}</span>}
        >
          <span className={styles.panelLabel}>
            <IconContact aria-hidden />
            <span>접선 콘솔</span>
          </span>
        </PanelTitle>

        <div className={styles.contactSimulator}>
          <div className={styles.operatorCard}>
            <div className={styles.operatorCard__sigil}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className={[
                    styles.operatorCard__logo,
                    code === "SPACE_ZERO"
                      ? styles["operatorCard__logo--spaceZero"]
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ) : (
                <span>{sigilFor(code)}</span>
              )}
            </div>
            <span>{displayCode(code)}</span>
            <strong>{label}</strong>
          </div>

          <div className={styles.dialoguePanel}>
            <div className={styles.dialoguePanel__head}>
              <span>{selected.channel}</span>
              <strong>
                {label} · {selected.label}
              </strong>
            </div>
            <p>{selected.detail}</p>
            <div className={styles.dialoguePanel__meta}>
              <span>현재 {currentFavorability}</span>
              <span>
                예상 {projectedFavorability} ({formatDelta(cappedDelta)})
              </span>
              {selected.cost ? (
                <span>{selected.cost.toLocaleString()} CR</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.actionGrid}>
          {profile.actions.map((action) => {
            const active = selected.kind === "action" && selected.id === action.id;
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
                <small>{action.effectLabel}</small>
              </button>
            );
          })}
        </div>

        <div className={styles.supportGrid}>
          {supportSelections.map((option) => {
            const active =
              selected.kind === "support" && selected.id === option.id;
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
                <small>{formatDelta(option.delta)}</small>
              </button>
            );
          })}
        </div>

        <div className={styles.applyConsole}>
          <IconFactionBriefing aria-hidden />
          <div>
            <strong>{canEditFavorability ? "GM 반영 대기" : "GM 검토 후보"}</strong>
            <p>
              {canEditFavorability
                ? "선택한 접선 결과를 현재 세력 우호도에 반영할 수 있습니다."
                : "접선 결과는 후보로만 표시됩니다."}
            </p>
          </div>
          <button type="button" onClick={handleApply} disabled={!canApply}>
            {isSaving ? "반영 중" : "우호도 반영"}
          </button>
        </div>
        {message ? <p className={styles.applyMessage}>{message}</p> : null}
      </Box>

      <Box className={styles.questPanel}>
        <PanelTitle right={<span className={styles.panelCode}>CANDIDATE</span>}>
          <span className={styles.panelLabel}>
            <IconReportDocument aria-hidden />
            <span>퀘스트 후보</span>
          </span>
        </PanelTitle>

        <div className={styles.questGrid}>
          {profile.quests.map((quest) => {
            const selection = questSelection(quest);
            const active =
              selected.kind === "quest" && selected.id === selection.id;
            const locked = currentFavorability < quest.minimumFavorability;
            return (
              <button
                key={quest.id}
                type="button"
                className={[
                  styles.questCard,
                  active ? styles["questCard--active"] : "",
                  locked ? styles["questCard--locked"] : "",
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
                <small>{locked ? "관계 단계 부족" : quest.reward}</small>
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
    </>
  );
}
