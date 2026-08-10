"use client";

import Image from "next/image";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Tag from "@/components/ui/Tag/Tag";

import ResearchCountdown, { type ResearchTimestamp } from "./ResearchCountdown";
import styles from "./page.module.css";

export type ResearchLineStatus = "LOCKED" | "INITIAL_RESEARCH" | "OPEN";
export type ResearchJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "CLAIMABLE"
  | "COMPLETED"
  | "CANCELLED"
  | "DIVERTED_SHARED";
export type ResearchDestination = "SHARED" | "CHARACTER";

export interface ResearchConsoleItem {
  name: string;
  slug: string;
  image: string;
  quantity: number;
  sharedQuantity: number;
  registered: boolean;
}

export interface ResearchConsoleJob {
  id: string;
  kind: "INITIAL" | "REPEAT";
  status: ResearchJobStatus;
  codename: string;
  position?: number;
  destination: ResearchDestination;
  completesAt?: ResearchTimestamp;
  claimDeadline?: ResearchTimestamp;
  isViewerJob?: boolean;
  cancellable?: boolean;
  claimable?: boolean;
}

export interface ResearchConsoleLine {
  id: string;
  code: string;
  title: string;
  description: string;
  gameplayNote?: string | null;
  status: ResearchLineStatus;
  isHalted: boolean;
  source: ResearchConsoleItem;
  output: ResearchConsoleItem;
  initialCompletesAt?: ResearchTimestamp;
  currentJob?: ResearchConsoleJob | null;
  queue: readonly ResearchConsoleJob[];
  repeatCreditCost: number;
  viewerBalance: number | null;
  canStartInitial: boolean;
  initialEligibilityMessage: string;
  canCreateJob: boolean;
  productionEligibilityMessage: string;
}

export interface ResearchConsoleProps {
  lines: readonly ResearchConsoleLine[];
  selectedLineId: string | null;
  destination: ResearchDestination;
  serverNow: ResearchTimestamp;
  pendingAction?: "initial" | "job" | "cancel" | "claim" | null;
  error?: string | null;
  onSelectLine: (lineId: string) => void;
  onDestinationChange: (destination: ResearchDestination) => void;
  onStartInitial: (lineId: string) => void;
  onCreateJob: (lineId: string, destination: ResearchDestination) => void;
  onCancelJob: (jobId: string) => void;
  onClaimJob: (jobId: string) => void;
  onRefresh?: () => void;
}

const STATUS_TONE: Record<ResearchLineStatus | ResearchJobStatus, "default" | "gold" | "info" | "success" | "danger"> = {
  LOCKED: "danger",
  INITIAL_RESEARCH: "gold",
  OPEN: "success",
  QUEUED: "info",
  RUNNING: "gold",
  CLAIMABLE: "success",
  COMPLETED: "success",
  CANCELLED: "default",
  DIVERTED_SHARED: "default",
};

function statusLabel(status: ResearchLineStatus | ResearchJobStatus): string {
  return {
    LOCKED: "잠김",
    INITIAL_RESEARCH: "최초 연구 중",
    OPEN: "개방",
    QUEUED: "대기열",
    RUNNING: "생산 중",
    CLAIMABLE: "개인 수령 대기",
    COMPLETED: "완료",
    CANCELLED: "취소됨",
    DIVERTED_SHARED: "공용 전환 완료",
  }[status];
}

function ItemFlow({ line }: { line: ResearchConsoleLine }) {
  return (
    <div className={styles.itemFlow}>
      <div className={styles.itemFlow__item}>
        <Image src={line.source.image} alt={line.source.name} width={128} height={128} sizes="96px" />
        <div><span>제출물 · 공용 {line.source.sharedQuantity}</span><strong>{line.source.name} ×{line.source.quantity}</strong>{!line.source.registered ? <small>master item 미등록</small> : null}</div>
      </div>
      <span className={styles.itemFlow__arrow} aria-hidden="true">→</span>
      <div className={styles.itemFlow__item}>
        <Image src={line.output.image} alt={line.output.name} width={128} height={128} sizes="96px" />
        <div><span>산출물 · 공용 {line.output.sharedQuantity}</span><strong>{line.output.name} ×{line.output.quantity}</strong>{!line.output.registered ? <small>catalog 후보 · 운영 적재 전</small> : null}</div>
      </div>
    </div>
  );
}

export default function ResearchConsole(props: ResearchConsoleProps) {
  const line = props.lines.find((candidate) => candidate.id === props.selectedLineId) ?? props.lines[0];
  if (!line) {
    return <Box className={styles.stateBox}>표시할 연구선이 없습니다.</Box>;
  }
  const active = line.currentJob;
  const isPending = props.pendingAction !== null && props.pendingAction !== undefined;
  const initialCompletesAt =
    line.status === "INITIAL_RESEARCH" ? line.initialCompletesAt : undefined;
  const currentTimer = active?.status === "RUNNING" ? active.completesAt : active?.status === "CLAIMABLE" ? active.claimDeadline : undefined;

  return (
    <section className={styles.researchConsole} aria-labelledby="research-console-title">
      <header className={styles.researchConsole__header}>
        <div><p className={styles.eyebrow}>RESEARCH LINES · PRODUCTION CONSOLE</p><h2 id="research-console-title">연구·반복생산 콘솔</h2></div>
        <p className={styles.serverTime}>서버 동기화 기준</p>
      </header>
      <div className={styles.researchTabs} role="tablist" aria-label="연구선 선택">
        {props.lines.map((candidate) => (
          <button key={candidate.id} className={[styles.researchTabs__tab, candidate.id === line.id ? styles["researchTabs__tab--active"] : ""].filter(Boolean).join(" ")} role="tab" aria-selected={candidate.id === line.id} onClick={() => props.onSelectLine(candidate.id)}>
            <span>{candidate.code}</span><Tag tone={candidate.isHalted ? "danger" : STATUS_TONE[candidate.status]}>{candidate.isHalted ? "안전정지" : statusLabel(candidate.status)}</Tag>
          </button>
        ))}
      </div>
      <Box className={styles.linePanel} variant={line.status === "OPEN" ? "gold" : "default"}>
        <div className={styles.linePanel__heading}><div><h3>{line.title}</h3><p>{line.description}</p>{line.gameplayNote ? <p className={styles.gameplayNote}>{line.gameplayNote}</p> : null}</div><Tag tone={line.isHalted ? "danger" : STATUS_TONE[line.status]}>{line.isHalted ? "안전정지" : statusLabel(line.status)}</Tag></div>
        <ItemFlow line={line} />
        {line.isHalted ? <p className={styles.feedbackError} role="status">이 연구선은 반복 실패로 운영 안전정지되었습니다. 신규 결제는 차단되며 운영자 복구가 필요합니다.</p> : null}
        {initialCompletesAt && !active ? <p className={styles.countdownLine}>최초 연구 완료까지 <ResearchCountdown completesAt={initialCompletesAt} serverNow={props.serverNow} onExpire={props.onRefresh} onRefresh={props.onRefresh} /></p> : null}
        {active ? <div className={[styles.currentJob, active.status === "CLAIMABLE" ? styles["currentJob--claimable"] : ""].filter(Boolean).join(" ")}><div><Tag tone={STATUS_TONE[active.status]}>{statusLabel(active.status)}</Tag><strong>{active.codename}의 {active.kind === "INITIAL" ? "최초 연구" : "생산 요청"}</strong>{currentTimer ? <p>{active.status === "CLAIMABLE" ? "개인 수령 마감까지 " : "완료까지 "}<ResearchCountdown completesAt={currentTimer} serverNow={props.serverNow} onExpire={props.onRefresh} onRefresh={props.onRefresh} /></p> : null}</div>{active.isViewerJob && active.claimable ? <Button variant="primary" disabled={isPending} onClick={() => props.onClaimJob(active.id)}>개인 수령</Button> : null}</div> : <p className={styles.emptyCopy}>현재 실행 중인 요청이 없습니다.</p>}
        <div className={styles.queueList} aria-label="연구선 FIFO 대기열"><h4>FIFO 대기열</h4>{line.queue.length === 0 ? <p className={styles.emptyCopy}>대기 중인 요청이 없습니다.</p> : line.queue.map((job) => <div key={job.id} className={styles.queueList__item}><span>{job.position ? `${job.position}번` : "대기"}</span><strong>{job.codename}</strong><span>{job.destination === "SHARED" ? "공용 수령" : "개인 수령"}</span>{job.isViewerJob && job.cancellable ? <Button size="sm" disabled={isPending} onClick={() => props.onCancelJob(job.id)}>취소·환불</Button> : null}</div>)}</div>
      </Box>
      <Box className={styles.productionPanel} variant="solid"><div><p className={styles.eyebrow}>REPEAT PRODUCTION</p><h3>반복생산 요청</h3><p>{line.repeatCreditCost.toLocaleString()} CR · 잔액 {line.viewerBalance === null ? "—" : `${line.viewerBalance.toLocaleString()} CR`} · 산출물 catalog 0 CR</p></div><fieldset className={styles.destinationFieldset}><legend>수령처</legend>{(["SHARED", "CHARACTER"] as const).map((destination) => <label key={destination}><input type="radio" name="research-destination" value={destination} checked={props.destination === destination} disabled={!line.canCreateJob || isPending} onChange={() => props.onDestinationChange(destination)} />{destination === "SHARED" ? "공용 인벤토리" : "내 캐릭터 수령함"}</label>)}</fieldset>{line.status === "LOCKED" ? <div className={styles.permissionNote}><p>{line.initialEligibilityMessage}</p><Button variant="primary" disabled={!line.canStartInitial || isPending} onClick={() => props.onStartInitial(line.id)}>{isPending && props.pendingAction === "initial" ? "최초 연구 접수 중…" : "최초 연구 제출"}</Button></div> : line.status === "INITIAL_RESEARCH" ? <div className={styles.permissionNote}><p>{line.isHalted ? "최초 연구가 운영 안전정지되었습니다. 운영자 복구가 필요합니다." : "24시간 최초 연구가 진행 중입니다. 완료 후 누구나 반복생산을 요청할 수 있습니다."}</p><Button disabled>{line.isHalted ? "안전정지" : "연구 진행 중"}</Button></div> : <div className={styles.permissionNote}><p>{line.productionEligibilityMessage}</p><Button className={styles.productionAction} variant="primary" disabled={!line.canCreateJob || isPending} onClick={() => props.onCreateJob(line.id, props.destination)}>{isPending && props.pendingAction === "job" ? "요청 등록 중…" : `${line.repeatCreditCost.toLocaleString()} CR로 반복생산 요청`}</Button></div>}</Box>
      {props.error ? <p className={styles.feedbackError} role="alert">{props.error}</p> : null}
    </section>
  );
}
