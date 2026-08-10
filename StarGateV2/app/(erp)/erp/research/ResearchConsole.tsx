"use client";

import { useEffect, useRef } from "react";

import Image from "next/image";

import ResearchCountdown, {
  type ResearchTimestamp,
} from "./ResearchCountdown";
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
  onClose: () => void;
  onSelectLine: (lineId: string) => void;
  onDestinationChange: (destination: ResearchDestination) => void;
  onStartInitial: (lineId: string) => void;
  onCreateJob: (
    lineId: string,
    destination: ResearchDestination,
  ) => void;
  onCancelJob: (jobId: string) => void;
  onClaimJob: (jobId: string) => void;
  onRefresh?: () => void;
}

function statusLabel(status: ResearchLineStatus | ResearchJobStatus): string {
  return {
    LOCKED: "미해금",
    INITIAL_RESEARCH: "최초 연구 중",
    OPEN: "생산 가능",
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
        <Image
          src={line.source.image}
          alt={line.source.name}
          width={128}
          height={128}
          sizes="78px"
        />
        <div>
          <span>SHARED STOCK · {line.source.sharedQuantity}</span>
          <strong>
            {line.source.name} ×{line.source.quantity}
          </strong>
          {!line.source.registered ? <small>MASTER ITEM 미등록</small> : null}
        </div>
      </div>
      <div className={styles.itemFlow__process} aria-hidden="true">
        <i />
        <span>EXTRACT</span>
        <i />
      </div>
      <div className={styles.itemFlow__item}>
        <Image
          src={line.output.image}
          alt={line.output.name}
          width={128}
          height={128}
          sizes="78px"
        />
        <div>
          <span>OUTPUT STOCK · {line.output.sharedQuantity}</span>
          <strong>
            {line.output.name} ×{line.output.quantity}
          </strong>
          {!line.output.registered ? <small>CATALOG 후보 · 적재 전</small> : null}
        </div>
      </div>
    </div>
  );
}

export default function ResearchConsole(props: ResearchConsoleProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const line =
    props.lines.find((candidate) => candidate.id === props.selectedLineId) ??
    props.lines[0];

  useEffect(() => {
    closeButtonRef.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (
        !(activeElement instanceof HTMLElement) ||
        !dialogRef.current.contains(activeElement) ||
        !focusable.includes(activeElement)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, []);

  if (!line) return null;

  const active = line.currentJob;
  const isPending = props.pendingAction !== null && props.pendingAction !== undefined;
  const initialCompletesAt =
    line.status === "INITIAL_RESEARCH" ? line.initialCompletesAt : undefined;
  const currentTimer =
    active?.status === "RUNNING"
      ? active.completesAt
      : active?.status === "CLAIMABLE"
        ? active.claimDeadline
        : undefined;

  return (
    <aside
      ref={dialogRef}
      className={styles.researchConsole}
      role="dialog"
      aria-modal="true"
      aria-labelledby="research-console-title"
    >
      <header className={styles.researchConsole__header}>
        <div>
          <p>LAB TERMINAL · B-07</p>
          <h2 id="research-console-title">샘플 처리 장치</h2>
        </div>
        <button
          ref={closeButtonRef}
          className={styles.researchConsole__close}
          aria-label="연구 콘솔 닫기"
          onClick={props.onClose}
        >
          ×
        </button>
      </header>

      <div className={styles.researchTabs} role="tablist" aria-label="연구선 선택">
        {props.lines.map((candidate, index) => (
          <button
            key={candidate.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`research-line-tab-${candidate.id}`}
            className={styles.researchTabs__tab}
            data-active={candidate.id === line.id || undefined}
            role="tab"
            aria-selected={candidate.id === line.id}
            aria-controls="research-line-panel"
            tabIndex={candidate.id === line.id ? 0 : -1}
            onClick={() => props.onSelectLine(candidate.id)}
            onKeyDown={(event) => {
              let nextIndex = index;
              if (event.key === "ArrowRight") {
                nextIndex = (index + 1) % props.lines.length;
              } else if (event.key === "ArrowLeft") {
                nextIndex = (index - 1 + props.lines.length) % props.lines.length;
              } else if (event.key === "Home") {
                nextIndex = 0;
              } else if (event.key === "End") {
                nextIndex = props.lines.length - 1;
              } else {
                return;
              }

              event.preventDefault();
              const nextLine = props.lines[nextIndex];
              if (!nextLine) return;
              props.onSelectLine(nextLine.id);
              tabRefs.current[nextIndex]?.focus();
            }}
          >
            <Image
              src={candidate.source.image}
              alt=""
              width={64}
              height={64}
              sizes="42px"
            />
            <span>
              <small>0{index + 1}</small>
              <strong>{candidate.title}</strong>
              <em>
                {candidate.isHalted ? "안전정지" : statusLabel(candidate.status)}
              </em>
            </span>
          </button>
        ))}
      </div>

      <div className={styles.researchConsole__scroll}>
        <section
          id="research-line-panel"
          className={styles.linePanel}
          role="tabpanel"
          aria-labelledby={`research-line-tab-${line.id}`}
        >
          <div className={styles.linePanel__heading}>
            <div>
              <p>{line.code}</p>
              <h3>{line.title}</h3>
              <span>{line.description}</span>
            </div>
            <strong data-status={line.isHalted ? "halted" : line.status.toLowerCase()}>
              {line.isHalted ? "안전정지" : statusLabel(line.status)}
            </strong>
          </div>

          {line.gameplayNote ? (
            <p className={styles.gameplayNote}>{line.gameplayNote}</p>
          ) : null}
          <ItemFlow line={line} />

          {line.isHalted ? (
            <p className={styles.feedbackError} role="status">
              반복 실패로 장치가 안전정지되었습니다. 복구 전에는 결제와 신규
              생산을 받지 않습니다.
            </p>
          ) : null}

          {initialCompletesAt && !active ? (
            <div className={styles.timerReadout}>
              <span>INITIAL RESEARCH</span>
              <strong>
                <ResearchCountdown
                  completesAt={initialCompletesAt}
                  serverNow={props.serverNow}
                  onExpire={props.onRefresh}
                  onRefresh={props.onRefresh}
                />
              </strong>
              <small>완료 시 산출물 1개가 공용 보관고에 자동 지급됩니다.</small>
            </div>
          ) : null}

          <section className={styles.operationDeck}>
            <header>
              <span>CURRENT OPERATION</span>
              <strong>{active ? statusLabel(active.status) : "IDLE"}</strong>
            </header>
            {active ? (
              <div
                className={styles.currentJob}
                data-claimable={active.status === "CLAIMABLE" || undefined}
              >
                <div>
                  <span>
                    {active.kind === "INITIAL" ? "최초 연구" : "반복 생산"} ·{" "}
                    {active.codename}
                  </span>
                  {currentTimer ? (
                    <strong>
                      {active.status === "CLAIMABLE" ? "수령 마감 " : "완료까지 "}
                      <ResearchCountdown
                        completesAt={currentTimer}
                        serverNow={props.serverNow}
                        onExpire={props.onRefresh}
                        onRefresh={props.onRefresh}
                      />
                    </strong>
                  ) : null}
                </div>
                {active.isViewerJob && active.claimable ? (
                  <button
                    className={styles.consolePrimaryAction}
                    disabled={isPending}
                    onClick={() => props.onClaimJob(active.id)}
                  >
                    산출물 수령
                  </button>
                ) : null}
              </div>
            ) : (
              <p className={styles.emptyCopy}>장치가 다음 명령을 기다리고 있습니다.</p>
            )}
          </section>

          <section className={styles.queueList} aria-label="연구선 FIFO 대기열">
            <header>
              <span>FIFO QUEUE</span>
              <strong>{line.queue.length}</strong>
            </header>
            {line.queue.length === 0 ? (
              <p className={styles.emptyCopy}>예약된 생산 요청이 없습니다.</p>
            ) : (
              line.queue.map((job) => (
                <div key={job.id} className={styles.queueList__item}>
                  <span>{job.position ? `#${job.position}` : "—"}</span>
                  <strong>{job.codename}</strong>
                  <em>
                    {job.destination === "SHARED" ? "공용 지급" : "개인 수령"}
                  </em>
                  {job.isViewerJob && job.cancellable ? (
                    <button
                      disabled={isPending}
                      onClick={() => props.onCancelJob(job.id)}
                    >
                      취소·환불
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </section>
        </section>
      </div>

      <footer className={styles.productionPanel}>
        {line.status === "OPEN" ? (
          <fieldset className={styles.destinationFieldset}>
            <legend>수령처 선택</legend>
            {(["SHARED", "CHARACTER"] as const).map((destination) => (
              <label key={destination}>
                <input
                  type="radio"
                  name="research-destination"
                  value={destination}
                  checked={props.destination === destination}
                  disabled={!line.canCreateJob || isPending}
                  onChange={() => props.onDestinationChange(destination)}
                />
                {destination === "SHARED" ? "공용 보관고" : "내 캐릭터"}
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className={styles.permissionNote}>
          <p>
            {line.status === "LOCKED"
              ? line.initialEligibilityMessage
              : line.status === "INITIAL_RESEARCH"
                ? line.isHalted
                  ? "운영 복구 전까지 최초 연구가 정지됩니다."
                  : "24시간 최초 연구가 끝나면 누구나 이 장치를 이용할 수 있습니다."
                : line.productionEligibilityMessage}
          </p>
          {line.status === "LOCKED" ? (
            <button
              className={styles.consolePrimaryAction}
              disabled={!line.canStartInitial || isPending}
              onClick={() => props.onStartInitial(line.id)}
            >
              {isPending && props.pendingAction === "initial"
                ? "표본 접수 중…"
                : "표본 제출 · 최초 연구"}
            </button>
          ) : line.status === "INITIAL_RESEARCH" ? (
            <button disabled>{line.isHalted ? "안전정지" : "연구 진행 중"}</button>
          ) : (
            <button
              className={styles.consolePrimaryAction}
              disabled={!line.canCreateJob || isPending}
              onClick={() => props.onCreateJob(line.id, props.destination)}
            >
              {isPending && props.pendingAction === "job"
                ? "생산 등록 중…"
                : `${line.repeatCreditCost.toLocaleString()} CR · 생산 예약`}
            </button>
          )}
        </div>
        <span className={styles.productionPanel__balance}>
          BALANCE ·{" "}
          {line.viewerBalance === null
            ? "—"
            : `${line.viewerBalance.toLocaleString()} CR`}
        </span>
        {props.error ? (
          <p className={styles.feedbackError} role="alert">
            {props.error}
          </p>
        ) : null}
      </footer>
    </aside>
  );
}
