import { redirect } from "next/navigation";

import type { OperationHonorCategory } from "@stargate/core";

import { getActiveSession } from "@/lib/auth/active-session";
import {
  getHallOfFameCitationPage,
  getHallOfFameMineResponse,
  getHallOfFameNovexResponse,
  getHallOfFameOverviewResponse,
} from "@/lib/hall-of-fame/honors";
import { getResearchHallOfFameResponse } from "@/lib/hall-of-fame/research";

import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import HallOfFameClient from "./HallOfFameClient";
import styles from "./page.module.css";

const HALL_VIEWS = ["overview", "research", "novex", "operations", "mine"] as const;
type HallView = (typeof HALL_VIEWS)[number];
const OPERATION_CATEGORIES: readonly OperationHonorCategory[] = [
  "COMBAT",
  "COMMAND",
  "RESCUE_PROTECTION",
  "RESEARCH_TECH",
  "SUPPORT_TEAMWORK",
  "INTELLIGENCE_JUDGMENT",
];

interface PageProps {
  searchParams: Promise<{
    view?: string | string[];
    category?: string | string[];
    cursor?: string | string[];
  }>;
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveHallView(value: string | undefined): HallView {
  return HALL_VIEWS.includes(value as HallView) ? (value as HallView) : "overview";
}

export default async function HallOfFamePage({ searchParams }: PageProps) {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const isGuest = session.user.isGuest === true;
  const requestedView = resolveHallView(firstSearchParam(params.view));
  const view =
    isGuest && (requestedView === "operations" || requestedView === "mine")
      ? "overview"
      : requestedView;
  const categoryParam = firstSearchParam(params.category);
  const operationCategory =
    view === "operations" &&
    OPERATION_CATEGORIES.includes(categoryParam as OperationHonorCategory)
      ? (categoryParam as OperationHonorCategory)
      : undefined;
  const operationCursor =
    view === "operations"
      ? firstSearchParam(params.cursor)?.trim() || undefined
      : undefined;

  const shouldLoadOverview = view === "overview";
  const shouldLoadResearch = shouldLoadOverview || view === "research";
  const shouldLoadNovex = shouldLoadOverview || view === "novex";
  const shouldLoadCitations =
    !isGuest && (shouldLoadOverview || view === "operations");
  const shouldLoadMine = !isGuest && (shouldLoadOverview || view === "mine");

  const [overviewResult, researchResult, novexResult, citationsResult, mineResult] =
    await Promise.all([
      shouldLoadOverview
        ? getHallOfFameOverviewResponse({
            viewerRole: session.user.role,
            isGuest,
          }).catch(() => undefined)
        : Promise.resolve(undefined),
      shouldLoadResearch
        ? getResearchHallOfFameResponse().catch(() => undefined)
        : Promise.resolve(undefined),
      shouldLoadNovex
        ? getHallOfFameNovexResponse().catch(() => undefined)
        : Promise.resolve(undefined),
      shouldLoadCitations
        ? getHallOfFameCitationPage({
            viewerRole: session.user.role,
            ...(view === "operations" && operationCategory
              ? { category: operationCategory }
              : {}),
            ...(view === "operations" && operationCursor
              ? { cursor: operationCursor }
              : {}),
          }).catch(() => undefined)
        : Promise.resolve(undefined),
      shouldLoadMine
        ? getHallOfFameMineResponse({
            userId: session.user.id,
            viewerRole: session.user.role,
          }).catch(() => undefined)
        : Promise.resolve(undefined),
    ]);

  const initialOverviewData = overviewResult;
  const initialOverviewDataUpdatedAt = initialOverviewData
    ? new Date(initialOverviewData.generatedAt).getTime()
    : undefined;
  const initialData = researchResult;
  const initialDataUpdatedAt = initialData
    ? new Date(initialData.generatedAt).getTime()
    : undefined;
  const initialNovexData = novexResult;
  const initialNovexDataUpdatedAt = initialNovexData
    ? new Date(initialNovexData.generatedAt).getTime()
    : undefined;
  const initialCitationsData = citationsResult;
  const initialCitationsDataUpdatedAt = initialCitationsData
    ? new Date(initialCitationsData.generatedAt).getTime()
    : undefined;
  const initialMineData = mineResult;
  // mine 단독 조회에는 generatedAt이 없으므로 Query의 초기 seed 시각을 사용한다.
  const initialMineDataUpdatedAt = initialMineData
    ? initialCitationsDataUpdatedAt ??
      initialNovexDataUpdatedAt ??
      initialDataUpdatedAt
    : undefined;

  return (
    <div className={styles.page} data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "HALL OF FAME" },
        ]}
        className={styles.page__toolbar}
        title="명예의 전당"
        right={<Tag tone="gold">OFFICIAL · LIVING ARCHIVE</Tag>}
      />
      <HallOfFameClient
        initialOverviewData={initialOverviewData}
        initialOverviewDataUpdatedAt={initialOverviewDataUpdatedAt}
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
        initialNovexData={initialNovexData}
        initialNovexDataUpdatedAt={initialNovexDataUpdatedAt}
        initialCitationsData={initialCitationsData}
        initialCitationsDataUpdatedAt={initialCitationsDataUpdatedAt}
        initialMineData={initialMineData}
        initialMineDataUpdatedAt={initialMineDataUpdatedAt}
        isGuest={isGuest}
      />
    </div>
  );
}
