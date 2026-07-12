/**
 * 운영 중인 ERP 페이지의 노출을 일시 중단하는 UI 정책이다.
 * 인증/RBAC를 대체하지 않으며 각 API의 권한 계약은 기존 서버 가드가 계속 담당한다.
 */
export type ErpPageLockOverrides = Record<string, boolean>;

export interface LockableNavItem {
  label: string;
  href: string | null;
  gmHref?: string;
  lockKey?: string;
  preparing?: boolean;
  children?: LockableNavItem[];
}

export function resolvePageLockHref(
  item: Pick<LockableNavItem, "href" | "gmHref">,
  options: {
    isGM: boolean;
    locked: boolean;
    bypassLocks: boolean;
  },
): string | null {
  if (options.isGM && item.gmHref) return item.gmHref;
  if (options.bypassLocks) return item.href ?? item.gmHref ?? null;
  if (options.locked) return null;
  return item.href ?? item.gmHref ?? null;
}

function pathMatches(pathname: string, candidate: string): boolean {
  if (candidate === "/erp") return pathname === candidate;
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

export function getPageLockKey(item: LockableNavItem): string | null {
  return item.lockKey ?? item.gmHref ?? item.href;
}

export function isPageLocked(
  item: LockableNavItem,
  override?: boolean,
): boolean {
  return override ?? (item.preparing === true || item.href === null);
}

export function flattenLockableNavItems(
  items: LockableNavItem[],
): LockableNavItem[] {
  return items.flatMap((item) => [
    item,
    ...flattenLockableNavItems(item.children ?? []),
  ]);
}

export function resolvePageLockItems(
  items: LockableNavItem[],
  pathname: string,
): LockableNavItem[] {
  const pending = items.map((item) => ({ item, depth: 0 }));
  const matches: Array<{
    item: LockableNavItem;
    matchLength: number;
    depth: number;
  }> = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    const { item, depth } = current;
    const candidates = [item.lockKey, item.gmHref, item.href].filter(
      (value): value is string => typeof value === "string",
    );
    const matchLength = candidates.reduce(
      (longest, candidate) =>
        pathMatches(pathname, candidate)
          ? Math.max(longest, candidate.length)
          : longest,
      -1,
    );

    if (matchLength >= 0) matches.push({ item, matchLength, depth });

    pending.push(
      ...(item.children ?? []).map((child) => ({
        item: child,
        depth: depth + 1,
      })),
    );
  }

  return matches
    .sort(
      (left, right) =>
        left.matchLength - right.matchLength || left.depth - right.depth,
    )
    .map(({ item }) => item);
}

export function resolvePageLockItem(
  items: LockableNavItem[],
  pathname: string,
): LockableNavItem | null {
  return resolvePageLockItems(items, pathname).at(-1) ?? null;
}

export function isResolvedPageLocked(
  items: LockableNavItem[],
  pathname: string,
  overrides?: ErpPageLockOverrides,
): boolean {
  const item = resolvePageLockItem(items, pathname);
  if (!item) return false;
  const lockKey = getPageLockKey(item);
  return isPageLocked(item, lockKey ? overrides?.[lockKey] : undefined);
}
