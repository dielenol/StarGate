"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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
import Box from "@/components/ui/Box/Box";
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
const CATEGORY_LABELS: Record<HallOfFameHonorItem["category"], string> = { NOVEX_PODIUM: "NOVEX 시즌 챔피언", COMBAT: "전투 공적", COMMAND: "지휘 공적", RESCUE_PROTECTION: "구조 · 보호", RESEARCH_TECH: "연구 · 기술", SUPPORT_TEAMWORK: "지원 · 공조", INTELLIGENCE_JUDGMENT: "정보 · 판단" };
const OPERATION_CATEGORIES: OperationHonorCategory[] = ["COMBAT", "COMMAND", "RESCUE_PROTECTION", "RESEARCH_TECH", "SUPPORT_TEAMWORK", "INTELLIGENCE_JUDGMENT"];
const PORTRAIT_SIZES: Record<1 | 2 | 3, string> = { 1: "(max-width: 640px) 50vw, (max-width: 960px) 42vw, 510px", 2: "(max-width: 640px) 34vw, 210px", 3: "(max-width: 640px) 34vw, 210px" };

function formatCredits(value: number): string { return `${value.toLocaleString("ko-KR")} CR`; }

function HallPortrait({ codename, rank = 2 }: { codename: string; rank?: 1 | 2 | 3 }) {
  const profilePath = getPixelProfilePath(codename);
  const [hasImageError, setHasImageError] = useState(false);
  if (!profilePath || hasImageError) return <div className={styles.portraitFallback} aria-hidden="true"><IconCrown /></div>;
  return <Image fill alt="" className={styles.portraitImage} loading={rank === 1 ? "eager" : "lazy"} onError={() => setHasImageError(true)} sizes={PORTRAIT_SIZES[rank]} src={preferOptimizedPublicImagePath(profilePath)} />;
}

function HallState({ title, detail, retry, isRetrying, compact = false }: { title: string; detail: string; retry?: () => void; isRetrying?: boolean; compact?: boolean }) {
  return <Box className={compact ? styles.stateCompact : styles.state} role={retry ? "alert" : undefined}><span className={styles.state__eyebrow}>ARCHIVE STATUS</span><strong>{title}</strong><span>{detail}</span>{retry ? <Button disabled={isRetrying} onClick={retry} size="sm">{isRetrying ? "재시도 중" : "다시 불러오기"}</Button> : null}</Box>;
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
  if (!data?.selectedSeason) return <HallState compact title="확정된 NOVEX 시즌이 없습니다." detail="첫 시즌이 마감되면 챔피언 기록이 보존됩니다." />;
  return <div className={styles.novexPanel}><div className={styles.novexPanel__topline}><span>{data.selectedSeason.label}</span><span>FINALIZED</span></div><ol>{data.items.map((item) => <li key={item.key}><b>{String(item.rank ?? 0).padStart(2, "0")}</b><span>{item.codename}</span><small>{item.citation}</small></li>)}</ol><Link href="/erp/hall-of-fame?view=novex">역대 챔피언 기록</Link></div>;
}

function ResearchWing({ research, isLoading, isError, error, refetch, isFetching }: { research?: ResearchHallOfFameResponse; isLoading: boolean; isError: boolean; error: unknown; refetch: () => void; isFetching: boolean }) {
  if (isLoading && !research) return <HallState title="누적 공로를 집계하고 있습니다." detail="모금·가속 기록을 확인하는 중입니다." />;
  if (!research) return <HallState title="연구 공로 순위를 불러오지 못했습니다." detail={error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."} retry={refetch} isRetrying={isFetching} />;
  return <section className={styles.wing} aria-labelledby="research-honors-title"><header className={styles.wing__header}><span>RESEARCH HONORS REGISTER · ALL TIME</span><h2 id="research-honors-title">팀 연구 공로 헌액자</h2><p>공동 연구의 모금과 가속에 실제 사용된 CR을 전 기간 합산합니다.</p></header>{isError ? <StaleNotice retry={refetch} isRetrying={isFetching} /> : null}<ResearchPodium data={research} /><footer className={styles.wing__meta}><span>ALL TIME</span><span>FUND + RUSH</span><span>DAILY · 21:00 KST</span><span>기준 {formatDateTime(research.generatedAt, "padded")} KST</span></footer></section>;
}

export default function HallOfFameClient({ initialOverviewData, initialOverviewDataUpdatedAt, initialData, initialDataUpdatedAt, initialNovexData, initialNovexDataUpdatedAt, initialCitationsData, initialCitationsDataUpdatedAt, initialMineData, initialMineDataUpdatedAt, isGuest }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const candidateView = searchParams.get("view");
  const view: HallView = VIEWS.includes(candidateView as HallView) ? (candidateView as HallView) : "overview";
  const permittedView = isGuest && (view === "operations" || view === "mine") ? "overview" : view;
  const seasonKey = permittedView === "novex" ? searchParams.get("season") ?? undefined : undefined;
  const categoryParam = searchParams.get("category");
  const operationCategory = OPERATION_CATEGORIES.includes(categoryParam as OperationHonorCategory) ? (categoryParam as OperationHonorCategory) : undefined;
  const operationCursor = permittedView === "operations" ? searchParams.get("cursor")?.trim() || undefined : undefined;
  const overview = useHallOfFameOverview({ initialData: initialOverviewData, initialDataUpdatedAt: initialOverviewDataUpdatedAt });
  const research = useResearchHallOfFame({ initialData, initialDataUpdatedAt });
  const novex = useHallOfFameNovex({ seasonKey, initialData: seasonKey ? undefined : initialNovexData, initialDataUpdatedAt: seasonKey ? undefined : initialNovexDataUpdatedAt });
  const citations = useHallOfFameCitations({ category: permittedView === "operations" ? operationCategory : undefined, cursor: operationCursor, initialData: permittedView === "operations" && (operationCategory || operationCursor) ? undefined : initialCitationsData, initialDataUpdatedAt: permittedView === "operations" && (operationCategory || operationCursor) ? undefined : initialCitationsDataUpdatedAt, enabled: !isGuest });
  const mine = useHallOfFameMine({ initialData: initialMineData, initialDataUpdatedAt: initialMineDataUpdatedAt, enabled: !isGuest });
  const latestHonor = [...(isGuest ? [] : citations.data?.items ?? []), ...(novex.data?.items ?? [])].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0];
  const navViews = VIEWS.filter((candidate) => !isGuest || (candidate !== "operations" && candidate !== "mine"));
  const generatedAtCandidates = [overview.data?.generatedAt, research.data?.generatedAt, novex.data?.generatedAt, !isGuest ? citations.data?.generatedAt : undefined].filter((value): value is string => Boolean(value));
  const latestGeneratedAt = generatedAtCandidates.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
  const nextCitationHref = citations.data?.nextCursor
    ? `/erp/hall-of-fame?view=operations${operationCategory ? `&category=${operationCategory}` : ""}&cursor=${encodeURIComponent(citations.data.nextCursor)}`
    : undefined;

  return <main className={styles.archive}><nav className={styles.archive__tabs} aria-label="명예의 전당 부문">{navViews.map((candidate) => <Link aria-current={permittedView === candidate ? "page" : undefined} className={styles.archive__tab} href={candidate === "overview" ? "/erp/hall-of-fame" : `/erp/hall-of-fame?view=${candidate}`} key={candidate}>{VIEW_LABELS[candidate]}</Link>)}</nav>
    {permittedView === "overview" ? <section className={styles.overview} data-guest={isGuest ? "true" : undefined} aria-label="명예의 전당 개요"><header className={styles.overview__header}><div className={styles.overview__seal} aria-hidden="true"><IconCrown /></div><div><span>NOVUS ORDO HONORS ARCHIVE</span><h2>명예의 전당 기록 보관소</h2><p>공동 연구, 시즌 성과, 작전 공적을 하나의 공식 기록으로 보존합니다.</p></div><dl><div><dt>전체 기록</dt><dd>{overview.data?.totalRecords ?? "—"}</dd></div><div><dt>확정 시즌</dt><dd>{overview.data?.seasonCount ?? "—"}</dd></div><div className={styles.overview__updated}><dt>최신 갱신</dt><dd>{latestGeneratedAt ? formatDateTime(latestGeneratedAt, "padded") : "—"}</dd></div></dl></header>{overview.isLoading && !overview.data ? <HallState compact title="공식 기록을 집계하고 있습니다." detail="공개 가능한 공적 원장을 확인하는 중입니다." /> : overview.isError && !overview.data ? <HallState compact title="전체 기록 집계를 불러오지 못했습니다." detail="각 부문 기록은 아래에서 계속 확인할 수 있습니다." retry={() => void overview.refetch()} isRetrying={overview.isFetching} /> : overview.isError ? <StaleNotice compact retry={() => void overview.refetch()} isRetrying={overview.isFetching} /> : null}<div className={styles.overview__grid}>
      <section className={`${styles.panel} ${styles["panel--featured"]}`} aria-labelledby="featured-title"><div className={styles.panel__eyebrow}>LATEST OFFICIAL RECORD</div><h3 id="featured-title">{latestHonor ? latestHonor.codename : "기록을 준비하고 있습니다"}</h3>{latestHonor ? <><strong>{latestHonor.title}</strong><p>{latestHonor.citation}</p><span>{CATEGORY_LABELS[latestHonor.category]} · {latestHonor.sourceLabel}</span></> : <p>{novex.isLoading || (!isGuest && citations.isLoading) ? "대표 공적 기록을 확인하고 있습니다." : "확정된 공적이 등록되면 최신 기록을 이곳에 표시합니다."}</p>}</section>
      {!isGuest ? <section className={`${styles.panel} ${styles["panel--mine"]}`} aria-labelledby="mine-title"><div className={styles.panel__eyebrow}>PERSONAL RIBBONS</div><h3 id="mine-title">내 공적 리본</h3>{mine.isLoading && !mine.data ? <p>기록을 불러오는 중입니다.</p> : mine.data ? <>{mine.isError ? <StaleNotice compact retry={() => void mine.refetch()} isRetrying={mine.isFetching} /> : null}<strong>{mine.data.total}건</strong><HonorList items={mine.data.ribbons} limit={3} emptyMessage="아직 발급된 리본이 없습니다." /></> : <HallState compact title="개인 기록을 불러오지 못했습니다." detail="잠시 후 다시 확인해 주세요." retry={() => void mine.refetch()} isRetrying={mine.isFetching} />}<Link href="/erp/hall-of-fame?view=mine">내 기록 열기</Link></section> : null}
      <section className={`${styles.panel} ${styles["panel--research"]}`} aria-labelledby="overview-research-title"><div className={styles.panel__heading}><div><span>DAILY · 21:00 KST</span><h3 id="overview-research-title">실시간 연구 기록</h3></div><Link href="/erp/hall-of-fame?view=research">전체 기록</Link></div>{research.isLoading && !research.data ? <HallState compact title="연구 기록을 불러오는 중입니다." detail="누적 공로 스냅샷을 확인하고 있습니다." /> : research.isError && !research.data ? <HallState compact title="연구 기록을 불러오지 못했습니다." detail="잠시 후 다시 확인해 주세요." retry={() => void research.refetch()} isRetrying={research.isFetching} /> : <>{research.isError ? <StaleNotice compact retry={() => void research.refetch()} isRetrying={research.isFetching} /> : null}{research.data ? <ResearchPodium compact data={research.data} /> : null}</>}</section>
      <section className={`${styles.panel} ${styles["panel--novex"]}`} aria-labelledby="novex-title"><div className={styles.panel__heading}><div><span>SEASON CHAMPIONS</span><h3 id="novex-title">NOVEX 챔피언</h3></div></div>{novex.isLoading && !novex.data ? <HallState compact title="시즌 기록을 불러오는 중입니다." detail="확정 시즌을 확인하고 있습니다." /> : novex.isError && !novex.data ? <HallState compact title="시즌 기록을 불러오지 못했습니다." detail="잠시 후 다시 확인해 주세요." retry={() => void novex.refetch()} isRetrying={novex.isFetching} /> : <>{novex.isError ? <StaleNotice compact retry={() => void novex.refetch()} isRetrying={novex.isFetching} /> : null}<NovexPanel data={novex.data} /></>}</section>
      {!isGuest ? <section className={`${styles.panel} ${styles["panel--citations"]}`} aria-labelledby="citation-title"><div className={styles.panel__heading}><div><span>OFFICIAL CITATIONS</span><h3 id="citation-title">최근 작전 공적</h3></div><Link href="/erp/hall-of-fame?view=operations">전체 공적</Link></div>{citations.isLoading && !citations.data ? <HallState compact title="작전 공적을 불러오는 중입니다." detail="공개 공적 기록을 확인하고 있습니다." /> : citations.isError && !citations.data ? <HallState compact title="작전 공적을 불러오지 못했습니다." detail="잠시 후 다시 확인해 주세요." retry={() => void citations.refetch()} isRetrying={citations.isFetching} /> : <>{citations.isError ? <StaleNotice compact retry={() => void citations.refetch()} isRetrying={citations.isFetching} /> : null}<HonorList items={citations.data?.items ?? []} emptyMessage="아직 확정된 작전 공적이 없습니다." limit={3} /></>}</section> : null}
    </div></section> : null}
    {permittedView === "research" ? <ResearchWing research={research.data} isLoading={research.isLoading} isError={research.isError} error={research.error} refetch={() => void research.refetch()} isFetching={research.isFetching} /> : null}
    {permittedView === "novex" ? <section className={styles.wing}><header className={styles.wing__header}><span>NOVEX CHAMPIONS ARCHIVE</span><h2>역대 시즌 챔피언</h2><p>확정된 시즌 성과를 공식 기록으로 보존합니다.</p></header>{novex.data?.seasons.length ? <label className={styles.seasonPicker}>시즌 선택<select value={novex.data.selectedSeason?.key ?? ""} onChange={(event) => router.replace(`/erp/hall-of-fame?view=novex&season=${encodeURIComponent(event.target.value)}`)}>{novex.data.seasons.map((season) => <option key={season.key} value={season.key}>{season.label}</option>)}</select></label> : null}{novex.isLoading && !novex.data ? <HallState title="시즌 기록을 불러오는 중입니다." detail="확정 시즌을 확인하는 중입니다." /> : novex.isError && !novex.data ? <HallState title="시즌 기록을 불러오지 못했습니다." detail="잠시 후 다시 시도해 주세요." retry={() => void novex.refetch()} isRetrying={novex.isFetching} /> : <>{novex.isError ? <StaleNotice retry={() => void novex.refetch()} isRetrying={novex.isFetching} /> : null}<NovexPanel data={novex.data} /></>}</section> : null}
    {permittedView === "operations" ? <section className={styles.wing}><header className={styles.wing__header}><span>OFFICIAL OPERATION CITATIONS</span><h2>작전 공적 기록</h2><p>공개 작전보고서의 충분한 근거를 통해 자동으로 확정된 공식 인용입니다.</p></header><nav className={styles.categoryFilters} aria-label="작전 공적 부문 필터"><Link aria-current={!operationCategory ? "page" : undefined} href="/erp/hall-of-fame?view=operations">전체</Link>{OPERATION_CATEGORIES.map((category) => <Link aria-current={operationCategory === category ? "page" : undefined} href={`/erp/hall-of-fame?view=operations&category=${category}`} key={category}>{CATEGORY_LABELS[category]}</Link>)}</nav>{citations.isLoading && !citations.data ? <HallState title="작전 공적을 불러오는 중입니다." detail="공개 공적 기록을 확인하는 중입니다." /> : citations.isError && !citations.data ? <HallState title="작전 공적을 불러오지 못했습니다." detail="잠시 후 다시 시도해 주세요." retry={() => void citations.refetch()} isRetrying={citations.isFetching} /> : <>{citations.isError ? <StaleNotice retry={() => void citations.refetch()} isRetrying={citations.isFetching} /> : null}<HonorList items={citations.data?.items ?? []} emptyMessage="아직 확정된 작전 공적이 없습니다." />{nextCitationHref ? <Link className={styles.nextPageLink} href={nextCitationHref}>다음 기록 보기 →</Link> : null}</>}</section> : null}
    {permittedView === "mine" ? <section className={styles.wing}><header className={styles.wing__header}><span>PERSONAL HONORS RECORD</span><h2>내 공적 리본</h2><p>발급된 공식 공적 기록을 시간순으로 보관합니다.</p></header>{mine.isLoading && !mine.data ? <HallState title="내 리본을 불러오는 중입니다." detail="개인 공적 기록을 확인하는 중입니다." /> : mine.isError && !mine.data ? <HallState title="개인 기록을 불러오지 못했습니다." detail="잠시 후 다시 시도해 주세요." retry={() => void mine.refetch()} isRetrying={mine.isFetching} /> : <>{mine.isError ? <StaleNotice retry={() => void mine.refetch()} isRetrying={mine.isFetching} /> : null}<HonorList items={mine.data?.ribbons ?? []} emptyMessage="아직 발급된 리본이 없습니다." /></>}</section> : null}
  </main>;
}
