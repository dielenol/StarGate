import type {
  Character,
  SessionReport,
  WikiPage,
} from "@stargate/shared-db/types";

import { formatOperationReportTitle } from "./format/session-report";

export interface RelatedWikiLink {
  id: string;
  title: string;
  category: string;
}

export interface RelatedPersonnelLink {
  id: string;
  codename: string;
  name: string;
  role: string;
  type: Character["type"];
  agentLevel?: Character["agentLevel"];
  aliases?: string[];
}

export interface RelatedReportLink {
  id: string;
  sessionId: string;
  title: string;
  locationLabel?: string;
  participants: string[];
  createdAt: Date;
}

const WIKI_CATEGORY_ORDER = [
  "작전 보고서",
  "개체",
  "줄루",
  "개념",
  "세력",
  "기관",
  "장소",
  "인물",
  "규정",
  "장비",
  "소모품",
  "문헌",
];

const EXACT_SESSION_KEY_PATTERN =
  /NOSB-[A-Z0-9]+(?:-[A-Z0-9]+)*|(?:[A-Z0-9]+-)?S\d+E\d+(?:-[A-Z0-9]+)+/giu;

export function extractSessionKeys(...values: string[]): string[] {
  const keys = new Set<string>();
  const source = values.join(" ");
  const matches = source.match(/S\d+E\d+/giu) ?? [];

  for (const match of matches) {
    keys.add(match.toUpperCase());
  }

  return [...keys];
}

export function extractExactSessionKeys(...values: string[]): string[] {
  const keys = new Set<string>();
  const source = values.join(" ");
  const matches = source.match(EXACT_SESSION_KEY_PATTERN) ?? [];

  for (const match of matches) {
    const normalized = match.toUpperCase();
    keys.add(normalized);

    const shorthand = normalized.match(/S\d+E\d+(?:-[A-Z0-9]+)+$/u)?.[0];
    if (shorthand) keys.add(shorthand);
  }

  return [...keys];
}

function intersects(left: Iterable<string>, right: Iterable<string>): boolean {
  const rightSet = new Set(right);
  for (const value of left) {
    if (rightSet.has(value)) return true;
  }
  return false;
}

function wikiPageId(page: Pick<WikiPage, "_id">): string | null {
  return page._id?.toString() ?? null;
}

function reportId(report: Pick<SessionReport, "_id">): string | null {
  return report._id?.toString() ?? null;
}

function characterId(character: Pick<Character, "_id">): string | null {
  return character._id?.toString() ?? null;
}

function pageSessionKeys(page: Pick<WikiPage, "tags" | "title" | "content">): string[] {
  return extractSessionKeys(page.title, page.content, ...page.tags);
}

function pageExactSessionKeys(
  page: Pick<WikiPage, "tags" | "title" | "content">,
): string[] {
  return extractExactSessionKeys(page.title, page.content, ...page.tags);
}

function normalizePersonnelKey(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function characterParticipantKeys(character: Character): string[] {
  const keys = new Set<string>();

  for (const value of [
    character.codename,
    character.lore.name,
    ...(character.lore.loreTags ?? []),
  ]) {
    const normalized = normalizePersonnelKey(value);
    if (normalized) keys.add(normalized);
  }

  const baseCodename = character.codename.split(/[-(]/u)[0];
  const normalizedBase = normalizePersonnelKey(baseCodename);
  if (normalizedBase) keys.add(normalizedBase);

  return [...keys];
}

function pageMatchesReport(
  page: WikiPage,
  sessionKeys: string[],
  exactSessionKeys: string[],
  displayTitle: string,
): boolean {
  if (page.title === displayTitle) return true;

  const pageExactKeys = pageExactSessionKeys(page);
  if (exactSessionKeys.length > 0 || pageExactKeys.length > 0) {
    return intersects(pageExactKeys, exactSessionKeys);
  }

  if (sessionKeys.length === 0) return false;

  const tags = page.tags.map((tag) => tag.toUpperCase());
  const title = page.title.toUpperCase();
  const content = page.content.toUpperCase();

  return sessionKeys.some(
    (key) =>
      tags.includes(key) ||
      title.includes(key) ||
      content.includes(`관련 세션: ${key}`.toUpperCase()),
  );
}

export function toRelatedWikiLink(page: WikiPage): RelatedWikiLink | null {
  const id = wikiPageId(page);
  if (!id) return null;

  return {
    id,
    title: page.title,
    category: page.category,
  };
}

export function sortRelatedWikiLinks(
  left: RelatedWikiLink,
  right: RelatedWikiLink,
): number {
  const leftCategory = WIKI_CATEGORY_ORDER.indexOf(left.category);
  const rightCategory = WIKI_CATEGORY_ORDER.indexOf(right.category);
  const leftRank =
    leftCategory === -1 ? WIKI_CATEGORY_ORDER.length : leftCategory;
  const rightRank =
    rightCategory === -1 ? WIKI_CATEGORY_ORDER.length : rightCategory;

  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.title.localeCompare(right.title, "ko");
}

export function relatedWikiForReport(
  report: SessionReport,
  allPages: WikiPage[],
): RelatedWikiLink[] {
  const displayTitle = formatOperationReportTitle(report.sessionTitle);
  const sessionKeys = extractSessionKeys(report.sessionId, displayTitle);
  const exactSessionKeys = extractExactSessionKeys(
    report.sessionId,
    report.sessionTitle,
    displayTitle,
  );

  return allPages
    .filter((page) =>
      pageMatchesReport(page, sessionKeys, exactSessionKeys, displayTitle),
    )
    .map(toRelatedWikiLink)
    .filter((page): page is RelatedWikiLink => page !== null)
    .sort(sortRelatedWikiLinks);
}

export function toRelatedPersonnelLink(
  character: Character,
): RelatedPersonnelLink | null {
  const id = characterId(character);
  if (!id) return null;

  return {
    id,
    codename: character.codename,
    name: character.lore.name || character.codename,
    role: character.role,
    type: character.type,
    agentLevel: character.agentLevel,
    aliases: character.lore.loreTags ?? [],
  };
}

export function relatedPersonnelForReport(
  report: SessionReport,
  characters: Character[],
): RelatedPersonnelLink[] {
  const participantKeys = new Set(
    report.participants.map(normalizePersonnelKey).filter(Boolean),
  );

  return characters
    .filter((character) =>
      character.lore.appearsInEvents?.includes(report.sessionId) ||
      characterParticipantKeys(character).some((key) => participantKeys.has(key)),
    )
    .map(toRelatedPersonnelLink)
    .filter((character): character is RelatedPersonnelLink => character !== null)
    .sort((left, right) => {
      if (left.type !== right.type) return left.type.localeCompare(right.type);
      return left.codename.localeCompare(right.codename, "en");
    });
}

export function toRelatedReportLink(
  report: SessionReport,
): RelatedReportLink | null {
  const id = reportId(report);
  if (!id) return null;

  return {
    id,
    sessionId: report.sessionId,
    title: formatOperationReportTitle(report.sessionTitle),
    locationLabel: report.locationLabel,
    participants: report.participants,
    createdAt: report.createdAt,
  };
}

export function relatedReportsForWiki(
  page: WikiPage,
  reports: SessionReport[],
): RelatedReportLink[] {
  const exactKeys = new Set(pageExactSessionKeys(page));
  const keys = new Set(pageSessionKeys(page));
  if (keys.size === 0 && exactKeys.size === 0) return [];

  return reports
    .filter((report) => {
      const displayTitle = formatOperationReportTitle(report.sessionTitle);
      if (page.title === displayTitle) return true;

      const reportExactKeys = extractExactSessionKeys(
        report.sessionId,
        report.sessionTitle,
        displayTitle,
      );
      if (exactKeys.size > 0 || reportExactKeys.length > 0) {
        return intersects(reportExactKeys, exactKeys);
      }

      const reportKeys = extractSessionKeys(
        report.sessionId,
        report.sessionTitle,
      );
      return reportKeys.some((key) => keys.has(key));
    })
    .map(toRelatedReportLink)
    .filter((report): report is RelatedReportLink => report !== null)
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
}

export function relatedPersonnelForReports(
  reports: RelatedReportLink[],
  characters: Character[],
): RelatedPersonnelLink[] {
  const sessionIds = new Set(reports.map((report) => report.sessionId));
  const participantKeys = new Set(
    reports
      .flatMap((report) => report.participants)
      .map(normalizePersonnelKey)
      .filter(Boolean),
  );
  const seen = new Set<string>();

  return characters
    .filter((character) =>
      character.lore.appearsInEvents?.some((event) => sessionIds.has(event)) ||
      characterParticipantKeys(character).some((key) => participantKeys.has(key)),
    )
    .map(toRelatedPersonnelLink)
    .filter((character): character is RelatedPersonnelLink => {
      if (!character || seen.has(character.id)) return false;
      seen.add(character.id);
      return true;
    })
    .sort((left, right) => {
      if (left.type !== right.type) return left.type.localeCompare(right.type);
      return left.codename.localeCompare(right.codename, "en");
    });
}
