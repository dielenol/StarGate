"use client";

import type { ResearchHallOfFameResponse } from "@stargate/core";

import { useResearchHallOfFame } from "@/hooks/queries/useHallOfFameQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Tag from "@/components/ui/Tag/Tag";
import { formatDateTime } from "@/lib/format/date";

import styles from "./page.module.css";

interface Props {
  initialData?: ResearchHallOfFameResponse;
  initialDataUpdatedAt?: number;
}

const MEDAL_LABELS = {
  1: "금",
  2: "은",
  3: "동",
} as const;

function formatCredits(value: number): string {
  return `${value.toLocaleString("ko-KR")} CR`;
}

export default function HallOfFameClient({
  initialData,
  initialDataUpdatedAt,
}: Props) {
  const { data, isLoading, isError, error, isFetching, refetch } =
    useResearchHallOfFame({ initialData, initialDataUpdatedAt });

  if (isLoading && !data) {
    return (
      <Box className={styles.state} aria-live="polite">
        <span className={styles.state__eyebrow}>RESEARCH HONORS</span>
        <strong>누적 공로를 집계하고 있습니다.</strong>
        <span>모금·가속 기록을 확인하는 중입니다.</span>
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Box className={styles.state} role="alert">
        <span className={styles.state__eyebrow}>RANKING UNAVAILABLE</span>
        <strong>연구 공로 순위를 불러오지 못했습니다.</strong>
        <span>
          {error instanceof Error
            ? error.message
            : "잠시 후 다시 시도해 주세요."}
        </span>
        <Button
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? "재시도 중" : "다시 불러오기"}
        </Button>
      </Box>
    );
  }

  if (data.items.length === 0) {
    return (
      <Box className={styles.state}>
        <span className={styles.state__eyebrow}>AWAITING FIRST RECORD</span>
        <strong>아직 기록된 팀 연구 공로가 없습니다.</strong>
        <span>첫 모금 또는 가속 기여가 등록되면 이곳에 표시됩니다.</span>
      </Box>
    );
  }

  return (
    <section className={styles.honors} aria-labelledby="research-honors-title">
      <Box variant="gold" className={styles.honors__intro}>
        <div>
          <span className={styles.honors__eyebrow}>ALL-TIME RESEARCH HONORS</span>
          <h2 id="research-honors-title">팀 연구 누적 공로 TOP 3</h2>
          <p>
            공동 연구의 모금과 가속에 실제 사용된 CR을 전 기간 합산합니다.
          </p>
        </div>
        <div className={styles.honors__status}>
          <Tag tone="gold">DAILY · 21:00 KST</Tag>
          <span>기준 {formatDateTime(data.generatedAt, "padded")} KST</span>
        </div>
      </Box>

      <ol className={styles.podium} aria-label="팀 연구 누적 공로 상위 3명">
        {data.items.map((item) => (
          <li
            className={styles.podium__card}
            data-rank={item.rank}
            key={`${item.rank}-${item.codename}`}
          >
            <div className={styles.podium__medal} aria-label={`${item.rank}위`}>
              <span>{MEDAL_LABELS[item.rank]}</span>
              <strong>{item.rank}</strong>
            </div>
            <div className={styles.podium__identity}>
              <span>{item.rank === 1 ? "PRIME CONTRIBUTOR" : "HONORED CONTRIBUTOR"}</span>
              <h3>{item.codename}</h3>
            </div>
            <dl className={styles.podium__stats}>
              <div>
                <dt>누적 공로</dt>
                <dd>{formatCredits(item.totalCredits)}</dd>
              </div>
              <div>
                <dt>기여 횟수</dt>
                <dd>{item.contributionCount.toLocaleString("ko-KR")}회</dd>
              </div>
            </dl>
            <div className={styles.podium__base} aria-hidden="true">
              <span>RANK</span>
              <strong>0{item.rank}</strong>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
