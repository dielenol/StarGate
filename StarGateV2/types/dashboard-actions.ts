export type DashboardActionTone = "gold" | "info" | "danger" | "default";

export type DashboardActionDomainKey = "workshop" | "trades" | "research";

export interface DashboardActionItem {
  id: string;
  label: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: DashboardActionTone;
  deadlineAt: string | null;
}

export interface DashboardActionDomain {
  key: DashboardActionDomainKey;
  label: string;
  href: string;
  /** 조회 실패 시 0으로 오인하지 않도록 null을 사용한다. */
  count: number | null;
}

export interface DashboardActionSummary {
  items: DashboardActionItem[];
  totalCount: number;
  domains: DashboardActionDomain[];
  unavailableDomains: DashboardActionDomainKey[];
}
