"use client";

import { useEffect, useRef, useState } from "react";

import Image from "next/image";

import Box from "@/components/ui/Box/Box";

import {
  GM_SIMULATION_RELATIONSHIPS,
  GM_SIMULATION_SCENARIOS,
  type GmSimulationScenario,
} from "./gmSimulation";
import ResearchConsole, {
  type ResearchConsoleLine,
  type ResearchDestination,
} from "./ResearchConsole";
import type { ResearchTimestamp } from "./ResearchCountdown";
import XenoStage, {
  type XenoDialogueChoice,
  type XenoDialogueMessage,
  type XenoRelationshipPresentation,
  type XenoRelationshipState,
} from "./XenoStage";
import styles from "./page.module.css";

export interface ResearchLabViewData {
  serverNow: ResearchTimestamp;
  relationship: XenoRelationshipPresentation;
  messages: readonly XenoDialogueMessage[];
  choices?: readonly XenoDialogueChoice[];
  chatRemaining: number;
  chatRetryAt?: string | null;
  lines: readonly ResearchConsoleLine[];
}

export interface ResearchLabViewActions {
  onRefresh?: () => void;
  onChatSubmit?: (message: string) => void;
  onChoiceSelect?: (choiceId: string) => void;
  onStartInitial?: (lineId: string) => void;
  onCreateJob?: (lineId: string, destination: ResearchDestination) => void;
  onCancelJob?: (jobId: string) => void;
  onClaimJob?: (jobId: string) => void;
}

export interface ResearchLabSimulationControls {
  active: boolean;
  disabled: boolean;
  scenario: GmSimulationScenario;
  relationshipState: XenoRelationshipState;
  onToggle: () => void;
  onScenarioChange: (scenario: GmSimulationScenario) => void;
  onRelationshipChange: (state: XenoRelationshipState) => void;
}

export interface ResearchLabViewProps extends ResearchLabViewActions {
  data?: ResearchLabViewData | null;
  isLoading?: boolean;
  error?: string | null;
  pendingAction?:
    | "initial"
    | "job"
    | "cancel"
    | "claim"
    | "chat"
    | "choice"
    | null;
  chatError?: string | null;
  simulation?: ResearchLabSimulationControls;
}

function lineStatusLabel(line: ResearchConsoleLine): string {
  if (line.isHalted) return "안전정지";
  if (line.status === "LOCKED") return "미해금";
  if (line.status === "INITIAL_RESEARCH") return "연구 중";
  if (line.currentJob?.status === "CLAIMABLE") return "수령 대기";
  if (line.currentJob?.status === "RUNNING") return "가동 중";
  if (line.queue.length > 0) return `${line.queue.length} 대기`;
  return "생산 가능";
}

export default function ResearchLabView({
  data,
  isLoading = false,
  error,
  pendingAction,
  chatError,
  simulation,
  onRefresh,
  onChatSubmit,
  onChoiceSelect,
  onStartInitial,
  onCreateJob,
  onCancelJob,
  onClaimJob,
}: ResearchLabViewProps) {
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [destination, setDestination] =
    useState<ResearchDestination>("SHARED");
  const [chatValue, setChatValue] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const consoleTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!consoleOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConsoleOpen(false);
        window.requestAnimationFrame(() => consoleTriggerRef.current?.focus());
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [consoleOpen]);

  if (isLoading) {
    return (
      <Box className={styles.stateBox} aria-live="polite">
        샘플 연구소에 접속하는 중입니다.
      </Box>
    );
  }
  if (error && !data) {
    return (
      <Box className={styles.stateBox} role="alert">
        {error}
      </Box>
    );
  }
  if (!data) {
    return (
      <Box className={styles.stateBox}>
        연구소 정보가 아직 준비되지 않았습니다.
      </Box>
    );
  }
  if (data.lines.length === 0) {
    return <Box className={styles.stateBox}>공개된 연구선이 없습니다.</Box>;
  }

  const selectedId = data.lines.some((line) => line.id === selectedLineId)
    ? selectedLineId
    : data.lines[0].id;
  const chatPending = pendingAction === "chat" || pendingAction === "choice";
  const economicPending =
    pendingAction === "initial" ||
    pendingAction === "job" ||
    pendingAction === "cancel" ||
    pendingAction === "claim";
  const openConsole = (lineId?: string, trigger?: HTMLButtonElement) => {
    if (trigger) consoleTriggerRef.current = trigger;
    if (lineId) setSelectedLineId(lineId);
    setConsoleOpen(true);
  };
  const closeConsole = () => {
    setConsoleOpen(false);
    window.requestAnimationFrame(() => consoleTriggerRef.current?.focus());
  };

  return (
    <div className={styles.researchLab}>
      <section className={styles.stageFrame} aria-label="제노의 샘플 연구소">
        <Image
          className={styles.stageFrame__background}
          src="/assets/research/xeno-sample-lab.webp"
          alt=""
          fill
          sizes="100vw"
          priority
        />
        <div className={styles.stageFrame__shade} aria-hidden="true" />
        <div className={styles.stageFrame__grain} aria-hidden="true" />

        <header className={styles.locationHud}>
          <span className={styles.locationHud__index}>B-07</span>
          <div>
            <p>SAMPLE CONTAINMENT LAB</p>
            <strong>제노의 샘플 연구소</strong>
          </div>
        </header>

        <nav className={styles.specimenDock} aria-label="연구 장치 선택">
          {data.lines.map((line, index) => (
            <button
              key={line.id}
              className={styles.specimenDock__button}
              data-status={line.isHalted ? "halted" : line.status.toLowerCase()}
              onClick={(event) => openConsole(line.id, event.currentTarget)}
            >
              <Image
                src={line.source.image}
                alt=""
                width={64}
                height={64}
                sizes="42px"
              />
              <span>
                <small>LINE {String(index + 1).padStart(2, "0")}</small>
                <strong>{line.title}</strong>
                <em>{lineStatusLabel(line)}</em>
              </span>
            </button>
          ))}
        </nav>

        {simulation ? (
          <section
            className={styles.gmSimulator}
            data-active={simulation.active || undefined}
            aria-label="GM 연구소 시뮬레이션"
          >
            <button
              className={styles.gmSimulator__toggle}
              disabled={simulation.disabled}
              onClick={simulation.onToggle}
            >
              {simulation.active ? "LIVE DATA 보기" : "GM 시뮬레이션 시작"}
            </button>
            {simulation.active ? (
              <div className={styles.gmSimulator__controls}>
                <span>GM SIMULATION · NO LIVE MUTATION</span>
                <label>
                  연구 상태
                  <select
                    value={simulation.scenario}
                    onChange={(event) =>
                      simulation.onScenarioChange(
                        event.target.value as GmSimulationScenario,
                      )
                    }
                  >
                    {GM_SIMULATION_SCENARIOS.map((scenario) => (
                      <option key={scenario.value} value={scenario.value}>
                        {scenario.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  제노 반응
                  <select
                    value={simulation.relationshipState}
                    onChange={(event) =>
                      simulation.onRelationshipChange(
                        event.target.value as XenoRelationshipState,
                      )
                    }
                  >
                    {GM_SIMULATION_RELATIONSHIPS.map((relationship) => (
                      <option
                        key={relationship.value}
                        value={relationship.value}
                      >
                        {relationship.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </section>
        ) : null}

        <XenoStage
          relationship={data.relationship}
          messages={data.messages}
          choices={data.choices}
          chatValue={chatValue}
          chatRemaining={data.chatRemaining}
          chatRetryAt={data.chatRetryAt}
          isChatPending={chatPending}
          chatError={chatError}
          disabled={economicPending}
          preferRelationshipExpression={simulation?.active}
          isResearchOpen={consoleOpen}
          onOpenResearch={(trigger) =>
            openConsole(selectedId ?? data.lines[0].id, trigger)
          }
          onChatChange={setChatValue}
          onChatSubmit={() => {
            const message = chatValue.trim();
            if (message && onChatSubmit) {
              onChatSubmit(message);
              setChatValue("");
            }
          }}
          onChoiceSelect={onChoiceSelect}
        />

        {consoleOpen ? (
          <>
            <button
              className={styles.consoleBackdrop}
              aria-label="연구 콘솔 바깥 영역"
              tabIndex={-1}
              onClick={closeConsole}
            />
            <ResearchConsole
              lines={data.lines}
              selectedLineId={selectedId}
              destination={destination}
              serverNow={data.serverNow}
              pendingAction={chatPending ? null : pendingAction}
              error={error}
              onClose={closeConsole}
              onSelectLine={setSelectedLineId}
              onDestinationChange={setDestination}
              onStartInitial={(lineId) => {
                onStartInitial?.(lineId);
                if (simulation?.active) closeConsole();
              }}
              onCreateJob={(lineId, nextDestination) => {
                onCreateJob?.(lineId, nextDestination);
                if (simulation?.active) closeConsole();
              }}
              onCancelJob={(jobId) => {
                onCancelJob?.(jobId);
                if (simulation?.active) closeConsole();
              }}
              onClaimJob={(jobId) => {
                onClaimJob?.(jobId);
                if (simulation?.active) closeConsole();
              }}
              onRefresh={onRefresh}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}
