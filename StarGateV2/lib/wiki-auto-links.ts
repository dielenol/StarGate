import type {
  Character,
  MasterItem,
  SessionReport,
  WikiPage,
} from "@stargate/shared-db/types";

import type { MarkdownLinkTarget } from "./wiki-render";
import { formatOperationReportTitle } from "./format/session-report";

interface BuildWikiAutoLinkTargetsInput {
  catalogItems: MasterItem[];
  characters: Character[];
  currentWikiPageId?: string;
  reports: SessionReport[];
  wikiPages: WikiPage[];
}

const CODE_ALIAS_PATTERN =
  /^(?:[A-Z]{2,}(?:[-_][A-Z0-9]+)*|ZULU-\d{2,4}|NOSB-S\d+E\d+(?:-[A-Z0-9]+)*|S\d+E\d+(?:-[A-Z0-9]+)*)$/u;

const LOW_SIGNAL_ALIASES = new Set([
  "S1E1",
  "NOSB-S1E1",
  "MANUS",
  "NOVUS ORDO",
  "[CLASSIFIED]",
  "노부스 오르도",
  "줄루",
  "세션로그",
  "정보",
  "기록",
  "현장요원",
]);

function idString(value: { _id?: unknown }): string | null {
  return value._id?.toString() ?? null;
}

function itemKey(item: MasterItem): string | null {
  return item.slug ?? idString(item);
}

function normalizeAlias(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function isCodeAlias(value: string): boolean {
  return CODE_ALIAS_PATTERN.test(value.toUpperCase());
}

function hasHangul(value: string): boolean {
  return /\p{Script=Hangul}/u.test(value);
}

function isHighSignalAlias(value: string, options?: { allowShortHangul?: boolean }): boolean {
  const alias = normalizeAlias(value);
  if (!alias) return false;
  if (LOW_SIGNAL_ALIASES.has(alias.toUpperCase()) || LOW_SIGNAL_ALIASES.has(alias)) {
    return false;
  }
  if (isCodeAlias(alias)) return true;
  if (hasHangul(alias)) return alias.length >= (options?.allowShortHangul ? 2 : 3);
  return alias.length >= 4;
}

function uniqueAliases(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const alias = normalizeAlias(value ?? "");
    if (!alias) continue;
    const key = alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
  }

  return result;
}

function pushTarget(
  targets: MarkdownLinkTarget[],
  target: MarkdownLinkTarget,
): void {
  const keywords = uniqueAliases(target.keywords).filter((alias) =>
    isHighSignalAlias(alias, {
      allowShortHangul: target.kind === "personnel",
    }),
  );
  if (keywords.length === 0) return;

  targets.push({ ...target, keywords });
}

export function buildWikiAutoLinkTargets({
  catalogItems,
  characters,
  currentWikiPageId,
  reports,
  wikiPages,
}: BuildWikiAutoLinkTargetsInput): MarkdownLinkTarget[] {
  const targets: MarkdownLinkTarget[] = [];

  for (const report of reports) {
    const id = idString(report);
    if (!id) continue;

    pushTarget(targets, {
      href: `/erp/sessions/report/${id}`,
      kind: "report",
      keywords: [
        report.sessionId,
        report.sessionTitle,
        formatOperationReportTitle(report.sessionTitle),
      ],
      priority: 90,
      title: "작전 보고서",
    });
  }

  for (const character of characters) {
    const id = idString(character);
    if (!id) continue;

    pushTarget(targets, {
      href: `/erp/personnel/${id}`,
      kind: "personnel",
      keywords: [
        character.codename,
        character.lore.name,
        character.lore.nameNative,
        character.lore.nickname,
        character.lore.nameEn,
      ],
      priority: 80,
      title: "신원조회",
    });
  }

  for (const page of wikiPages) {
    const id = idString(page);
    if (!id || id === currentWikiPageId) continue;

    pushTarget(targets, {
      href: `/erp/wiki/${id}`,
      kind: "wiki",
      keywords: [
        page.title,
        ...page.tags.filter((tag) => isCodeAlias(normalizeAlias(tag))),
      ],
      priority: 70,
      title: page.category,
    });
  }

  for (const item of catalogItems) {
    const key = itemKey(item);
    if (!key) continue;

    pushTarget(targets, {
      href: `/erp/wiki/catalog/item/${encodeURIComponent(key)}`,
      kind: "catalog",
      keywords: [
        item.name,
        item.nameEn,
        item.slug,
        ...(item.tags ?? []).filter((tag) => isCodeAlias(normalizeAlias(tag))),
      ],
      priority: 60,
      title: "카탈로그",
    });
  }

  return targets;
}
