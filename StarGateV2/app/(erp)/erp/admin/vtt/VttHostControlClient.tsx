"use client";

import { useState } from "react";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag, { type TagTone } from "@/components/ui/Tag/Tag";
import {
  useVttHostMutation,
  VttHostMutationError,
} from "@/hooks/mutations/useVttHostMutation";
import { useVttHostStatusQuery } from "@/hooks/queries/useVttHostStatusQuery";
import type {
  VttHostActionInput,
  VttHostControlState,
  VttHostRuntimeStatus,
  VttHostStatus,
  VttHostTarget,
  VttHostTransitionPhase,
} from "@/types/vtt-host-control";
import type { VttRuntimeState } from "@/types/vtt-runtime";

import styles from "./vtt.module.css";

interface Props {
  initialStatus: VttHostStatus;
}

interface SwitchConfirmation {
  targetHost: VttHostTarget;
  connectedUsers: number | null;
  reason: "ACTIVE_CONNECTIONS" | "CONNECTION_STATE_UNKNOWN";
}

const CONTROL_STATE_LABEL: Record<VttHostControlState, string> = {
  RUNNING: "운영 중",
  OFFLINE: "오프라인",
  SWITCHING: "전환 중",
  DEGRADED: "점검 필요",
  RECOVERY_REQUIRED: "수동 복구 필요",
  UNREACHABLE: "제어기 연결 불가",
};

const CONTROL_STATE_DESCRIPTION: Record<VttHostControlState, string> = {
  RUNNING: "공개 주소와 단일 writer가 같은 호스트를 가리키고 있습니다.",
  OFFLINE: "두 앱은 정지 상태이며 공개 주소에는 점검 안내가 표시됩니다.",
  SWITCHING: "공개 차단, 저장, 데이터 검증, 대상 시작 순서로 전환하고 있습니다.",
  DEGRADED: "저장된 활성 호스트와 실제 앱 또는 공개 경로가 일치하지 않습니다.",
  RECOVERY_REQUIRED: "자동 추측으로 다른 writer를 시작하지 않습니다. 서버에서 상태를 복구해야 합니다.",
  UNREACHABLE: "VPS의 상시 제어기에 연결할 수 없어 모든 조작을 잠갔습니다.",
};

const HOST_LABEL: Record<VttHostTarget, string> = {
  HOME: "로컬 PC",
  VPS: "Contabo VPS",
  OFFLINE: "오프라인",
};

const HOST_DESCRIPTION: Record<Exclude<VttHostTarget, "OFFLINE">, string> = {
  HOME: "집 PC의 앱과 전용 HOME 터널을 사용합니다.",
  VPS: "항상 켜진 VPS의 앱과 전용 VPS 터널을 사용합니다.",
};

const RUNTIME_STATE_LABEL: Record<VttRuntimeState, string> = {
  RUNNING: "실행 중",
  STOPPED: "정지",
  STARTING: "시작 중",
  STOPPING: "종료 중",
  DEGRADED: "점검 필요",
  UNREACHABLE: "응답 없음",
};

const PHASE_LABEL: Record<VttHostTransitionPhase, string> = {
  CLOSING_PUBLIC: "공개 접속 차단",
  STOPPING_SOURCE: "현재 호스트 정상 종료",
  SNAPSHOTTING_SOURCE: "데이터 스냅샷 생성",
  TRANSFERRING: "대상 호스트로 데이터 복사",
  VERIFYING_TARGET: "대상 데이터 해시 검증",
  STARTING_TARGET: "대상 앱 시작",
  ROUTING_TARGET: "공개 주소 전환",
  VERIFYING_PUBLIC: "공개 접속 최종 확인",
  RECOVERY_REQUIRED: "수동 복구 대기",
};

const WRITER_HOSTS = ["HOME", "VPS"] as const;
const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

function controlStateTone(state: VttHostControlState): TagTone {
  if (state === "RUNNING") return "success";
  if (state === "SWITCHING") return "info";
  if (state === "DEGRADED" || state === "RECOVERY_REQUIRED" || state === "UNREACHABLE") {
    return "danger";
  }
  return "default";
}

function runtimeStateTone(state: VttRuntimeState): TagTone {
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

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${unit}`;
}

function statusDescription(status: VttHostStatus): string {
  if (status.unavailableReason === "CONTROLLER_REJECTED") {
    return "제어기가 StarGate 서버 인증을 거절했습니다. 운영 비밀값을 점검해 주세요.";
  }
  if (status.unavailableReason === "CONTROL_MISCONFIGURED") {
    return "하이브리드 제어가 켜졌지만 Production 환경변수가 완전하지 않습니다.";
  }
  if (!status.controlEnabled) {
    return "현재 배포 환경에서는 하이브리드 호스트 제어가 비활성화되어 있습니다.";
  }
  return CONTROL_STATE_DESCRIPTION[status.state];
}

function hostConnectedUsers(runtime: VttHostRuntimeStatus): string {
  if (runtime.connectedUsers === null) return "확인 불가";
  return `${runtime.connectedUsers}명`;
}

export default function VttHostControlClient({ initialStatus }: Props) {
  const query = useVttHostStatusQuery(initialStatus);
  const mutation = useVttHostMutation();
  const status = query.data ?? initialStatus;
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const [switchConfirmation, setSwitchConfirmation] =
    useState<SwitchConfirmation | null>(null);
  const [confirmationText, setConfirmationText] = useState("");

  const description = statusDescription(status);
  const transitioning = status.state === "SWITCHING";
  const unavailable = status.state === "UNREACHABLE" || !status.controlEnabled;
  const recoveryLocked = status.state === "RECOVERY_REQUIRED";
  const auditLocked = status.auditBacklogBlocked;
  const globallyLocked = (
    mutation.isPending || transitioning || unavailable || recoveryLocked || auditLocked
  );

  function targetDisabled(targetHost: VttHostTarget): boolean {
    if (globallyLocked) return true;
    if (
      targetHost !== "OFFLINE" &&
      !status.hosts[targetHost].reachable
    ) {
      return true;
    }
    if (
      targetHost !== "OFFLINE" &&
      targetHost !== status.activeHost &&
      status.hosts[targetHost].state !== "STOPPED"
    ) {
      return true;
    }
    return (
      status.activeHost === targetHost &&
      status.routeHost === targetHost &&
      status.state === (targetHost === "OFFLINE" ? "OFFLINE" : "RUNNING")
    );
  }

  async function runAction(input: VttHostActionInput) {
    setFeedback(null);
    try {
      const result = await mutation.mutateAsync(input);
      setSwitchConfirmation(null);
      setConfirmationText("");
      setFeedback({
        tone: result.auditRecorded ? "success" : "warning",
        text: result.warning ?? (
          result.accepted
            ? `${HOST_LABEL[input.targetHost]} 전환 요청이 접수됐습니다. 완료될 때까지 상태를 자동 확인합니다.`
            : `${HOST_LABEL[input.targetHost]} 상태가 확인됐습니다.`
        ),
      });
    } catch (error) {
      if (
        error instanceof VttHostMutationError &&
        (error.code === "ACTIVE_CONNECTIONS" || error.code === "CONNECTION_STATE_UNKNOWN")
      ) {
        setSwitchConfirmation({
          targetHost: input.targetHost,
          connectedUsers: error.connectedUsers ?? null,
          reason: error.code,
        });
        setConfirmationText("");
        setFeedback(null);
        return;
      }
      const unknown =
        error instanceof VttHostMutationError &&
        error.code === "ACTION_RESULT_UNKNOWN";
      setFeedback({
        tone: "error",
        text: unknown
          ? "전환 접수 여부를 확정하지 못했습니다. 자동 재전송하지 않고 상태를 다시 조회합니다."
          : error instanceof Error
            ? error.message
            : "VTT 호스트 전환 요청에 실패했습니다.",
      });
    }
  }

  return (
    <main className={styles.root}>
      <Box variant="gold" className={styles.hero}>
        <div className={styles.hero__copy}>
          <Eyebrow tone="gold">NOCHICHIM · ACTIVE HOST</Eyebrow>
          <h2>로컬 PC와 VPS 중 한 곳만 라이브 writer로 운영합니다.</h2>
          <p>
            호스트를 바꾸면 현재 앱을 정상 저장 종료하고, 데이터 해시를 대조한 뒤
            대상 앱과 전용 Cloudflare Tunnel로 공개 주소를 넘깁니다.
          </p>
        </div>
        <div className={styles.hero__status} role="status" aria-live="polite">
          <Tag tone={controlStateTone(status.state)}>
            {CONTROL_STATE_LABEL[status.state]}
          </Tag>
          <strong>
            활성 호스트 · {status.activeHost === "UNKNOWN"
              ? "확인 불가"
              : HOST_LABEL[status.activeHost]}
          </strong>
          <span>{description}</span>
        </div>
      </Box>

      {query.isError ? (
        <Box className={styles.notice} data-tone="error" role="alert">
          최신 상태 조회에 실패해 마지막으로 확인한 상태를 표시하고 있습니다.
        </Box>
      ) : null}
      {status.auditBacklogBlocked ? (
        <Box className={styles.notice} data-tone="error" role="alert">
          완료 감사 {status.pendingAuditCount}건이 아직 durable outbox로 확인되지 않아
          새 전환을 잠갔습니다. 상태 조회 또는 일일 감사 조정이 복구되면 자동으로 풀립니다.
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

      <section aria-labelledby="vtt-host-summary-title">
        <PanelTitle
          id="vtt-host-summary-title"
          role="heading"
          aria-level={2}
          right={query.isFetching ? "상태 갱신 중" : transitioning ? "2초마다 자동 갱신" : "15초마다 자동 갱신"}
        >
          라이브 상태
        </PanelTitle>
        <Box className={styles.runtime} data-state={status.state.toLowerCase()}>
          <div className={styles.runtime__primary}>
            <span className={styles.runtime__pulse} aria-hidden="true" />
            <div>
              <small>CURRENT HOST</small>
              <strong>
                {status.activeHost === "UNKNOWN"
                  ? "확인 불가"
                  : HOST_LABEL[status.activeHost]}
              </strong>
              <p>{description}</p>
            </div>
          </div>
          <dl className={styles.metrics}>
            <div>
              <dt>목표 호스트</dt>
              <dd>{status.desiredHost ? HOST_LABEL[status.desiredHost] : "—"}</dd>
            </div>
            <div>
              <dt>공개 경로</dt>
              <dd>{status.routeHost === "UNKNOWN" ? "확인 불가" : HOST_LABEL[status.routeHost]}</dd>
            </div>
            <div>
              <dt>마지막 writer</dt>
              <dd>{status.lastWriterHost ? HOST_LABEL[status.lastWriterHost] : "—"}</dd>
            </div>
            <div>
              <dt>데이터 세대</dt>
              <dd>{status.generation === null ? "—" : `#${status.generation}`}</dd>
            </div>
          </dl>
        </Box>
      </section>

      {status.transition ? (
        <section aria-labelledby="vtt-host-transition-title">
          <PanelTitle
            id="vtt-host-transition-title"
            role="heading"
            aria-level={2}
          >
            전환 진행
          </PanelTitle>
          <Box
            className={styles.transition}
            data-tone={status.transition.phase === "RECOVERY_REQUIRED" ? "error" : "info"}
            role="status"
            aria-live="polite"
          >
            <div>
              <small>CURRENT PHASE</small>
              <strong>{PHASE_LABEL[status.transition.phase]}</strong>
              <p>
                {status.transition.sourceHost} → {status.transition.targetHost}
                {status.transition.error ? ` · ${status.transition.error.message}` : ""}
              </p>
            </div>
            <span>{formatDateTime(status.transition.updatedAt)}</span>
          </Box>
        </section>
      ) : null}

      <section aria-labelledby="vtt-host-selection-title">
        <PanelTitle
          id="vtt-host-selection-title"
          role="heading"
          aria-level={2}
        >
          운영 호스트 선택
        </PanelTitle>
        <div className={styles.hostGrid}>
          {WRITER_HOSTS.map(host => {
            const runtime = status.hosts[host];
            const active = status.activeHost === host;
            return (
              <Box
                key={host}
                className={styles.hostCard}
                data-active={active ? "true" : "false"}
              >
                <div className={styles.hostCard__heading}>
                  <div>
                    <small>{host}</small>
                    <strong>{HOST_LABEL[host]}</strong>
                  </div>
                  <Tag tone={runtimeStateTone(runtime.state)}>
                    {RUNTIME_STATE_LABEL[runtime.state]}
                  </Tag>
                </div>
                <p>{HOST_DESCRIPTION[host]}</p>
                <dl className={styles.hostCard__metrics}>
                  <div><dt>Heartbeat</dt><dd>{runtime.reachable ? "정상" : "응답 없음"}</dd></div>
                  <div><dt>접속자</dt><dd>{hostConnectedUsers(runtime)}</dd></div>
                  <div><dt>시작 시각</dt><dd>{formatDateTime(runtime.startedAt)}</dd></div>
                  <div><dt>소스 커밋</dt><dd title={runtime.sourceRevision ?? undefined}>{sourceRevision(runtime.sourceRevision)}</dd></div>
                </dl>
                <Button
                  variant={active ? "default" : "primary"}
                  disabled={targetDisabled(host)}
                  onClick={() => void runAction({ targetHost: host })}
                >
                  {mutation.isPending && mutation.variables?.targetHost === host
                    ? "전환 요청 중"
                    : active
                      ? "현재 운영 호스트"
                      : `${HOST_LABEL[host]}로 전환`}
                </Button>
              </Box>
            );
          })}
        </div>
        <Box className={styles.offlineControl}>
          <div>
            <strong>VTT 오프라인</strong>
            <p>
              마지막 writer를 정상 저장 종료하고 두 앱을 모두 끕니다. 공개 주소에는
              VPS의 점검 안내가 유지됩니다.
            </p>
          </div>
          <div className={styles.controls__actions}>
            <Button
              className={styles.stopButton}
              disabled={targetDisabled("OFFLINE")}
              onClick={() => void runAction({ targetHost: "OFFLINE" })}
            >
              {mutation.isPending && mutation.variables?.targetHost === "OFFLINE"
                ? "오프라인 전환 중"
                : status.activeHost === "OFFLINE"
                  ? "현재 오프라인"
                  : "오프라인으로 전환"}
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

      {switchConfirmation ? (
        <section aria-labelledby="vtt-host-confirm-title">
          <PanelTitle
            id="vtt-host-confirm-title"
            role="heading"
            aria-level={2}
          >
            호스트 전환 재확인
          </PanelTitle>
          <Box className={styles.confirm} role="alert">
            <div>
              <strong>
                {switchConfirmation.reason === "ACTIVE_CONNECTIONS"
                  ? `${switchConfirmation.connectedUsers ?? "여러"}명이 현재 VTT에 접속 중입니다.`
                  : "현재 접속자 수를 확인할 수 없습니다."}
              </strong>
              <p>
                계속하면 공개 접속을 먼저 닫고 현재 앱을 정상 저장 종료합니다.
                강제 kill이나 동시 writer 시작은 하지 않습니다. {HOST_LABEL[switchConfirmation.targetHost]} 전환을
                진행하려면 아래에 <b>전환</b>을 입력하세요.
              </p>
            </div>
            <label className={styles.confirm__field}>
              <span>확인 문구</span>
              <input
                value={confirmationText}
                autoComplete="off"
                disabled={mutation.isPending}
                onChange={event => setConfirmationText(event.target.value)}
                placeholder="전환"
              />
            </label>
            <div className={styles.confirm__actions}>
              <Button
                disabled={mutation.isPending}
                onClick={() => {
                  setSwitchConfirmation(null);
                  setConfirmationText("");
                }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                disabled={confirmationText !== "전환" || mutation.isPending}
                onClick={() => void runAction({
                  targetHost: switchConfirmation.targetHost,
                  force: true,
                })}
              >
                정상 저장 후 전환
              </Button>
            </div>
          </Box>
        </section>
      ) : null}

      <section aria-labelledby="vtt-host-data-title">
        <PanelTitle
          id="vtt-host-data-title"
          role="heading"
          aria-level={2}
        >
          데이터 검증
        </PanelTitle>
        <Box className={styles.lastAction}>
          {status.manifest ? (
            <dl>
              <div><dt>세대</dt><dd>#{status.generation ?? "—"}</dd></div>
              <div><dt>파일 수</dt><dd>{status.manifest.fileCount.toLocaleString("ko-KR")}</dd></div>
              <div><dt>총 크기</dt><dd>{formatBytes(status.manifest.totalBytes)}</dd></div>
              <div><dt>마지막 writer</dt><dd>{status.lastWriterHost ?? "—"}</dd></div>
              <div className={styles.lastAction__request}><dt>SHA-256 manifest</dt><dd>{status.manifest.digest}</dd></div>
            </dl>
          ) : (
            <p>아직 검증된 데이터 manifest가 없습니다. 초기 이관 전에 생성해야 합니다.</p>
          )}
        </Box>
      </section>

      <section aria-labelledby="vtt-host-last-action-title">
        <PanelTitle
          id="vtt-host-last-action-title"
          role="heading"
          aria-level={2}
        >
          마지막 전환 기록
        </PanelTitle>
        <Box className={styles.lastAction}>
          {status.lastAction ? (
            <dl>
              <div><dt>경로</dt><dd>{status.lastAction.sourceHost} → {status.lastAction.targetHost}</dd></div>
              <div><dt>결과</dt><dd>{status.lastAction.result}</dd></div>
              <div><dt>조작자</dt><dd>{status.lastAction.actor?.displayName ?? "확인 불가"}</dd></div>
              <div><dt>완료 시각</dt><dd>{formatDateTime(status.lastAction.completedAt)}</dd></div>
              <div className={styles.lastAction__request}><dt>요청 ID</dt><dd>{status.lastAction.requestId}</dd></div>
            </dl>
          ) : (
            <p>아직 기록된 호스트 전환이 없습니다.</p>
          )}
        </Box>
      </section>
    </main>
  );
}
