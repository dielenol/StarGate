"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type TouchEvent } from "react";

import type {
  HallOfFameCitationPageResponse,
  HallOfFameHonorItem,
  HallOfFameMineResponse,
  HallOfFameNovexResponse,
  HallOfFameOverviewResponse,
  OperationHonorCategory,
  ResearchHallOfFameResponse,
} from "@stargate/core";

import {
  useHallOfFameCitations,
  useHallOfFameMine,
  useHallOfFameNovex,
  useHallOfFameOverview,
  useResearchHallOfFame,
} from "@/hooks/queries/useHallOfFameQuery";

import { IconCrown } from "@/components/icons";
import Button from "@/components/ui/Button/Button";
import { preferOptimizedPublicImagePath } from "@/lib/asset-path";
import { getPixelProfilePath } from "@/lib/assets/characters";
import { formatDateTime } from "@/lib/format/date";

import styles from "./page.module.css";

interface Props {
  initialOverviewData?: HallOfFameOverviewResponse;
  initialOverviewDataUpdatedAt?: number;
  initialData?: ResearchHallOfFameResponse;
  initialDataUpdatedAt?: number;
  initialNovexData?: HallOfFameNovexResponse;
  initialNovexDataUpdatedAt?: number;
  initialCitationsData?: HallOfFameCitationPageResponse;
  initialCitationsDataUpdatedAt?: number;
  initialMineData?: HallOfFameMineResponse;
  initialMineDataUpdatedAt?: number;
  isGuest: boolean;
}

const VIEWS = ["overview", "research", "novex", "operations", "mine"] as const;
type HallView = (typeof VIEWS)[number];
const VIEW_LABELS: Record<HallView, string> = { overview: "개요", research: "연구 기록", novex: "NOVEX", operations: "작전 공적", mine: "내 리본" };
const RANK_LABELS = { 1: "GOLD LAUREATE", 2: "SILVER HONOREE", 3: "BRONZE HONOREE" } as const;
const CATEGORY_LABELS: Record<HallOfFameHonorItem["category"], string> = { NOVEX_PODIUM: "NOVEX 투자 공적", COMBAT: "전투 공적", COMMAND: "지휘 공적", RESCUE_PROTECTION: "구조 · 보호", RESEARCH_TECH: "연구 · 기술", SUPPORT_TEAMWORK: "지원 · 공조", INTELLIGENCE_JUDGMENT: "정보 · 판단" };
const OPERATION_CATEGORIES: OperationHonorCategory[] = ["COMBAT", "COMMAND", "RESCUE_PROTECTION", "RESEARCH_TECH", "SUPPORT_TEAMWORK", "INTELLIGENCE_JUDGMENT"];
const PORTRAIT_SIZES: Record<1 | 2 | 3, string> = { 1: "(max-width: 640px) 50vw, (max-width: 960px) 42vw, 510px", 2: "(max-width: 640px) 34vw, 210px", 3: "(max-width: 640px) 34vw, 210px" };
const SPOTLIGHT_INTERVAL_MS = 6_500;

type ResearchHonorItem = ResearchHallOfFameResponse["items"][number];
type NovexHonorItem = HallOfFameNovexResponse["items"][number];
type SpotlightSlide =
  | { key: string; kind: "operation"; honor: HallOfFameHonorItem }
  | { key: string; kind: "ribbon"; honor: HallOfFameHonorItem }
  | { key: string; kind: "novex"; item: NovexHonorItem }
  | { key: string; kind: "research"; item: ResearchHonorItem; generatedAt?: string };

function formatCredits(value: number): string { return `${value.toLocaleString("ko-KR")} CR`; }
function formatProfit(value: number): string { return `${value > 0 ? "+" : ""}${value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CR`; }

function HallPortrait({ codename, rank = 2 }: { codename: string; rank?: 1 | 2 | 3 }) {
  const profilePath = getPixelProfilePath(codename);
  const [hasImageError, setHasImageError] = useState(false);
  if (!profilePath || hasImageError) return <div className={styles.portraitFallback} aria-hidden="true"><NovusEmblem /></div>;
  return <Image fill alt="" className={styles.portraitImage} loading={rank === 1 ? "eager" : "lazy"} onError={() => setHasImageError(true)} sizes={PORTRAIT_SIZES[rank]} src={preferOptimizedPublicImagePath(profilePath)} />;
}

function NovusEmblem() {
  return <span aria-hidden="true" className={styles.novusEmblem} />;
}

function HallState({ title, detail, retry, isRetrying, compact = false }: { title: string; detail: string; retry?: () => void; isRetrying?: boolean; compact?: boolean }) {
  return <div className={compact ? styles.stateCompact : styles.state} role={retry ? "alert" : "status"}><span className={styles.state__seal} aria-hidden="true"><NovusEmblem /></span><span className={styles.state__eyebrow}>ARCHIVE STATUS</span><strong>{title}</strong><span>{detail}</span>{retry ? <Button disabled={isRetrying} onClick={retry} size="sm">{isRetrying ? "재시도 중" : "다시 불러오기"}</Button> : null}</div>;
}

function StaleNotice({ retry, isRetrying, compact = false }: { retry: () => void; isRetrying: boolean; compact?: boolean }) {
  return <div className={`${styles.staleNotice} ${compact ? styles["staleNotice--compact"] : ""}`} role="status"><span>최신 기록을 확인하지 못해 마지막 성공 데이터를 표시합니다.</span><Button size="sm" onClick={retry} disabled={isRetrying}>{isRetrying ? "재시도 중" : "다시 확인"}</Button></div>;
}

function ResearchPodium({ data, compact = false }: { data: ResearchHallOfFameResponse; compact?: boolean }) {
  if (data.items.length === 0) return <HallState compact title="첫 연구 공적을 기다리고 있습니다." detail="모금 또는 가속 기여가 등록되면 기록판이 열립니다." />;
  return <ol className={`${styles.researchPodium} ${compact ? styles["researchPodium--compact"] : ""}`} data-count={data.items.length} aria-label="팀 연구 누적 공로 상위 3명">{data.items.map((item) => <li className={styles.researchPodium__card} data-rank={item.rank} key={`${item.rank}-${item.codename}`}><div className={styles.researchPodium__portrait} aria-hidden="true"><HallPortrait codename={item.codename} rank={item.rank} /></div><div className={styles.researchPodium__content}><span className={styles.rankLabel}>{String(item.rank).padStart(2, "0")} · {RANK_LABELS[item.rank]}</span><h3>{item.codename}</h3><dl className={styles.stats}><div><dt>누적 공로</dt><dd>{formatCredits(item.totalCredits)}</dd></div><div><dt>기여 횟수</dt><dd>{item.contributionCount.toLocaleString("ko-KR")}회</dd></div></dl></div></li>)}</ol>;
}

function HonorList({ items, emptyMessage, limit }: { items: HallOfFameHonorItem[]; emptyMessage: string; limit?: number }) {
  const visibleItems = limit ? items.slice(0, limit) : items;
  if (visibleItems.length === 0) return <HallState compact title={emptyMessage} detail="새 공적이 확정되면 여기에 기록됩니다." />;
  return <ol className={styles.honorList}>{visibleItems.map((item) => <li className={styles.honorList__item} key={item.key}><div className={styles.honorList__seal} aria-hidden="true"><IconCrown /></div><div className={styles.honorList__content}><span>{CATEGORY_LABELS[item.category]}</span><strong>{item.codename}</strong><p>{item.title}</p><blockquote>{item.citation}</blockquote><small>{item.sourceLabel} · {formatDateTime(item.occurredAt, "padded")}</small></div>{item.sourceHref ? <Link className={styles.honorList__link} href={item.sourceHref}>기록 보기</Link> : null}</li>)}</ol>;
}

function NovexPanel({ data }: { data: HallOfFameNovexResponse | undefined }) {
  if (!data?.items.length) return <HallState compact title="집계 가능한 NOVEX 수익 기록이 없습니다." detail="실현손익이 기록된 일반 플레이어 AGENT가 생기면 순위가 열립니다." />;
  return <div className={styles.novexPanel}><div className={styles.novexPanel__topline}><span>ALL TIME · TOTAL REALIZED RETURN</span><span>TOP 3</span></div><ol>{data.items.map((item) => <li key={`${item.rank}-${item.codename}`}><b>{String(item.rank).padStart(2, "0")}</b><span>{item.codename}</span><small>{formatProfit(item.totalRealizedReturn)} · 수익 확정 {item.profitEventCount.toLocaleString("ko-KR")}건</small></li>)}</ol></div>;
}

function SpotlightRecord({
  slide,
  index,
  total,
  isActive,
}: {
  slide: SpotlightSlide;
  index: number;
  total: number;
  isActive: boolean;
}) {
  const honor = slide.kind === "operation" || slide.kind === "ribbon" ? slide.honor : undefined;
  const novexLeader = slide.kind === "novex" ? slide.item : undefined;
  const researchLeader = slide.kind === "research" ? slide.item : undefined;
  const codename = slide.kind === "operation" || slide.kind === "ribbon"
    ? slide.honor.codename
    : slide.item.codename;
  const titleId = `spotlight-title-${index}`;

  return (
    <article
      aria-hidden={!isActive}
      aria-labelledby={titleId}
      className={styles.featured__slide}
      data-source={slide.kind}
    >
      <div className={styles.featured__orbit} aria-hidden="true">
        <span className={styles.featured__emblem}><NovusEmblem /></span>
        <span className={styles.featured__portrait}><HallPortrait codename={codename} rank={isActive ? 1 : 2} /></span>
        <span className={styles.featured__axis}>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      </div>
      <div className={styles.featured__copy}>
        <div className={styles.panel__eyebrow}>
          {slide.kind === "operation"
            ? "LATEST OPERATION CITATION"
            : slide.kind === "ribbon"
              ? "PERSONAL HONOR RIBBON"
              : slide.kind === "novex"
                ? "NOVEX ALL-TIME LEAD"
                : "LIVE RESEARCH LEAD"}
        </div>
        <h3 id={titleId}>{codename}</h3>
        {honor ? <>
          <strong>{honor.title}</strong>
          <p>{honor.citation}</p>
          <span>{CATEGORY_LABELS[honor.category]} · {honor.sourceLabel}</span>
          {honor.sourceHref ? <Link className={styles.featured__link} href={honor.sourceHref} tabIndex={isActive ? 0 : -1}>원문 기록 열기 →</Link> : null}
        </> : novexLeader ? <>
          <strong>NOVEX 누적 실현수익 1위</strong>
          <p>전 기간 주식 매도 실현손익과 지급 배당을 합산한 현재 선두 기록입니다.</p>
          <dl className={styles.featured__metrics}>
            <div><dt>누적 수익</dt><dd>{formatProfit(novexLeader.totalRealizedReturn)}</dd></div>
            <div><dt>수익 확정</dt><dd>{novexLeader.profitEventCount.toLocaleString("ko-KR")}건</dd></div>
          </dl>
          <span>NOVEX · ALL TIME · GM / TEST EXCLUDED</span>
        </> : researchLeader ? <>
          <strong>팀 연구 누적 공로 1위</strong>
          <p>공동 연구의 모금과 가속에 실제 사용된 CR을 전 기간 합산한 현재 선두 기록입니다.</p>
          <dl className={styles.featured__metrics}>
            <div><dt>누적 공로</dt><dd>{formatCredits(researchLeader.totalCredits)}</dd></div>
            <div><dt>기여 횟수</dt><dd>{researchLeader.contributionCount.toLocaleString("ko-KR")}회</dd></div>
          </dl>
          <span>RESEARCH · ALL TIME{slide.kind === "research" && slide.generatedAt ? ` · ${formatDateTime(slide.generatedAt, "padded")}` : ""}</span>
        </> : null}
      </div>
    </article>
  );
}

function HonorsSpotlight({ slides, isLoading }: { slides: SpotlightSlide[]; isLoading: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInteractionPaused, setIsInteractionPaused] = useState(false);
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const slideCount = slides.length;
  const safeIndex = slideCount > 0 ? activeIndex % slideCount : 0;
  const translatePercent = safeIndex === 0 ? 0 : safeIndex * -100;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (slideCount < 2 || prefersReducedMotion || isInteractionPaused || isManuallyPaused) return;
    const timer = window.setInterval(
      () => setActiveIndex((current) => (current + 1) % slideCount),
      SPOTLIGHT_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [isInteractionPaused, isManuallyPaused, prefersReducedMotion, slideCount]);

  const showPrevious = () => {
    if (slideCount < 2) return;
    setActiveIndex((current) => (current - 1 + slideCount) % slideCount);
  };
  const showNext = () => {
    if (slideCount < 2) return;
    setActiveIndex((current) => (current + 1) % slideCount);
  };
  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    setIsInteractionPaused(true);
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) {
      setIsInteractionPaused(false);
      return;
    }
    const distance = (event.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(distance) >= 44) {
      if (distance > 0) showPrevious();
      else showNext();
    }
    setIsInteractionPaused(false);
  };

  if (slideCount === 0) {
    return (
      <section className={`${styles.panel} ${styles["panel--featured"]} ${styles.spotlight}`} aria-label="대표 공적 기록">
        <div className={`${styles.featured__slide} ${styles["featured__slide--empty"]}`}>
          <div className={styles.featured__orbit} aria-hidden="true"><span className={styles.featured__emblem}><NovusEmblem /></span><span className={styles.featured__axis}>00 / 00</span></div>
          <div className={styles.featured__copy}><div className={styles.panel__eyebrow}>OFFICIAL RECORD CHANNEL</div><h3>{isLoading ? "기록 조회중" : "첫 공적 대기중"}</h3><p>{isLoading ? "공개 가능한 연구·투자·작전 기록을 대조하고 있습니다." : "공식 기준을 통과한 첫 기록이 생성되면 이 좌표에 헌액됩니다."}</p></div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="대표 공적 자동 순환 기록"
      aria-roledescription="carousel"
      className={`${styles.panel} ${styles["panel--featured"]} ${styles.spotlight}`}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsInteractionPaused(false);
      }}
      onFocusCapture={() => setIsInteractionPaused(true)}
      onMouseEnter={() => setIsInteractionPaused(true)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setIsInteractionPaused(false);
      }}
    >
      <div
        className={styles.spotlight__viewport}
        onTouchCancel={() => {
          touchStartX.current = null;
          setIsInteractionPaused(false);
        }}
        onTouchEnd={handleTouchEnd}
        onTouchStart={handleTouchStart}
      >
        <div
          aria-live="off"
          className={styles.spotlight__track}
          style={{ transform: `translateX(${translatePercent}%)` }}
        >
          {slides.map((slide, index) => <SpotlightRecord index={index} isActive={safeIndex === index} key={slide.key} slide={slide} total={slideCount} />)}
        </div>
      </div>
      {slideCount > 1 ? <footer className={styles.spotlight__controls}>
        <div className={styles.spotlight__arrows}>
          <button aria-label="이전 공적 기록" onClick={showPrevious} type="button">←</button>
          <button aria-label="다음 공적 기록" onClick={showNext} type="button">→</button>
        </div>
        <div aria-label="공적 기록 선택" className={styles.spotlight__dots} role="group">
          {slides.map((slide, index) => <button aria-label={`${index + 1}번째 공적 기록 보기`} aria-pressed={safeIndex === index} key={slide.key} onClick={() => setActiveIndex(index)} type="button"><span /></button>)}
        </div>
        {prefersReducedMotion ? <span className={styles.spotlight__mode}>MANUAL · REDUCED MOTION</span> : <button aria-pressed={isManuallyPaused} className={styles.spotlight__pause} onClick={() => setIsManuallyPaused((paused) => !paused)} type="button">{isManuallyPaused ? "자동 순환 재개" : "자동 순환 정지"}</button>}
      </footer> : null}
    </section>
  );
}

function ArchiveChannel({
  href,
  index,
  label,
  value,
  status,
  active,
}: {
  href: string;
  index: string;
  label: string;
  value: string;
  status: string;
  active: boolean;
}) {
  return (
    <Link className={styles.archiveChannel} data-active={active ? "true" : "false"} href={href}>
      <span className={styles.archiveChannel__orbit} aria-hidden="true"><i />{index}</span>
      <span className={styles.archiveChannel__copy}><small>{label}</small><strong>{value}</strong><em>{status}</em></span>
      <span className={styles.archiveChannel__arrow} aria-hidden="true">↗</span>
    </Link>
  );
}

function ResearchWing({ research, isLoading, isError, error, refetch, isFetching }: { research?: ResearchHallOfFameResponse; isLoading: boolean; isError: boolean; error: unknown; refetch: () => void; isFetching: boolean }) {
  if (isLoading && !research) return <HallState title="누적 공로를 집계하고 있습니다." detail="모금·가속 기록을 확인하는 중입니다." />;
  if (!research) return <HallState title="연구 공로 순위를 불러오지 못했습니다." detail={error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."} retry={refetch} isRetrying={isFetching} />;
  return <section className={styles.wing} aria-labelledby="research-honors-title"><header className={styles.wing__header}><span>RESEARCH HONORS REGISTER · ALL TIME</span><h2 id="research-honors-title">팀 연구 공로 헌액자</h2><p>공동 연구의 모금과 가속에 실제 사용된 CR을 전 기간 합산합니다.</p></header>{isError ? <StaleNotice retry={refetch} isRetrying={isFetching} /> : null}<ResearchPodium data={research} /><footer className={styles.wing__meta}><span>ALL TIME</span><span>FUND + RUSH</span><span>DAILY · 21:00 KST</span><span>기준 {formatDateTime(research.generatedAt, "padded")} KST</span></footer></section>;
}

export default function HallOfFameClient({ initialOverviewData, initialOverviewDataUpdatedAt, initialData, initialDataUpdatedAt, initialNovexData, initialNovexDataUpdatedAt, initialCitationsData, initialCitationsDataUpdatedAt, initialMineData, initialMineDataUpdatedAt, isGuest }: Props) {
  const searchParams = useSearchParams();
  const candidateView = searchParams.get("view");
  const view: HallView = VIEWS.includes(candidateView as HallView) ? (candidateView as HallView) : "overview";
  const permittedView = isGuest && (view === "operations" || view === "mine") ? "overview" : view;
  const categoryParam = searchParams.get("category");
  const operationCategory = OPERATION_CATEGORIES.includes(categoryParam as OperationHonorCategory) ? (categoryParam as OperationHonorCategory) : undefined;
  const operationCursor = permittedView === "operations" ? searchParams.get("cursor")?.trim() || undefined : undefined;
  const overview = useHallOfFameOverview({ initialData: initialOverviewData, initialDataUpdatedAt: initialOverviewDataUpdatedAt });
  const research = useResearchHallOfFame({ initialData, initialDataUpdatedAt });
  const novex = useHallOfFameNovex({ initialData: initialNovexData, initialDataUpdatedAt: initialNovexDataUpdatedAt });
  const citations = useHallOfFameCitations({ category: permittedView === "operations" ? operationCategory : undefined, cursor: operationCursor, initialData: permittedView === "operations" && (operationCategory || operationCursor) ? undefined : initialCitationsData, initialDataUpdatedAt: permittedView === "operations" && (operationCategory || operationCursor) ? undefined : initialCitationsDataUpdatedAt, enabled: !isGuest });
  const mine = useHallOfFameMine({ initialData: initialMineData, initialDataUpdatedAt: initialMineDataUpdatedAt, enabled: !isGuest });
  const novexLeader = novex.data?.items.find((item) => item.rank === 1);
  const researchLeader = research.data?.items.find((item) => item.rank === 1);
  const hasNovexRecords = Boolean(novex.data?.items.length);
  const hasOperationRecords = !isGuest && Boolean(citations.data?.items.length);
  const hasMineRecords = !isGuest && Boolean(mine.data?.ribbons.length);
  const registryHealthy = !overview.isError && !research.isError && !novex.isError && (isGuest || (!citations.isError && !mine.isError));
  const researchChannelValue = research.data ? `${research.data.items.length}명 헌액` : research.isLoading ? "원장 조회중" : "확인 불가";
  const researchChannelStatus = research.isError ? "마지막 성공 기록 확인 필요" : research.data ? "매일 21:00 KST 갱신" : "연구 원장 연결중";
  const novexChannelValue = overview.data ? `${overview.data.novexHonoreeCount}명 헌액` : overview.isLoading ? "수익 조회중" : "확인 불가";
  const novexChannelStatus = novex.isError ? "수익 원장 조회 실패" : !novex.data ? "수익 원장 연결중" : hasNovexRecords ? "전 기간 실현손익 집계" : "실현손익 기록 대기";
  const operationChannelValue = citations.data ? hasOperationRecords ? "공적 기록 활성" : "헌액 기록 0건" : citations.isLoading ? "원장 조회중" : "확인 불가";
  const operationChannelStatus = citations.isError ? "작전 원장 조회 실패" : !citations.data ? "작전 원장 연결중" : hasOperationRecords ? "U 공개 원본 검증 완료" : "작전 공적 검토 대기";
  const mineChannelValue = mine.data ? `${mine.data.total.toLocaleString("ko-KR")}개 리본` : mine.isLoading ? "개인 원장 조회중" : "확인 불가";
  const mineChannelStatus = mine.isError ? "개인 원장 조회 실패" : !mine.data ? "리본 원장 연결중" : hasMineRecords ? "내 AGENT 공적 연결됨" : "발급된 리본 없음";
  const navViews = VIEWS.filter((candidate) => !isGuest || (candidate !== "operations" && candidate !== "mine"));
  const generatedAtCandidates = [overview.data?.generatedAt, research.data?.generatedAt, novex.data?.generatedAt, !isGuest ? citations.data?.generatedAt : undefined].filter((value): value is string => Boolean(value));
  const latestGeneratedAt = generatedAtCandidates.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
  const operationHighlights = [...(isGuest ? [] : citations.data?.items ?? [])]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, 3);
  const operationKeys = new Set(operationHighlights.map((item) => item.key));
  const ribbonHighlights = (isGuest ? [] : mine.data?.ribbons ?? [])
    .filter((item) => !operationKeys.has(item.key))
    .slice(0, 2);
  const spotlightSlides: SpotlightSlide[] = [
    ...operationHighlights.slice(0, 1).map((honor) => ({ key: `operation-${honor.key}`, kind: "operation" as const, honor })),
    ...(novexLeader ? [{ key: `novex-${novexLeader.codename}`, kind: "novex" as const, item: novexLeader }] : []),
    ...(researchLeader ? [{ key: `research-${researchLeader.codename}`, kind: "research" as const, item: researchLeader, generatedAt: research.data?.generatedAt }] : []),
    ...operationHighlights.slice(1).map((honor) => ({ key: `operation-${honor.key}`, kind: "operation" as const, honor })),
    ...ribbonHighlights.map((honor) => ({ key: `ribbon-${honor.key}`, kind: "ribbon" as const, honor })),
  ];
  const nextCitationHref = citations.data?.nextCursor
    ? `/erp/hall-of-fame?view=operations${operationCategory ? `&category=${operationCategory}` : ""}&cursor=${encodeURIComponent(citations.data.nextCursor)}`
    : undefined;

  return <main className={styles.archive}><nav className={styles.archive__tabs} aria-label="명예의 전당 부문">{navViews.map((candidate) => <Link aria-current={permittedView === candidate ? "page" : undefined} className={styles.archive__tab} href={candidate === "overview" ? "/erp/hall-of-fame" : `/erp/hall-of-fame?view=${candidate}`} key={candidate}>{VIEW_LABELS[candidate]}</Link>)}</nav>
    {permittedView === "overview" ? <section className={styles.overview} data-guest={isGuest ? "true" : undefined} aria-label="명예의 전당 개요">
      <header className={styles.overview__header}>
        <div className={styles.overview__seal} aria-hidden="true"><NovusEmblem /></div>
        <div><span>NOVUS ORDO HONORS ARCHIVE</span><h2>명예의 전당 기록 보관소</h2><p>공동 연구, 누적 투자 성과, 작전 공적을 하나의 공식 기록으로 보존합니다.</p></div>
        <dl><div><dt>전체 기록</dt><dd>{overview.data?.totalRecords ?? "—"}</dd></div><div><dt>NOVEX 헌액</dt><dd>{overview.data?.novexHonoreeCount ?? "—"}</dd></div><div className={styles.overview__updated}><dt>최신 갱신</dt><dd>{latestGeneratedAt ? formatDateTime(latestGeneratedAt, "padded") : "—"}</dd></div></dl>
      </header>
      {overview.isLoading && !overview.data ? <HallState compact title="공식 기록을 집계하고 있습니다." detail="공개 가능한 공적 원장을 확인하는 중입니다." /> : overview.isError && !overview.data ? <HallState compact title="전체 기록 집계를 불러오지 못했습니다." detail="각 부문 기록은 아래에서 계속 확인할 수 있습니다." retry={() => void overview.refetch()} isRetrying={overview.isFetching} /> : overview.isError ? <StaleNotice compact retry={() => void overview.refetch()} isRetrying={overview.isFetching} /> : null}
      <div className={styles.overview__grid}>
        <HonorsSpotlight slides={spotlightSlides} isLoading={research.isLoading || novex.isLoading || (!isGuest && (citations.isLoading || mine.isLoading))} />
        <aside className={`${styles.panel} ${styles["panel--registry"]}`} aria-labelledby="registry-title">
          <div className={styles.panel__heading}><div><span>ARCHIVE CHANNELS</span><h3 id="registry-title">공적 원장 좌표</h3></div><span className={styles.registry__pulse} data-healthy={registryHealthy ? "true" : "false"} aria-label={registryHealthy ? "원장 온라인" : "원장 부분 연결"}>{registryHealthy ? "ONLINE" : "PARTIAL"}</span></div>
          <div className={styles.registry__channels}>
            <ArchiveChannel active={Boolean(research.data?.items.length) && !research.isError} href="/erp/hall-of-fame?view=research" index="01" label="RESEARCH" value={researchChannelValue} status={researchChannelStatus} />
            <ArchiveChannel active={hasNovexRecords && !novex.isError} href="/erp/hall-of-fame?view=novex" index="02" label="NOVEX" value={novexChannelValue} status={novexChannelStatus} />
            {!isGuest ? <ArchiveChannel active={hasOperationRecords && !citations.isError} href="/erp/hall-of-fame?view=operations" index="03" label="OPERATIONS" value={operationChannelValue} status={operationChannelStatus} /> : null}
            {!isGuest ? <ArchiveChannel active={hasMineRecords && !mine.isError} href="/erp/hall-of-fame?view=mine" index="04" label="MY RIBBONS" value={mineChannelValue} status={mineChannelStatus} /> : null}
          </div>
          <footer className={styles.registry__footer}><span>OFFICIAL · READ ONLY</span><small>공식 조건을 통과한 실제 기록만 표시합니다.</small></footer>
        </aside>
        <section className={`${styles.panel} ${styles["panel--research"]}`} aria-labelledby="overview-research-title"><div className={styles.panel__heading}><div><span>DAILY · 21:00 KST</span><h3 id="overview-research-title">실시간 연구 기록</h3></div><Link href="/erp/hall-of-fame?view=research">전체 기록</Link></div>{research.isLoading && !research.data ? <HallState compact title="연구 기록을 불러오는 중입니다." detail="누적 공로 스냅샷을 확인하고 있습니다." /> : research.isError && !research.data ? <HallState compact title="연구 기록을 불러오지 못했습니다." detail="잠시 후 다시 확인해 주세요." retry={() => void research.refetch()} isRetrying={research.isFetching} /> : <>{research.isError ? <StaleNotice compact retry={() => void research.refetch()} isRetrying={research.isFetching} /> : null}{research.data ? <ResearchPodium compact data={research.data} /> : null}</>}</section>
      </div>
    </section> : null}
    {permittedView === "research" ? <ResearchWing research={research.data} isLoading={research.isLoading} isError={research.isError} error={research.error} refetch={() => void research.refetch()} isFetching={research.isFetching} /> : null}
    {permittedView === "novex" ? <section className={styles.wing}><header className={styles.wing__header}><span>NOVEX ALL-TIME PROFIT REGISTER</span><h2>누적 실현수익 TOP 3</h2><p>전 기간 매도 실현손익과 지급 배당을 합산하며 GM과 테스트 계정은 집계에서 제외합니다.</p></header>{novex.isLoading && !novex.data ? <HallState title="누적 수익을 집계하고 있습니다." detail="전체 NOVEX 수익 원장을 확인하는 중입니다." /> : novex.isError && !novex.data ? <HallState title="누적 수익 순위를 불러오지 못했습니다." detail="잠시 후 다시 시도해 주세요." retry={() => void novex.refetch()} isRetrying={novex.isFetching} /> : <>{novex.isError ? <StaleNotice retry={() => void novex.refetch()} isRetrying={novex.isFetching} /> : null}<NovexPanel data={novex.data} />{novex.data ? <footer className={styles.wing__meta}><span>ALL TIME</span><span>REALIZED PROFIT + DIVIDEND</span><span>GM + TEST EXCLUDED</span><span>기준 {formatDateTime(novex.data.generatedAt, "padded")} KST</span></footer> : null}</>}</section> : null}
    {permittedView === "operations" ? <section className={styles.wing}><header className={styles.wing__header}><span>OFFICIAL OPERATION CITATIONS</span><h2>작전 공적 기록</h2><p>공개 작전보고서의 충분한 근거를 검토해 확정한 공식 인용입니다.</p></header><nav className={styles.categoryFilters} aria-label="작전 공적 부문 필터"><Link aria-current={!operationCategory ? "page" : undefined} href="/erp/hall-of-fame?view=operations">전체</Link>{OPERATION_CATEGORIES.map((category) => <Link aria-current={operationCategory === category ? "page" : undefined} href={`/erp/hall-of-fame?view=operations&category=${category}`} key={category}>{CATEGORY_LABELS[category]}</Link>)}</nav>{citations.isLoading && !citations.data ? <HallState title="작전 공적을 불러오는 중입니다." detail="공개 공적 기록을 확인하는 중입니다." /> : citations.isError && !citations.data ? <HallState title="작전 공적을 불러오지 못했습니다." detail="잠시 후 다시 시도해 주세요." retry={() => void citations.refetch()} isRetrying={citations.isFetching} /> : <>{citations.isError ? <StaleNotice retry={() => void citations.refetch()} isRetrying={citations.isFetching} /> : null}<HonorList items={citations.data?.items ?? []} emptyMessage="아직 확정된 작전 공적이 없습니다." />{nextCitationHref ? <Link className={styles.nextPageLink} href={nextCitationHref}>다음 기록 보기 →</Link> : null}</>}</section> : null}
    {permittedView === "mine" ? <section className={styles.wing}><header className={styles.wing__header}><span>PERSONAL HONORS RECORD</span><h2>내 공적 리본</h2><p>발급된 공식 공적 기록을 시간순으로 보관합니다.</p></header>{mine.isLoading && !mine.data ? <HallState title="내 리본을 불러오는 중입니다." detail="개인 공적 기록을 확인하는 중입니다." /> : mine.isError && !mine.data ? <HallState title="개인 기록을 불러오지 못했습니다." detail="잠시 후 다시 시도해 주세요." retry={() => void mine.refetch()} isRetrying={mine.isFetching} /> : <>{mine.isError ? <StaleNotice retry={() => void mine.refetch()} isRetrying={mine.isFetching} /> : null}<HonorList items={mine.data?.ribbons ?? []} emptyMessage="아직 발급된 리본이 없습니다." /></>}</section> : null}
  </main>;
}
