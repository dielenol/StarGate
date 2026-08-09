"use client";

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
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function countLabel(value: number): string {
  return value.toLocaleString("ko-KR");
}

export default function AdminIntegrationStatusClient({ initialData }: Props) {
  const query = useAdminIntegrationStatusQuery({ initialData });
  const data = query.data ?? initialData;

  return (
    <main className={styles.root}>
      <Box variant="gold" className={styles.overview}>
        <div>
          <Eyebrow tone="gold">DISCORD · WORKER · OUTBOX</Eyebrow>
          <h2>알림과 봇 위임 상태를 한곳에서 확인합니다.</h2>
          <p>
            이 화면은 읽기 전용입니다. 재전송·상태 변경 버튼 없이 worker heartbeat,
            전달 대기열, 상태 카드와 봇 위임 지연만 표시합니다.
          </p>
        </div>
        <div className={styles.overview__actions}>
          <HealthTag health={data.overallHealth} />
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
        <Box className={styles.error}>
          최신 상태 조회에 실패해 마지막으로 확인된 값을 표시하고 있습니다.
        </Box>
      ) : null}

      <section className={styles.kpiGrid} aria-label="Discord 연동 요약">
        <Box className={styles.kpi}>
          <span>즉시 처리 대기</span>
          <strong>{countLabel(data.summary.dueCount)}</strong>
        </Box>
        <Box className={styles.kpi}>
          <span>예약 대기</span>
          <strong>{countLabel(data.summary.scheduledCount)}</strong>
        </Box>
        <Box className={styles.kpi}>
          <span>DEAD</span>
          <strong>{countLabel(data.summary.deadCount)}</strong>
        </Box>
        <Box className={styles.kpi}>
          <span>lease 만료</span>
          <strong>{countLabel(data.summary.expiredLeaseCount)}</strong>
        </Box>
        <Box className={styles.kpi}>
          <span>상태 카드 문제</span>
          <strong>{countLabel(data.summary.desiredStateIssues)}</strong>
        </Box>
        <Box className={styles.kpi}>
          <span>봇 위임 문제</span>
          <strong>{countLabel(data.summary.delegatedWorkflowIssues)}</strong>
        </Box>
      </section>

      <section className={styles.section}>
        <PanelTitle right={dateTime(data.worker.lastSeenAt)}>Worker heartbeat</PanelTitle>
        <Box className={styles.workerPanel}>
          <div className={styles.workerPanel__status}>
            <HealthTag health={data.worker.health} />
            <span>30초 주기의 active worker 상태 기록</span>
          </div>
          <dl className={styles.definitionList}>
            <div>
              <dt>domain consumers</dt>
              <dd>{data.worker.enabledConsumers.join(", ") || "확인되지 않음"}</dd>
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

      <section className={styles.section}>
        <PanelTitle right={`${data.outbox.length}종`}>Integration outbox</PanelTitle>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>종류 / 채널</th>
                <th>상태</th>
                <th>즉시 대기</th>
                <th>예약</th>
                <th>처리 중</th>
                <th>lease 만료</th>
                <th>재시도</th>
                <th>DEAD</th>
                <th>가장 오래된 대기</th>
                <th>최근 처리 완료</th>
              </tr>
            </thead>
            <tbody>
              {data.outbox.map((item) => (
                <tr key={item.kind}>
                  <td>
                    <strong>{item.kind}</strong>
                    <small>{item.channel} · worker {item.enabledByWorker === null ? "미확인" : item.enabledByWorker ? "활성" : "누락"}</small>
                  </td>
                  <td><HealthTag health={item.health} /></td>
                  <td>{countLabel(item.dueCount)}</td>
                  <td>{countLabel(item.scheduledCount)}</td>
                  <td>{countLabel(item.processingCount)}</td>
                  <td>{countLabel(item.expiredLeaseCount)}</td>
                  <td>{countLabel(item.retryingCount)}</td>
                  <td>{countLabel(item.deadCount)}</td>
                  <td>{dateTime(item.oldestDueAt)}</td>
                  <td>{dateTime(item.lastDeliveredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>
          “처리 완료”는 실제 발송뿐 아니라 비공개·연결 해제 등 정책상 생략도 포함할 수 있습니다.
        </p>
      </section>

      <div className={styles.twoColumn}>
        <section className={styles.section}>
          <PanelTitle>Discord 상태 카드</PanelTitle>
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

        <section className={styles.section}>
          <PanelTitle>봇 위임 흐름</PanelTitle>
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

      <section className={styles.section}>
        <PanelTitle right="Dokploy worker 소유">예약 작업</PanelTitle>
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
