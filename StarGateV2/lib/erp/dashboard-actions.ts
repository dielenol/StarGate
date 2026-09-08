import type { UserRole } from "@/types/user";
import type {
  DashboardActionDomain,
  DashboardActionDomainKey,
  DashboardActionItem,
  DashboardActionSummary,
} from "@/types/dashboard-actions";

import type {
  DashboardActionBatch,
  ResearchDashboardActionCandidate,
  TradeDashboardActionCandidate,
  WorkshopDashboardActionCandidate,
} from "../db/dashboard-actions";

const ACTION_PREVIEW_LIMIT = 8;
const URGENT_DEADLINE_MS = 60 * 60 * 1_000;

const DOMAIN_META: Record<
  DashboardActionDomainKey,
  { label: string; href: string }
> = {
  workshop: { label: "공방", href: "/erp/equipment-shop/custom" },
  trades: { label: "거래", href: "/erp/trades" },
  research: { label: "연구", href: "/erp/research" },
};

type DomainLoad<T> =
  | { ok: true; value: DashboardActionBatch<T> }
  | { ok: false };

export interface DashboardActionLoads {
  workshop: DomainLoad<WorkshopDashboardActionCandidate>;
  trades: DomainLoad<TradeDashboardActionCandidate>;
  research: DomainLoad<ResearchDashboardActionCandidate>;
}

interface RankedDashboardAction extends DashboardActionItem {
  priority: number;
  sortAt: number;
}

export interface GetDashboardActionSummaryInput {
  userId: string | null;
  viewerRole: UserRole;
  mainCharacterId: string | null;
  username?: string;
  now?: Date;
}

function rankedWorkshopAction(
  item: WorkshopDashboardActionCandidate,
): RankedDashboardAction {
  const href = `/erp/equipment-shop/custom?requestId=${encodeURIComponent(item.id)}`;
  const identity = `${item.characterCodename} · ${item.subject}`;
  switch (item.state) {
    case "OWNER_QUOTE":
      return {
        id: `workshop:${item.id}:quote`,
        label: "공방 견적",
        title: `${item.subject} 견적 검토`,
        detail: `${identity} · 새 견적의 비용과 결과물을 확인하세요.`,
        href,
        cta: "견적 열기",
        tone: "gold",
        deadlineAt: null,
        priority: 20,
        sortAt: item.updatedAt.getTime(),
      };
    case "OWNER_COMPLETION_CHECK":
      return {
        id: `workshop:${item.id}:completion`,
        label: "공방 완료",
        title: `${item.subject} 수령 조건 확인`,
        detail: `${identity} · 제작 시간이 끝났습니다. 최종 수령 조건을 확인하세요.`,
        href,
        cta: "공방 열기",
        tone: "gold",
        deadlineAt: null,
        priority: 30,
        sortAt: item.updatedAt.getTime(),
      };
    case "OWNER_CONDITION_INVALID":
      return {
        id: `workshop:${item.id}:condition`,
        label: "공방 확인",
        title: `${item.subject} 완료 조건 재확인`,
        detail: `${identity} · 수령 조건 일부를 확인할 수 없습니다. 공방 상태를 다시 확인하세요.`,
        href,
        cta: "상태 확인",
        tone: "danger",
        deadlineAt: null,
        priority: 10,
        sortAt: item.updatedAt.getTime(),
      };
    case "GM_REVIEW":
      return {
        id: `workshop:${item.id}:review`,
        label: "공방 운영",
        title: `${item.characterCodename} 요청 검토`,
        detail: `${item.subject} 의뢰가 운영 검토를 기다리고 있습니다.`,
        href: `/erp/admin/equipment-workshop?requestId=${encodeURIComponent(item.id)}`,
        cta: "검토 시작",
        tone: "info",
        deadlineAt: null,
        priority: 40,
        sortAt: item.updatedAt.getTime(),
      };
    case "GM_QUOTE":
      return {
        id: `workshop:${item.id}:quote-issue`,
        label: "공방 운영",
        title: `${item.characterCodename} 견적 발행`,
        detail: `${item.subject} 의뢰의 검토가 시작됐습니다. 견적을 확정하세요.`,
        href: `/erp/admin/equipment-workshop?requestId=${encodeURIComponent(item.id)}`,
        cta: "견적 작성",
        tone: "info",
        deadlineAt: null,
        priority: 35,
        sortAt: item.updatedAt.getTime(),
      };
    case "GM_RELOAD_APPROVAL":
      return {
        id: `workshop:${item.id}:reload`,
        label: "공방 운영",
        title: `${item.characterCodename} 재장전 승인`,
        detail: `${item.subject} 재장전 요청의 승인 여부를 결정하세요.`,
        href: `/erp/admin/equipment-workshop?requestId=${encodeURIComponent(item.id)}`,
        cta: "승인 검토",
        tone: "info",
        deadlineAt: null,
        priority: 35,
        sortAt: item.updatedAt.getTime(),
      };
  }
}

function rankedTradeAction(
  item: TradeDashboardActionCandidate,
): RankedDashboardAction {
  return {
    id: `trade:${item.id}:confirm`,
    label: "자산 교환",
    title: `${item.counterpartyName}님과 교환 확인`,
    detail: item.otherConfirmed
      ? "상대가 현재 조건을 확정했습니다. 최신 구성을 검토하고 내 확정을 진행하세요."
      : "현재 교환 구성을 검토하고 내 확정 여부를 결정하세요.",
    href: `/erp/trades?tradeId=${encodeURIComponent(item.id)}`,
    cta: "교환 열기",
    tone: item.otherConfirmed ? "gold" : "default",
    deadlineAt: null,
    priority: item.otherConfirmed ? 15 : 45,
    sortAt: item.updatedAt.getTime(),
  };
}

function rankedResearchAction(
  item: ResearchDashboardActionCandidate,
  now: Date,
): RankedDashboardAction {
  const remainingMs = item.claimDeadline.getTime() - now.getTime();
  return {
    id: `research:${item.id}:claim`,
    label: "연구 수령",
    title: `${item.outputName} 수령`,
    detail:
      remainingMs <= URGENT_DEADLINE_MS
        ? "개인 연구 산출물의 수령 기한이 1시간 이내로 남았습니다."
        : "개인 연구 산출물이 준비됐습니다. 수령 기한 전에 인계받으세요.",
    href: `/erp/research?jobId=${encodeURIComponent(item.id)}`,
    cta: "연구 수령",
    tone: remainingMs <= URGENT_DEADLINE_MS ? "danger" : "gold",
    deadlineAt: item.claimDeadline.toISOString(),
    priority: remainingMs <= URGENT_DEADLINE_MS ? 0 : 12,
    sortAt: item.claimDeadline.getTime(),
  };
}

function domainSummary<T>(
  key: DashboardActionDomainKey,
  load: DomainLoad<T>,
  href = DOMAIN_META[key].href,
): DashboardActionDomain | null {
  if (!load.ok) {
    return { key, label: DOMAIN_META[key].label, href, count: null };
  }
  if (load.value.totalCount === 0) return null;
  return {
    key,
    label: DOMAIN_META[key].label,
    href,
    count: load.value.totalCount,
  };
}

function publicAction(item: RankedDashboardAction): DashboardActionItem {
  return {
    id: item.id,
    label: item.label,
    title: item.title,
    detail: item.detail,
    href: item.href,
    cta: item.cta,
    tone: item.tone,
    deadlineAt: item.deadlineAt,
  };
}

export function buildDashboardActionSummary(
  loads: DashboardActionLoads,
  now: Date,
  workshopHref?: string,
): DashboardActionSummary {
  const unavailableDomains = (
    Object.entries(loads) as Array<
      [DashboardActionDomainKey, DomainLoad<unknown>]
    >
  ).flatMap(([key, load]) => (load.ok ? [] : [key]));
  const ranked: RankedDashboardAction[] = [
    ...(loads.workshop.ok
      ? loads.workshop.value.items.map(rankedWorkshopAction)
      : []),
    ...(loads.trades.ok
      ? loads.trades.value.items.map(rankedTradeAction)
      : []),
    ...(loads.research.ok
      ? loads.research.value.items
          .filter((item) => item.claimDeadline.getTime() > now.getTime())
          .map((item) => rankedResearchAction(item, now))
      : []),
  ].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.sortAt - right.sortAt ||
      left.id.localeCompare(right.id, "en"),
  );
  const domains = (
    Object.entries(loads) as Array<
      [DashboardActionDomainKey, DomainLoad<unknown>]
    >
  ).flatMap(([key, load]) => {
    const workshopAdminHref =
      key === "workshop" &&
      loads.workshop.ok &&
      loads.workshop.value.items.some((item) => item.state.startsWith("GM_"))
        ? "/erp/admin/equipment-workshop"
        : undefined;
    const summary = domainSummary(key, load, key === "workshop" ? workshopHref ?? workshopAdminHref : undefined);
    return summary ? [summary] : [];
  });
  const totalCount = Object.values(loads).reduce(
    (sum, load) => sum + (load.ok ? load.value.totalCount : 0),
    0,
  );

  return {
    items: ranked.slice(0, ACTION_PREVIEW_LIMIT).map(publicAction),
    totalCount,
    domains,
    unavailableDomains,
  };
}

function rejectedLoad(): { ok: false } {
  return { ok: false };
}

export async function getDashboardActionSummary(
  input: GetDashboardActionSummaryInput,
): Promise<DashboardActionSummary> {
  const now = input.now ?? new Date();
  if (!input.userId || (input.viewerRole !== "GM" && !input.mainCharacterId)) {
    return buildDashboardActionSummary(
      {
        workshop: { ok: true, value: { items: [], totalCount: 0 } },
        trades: { ok: true, value: { items: [], totalCount: 0 } },
        research: { ok: true, value: { items: [], totalCount: 0 } },
      },
      now,
    );
  }

  const isGM = input.viewerRole === "GM";
  const workshopHref = isGM ? "/erp/admin/equipment-workshop" : DOMAIN_META.workshop.href;
  const empty = { items: [], totalCount: 0 };
  // 목적지에서 운영 잠금으로 막힐 업무는 조회하지 않는다. 테스트 예외도 기존 정책만 사용한다.
  const [{ isNavPathLocked }, { getErpPageLockOverrides }, { hasPlayerServiceTestPathAccess }] = await Promise.all([
    import("@/components/erp/nav-config"),
    import("@/lib/db/erp-page-locks"),
    import("@/lib/auth/player-service-test-access"),
  ]);
  const lockResult = isGM
    ? { ok: true as const, value: {} }
    : await getErpPageLockOverrides().then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const }),
      );
  const viewer = { role: input.viewerRole, username: input.username };
  const canOpen = (path: string) => isGM || hasPlayerServiceTestPathAccess(viewer, path)
    || (lockResult.ok && !isNavPathLocked(path, lockResult.value));
  if (!lockResult.ok) {
    return buildDashboardActionSummary({ workshop: rejectedLoad(), trades: rejectedLoad(), research: rejectedLoad() }, now, workshopHref);
  }
  const db = await import("@/lib/db/dashboard-actions");
  const [workshop, trades, research] = await Promise.allSettled([
    canOpen(workshopHref) ? db.readDashboardWorkshopActions({
      userId: input.userId,
      // GM의 개인 공방 화면에는 소유자 수령/수락 UI가 없다. 운영 접수함만 집계한다.
      mainCharacterId: isGM ? null : input.mainCharacterId,
      includeAdmin: isGM,
      now,
    }) : empty,
    canOpen(DOMAIN_META.trades.href) ? db.readDashboardTradeActions({
      userId: input.userId,
      mainCharacterId: input.mainCharacterId,
    }) : empty,
    canOpen(DOMAIN_META.research.href) ? db.readDashboardResearchActions({
      userId: input.userId,
      mainCharacterId: input.mainCharacterId,
      now,
    }) : empty,
  ]);

  return buildDashboardActionSummary(
    {
      workshop:
        workshop.status === "fulfilled"
          ? { ok: true, value: workshop.value }
          : rejectedLoad(),
      trades:
        trades.status === "fulfilled"
          ? { ok: true, value: trades.value }
          : rejectedLoad(),
      research:
        research.status === "fulfilled"
          ? { ok: true, value: research.value }
          : rejectedLoad(),
    },
    now,
    workshopHref,
  );
}
