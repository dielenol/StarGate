import type {
  MasterItem,
  SessionReport,
  WikiPage,
} from "@stargate/shared-db/types";

import { ITEM_CATEGORY_LABEL } from "@/lib/catalog/categories";
import {
  extractSessionKeys,
  sortRelatedWikiLinks,
  toRelatedReportLink,
  toRelatedWikiLink,
  type RelatedReportLink,
  type RelatedWikiLink,
} from "@/lib/lore-links";

export interface RelatedCatalogItemLink {
  key: string;
  name: string;
  category: MasterItem["category"];
  categoryLabel: string;
  effect?: string;
}

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

const CATALOG_CATEGORY_ORDER: MasterItem["category"][] = [
  "WEAPON",
  "ARMOR",
  "CONSUMABLE",
  "MATERIAL",
  "SPECIAL",
];

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

function reportTextValues(report: SessionReport): string[] {
  return [
    report.sessionId,
    report.sessionTitle,
    report.summary,
    ...report.highlights,
    ...report.participants,
    report.locationLabel,
  ].filter((value): value is string => Boolean(value));
}

function pageTextValues(page: WikiPage): string[] {
  return [page.title, page.content, page.category, ...page.tags].filter(
    (value): value is string => Boolean(value),
  );
}

function pageAllowsSessionKeyCatalogMatch(page: WikiPage): boolean {
  const category = page.category.toLowerCase();
  const title = page.title.toLowerCase();

  return (
    category.includes("작전") ||
    category.includes("보고서") ||
    category.includes("operation") ||
    category.includes("report") ||
    title.includes("작전") ||
    title.includes("보고서")
  );
}

function catalogItemKey(item: MasterItem): string | null {
  return item.slug?.trim() || item._id?.toString() || null;
}

function toRelatedCatalogItemLink(
  item: MasterItem,
): RelatedCatalogItemLink | null {
  const key = catalogItemKey(item);
  if (!key) return null;

  return {
    key,
    name: item.name,
    category: item.category,
    categoryLabel: ITEM_CATEGORY_LABEL[item.category] ?? item.category,
    effect: item.effect,
  };
}

function sortRelatedCatalogItemLinks(
  left: RelatedCatalogItemLink,
  right: RelatedCatalogItemLink,
): number {
  const leftRank = CATALOG_CATEGORY_ORDER.indexOf(left.category);
  const rightRank = CATALOG_CATEGORY_ORDER.indexOf(right.category);
  const safeLeftRank =
    leftRank === -1 ? CATALOG_CATEGORY_ORDER.length : leftRank;
  const safeRightRank =
    rightRank === -1 ? CATALOG_CATEGORY_ORDER.length : rightRank;

  if (safeLeftRank !== safeRightRank) return safeLeftRank - safeRightRank;
  return left.name.localeCompare(right.name, "ko");
}

function itemMatchesContext(
  item: MasterItem,
  contextText: string,
  contextSessionKeys: Set<string>,
  options: { allowSessionKeyMatch?: boolean } = {},
): boolean {
  const itemSessionKeys = catalogItemSessionKeys(item);
  if (
    options.allowSessionKeyMatch !== false &&
    itemSessionKeys.some((key) => contextSessionKeys.has(key))
  ) {
    return true;
  }

  return catalogItemSearchTerms(item).some((term) =>
    includesTerm(contextText, term),
  );
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

export function relatedCatalogItemsForReport(
  report: SessionReport,
  items: MasterItem[],
): RelatedCatalogItemLink[] {
  const contextValues = reportTextValues(report);
  const contextText = contextValues.join(" ");
  const contextSessionKeys = new Set(extractSessionKeys(...contextValues));

  return items
    .filter((item) =>
      itemMatchesContext(item, contextText, contextSessionKeys, {
        allowSessionKeyMatch: true,
      }),
    )
    .map(toRelatedCatalogItemLink)
    .filter((item): item is RelatedCatalogItemLink => item !== null)
    .sort(sortRelatedCatalogItemLinks);
}

export function relatedCatalogItemsForWiki(
  page: WikiPage,
  items: MasterItem[],
): RelatedCatalogItemLink[] {
  const contextValues = pageTextValues(page);
  const contextText = contextValues.join(" ");
  const contextSessionKeys = new Set(extractSessionKeys(...contextValues));
  const allowSessionKeyMatch = pageAllowsSessionKeyCatalogMatch(page);

  return items
    .filter((item) =>
      itemMatchesContext(item, contextText, contextSessionKeys, {
        allowSessionKeyMatch,
      }),
    )
    .map(toRelatedCatalogItemLink)
    .filter((item): item is RelatedCatalogItemLink => item !== null)
    .sort(sortRelatedCatalogItemLinks);
}
