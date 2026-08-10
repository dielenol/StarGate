"use client";

import type { KeyboardEvent } from "react";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";
import { useAdminIntegrationStatusQuery } from "@/hooks/queries/useAdminIntegrationStatusQuery";
import type {
  AdminIntegrationHealth,
  AdminIntegrationStatusResponse,
} from "@/types/admin-integration-status";

import styles from "./page.module.css";

interface Props {
  initialData: AdminIntegrationStatusResponse;
}

const HEALTH_LABEL: Record<AdminIntegrationHealth, string> = {
  HEALTHY: "정상",
  WARNING: "주의",
  CRITICAL: "장애",
  UNKNOWN: "확인 필요",
};

const OVERALL_HEALTH_MESSAGE: Record<AdminIntegrationHealth, string> = {
  HEALTHY: "감시 중인 연동이 모두 정상입니다.",
  WARNING: "지연되거나 재확인이 필요한 항목이 있습니다.",
  CRITICAL: "즉시 확인해야 할 연동 장애가 있습니다.",
  UNKNOWN: "worker 연결 상태를 확인하고 있습니다.",
};

const COUNT_FORMATTER = new Intl.NumberFormat("ko-KR");
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "short",
});

function tone(health: AdminIntegrationHealth) {
  if (health === "HEALTHY") return "success" as const;
  if (health === "WARNING") return "gold" as const;
  if (health === "CRITICAL") return "danger" as const;
  return "default" as const;
}

function HealthTag({ health }: { health: AdminIntegrationHealth }) {
  return <Tag tone={tone(health)}>{HEALTH_LABEL[health]}</Tag>;
}

function dateTime(value: string | null): string {
  if (!value) return "—";
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function countLabel(value: number): string {
  return COUNT_FORMATTER.format(value);
}

type MetricTone = "neutral" | "gold" | "success" | "danger" | "muted";

function SummaryMetric({
  label,
  value,
  description,
  tone: metricTone,
}: {
  label: string;
  value: number;
  description: string;
  tone: MetricTone;
}) {
  return (
    <Box className={styles.kpi} data-tone={metricTone}>
      <span className={styles.kpi__label}>{label}</span>
      <strong>{countLabel(value)}</strong>
      <small>{description}</small>
    </Box>
  );
}

function CountCell({ value, alert = false }: { value: number; alert?: boolean }) {
  return (
    <td
      className={styles.table__number}
      data-alert={alert && value > 0 ? "true" : undefined}
      data-zero={value === 0 ? "true" : undefined}
    >
      {countLabel(value)}
    </td>
  );
}

function handleOutboxTableKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

  event.preventDefault();
  event.currentTarget.scrollBy({
    left: event.key === "ArrowRight" ? 96 : -96,
  });
}

export default function AdminIntegrationStatusClient({ initialData }: Props) {
  const query = useAdminIntegrationStatusQuery({ initialData });
  const data = query.data ?? initialData;

  const summaryMetrics: Array<{
    label: string;
    value: number;
    description: string;
    tone: MetricTone;
  }> = [
    {
      label: "즉시 처리 대기",
      value: data.summary.dueCount,
      description: "지금 처리할 이벤트",
      tone: data.summary.dueCount > 0 ? "gold" : "neutral",
    },
    {
      label: "예약 대기",
      value: data.summary.scheduledCount,
      description: "예약 시각을 기다리는 이벤트",
      tone: data.summary.scheduledCount > 0 ? "gold" : "neutral",
    },
    {
      label: "DEAD",
      value: data.summary.deadCount,
      description: "재시도 한도를 넘긴 실패",
      tone: data.summary.deadCount > 0 ? "danger" : "neutral",
    },
    {
      label: "lease 만료",
      value: data.summary.expiredLeaseCount,
      description: "작업권이 만료된 처리",
      tone: data.summary.expiredLeaseCount > 0 ? "danger" : "neutral",
    },
    {
      label: "상태 카드 문제",
      value: data.summary.desiredStateIssues,
      description: "revision 또는 갱신 오류",
      tone: data.summary.desiredStateIssues > 0 ? "danger" : "neutral",
    },
    {
      label: "봇 위임 문제",
      value: data.summary.delegatedWorkflowIssues,
      description: "DM 또는 게시 지연",
      tone: data.summary.delegatedWorkflowIssues > 0 ? "danger" : "neutral",
    },
    {
      label: "누적 실제 발송",
      value: data.summary.sentCount,
      description: "Discord가 받은 신규 기록",
      tone: "success",
    },
    {
      label: "누적 정책 생략",
      value: data.summary.skippedCount,
      description: "정책에 따라 보내지 않은 기록",
      tone: "muted",
    },
    {
      label: "구형 처리 미분류",
      value: data.summary.unclassifiedCount,
      description: "결과 구분 이전의 과거 기록",
      tone: "muted",
    },
  ];

  return (
    <main className={styles.root}>
      <Box variant="gold" className={styles.overview}>
        <div className={styles.overview__copy}>
          <Eyebrow tone="gold">DISCORD · WORKER · OUTBOX</Eyebrow>
          <h2>알림과 봇 위임 상태를 한곳에서 확인합니다.</h2>
          <p>
            이 화면은 읽기 전용입니다. 재전송·상태 변경 버튼 없이 worker heartbeat,
            전달 대기열, 상태 카드와 봇 위임 지연만 표시합니다.
          </p>
        </div>
        <div className={styles.overview__actions}>
          <div className={styles.overview__health} role="status" aria-live="polite">
            <HealthTag health={data.overallHealth} />
            <span>{OVERALL_HEALTH_MESSAGE[data.overallHealth]}</span>
          </div>
          <Button
            size="sm"
            variant="default"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "갱신 중" : "지금 갱신"}
          </Button>
        </div>
      </Box>

      {query.isError ? (
        <Box className={styles.error} role="alert">
          최신 상태 조회에 실패해 마지막으로 확인된 값을 표시하고 있습니다.
        </Box>
      ) : null}

      <section className={styles.kpiGrid} aria-label="Discord 연동 요약">
        {summaryMetrics.map((metric) => (
          <SummaryMetric key={metric.label} {...metric} />
        ))}
      </section>

      <section className={styles.section} aria-labelledby="worker-heartbeat-title">
        <PanelTitle
          id="worker-heartbeat-title"
          role="heading"
          aria-level={2}
          aria-label="Worker heartbeat"
          className={styles.sectionTitle}
          right={dateTime(data.worker.lastSeenAt)}
        >
          Worker heartbeat
        </PanelTitle>
        <Box
          className={styles.workerPanel}
          data-health={data.worker.health.toLowerCase()}
        >
          <div className={styles.workerPanel__status}>
            <HealthTag health={data.worker.health} />
            <div>
              <strong>Worker {HEALTH_LABEL[data.worker.health]}</strong>
              <span>30초 주기의 active worker 상태 기록</span>
            </div>
          </div>
          <dl className={styles.definitionList}>
            <div>
              <dt>runtime mode</dt>
              <dd>
                {data.worker.mode === "active"
                  ? "active · 실제 전달"
                  : data.worker.mode === "shadow"
                    ? "shadow · 관찰 전용"
                    : "확인되지 않음"}
              </dd>
            </div>
            <div>
              <dt>domain consumers</dt>
              <dd>
                {data.worker.enabledConsumers.length} / {data.worker.expectedConsumers.length} 활성
                {data.worker.missingConsumers.length > 0
                  ? ` · 누락 ${data.worker.missingConsumers.join(", ")}`
                  : " · 전체 연결"}
              </dd>
            </div>
            <div>
              <dt>outbox kinds</dt>
              <dd>
                {data.worker.enabledOutboxKinds.length} / {data.outbox.length} 활성
              </dd>
            </div>
          </dl>
        </Box>
      </section>

      <section className={styles.section} aria-labelledby="integration-outbox-title">
        <PanelTitle
          id="integration-outbox-title"
          role="heading"
          aria-level={2}
          aria-label="Integration outbox"
          className={styles.sectionTitle}
          right={`${data.outbox.length}종`}
        >
          Integration outbox
        </PanelTitle>
        <div
          className={styles.tableWrap}
          role="region"
          aria-label="Integration outbox 종류별 전달 상태표"
          tabIndex={0}
          onKeyDown={handleOutboxTableKeyDown}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">종류 / 채널</th>
                <th scope="col">상태</th>
                <th scope="col">즉시 대기</th>
                <th scope="col">예약</th>
                <th scope="col">처리 중</th>
                <th scope="col">lease 만료</th>
                <th scope="col">재시도</th>
                <th scope="col">DEAD</th>
                <th scope="col">실제 발송</th>
                <th scope="col">정책 생략</th>
                <th scope="col">구형 미분류</th>
                <th scope="col">가장 오래된 대기</th>
                <th scope="col">최근 처리 완료</th>
              </tr>
            </thead>
            <tbody>
              {data.outbox.map((item) => (
                <tr key={item.kind} data-health={item.health.toLowerCase()}>
                  <td className={styles.table__kind}>
                    <strong>{item.kind}</strong>
                    <small>{item.channel} · worker {item.enabledByWorker === null ? "미확인" : item.enabledByWorker ? "활성" : "누락"}</small>
                  </td>
                  <td className={styles.table__status}><HealthTag health={item.health} /></td>
                  <CountCell value={item.dueCount} alert />
                  <CountCell value={item.scheduledCount} />
                  <CountCell value={item.processingCount} />
                  <CountCell value={item.expiredLeaseCount} alert />
                  <CountCell value={item.retryingCount} alert />
                  <CountCell value={item.deadCount} alert />
                  <CountCell value={item.sentCount} />
                  <CountCell value={item.skippedCount} />
                  <CountCell value={item.unclassifiedCount} />
                  <td className={styles.table__date}>{dateTime(item.oldestDueAt)}</td>
                  <td className={styles.table__date}>{dateTime(item.lastDeliveredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>
          신규 처리 완료는 실제 발송과 정책상 생략을 구분합니다. “구형 미분류”는 이 구분을 저장하기 전에 처리된 과거 기록입니다.
        </p>
      </section>

      <div className={styles.twoColumn}>
        <section className={styles.section} aria-labelledby="discord-state-card-title">
          <PanelTitle
            id="discord-state-card-title"
            role="heading"
            aria-level={2}
            className={styles.sectionTitle}
          >
            Discord 상태 카드
          </PanelTitle>
          <div className={styles.cardList}>
            {data.desiredStates.map((item) => (
              <Box key={item.key} className={styles.statusCard}>
                <div className={styles.statusCard__head}>
                  <strong>{item.label}</strong>
                  <HealthTag health={item.health} />
                </div>
                <p>
                  대기 {item.pendingCount} · revision 차이 {item.revisionLag} · 처리 중 {item.inFlightCount} · 오류 {item.errorCount}
                </p>
                <small>최근 갱신 {dateTime(item.updatedAt)}</small>
              </Box>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="delegated-workflow-title">
          <PanelTitle
            id="delegated-workflow-title"
            role="heading"
            aria-level={2}
            className={styles.sectionTitle}
          >
            봇 위임 흐름
          </PanelTitle>
          <div className={styles.cardList}>
            {data.delegatedWorkflows.map((item) => (
              <Box key={item.key} className={styles.statusCard}>
                <div className={styles.statusCard__head}>
                  <strong>{item.label}</strong>
                  <HealthTag health={item.health} />
                </div>
                <p>
                  즉시 대기 {item.dueCount} · 예약 {item.scheduledCount} · 처리 중 {item.inFlightCount} · 오류 {item.errorCount}
                </p>
              </Box>
            ))}
          </div>
        </section>
      </div>

      <section className={styles.section} aria-labelledby="scheduled-job-title">
        <PanelTitle
          id="scheduled-job-title"
          role="heading"
          aria-level={2}
          aria-label="예약 작업"
          className={styles.sectionTitle}
          right="Dokploy worker 소유"
        >
          예약 작업
        </PanelTitle>
        <div className={styles.jobGrid}>
          {data.scheduledJobs.map((job) => (
            <Box key={job.jobName} className={styles.jobCard}>
              <div>
                <strong>{job.jobName}</strong>
                <small>{job.status} · 시도 {job.attempts}</small>
              </div>
              <HealthTag health={job.health} />
            </Box>
          ))}
        </div>
      </section>

      {data.legacy.shopRestockDocuments > 1 ? (
        <Box className={styles.legacyNotice}>
          편의점 입고 상태 컬렉션에 현재 singleton 외 과거 문서가 {data.legacy.shopRestockDocuments - 1}건 있습니다. 이 화면은 삭제하지 않고 현황만 표시합니다.
        </Box>
      ) : null}

      <p className={styles.generatedAt}>기준 시각 {dateTime(data.generatedAt)}</p>
    </main>
  );
}
