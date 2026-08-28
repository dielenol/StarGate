"use client";

import Link from "next/link";

import type {
  HallOfFameCitationPageResponse,
  HallOfFameHonorItem,
  HallOfFameReportReviewResponse,
} from "@stargate/core";

import {
  useHallOfFameCitations,
  useHallOfFameReportReviewState,
} from "@/hooks/queries/useHallOfFameQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import { formatDate } from "@/lib/format/date";

import styles from "./page.module.css";

interface Props {
  reportId: string;
  initialHonors?: HallOfFameCitationPageResponse;
  initialReview?: HallOfFameReportReviewResponse;
}

const HONOR_CATEGORY_LABEL: Record<string, string> = {
  COMBAT: "전투 공적",
  COMMAND: "지휘 공적",
  RESCUE_PROTECTION: "구조·보호",
  RESEARCH_TECH: "연구·기술",
  SUPPORT_TEAMWORK: "지원·공조",
  INTELLIGENCE_JUDGMENT: "정보·판단",
};

function HonorCitation({ item }: { item: HallOfFameHonorItem }) {
  return (
    <article className={styles.honorCitation}>
      <div className={styles.honorCitation__meta}>
        <span>{HONOR_CATEGORY_LABEL[item.category] ?? item.category}</span>
        <time dateTime={item.occurredAt}>
          {formatDate(item.occurredAt, "numeric")}
        </time>
      </div>
      <strong>{item.codename}</strong>
      <h3>{item.title}</h3>
      <p>{item.citation}</p>
    </article>
  );
}

export default function ReportHonorCitations({
  reportId,
  initialHonors,
  initialReview,
}: Props) {
  const honors = useHallOfFameCitations({
    reportId,
    initialData: initialHonors,
    initialDataUpdatedAt: initialHonors
      ? new Date(initialHonors.generatedAt).getTime()
      : undefined,
  });
  const review = useHallOfFameReportReviewState({
    reportId,
    initialData: initialReview,
    initialDataUpdatedAt: initialReview
      ? new Date(initialReview.generatedAt).getTime()
      : undefined,
  });
  const items = honors.data?.items ?? [];
  const reviewState = review.data?.state ?? null;
  const isInitialLoading =
    (!honors.data && honors.isLoading) ||
    (!review.data && review.isLoading);
  const hasLoadError = honors.isError || review.isError;
  const isRetrying = honors.isFetching || review.isFetching;
  const showEmpty =
    Boolean(honors.data) &&
    Boolean(review.data) &&
    items.length === 0 &&
    reviewState === null;

  const retry = () => {
    void honors.refetch();
    void review.refetch();
  };

  return (
    <Box className={styles.honorPanel}>
      <PanelTitle right={<span className={styles.mono}>{items.length}</span>}>
        공적 인용 · OFFICIAL HONORS
      </PanelTitle>
      {isInitialLoading ? (
        <div className={styles.honorPanel__status} role="status">
          <strong>공적 기록 확인 중</strong>
          <span>이 보고서와 연결된 확정 기록을 불러오고 있습니다.</span>
        </div>
      ) : null}
      {hasLoadError ? (
        <div className={styles.honorPanel__status} role="alert">
          <strong>
            {items.length > 0
              ? "마지막 성공 기록 표시 중"
              : "공적 기록을 불러오지 못했습니다"}
          </strong>
          <span>
            실시간 갱신에 실패했습니다. 잠시 후 다시 확인해 주세요.
          </span>
          <div className={styles.honorPanel__actions}>
            <Button disabled={isRetrying} onClick={retry} size="sm">
              {isRetrying ? "재시도 중" : "다시 불러오기"}
            </Button>
          </div>
        </div>
      ) : null}
      {reviewState ? (
        <div className={styles.honorPanel__status} role="status">
          <strong>공적 검토 대기</strong>
          <span>
            로어·세션 기록의 정확한 근거를 대조하고 있습니다. 확정 전
            기록은 공개하지 않습니다.
          </span>
        </div>
      ) : null}
      {showEmpty ? (
        <div className={styles.honorPanel__status} role="status">
          <strong>확정된 공적 인용 없음</strong>
          <span>엄격한 헌액 기준을 통과한 기록만 이곳에 표시합니다.</span>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className={styles.honorPanel__list}>
          {items.map((item) => (
            <HonorCitation item={item} key={item.key} />
          ))}
        </div>
      ) : null}
      <Link
        className={styles.honorPanel__link}
        href="/erp/hall-of-fame?view=operations"
      >
        전체 작전 공적 기록 보기 ↗
      </Link>
    </Box>
  );
}
