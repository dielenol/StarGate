import type {
  MasterItem,
  SessionReport,
  WikiPage,
} from "@stargate/shared-db/types";

import {
  extractSessionKeys,
  sortRelatedWikiLinks,
  toRelatedReportLink,
  toRelatedWikiLink,
  type RelatedReportLink,
  type RelatedWikiLink,
} from "@/lib/lore-links";

const GENERIC_CATALOG_TAGS = new Set([
  "장비",
  "무기",
  "방어구",
  "소모품",
  "샘플",
  "재료",
  "연구재료",
  "특수",
  "물증",
  "격리장비",
]);

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase();
}

function includesTerm(haystack: string, term: string): boolean {
  return haystack.toLowerCase().includes(normalizeTerm(term));
}

function itemTextValues(item: MasterItem): string[] {
  return [
    item.slug,
    item.name,
    item.nameEn,
    item.description,
    item.damage,
    item.effect,
    item.lore?.background,
    item.lore?.acquisition,
    item.lore?.notes,
    item.loreMd,
    ...(item.tags ?? []),
  ].filter((value): value is string => Boolean(value));
}

export function catalogItemSessionKeys(item: MasterItem): string[] {
  return extractSessionKeys(...itemTextValues(item));
}

export function catalogItemSearchTerms(item: MasterItem): string[] {
  const sessionKeys = new Set(catalogItemSessionKeys(item));
  const terms = new Set<string>();

  for (const value of [item.slug, item.name, item.nameEn]) {
    if (value && value.trim().length >= 2) terms.add(value.trim());
  }

  for (const tag of item.tags ?? []) {
    const normalized = tag.trim();
    if (!normalized) continue;
    if (sessionKeys.has(normalized.toUpperCase())) continue;
    if (GENERIC_CATALOG_TAGS.has(normalized)) continue;
    if (normalized.length < 2) continue;
    terms.add(normalized);
  }

  return [...terms];
}

export function relatedWikiForCatalogItem(
  item: MasterItem,
  pages: WikiPage[],
): RelatedWikiLink[] {
  const terms = catalogItemSearchTerms(item);
  if (terms.length === 0) return [];

  return pages
    .filter((page) => {
      const tagText = page.tags.join(" ");
      const haystack = `${page.title} ${page.content} ${tagText}`;
      return terms.some((term) => includesTerm(haystack, term));
    })
    .map(toRelatedWikiLink)
    .filter((page): page is RelatedWikiLink => page !== null)
    .sort(sortRelatedWikiLinks);
}

export function relatedReportsForCatalogItem(
  item: MasterItem,
  reports: SessionReport[],
): RelatedReportLink[] {
  const sessionKeys = new Set(catalogItemSessionKeys(item));
  const terms = catalogItemSearchTerms(item);

  if (sessionKeys.size === 0 && terms.length === 0) return [];

  return reports
    .filter((report) => {
      const reportKeys = extractSessionKeys(
        report.sessionId,
        report.sessionTitle,
        report.summary,
        ...report.highlights,
      );
      if (reportKeys.some((key) => sessionKeys.has(key))) return true;

      const reportText = [
        report.sessionId,
        report.sessionTitle,
        report.summary,
        ...report.highlights,
        ...report.participants,
        report.locationLabel,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ");

      return terms.some((term) => includesTerm(reportText, term));
    })
    .map(toRelatedReportLink)
    .filter((report): report is RelatedReportLink => report !== null)
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
}
