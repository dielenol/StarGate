"use client";

import { useState } from "react";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag, { type TagTone } from "@/components/ui/Tag/Tag";
import {
  useVttRuntimeMutation,
  VttRuntimeMutationError,
} from "@/hooks/mutations/useVttRuntimeMutation";
import { useVttRuntimeStatusQuery } from "@/hooks/queries/useVttRuntimeStatusQuery";
import { useVttHostStatusQuery } from "@/hooks/queries/useVttHostStatusQuery";
import type { VttHostStatus } from "@/types/vtt-host-control";
import type {
  VttRuntimeActionInput,
  VttRuntimeState,
  VttRuntimeStatus,
} from "@/types/vtt-runtime";

import styles from "./vtt.module.css";

interface Props {
  initialStatus: VttRuntimeStatus;
  initialHostStatus?: VttHostStatus | null;
}

interface StopConfirmation {
  connectedUsers: number | null;
  reason: "ACTIVE_CONNECTIONS" | "CONNECTION_STATE_UNKNOWN";
}

const STATE_LABEL: Record<VttRuntimeState, string> = {
  RUNNING: "실행 중",
  STOPPED: "정지",
  STARTING: "시작 중",
  STOPPING: "종료 중",
  DEGRADED: "점검 필요",
  UNREACHABLE: "연결 불가",
};

const STATE_DESCRIPTION: Record<VttRuntimeState, string> = {
  RUNNING: "VTT 서버가 health와 writer lock을 확보했습니다.",
  STOPPED: "VPS는 켜져 있고 Nochichim 앱만 정지해 있습니다.",
  STARTING: "health와 writer lock이 준비되기를 기다리고 있습니다.",
  STOPPING: "정상 저장 종료와 writer lock 해제를 확인하고 있습니다.",
  DEGRADED: "systemd 상태와 앱 health가 일치하지 않습니다.",
  UNREACHABLE: "제어 호스트에 연결할 수 없어 조작을 잠갔습니다.",
};

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

function statusTone(state: VttRuntimeState): TagTone {
  if (state === "RUNNING") return "success";
  if (state === "STARTING" || state === "STOPPING") return "info";
  if (state === "DEGRADED" || state === "UNREACHABLE") return "danger";
  return "default";
}

function formatDateTime(value: number | null): string {
  return value === null ? "—" : DATE_TIME.format(new Date(value));
}

function sourceRevision(value: string | null): string {
  if (!value) return "—";
  return value.length > 12 ? value.slice(0, 12) : value;
}

function statusDescription(status: VttRuntimeStatus): string {
  if (!status.controlEnabled) {
    return "현재 배포 환경에서는 운영 VPS 원격 제어가 비활성화되어 있습니다.";
  }
  if (status.unavailableReason === "CONTROLLER_REJECTED") {
    return "제어 호스트가 서버 인증을 거절했습니다. 운영 비밀값을 점검해 주세요.";
  }
  if (status.unavailableReason === "CONTROL_MISCONFIGURED") {
    return "Production 제어 환경변수 구성이 완전하지 않습니다.";
  }
  return STATE_DESCRIPTION[status.state];
}

export default function VttRuntimeClient({ initialStatus, initialHostStatus = null }: Props) {
  const query = useVttRuntimeStatusQuery(initialStatus);
  const hostQuery = useVttHostStatusQuery(initialHostStatus ?? undefined, {
    enabled: initialHostStatus !== null,
  });
  const mutation = useVttRuntimeMutation();
  const status = query.data ?? initialStatus;
  const hostStatus = hostQuery.data ?? initialHostStatus;
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const [stopConfirmation, setStopConfirmation] =
    useState<StopConfirmation | null>(null);
  const [confirmationText, setConfirmationText] = useState("");

  const transitioning = status.state === "STARTING" || status.state === "STOPPING";
  const description = statusDescription(status);
  const unavailable = status.state === "UNREACHABLE" || !status.controlEnabled;
  const locked = mutation.isPending || transitioning || unavailable;
  const separatedStartReady = !hostStatus || (
    hostStatus.controlEnabled &&
    hostStatus.state !== "UNREACHABLE" &&
    hostStatus.state !== "RECOVERY_REQUIRED" &&
    hostStatus.transition === null &&
    hostStatus.routeHost === "VPS" &&
    (!hostStatus.hosts.HOME.reachable || hostStatus.hosts.HOME.state === "STOPPED")
  );
  const startDisabled =
    locked || !separatedStartReady || status.state === "RUNNING" || status.state === "STARTING";
  const stopDisabled =
    locked || status.state === "STOPPED" || status.state === "STOPPING";

  async function runAction(input: VttRuntimeActionInput) {
    setFeedback(null);
    try {
      const result = await mutation.mutateAsync(input);
      setStopConfirmation(null);
      setConfirmationText("");
      setFeedback({
        tone: result.auditRecorded ? "success" : "warning",
        text: result.warning ?? (
          input.action === "START"
            ? "Nochichim VTT가 시작됐습니다."
            : "Nochichim VTT가 정상 저장 후 종료됐습니다."
        ),
      });
    } catch (error) {
      if (
        error instanceof VttRuntimeMutationError &&
        (error.code === "ACTIVE_CONNECTIONS" || error.code === "CONNECTION_STATE_UNKNOWN")
      ) {
        setStopConfirmation({
          connectedUsers: error.connectedUsers ?? null,
          reason: error.code,
        });
        setConfirmationText("");
        setFeedback(null);
        return;
      }
      const unknown =
        error instanceof VttRuntimeMutationError &&
        error.code === "ACTION_RESULT_UNKNOWN";
      setFeedback({
        tone: "error",
        text: unknown
          ? "명령 결과를 확정하지 못했습니다. 자동 재전송하지 않고 상태를 다시 조회합니다."
          : error instanceof Error
            ? error.message
            : "VTT 제어 요청에 실패했습니다.",
      });
    }
  }

  return (
    <>
      <Box variant="gold" className={styles.hero}>
        <div className={styles.hero__copy}>
          <Eyebrow tone="gold">NOCHICHIM · VPS RUNTIME</Eyebrow>
          <h2>VPS 전원은 유지하고 VTT 앱만 제어합니다.</h2>
          <p>
            이 화면은 Contabo 전원 API나 원격 shell을 사용하지 않습니다. 고정된
            systemd 서비스 하나만 시작·종료합니다.
          </p>
        </div>
        <div className={styles.hero__status} role="status" aria-live="polite">
          <Tag tone={statusTone(status.state)}>{STATE_LABEL[status.state]}</Tag>
          <span>{description}</span>
        </div>
      </Box>

      {query.isError ? (
        <Box className={styles.notice} data-tone="error" role="alert">
          최신 상태 조회에 실패해 마지막 상태를 표시하고 있습니다.
        </Box>
      ) : null}
      {feedback ? (
        <Box
          className={styles.notice}
          data-tone={feedback.tone}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </Box>
      ) : null}
      {hostStatus && !separatedStartReady && status.state === "STOPPED" ? (
        <Box className={styles.notice} data-tone="info" role="note">
          VPS 앱을 시작하려면 기존 HOME 앱과 Tunnel을 직접 종료하고 VPS Tunnel 경로를
          먼저 ON으로 선택하세요.
        </Box>
      ) : null}

      <section aria-labelledby="vtt-runtime-status-title">
        <PanelTitle
          id="vtt-runtime-status-title"
          role="heading"
          aria-level={2}
          right={query.isFetching ? "상태 갱신 중" : "15초마다 자동 갱신"}
        >
          실행 상태
        </PanelTitle>
        <Box className={styles.runtime} data-state={status.state.toLowerCase()}>
          <div className={styles.runtime__primary}>
            <span className={styles.runtime__pulse} aria-hidden="true" />
            <div>
              <small>CURRENT STATE</small>
              <strong>{STATE_LABEL[status.state]}</strong>
              <p>{description}</p>
            </div>
          </div>
          <dl className={styles.metrics}>
            <div>
              <dt>의도 상태</dt>
              <dd>{status.desiredState === "RUNNING" ? "ON" : status.desiredState === "STOPPED" ? "OFF" : "—"}</dd>
            </div>
            <div>
              <dt>접속자</dt>
              <dd>{status.connectedUsers === null ? "확인 불가" : `${status.connectedUsers}명`}</dd>
            </div>
            <div>
              <dt>시작 시각</dt>
              <dd>{formatDateTime(status.startedAt)}</dd>
            </div>
            <div>
              <dt>소스 커밋</dt>
              <dd title={status.sourceRevision ?? undefined}>{sourceRevision(status.sourceRevision)}</dd>
            </div>
          </dl>
        </Box>
      </section>

      <section aria-labelledby="vtt-runtime-control-title">
        <PanelTitle
          id="vtt-runtime-control-title"
          role="heading"
          aria-level={2}
        >
          앱 제어
        </PanelTitle>
        <Box className={styles.controls}>
          <div className={styles.controls__copy}>
            <strong>공개 주소 · nochiijjim.com</strong>
            <p>
              앱이 꺼져도 nginx와 StarGate 운영 화면은 유지됩니다. 공개 주소에는
              명시적인 503 오프라인 안내가 표시됩니다.
            </p>
          </div>
          <div className={styles.controls__actions}>
            <Button
              variant="primary"
              disabled={startDisabled}
              onClick={() => void runAction({ action: "START" })}
            >
              {mutation.isPending && mutation.variables?.action === "START"
                ? "시작 확인 중"
                : "VTT 시작"}
            </Button>
            <Button
              className={styles.stopButton}
              disabled={stopDisabled}
              onClick={() => void runAction({ action: "STOP" })}
            >
              {mutation.isPending && mutation.variables?.action === "STOP"
                ? "종료 확인 중"
                : "VTT 종료"}
            </Button>
            <Button
              size="sm"
              disabled={query.isFetching || mutation.isPending}
              onClick={() => void query.refetch()}
            >
              {query.isFetching ? "갱신 중" : "지금 갱신"}
            </Button>
          </div>
        </Box>
      </section>

      {stopConfirmation ? (
        <section aria-labelledby="vtt-stop-confirm-title">
          <PanelTitle
            id="vtt-stop-confirm-title"
            role="heading"
            aria-level={2}
          >
            종료 재확인
          </PanelTitle>
          <Box className={styles.confirm} role="alert">
            <div>
              <strong>
                {stopConfirmation.reason === "ACTIVE_CONNECTIONS"
                  ? `${stopConfirmation.connectedUsers ?? "여러"}명이 접속 중입니다.`
                  : "접속자 상태를 확인할 수 없습니다."}
              </strong>
              <p>
                계속해도 강제 kill은 하지 않습니다. SIGTERM으로 저장을 마치고
                writer lock과 포트가 닫힐 때까지 기다립니다. 진행하려면 아래에
                <b> 종료</b>를 입력하세요.
              </p>
            </div>
            <label className={styles.confirm__field}>
              <span>확인 문구</span>
              <input
                value={confirmationText}
                autoComplete="off"
                disabled={mutation.isPending}
                onChange={event => setConfirmationText(event.target.value)}
                placeholder="종료"
              />
            </label>
            <div className={styles.confirm__actions}>
              <Button
                disabled={mutation.isPending}
                onClick={() => {
                  setStopConfirmation(null);
                  setConfirmationText("");
                }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                disabled={confirmationText !== "종료" || mutation.isPending}
                onClick={() => void runAction({ action: "STOP", force: true })}
              >
                정상 저장 후 종료
              </Button>
            </div>
          </Box>
        </section>
      ) : null}

      <section aria-labelledby="vtt-runtime-last-action-title">
        <PanelTitle
          id="vtt-runtime-last-action-title"
          role="heading"
          aria-level={2}
        >
          마지막 제어 기록
        </PanelTitle>
        <Box className={styles.lastAction}>
          {status.lastAction ? (
            <dl>
              <div><dt>명령</dt><dd>{status.lastAction.action}</dd></div>
              <div><dt>결과</dt><dd>{status.lastAction.result}</dd></div>
              <div><dt>조작자</dt><dd>{status.lastAction.actor?.displayName ?? "확인 불가"}</dd></div>
              <div><dt>완료 시각</dt><dd>{formatDateTime(status.lastAction.completedAt)}</dd></div>
              <div className={styles.lastAction__request}><dt>요청 ID</dt><dd>{status.lastAction.requestId}</dd></div>
            </dl>
          ) : (
            <p>아직 기록된 원격 제어 명령이 없습니다.</p>
          )}
        </Box>
      </section>
    </>
  );
}
