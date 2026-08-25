"use client";

import Image from "next/image";
import { useState } from "react";

import type { ResearchHallOfFameResponse } from "@stargate/core";

import { useResearchHallOfFame } from "@/hooks/queries/useHallOfFameQuery";

import { IconCrown } from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import { preferOptimizedPublicImagePath } from "@/lib/asset-path";
import { getPixelProfilePath } from "@/lib/assets/characters";
import { formatDateTime } from "@/lib/format/date";

import styles from "./page.module.css";

interface Props {
  initialData?: ResearchHallOfFameResponse;
  initialDataUpdatedAt?: number;
}

const RANK_LABELS = {
  1: "GOLD LAUREATE",
  2: "SILVER HONOREE",
  3: "BRONZE HONOREE",
} as const;

type HallOfFameItem = ResearchHallOfFameResponse["items"][number];

function formatCredits(value: number): string {
  return `${value.toLocaleString("ko-KR")} CR`;
}

function HonoreePortrait({ item }: { item: HallOfFameItem }) {
  const profilePath = getPixelProfilePath(item.codename);
  const [hasImageError, setHasImageError] = useState(false);

  if (!profilePath || hasImageError) {
    return (
      <div className={styles.podium__portraitFallback} aria-hidden="true">
        <IconCrown />
      </div>
    );
  }

  return (
    <Image
      fill
      alt=""
      className={styles.podium__portraitImage}
      loading={item.rank === 1 ? "eager" : "lazy"}
      onError={() => setHasImageError(true)}
      sizes="(max-width: 640px) 112px, (max-width: 960px) 55vw, 400px"
      src={preferOptimizedPublicImagePath(profilePath)}
    />
  );
}

function HonoreeCard({ item }: { item: HallOfFameItem }) {
  const rankLabel = RANK_LABELS[item.rank];

  return (
    <li className={styles.podium__card} data-rank={item.rank}>
      <div className={styles.podium__portrait} aria-hidden="true">
        <HonoreePortrait item={item} />
      </div>
      <div className={styles.podium__content}>
        <span className={styles.podium__rank}>
          {String(item.rank).padStart(2, "0")} · {rankLabel}
        </span>
        <h3>{item.codename}</h3>
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
      </div>
    </li>
  );
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

  if (!data) {
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

  const refreshWarning = isError ? (
    <Box className={styles.refreshWarning} role="status" aria-live="polite">
      <div>
        <strong>최신 스냅샷을 다시 확인하지 못했습니다.</strong>
        <span>아래에는 마지막으로 확인된 일일 순위를 유지합니다.</span>
      </div>
      <Button
        size="sm"
        onClick={() => void refetch()}
        disabled={isFetching}
      >
        {isFetching ? "재시도 중" : "다시 확인"}
      </Button>
    </Box>
  ) : null;

  if (data.items.length === 0) {
    return (
      <>
        {refreshWarning}
        <Box className={styles.state}>
          <span className={styles.state__eyebrow}>AWAITING FIRST RECORD</span>
          <strong>아직 기록된 팀 연구 공로가 없습니다.</strong>
          <span>첫 모금 또는 가속 기여가 등록되면 이곳에 표시됩니다.</span>
        </Box>
      </>
    );
  }

  return (
    <>
      {refreshWarning}
      <section className={styles.honors} aria-labelledby="research-honors-title">
        <Box variant="gold" className={styles.honors__register}>
          <header className={styles.honors__header}>
            <div className={styles.honors__seal} aria-hidden="true">
              <IconCrown className={styles.honors__crown} />
            </div>
            <div className={styles.honors__heading}>
              <span className={styles.honors__eyebrow}>
                RESEARCH HONORS REGISTER · ALL TIME
              </span>
              <h2 id="research-honors-title">팀 연구 공로 헌액자</h2>
              <p>공동 연구의 모금과 가속에 실제 사용된 CR을 전 기간 합산합니다.</p>
            </div>
          </header>

          <ol
            className={styles.podium}
            data-count={data.items.length}
            aria-label="팀 연구 누적 공로 상위 3명"
          >
            {data.items.map((item) => (
              <HonoreeCard item={item} key={`${item.rank}-${item.codename}`} />
            ))}
          </ol>

          <footer className={styles.honors__meta}>
            <span>ALL TIME</span>
            <span>FUND + RUSH</span>
            <span>기준 {formatDateTime(data.generatedAt, "padded")} KST</span>
          </footer>
        </Box>
      </section>
    </>
  );
}
