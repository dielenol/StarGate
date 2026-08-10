"use client";

import { useState } from "react";

import Box from "@/components/ui/Box/Box";

import ResearchConsole, { type ResearchConsoleLine, type ResearchDestination } from "./ResearchConsole";
import XenoStage, { type XenoDialogueChoice, type XenoDialogueMessage, type XenoRelationshipPresentation } from "./XenoStage";
import type { ResearchTimestamp } from "./ResearchCountdown";
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

export interface ResearchLabViewProps extends ResearchLabViewActions {
  data?: ResearchLabViewData | null;
  isLoading?: boolean;
  error?: string | null;
  pendingAction?: "initial" | "job" | "cancel" | "claim" | "chat" | "choice" | null;
  chatError?: string | null;
}

export default function ResearchLabView({
  data,
  isLoading = false,
  error,
  pendingAction,
  chatError,
  onRefresh,
  onChatSubmit,
  onChoiceSelect,
  onStartInitial,
  onCreateJob,
  onCancelJob,
  onClaimJob,
}: ResearchLabViewProps) {
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [destination, setDestination] = useState<ResearchDestination>("SHARED");
  const [chatValue, setChatValue] = useState("");

  if (isLoading) return <Box className={styles.stateBox} aria-live="polite">연구소 정보를 불러오는 중입니다.</Box>;
  if (error && !data) return <Box className={styles.stateBox} role="alert">{error}</Box>;
  if (!data) return <Box className={styles.stateBox}>연구소 정보가 아직 준비되지 않았습니다.</Box>;
  if (data.lines.length === 0) return <Box className={styles.stateBox}>공개된 연구선이 없습니다.</Box>;

  const selectedId = data.lines.some((line) => line.id === selectedLineId) ? selectedLineId : data.lines[0].id;
  const chatPending = pendingAction === "chat" || pendingAction === "choice";

  return (
    <div className={styles.researchLab}>
      <XenoStage relationship={data.relationship} messages={data.messages} choices={data.choices} chatValue={chatValue} chatRemaining={data.chatRemaining} chatRetryAt={data.chatRetryAt} isChatPending={chatPending} chatError={chatError} disabled={pendingAction === "initial" || pendingAction === "job" || pendingAction === "cancel" || pendingAction === "claim"} onChatChange={setChatValue} onChatSubmit={() => { const message = chatValue.trim(); if (message && onChatSubmit) { onChatSubmit(message); setChatValue(""); } }} onChoiceSelect={onChoiceSelect} />
      <ResearchConsole lines={data.lines} selectedLineId={selectedId} destination={destination} serverNow={data.serverNow} pendingAction={pendingAction === "chat" || pendingAction === "choice" ? null : pendingAction} error={error} onSelectLine={setSelectedLineId} onDestinationChange={setDestination} onStartInitial={(lineId) => onStartInitial?.(lineId)} onCreateJob={(lineId, nextDestination) => onCreateJob?.(lineId, nextDestination)} onCancelJob={(jobId) => onCancelJob?.(jobId)} onClaimJob={(jobId) => onClaimJob?.(jobId)} onRefresh={onRefresh} />
    </div>
  );
}
