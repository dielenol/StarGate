"use client";

import { useState } from "react";

import type {
  VttHostActionInput,
  VttHostControlState,
  VttHostRuntimeStatus,
  VttHostStatus,
  VttHostTarget,
  VttHostTransitionPhase,
} from "@/types/vtt-host-control";
import type { VttRuntimeState } from "@/types/vtt-runtime";

import {
  useVttHostMutation,
  VttHostMutationError,
} from "@/hooks/mutations/useVttHostMutation";
import { useVttHostStatusQuery } from "@/hooks/queries/useVttHostStatusQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag, { type TagTone } from "@/components/ui/Tag/Tag";

import styles from "./vtt.module.css";

interface Props {
  initialStatus: VttHostStatus;
}

interface SyncConfirmation {
  sourceHost: "HOME" | "VPS";
  targetHost: "HOME" | "VPS";
}

const CONTROL_STATE_LABEL: Record<VttHostControlState, string> = {
  RUNNING: "공개 중",
  OFFLINE: "오프라인",
  SWITCHING: "작업 중",
  DEGRADED: "원본 응답 없음",
  RECOVERY_REQUIRED: "수동 복구 필요",
  UNREACHABLE: "제어기 연결 불가",
};

const CONTROL_STATE_DESCRIPTION: Record<VttHostControlState, string> = {
  RUNNING: "선택한 Cloudflare 경로에서 VTT 앱 응답이 확인됩니다.",
  OFFLINE: "공개 주소에는 VPS의 점검 안내가 표시됩니다.",
  SWITCHING: "경로 선택 또는 명시적 데이터 동기화를 처리하고 있습니다.",
  DEGRADED: "Cloudflare 경로는 선택됐지만 해당 앱 응답을 확인하지 못했습니다.",
  RECOVERY_REQUIRED: "공개 경로를 안전한 상태로 확정하지 못해 서버 복구가 필요합니다.",
  UNREACHABLE: "VPS의 상시 제어기에 연결할 수 없어 조작을 잠갔습니다.",
};

const HOST_LABEL: Record<VttHostTarget, string> = {
  HOME: "로컬 터널",
  VPS: "VPS 터널",
  OFFLINE: "오프라인",
};

const HOST_DESCRIPTION: Record<Exclude<VttHostTarget, "OFFLINE">, string> = {
  HOME: "각 PC에서 기존 방식으로 실행한 nochichim Tunnel을 공개 주소에 연결합니다.",
  VPS: "Contabo의 nochichim-vps Tunnel을 공개 주소에 연결합니다.",
};

const RUNTIME_STATE_LABEL: Record<VttRuntimeState, string> = {
  RUNNING: "앱 실행 중",
  STOPPED: "앱 정지",
  STARTING: "앱 시작 중",
  STOPPING: "앱 종료 중",
  DEGRADED: "앱 점검 필요",
  UNREACHABLE: "상태 응답 없음",
};

const PHASE_LABEL: Record<VttHostTransitionPhase, string> = {
  CLOSING_PUBLIC: "구형 공개 접속 차단",
  STOPPING_SOURCE: "구형 원본 앱 종료",
  LOCKING_DATA: "양쪽 데이터 작업 잠금",
  SNAPSHOTTING_SOURCE: "원본 데이터 스냅샷 생성",
  TRANSFERRING: "대상 호스트로 데이터 복사",
  VERIFYING_TARGET: "대상 데이터 해시 검증",
  RELEASING_DATA_LOCKS: "양쪽 데이터 작업 잠금 해제",
  STARTING_TARGET: "구형 대상 앱 시작",
  ROUTING_TARGET: "Cloudflare 공개 경로 선택",
  VERIFYING_PUBLIC: "Cloudflare 매핑 확인",
  RECOVERY_REQUIRED: "수동 복구 대기",
};

const DATA_HOSTS = ["HOME", "VPS"] as const;
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
    return "Production 경로·동기화 제어 환경변수가 완전하지 않습니다.";
  }
  if (!status.controlEnabled) {
    return "현재 배포 환경에서는 경로·동기화 제어가 비활성화되어 있습니다.";
  }
  return CONTROL_STATE_DESCRIPTION[status.state];
}

function hostConnectedUsers(runtime: VttHostRuntimeStatus): string {
  if (runtime.connectedUsers === null) return "확인 불가";
  return `${runtime.connectedUsers}명`;
}

function actionLabel(input: VttHostActionInput): string {
  if (input.action === "SYNC_DATA") {
    return `${HOST_LABEL[input.sourceHost]} → ${HOST_LABEL[input.targetHost]} 동기화`;
  }
  return `${HOST_LABEL[input.targetHost]} 경로 선택`;
}

export default function VttHostControlClient({ initialStatus }: Props) {
  const query = useVttHostStatusQuery(initialStatus);
  const mutation = useVttHostMutation();
  const status = query.data ?? initialStatus;
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const [syncConfirmation, setSyncConfirmation] =
    useState<SyncConfirmation | null>(null);
  const [confirmationText, setConfirmationText] = useState("");

  const description = statusDescription(status);
  const transitioning = status.transition !== null;
  const activelyTransitioning = status.state === "SWITCHING";
  const unavailable = status.state === "UNREACHABLE" || !status.controlEnabled;
  const recoveryLocked = status.state === "RECOVERY_REQUIRED";
  const auditLocked = status.auditBacklogBlocked;
  const globallyLocked = (
    mutation.isPending || transitioning || unavailable || recoveryLocked || auditLocked
  );
  const bothAppsStopped = DATA_HOSTS.every(host => (
    status.hosts[host].reachable && status.hosts[host].state === "STOPPED"
  ));
  const syncReady = status.routeHost === "OFFLINE" && bothAppsStopped;

  function routeDisabled(targetHost: VttHostTarget): boolean {
    if (globallyLocked || status.routeHost === targetHost) return true;
    if (targetHost === "OFFLINE") return false;
    if (status.routeHost !== "OFFLINE" || !status.hosts.VPS.reachable) return true;
    if (targetHost === "HOME") {
      return (
        status.hosts.VPS.state !== "STOPPED" ||
        (status.hosts.HOME.reachable &&
          !["STOPPED", "RUNNING"].includes(status.hosts.HOME.state))
      );
    }
    return (
      !["STOPPED", "RUNNING"].includes(status.hosts.VPS.state) ||
      (status.hosts.HOME.reachable && status.hosts.HOME.state !== "STOPPED")
    );
  }

  async function runAction(input: VttHostActionInput) {
    setFeedback(null);
    try {
      const result = await mutation.mutateAsync(input);
      setSyncConfirmation(null);
      setConfirmationText("");
      setFeedback({
        tone: result.auditRecorded ? "success" : "warning",
        text: result.warning ?? (
          result.accepted
            ? `${actionLabel(input)} 요청이 접수됐습니다. 완료될 때까지 상태를 자동 확인합니다.`
            : `${actionLabel(input)} 상태가 확인됐습니다.`
        ),
      });
    } catch (error) {
      const unknown =
        error instanceof VttHostMutationError &&
        error.code === "ACTION_RESULT_UNKNOWN";
      setFeedback({
        tone: "error",
        text: unknown
          ? "작업 접수 여부를 확정하지 못했습니다. 자동 재전송하지 않고 상태를 다시 조회합니다."
          : error instanceof Error
            ? error.message
            : "VTT 경로·동기화 요청에 실패했습니다.",
      });
    }
  }

  return (
    <>
      <Box variant="gold" className={styles.hero}>
        <div className={styles.hero__copy}>
          <Eyebrow tone="gold">NOCHICHIM · PUBLIC ROUTE</Eyebrow>
          <h2>Cloudflare 경로와 데이터 동기화를 따로 제어합니다.</h2>
          <p>
            로컬 버튼은 각 PC의 기존 nochichim Tunnel을, VPS 버튼은 Contabo Tunnel을
            공개 주소에 연결합니다. 앱 시작·종료나 데이터 복사는 함께 실행되지 않습니다.
          </p>
        </div>
        <div className={styles.hero__status} role="status" aria-live="polite">
          <Tag tone={controlStateTone(status.state)}>
            {CONTROL_STATE_LABEL[status.state]}
          </Tag>
          <strong>
            공개 경로 · {status.routeHost === "UNKNOWN"
              ? "확인 불가"
              : HOST_LABEL[status.routeHost]}
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
          새 작업을 잠갔습니다. 감사 조정이 복구되면 자동으로 풀립니다.
        </Box>
      ) : null}
      <Box className={styles.notice} data-tone="warning" role="note">
        HOME은 사용할 PC에서 기존 방식으로 앱과 <code>cloudflared tunnel run nochichim</code>을
        먼저 실행하세요. HOME connector는 한 번에 한 PC에서만 실행해야 합니다.
      </Box>
      <Box className={styles.notice} data-tone="info" role="note">
        VPS로 넘길 때는 공개 경로를 먼저 OFF로 바꾸고 기존 로컬 앱과 Tunnel을 직접
        종료하세요. HOME 동기화 helper가 없는 PC의 종료 상태는 사이트가 대신 확인할 수 없습니다.
      </Box>
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
          right={query.isFetching ? "상태 갱신 중" : activelyTransitioning ? "2초마다 자동 갱신" : "15초마다 자동 갱신"}
        >
          공개 경로 상태
        </PanelTitle>
        <Box className={styles.runtime} data-state={status.state.toLowerCase()}>
          <div className={styles.runtime__primary}>
            <span className={styles.runtime__pulse} aria-hidden="true" />
            <div>
              <small>PUBLIC ROUTE</small>
              <strong>
                {status.routeHost === "UNKNOWN"
                  ? "확인 불가"
                  : HOST_LABEL[status.routeHost]}
              </strong>
              <p>{description}</p>
            </div>
          </div>
          <dl className={styles.metrics}>
            <div>
              <dt>목표 경로</dt>
              <dd>{status.desiredHost ? HOST_LABEL[status.desiredHost] : "—"}</dd>
            </div>
            <div>
              <dt>작업 상태</dt>
              <dd>{activelyTransitioning ? "진행 중" : recoveryLocked ? "복구 대기" : "대기"}</dd>
            </div>
            <div>
              <dt>검증 세대</dt>
              <dd>{status.generation === null ? "—" : `#${status.generation}`}</dd>
            </div>
            <div>
              <dt>마지막 검증 원본</dt>
              <dd>{status.lastWriterHost ? HOST_LABEL[status.lastWriterHost] : "—"}</dd>
            </div>
          </dl>
        </Box>
      </section>

      {status.transition ? (
        <section aria-labelledby="vtt-host-transition-title">
          <PanelTitle id="vtt-host-transition-title" role="heading" aria-level={2}>
            작업 진행
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

      <section aria-labelledby="vtt-route-selection-title">
        <PanelTitle id="vtt-route-selection-title" role="heading" aria-level={2}>
          Cloudflare 공개 경로 선택
        </PanelTitle>
        <div className={styles.hostGrid}>
          {DATA_HOSTS.map(host => {
            const runtime = status.hosts[host];
            const selected = status.routeHost === host;
            return (
              <Box
                key={host}
                className={styles.hostCard}
                data-active={selected ? "true" : "false"}
              >
                <div className={styles.hostCard__heading}>
                  <div>
                    <small>{host} TUNNEL</small>
                    <strong>{HOST_LABEL[host]}</strong>
                  </div>
                  <Tag
                    tone={host === "HOME" && !runtime.reachable
                      ? "default"
                      : runtimeStateTone(runtime.state)}
                  >
                    {host === "HOME" && !runtime.reachable
                      ? "로컬 직접 실행"
                      : RUNTIME_STATE_LABEL[runtime.state]}
                  </Tag>
                </div>
                <p>{HOST_DESCRIPTION[host]}</p>
                <dl className={styles.hostCard__metrics}>
                  <div>
                    <dt>{host === "HOME" ? "동기화 helper" : "제어 응답"}</dt>
                    <dd>{runtime.reachable ? "연결됨" : host === "HOME" ? "선택 미연결" : "응답 없음"}</dd>
                  </div>
                  <div><dt>접속자</dt><dd>{hostConnectedUsers(runtime)}</dd></div>
                  <div><dt>시작 시각</dt><dd>{formatDateTime(runtime.startedAt)}</dd></div>
                  <div><dt>소스 커밋</dt><dd title={runtime.sourceRevision ?? undefined}>{sourceRevision(runtime.sourceRevision)}</dd></div>
                </dl>
                <Button
                  variant={selected ? "default" : "primary"}
                  disabled={routeDisabled(host)}
                  onClick={() => void runAction({ action: "SELECT_ROUTE", targetHost: host })}
                >
                  {mutation.isPending && mutation.variables?.action === "SELECT_ROUTE" && mutation.variables.targetHost === host
                    ? "경로 선택 중"
                    : selected
                      ? "현재 공개 경로"
                      : `${HOST_LABEL[host]} ON`}
                </Button>
              </Box>
            );
          })}
        </div>
        <Box className={styles.offlineControl}>
          <div>
            <strong>공개 경로 OFF</strong>
            <p>앱은 건드리지 않고 공개 주소만 VPS의 503 점검 화면으로 바꿉니다.</p>
          </div>
          <div className={styles.controls__actions}>
            <Button
              className={styles.stopButton}
              disabled={routeDisabled("OFFLINE")}
              onClick={() => void runAction({ action: "SELECT_ROUTE", targetHost: "OFFLINE" })}
            >
              {mutation.isPending && mutation.variables?.action === "SELECT_ROUTE" && mutation.variables.targetHost === "OFFLINE"
                ? "경로 종료 중"
                : status.routeHost === "OFFLINE"
                  ? "현재 공개 OFF"
                  : "공개 경로 OFF"}
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

      <section aria-labelledby="vtt-data-sync-title">
        <PanelTitle
          id="vtt-data-sync-title"
          role="heading"
          aria-level={2}
          right={syncReady
            ? "동기화 가능"
            : !status.hosts.HOME.reachable
              ? "HOME 동기화 helper 연결 필요"
              : "공개 OFF + 양쪽 앱 정지 필요"}
        >
          수동 데이터 동기화
        </PanelTitle>
        <Box className={styles.controls}>
          <div className={styles.controls__copy}>
            <strong>경로 전환과 무관한 별도 복사 기능</strong>
            <p>
              최신 데이터가 있는 쪽을 원본으로 직접 고르세요. 공개 경로가 OFF이고
              HOME/VPS 앱이 모두 정지된 경우에만 스냅샷·복사·SHA-256 검증을 수행합니다.
            </p>
          </div>
          <div className={styles.controls__actions}>
            <Button
              disabled={globallyLocked || !syncReady}
              onClick={() => {
                setSyncConfirmation({ sourceHost: "HOME", targetHost: "VPS" });
                setConfirmationText("");
              }}
            >
              로컬 → VPS 복사
            </Button>
            <Button
              disabled={globallyLocked || !syncReady}
              onClick={() => {
                setSyncConfirmation({ sourceHost: "VPS", targetHost: "HOME" });
                setConfirmationText("");
              }}
            >
              VPS → 로컬 복사
            </Button>
          </div>
        </Box>
      </section>

      {syncConfirmation ? (
        <section aria-labelledby="vtt-sync-confirm-title">
          <PanelTitle id="vtt-sync-confirm-title" role="heading" aria-level={2}>
            데이터 덮어쓰기 재확인
          </PanelTitle>
          <Box className={styles.confirm} role="alert">
            <div>
              <strong>
                {HOST_LABEL[syncConfirmation.sourceHost]} 데이터를 기준으로 {HOST_LABEL[syncConfirmation.targetHost]}를 교체합니다.
              </strong>
              <p>
                방향을 반대로 선택하면 최신 데이터가 오래된 복사본으로 바뀔 수 있습니다.
                경로 선택이나 앱 시작은 이어서 실행하지 않습니다. 진행하려면 아래에 <b>동기화</b>를 입력하세요.
              </p>
            </div>
            <label className={styles.confirm__field}>
              <span>확인 문구</span>
              <input
                value={confirmationText}
                autoComplete="off"
                disabled={mutation.isPending}
                onChange={event => setConfirmationText(event.target.value)}
                placeholder="동기화"
              />
            </label>
            <div className={styles.confirm__actions}>
              <Button
                disabled={mutation.isPending}
                onClick={() => {
                  setSyncConfirmation(null);
                  setConfirmationText("");
                }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                disabled={confirmationText !== "동기화" || mutation.isPending || !syncReady}
                onClick={() => void runAction({
                  action: "SYNC_DATA",
                  sourceHost: syncConfirmation.sourceHost,
                  targetHost: syncConfirmation.targetHost,
                })}
              >
                데이터 동기화 실행
              </Button>
            </div>
          </Box>
        </section>
      ) : null}

      <section aria-labelledby="vtt-host-data-title">
        <PanelTitle id="vtt-host-data-title" role="heading" aria-level={2}>
          마지막 데이터 검증
        </PanelTitle>
        <Box className={styles.lastAction}>
          {status.manifest ? (
            <dl>
              <div><dt>세대</dt><dd>#{status.generation ?? "—"}</dd></div>
              <div><dt>파일 수</dt><dd>{status.manifest.fileCount.toLocaleString("ko-KR")}</dd></div>
              <div><dt>총 크기</dt><dd>{formatBytes(status.manifest.totalBytes)}</dd></div>
              <div><dt>마지막 검증 원본</dt><dd>{status.lastWriterHost ?? "—"}</dd></div>
              <div className={styles.lastAction__request}>
                <dt>최근 동기화</dt>
                <dd>
                  {status.lastSync
                    ? `${status.lastSync.sourceHost} → ${status.lastSync.targetHost} · ${formatDateTime(status.lastSync.completedAt)}`
                    : "아직 분리형 동기화 기록이 없습니다."}
                </dd>
              </div>
              <div className={styles.lastAction__request}><dt>SHA-256 manifest</dt><dd>{status.manifest.digest}</dd></div>
            </dl>
          ) : (
            <p>아직 검증된 데이터 manifest가 없습니다.</p>
          )}
        </Box>
      </section>

      <section aria-labelledby="vtt-host-last-action-title">
        <PanelTitle id="vtt-host-last-action-title" role="heading" aria-level={2}>
          마지막 경로·동기화 기록
        </PanelTitle>
        <Box className={styles.lastAction}>
          {status.lastAction ? (
            <dl>
              <div><dt>명령</dt><dd>{status.lastAction.action}</dd></div>
              <div><dt>방향</dt><dd>{status.lastAction.sourceHost} → {status.lastAction.targetHost}</dd></div>
              <div><dt>결과</dt><dd>{status.lastAction.result}</dd></div>
              <div><dt>조작자</dt><dd>{status.lastAction.actor?.displayName ?? "확인 불가"}</dd></div>
              <div className={styles.lastAction__request}><dt>요청 ID</dt><dd>{status.lastAction.requestId}</dd></div>
            </dl>
          ) : (
            <p>아직 기록된 경로·동기화 작업이 없습니다.</p>
          )}
        </Box>
      </section>
    </>
  );
}
