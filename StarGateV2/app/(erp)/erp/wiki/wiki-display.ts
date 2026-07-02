import type { TagTone } from "@/components/ui/Tag/Tag";
import type { WikiPage } from "@/types/wiki";

export interface WikiInfoboxImage {
  src: string;
  alt: string;
  caption: string;
}

export interface WikiInfoRow {
  label: string;
  value: string;
}

export interface WikiRelatedLink {
  id: string;
  title: string;
  category: string;
  relation: "문서 언급" | "같은 세션";
}

interface ExplicitRelatedReference {
  key: string;
  kind: "wiki" | "external";
}

const CATEGORY_TONES: Record<string, TagTone> = {
  개념: "info",
  개체: "danger",
  줄루: "danger",
  기관: "p2",
  사건: "p1",
  세력: "rank-v",
  세션: "gold",
  장소: "rank-h",
  절차: "success",
  규정: "success",
  작전기록: "gold",
  "작전 보고서": "gold",
  인물: "rank-a",
  장비: "rank-m",
  물품: "p2",
  소모품: "rank-u",
};

const WIKI_CATEGORY_ORDER = [
  "작전 보고서",
  "개체",
  "줄루",
  "개념",
  "세력",
  "기관",
  "장소",
  "규정",
  "인물",
  "장비",
  "물품",
  "소모품",
  "문헌",
];

const LOW_SIGNAL_TAGS = new Set([
  "세션로그",
  "현장요원",
  "격리",
  "은폐",
]);

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

export function wikiCategoryTone(category: string): TagTone {
  return CATEGORY_TONES[category] ?? "default";
}

export function sortWikiCategories(categories: string[]): string[] {
  return [...categories].sort((left, right) => {
    const leftIndex = WIKI_CATEGORY_ORDER.indexOf(left);
    const rightIndex = WIKI_CATEGORY_ORDER.indexOf(right);
    const leftRank =
      leftIndex === -1 ? WIKI_CATEGORY_ORDER.length : leftIndex;
    const rightRank =
      rightIndex === -1 ? WIKI_CATEGORY_ORDER.length : rightIndex;

    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right, "ko");
  });
}

function isLocalAssetImage(src: string): boolean {
  const trimmed = src.trim();
  if (trimmed.includes("..")) return false;
  return /^\/assets\/[A-Za-z0-9/_ .%()-]+\.(webp|png|jpe?g|gif|avif)$/i.test(
    trimmed,
  );
}

function markdownImageFromLine(line: string): WikiInfoboxImage | null {
  const match = line
    .trim()
    .match(/^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/);
  if (!match || !isLocalAssetImage(match[2])) return null;

  const alt = stripInlineMarkdown(match[1].trim());
  const caption = stripInlineMarkdown((match[3] ?? match[1]).trim());

  return {
    src: match[2].trim(),
    alt,
    caption,
  };
}

function normalizePageTitle(value: string): string {
  return stripInlineMarkdown(value)
    .replace(/[「」『』"'`]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function cleanPlainLine(value: string): string {
  return stripInlineMarkdown(value)
    .replace(/^[-*]\s*/, "")
    .replace(/^·\s*/, "")
    .trim();
}

function extractSectionLines(content: string, sectionName: string): string[] {
  const lines = content.split(/\r?\n/);
  const result: string[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,4})\s+(.+)$/);

    if (heading) {
      const title = stripInlineMarkdown(heading[2]).trim();
      if (title === sectionName) {
        inSection = true;
        continue;
      }
      if (inSection) break;
    }

    if (inSection) result.push(rawLine);
  }

  return result;
}

export function wikiKeywordTags(
  page: Pick<WikiPage, "category" | "tags" | "title">,
  maxCount = 2,
): string[] {
  const titleKey = normalizeLabel(page.title);
  const categoryKey = normalizeLabel(page.category);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of page.tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;

    const key = normalizeLabel(trimmed);
    if (
      seen.has(key) ||
      key === categoryKey ||
      key === titleKey ||
      LOW_SIGNAL_TAGS.has(trimmed)
    ) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
    if (result.length >= maxCount) break;
  }

  return result;
}

export function wikiSummary(content: string, maxLength = 180): string {
  const lines = content.split(/\r?\n/);
  let inOverview = false;
  let fallback = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#\s+/.test(line)) continue;

    if (/^##\s+개요\s*$/.test(line)) {
      inOverview = true;
      continue;
    }

    if (/^#{2,4}\s+/.test(line)) {
      if (inOverview && fallback) break;
      inOverview = false;
      continue;
    }

    if (/^NOSB\s+1\.pdf/i.test(line)) continue;
    if (/^!\[[^\]]*\]\(.+\)$/.test(line)) continue;

    const text = stripInlineMarkdown(line);
    if (!text) continue;

    if (inOverview) return truncate(text, maxLength);
    if (!fallback) fallback = text;
  }

  return fallback ? truncate(fallback, maxLength) : "요약 정보가 아직 정리되지 않았습니다.";
}

export function wikiLead(content: string, maxLength = 240): string {
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#{1,4}\s+/.test(line)) continue;
    if (markdownImageFromLine(line)) continue;
    if (/^-{3,}\s*$/.test(line)) continue;

    const text = cleanPlainLine(line);
    return truncate(text, maxLength);
  }

  return "";
}

export function wikiFirstImage(content: string): WikiInfoboxImage | null {
  for (const rawLine of content.split(/\r?\n/)) {
    const image = markdownImageFromLine(rawLine);
    if (image) return image;
  }

  return null;
}

export function wikiArticleContent(content: string, title: string): string {
  let titleRemoved = false;
  let imageRemoved = false;
  let skippingSummary = false;

  const lines = content.split(/\r?\n/).filter((rawLine) => {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,4}\s+(.+)$/);

    if (skippingSummary) {
      if (heading) {
        skippingSummary = false;
      } else {
        return false;
      }
    }

    if (!titleRemoved) {
      if (heading && normalizePageTitle(heading[1]) === normalizePageTitle(title)) {
        titleRemoved = true;
        return false;
      }
    }

    if (heading && stripInlineMarkdown(heading[1]).trim() === "요약 정보") {
      skippingSummary = true;
      return false;
    }

    if (!imageRemoved && markdownImageFromLine(line)) {
      imageRemoved = true;
      return false;
    }

    return true;
  });

  const lead = wikiLead(content);
  const leadIndex = lines.findIndex((rawLine) => {
    const line = rawLine.trim();
    if (!line) return false;
    if (/^#{1,4}\s+/.test(line)) return false;
    if (markdownImageFromLine(line)) return false;
    if (/^-{3,}\s*$/.test(line)) return false;
    return cleanPlainLine(line) === lead;
  });

  if (lead && leadIndex >= 0) {
    const hasMoreBody = lines.slice(leadIndex + 1).some((rawLine) => {
      const line = rawLine.trim();
      if (!line) return false;
      if (markdownImageFromLine(line)) return false;
      if (/^-{3,}\s*$/.test(line)) return false;
      return true;
    });

    if (hasMoreBody) {
      lines.splice(leadIndex, 1);
    }
  }

  return lines.join("\n").trimStart();
}

export function wikiInfoRows(page: WikiPage, maxCount = 10): WikiInfoRow[] {
  const summaryLines = extractSectionLines(page.content, "요약 정보");
  const rows: WikiInfoRow[] = [];
  const seen = new Set<string>();

  for (const rawLine of summaryLines) {
    const line = cleanPlainLine(rawLine);
    if (!line) continue;

    const splitIndex = line.search(/[:：]/);
    if (splitIndex <= 0) continue;

    const label = line.slice(0, splitIndex).trim();
    const value = line.slice(splitIndex + 1).trim();
    if (!label || !value) continue;

    const key = normalizeLabel(label);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ label, value });
    if (rows.length >= maxCount) break;
  }

  if (!seen.has("분류")) rows.unshift({ label: "분류", value: page.category });
  if (!seen.has("기록상태")) {
    rows.push({ label: "기록 상태", value: page.isPublic ? "PUBLIC" : "PRIVATE" });
  }

  return rows.slice(0, maxCount);
}

export function wikiSourceLines(content: string, maxCount = 3): string[] {
  return extractSectionLines(content, "출처")
    .map(cleanPlainLine)
    .filter(Boolean)
    .slice(0, maxCount);
}

function relatedReferenceFromValue(
  value: string,
): ExplicitRelatedReference | null {
  const trimmed = cleanPlainLine(value);
  if (!trimmed) return null;

  const qualified = trimmed.match(/^([a-z가-힣]+):(.+)$/iu);
  if (!qualified) return { kind: "wiki", key: trimmed };

  const prefix = normalizeLabel(qualified[1]);
  const key = cleanPlainLine(qualified[2]);
  if (!key) return null;

  if (prefix === "wiki" || prefix === "위키") {
    return { kind: "wiki", key };
  }

  return { kind: "external", key };
}

function explicitRelatedNames(content: string): string[] {
  const references: ExplicitRelatedReference[] = [];

  for (const rawLine of extractSectionLines(content, "관련 문서")) {
    const line = cleanPlainLine(rawLine);
    if (!line) continue;

    const explicitLinks = [
      ...line.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g),
    ];
    if (explicitLinks.length > 0) {
      for (const match of explicitLinks) {
        const reference = relatedReferenceFromValue(match[1]);
        if (reference) references.push(reference);
      }
      continue;
    }

    for (const part of line.split(/[,，、;|·]/)) {
      const reference = relatedReferenceFromValue(part);
      if (reference) references.push(reference);
    }
  }

  return references
    .filter((reference) => reference.kind === "wiki")
    .map((reference) => reference.key);
}

function sessionTags(page: Pick<WikiPage, "tags">): string[] {
  return page.tags
    .map((tag) => tag.trim().toUpperCase())
    .filter(
      (tag) =>
        /^S\d+E\d+$/.test(tag) ||
        /^NOSB-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(tag),
    );
}

function pageId(page: Pick<WikiPage, "_id">): string | null {
  return page._id?.toString() ?? null;
}

export function wikiRelatedLinks(
  page: WikiPage,
  allPages: WikiPage[],
  maxCount = 8,
): WikiRelatedLink[] {
  const currentId = pageId(page);
  const byTitle = new Map<string, WikiPage>();
  const bySlug = new Map<string, WikiPage>();
  const result: WikiRelatedLink[] = [];
  const seenIds = new Set<string>();

  for (const candidate of allPages) {
    byTitle.set(normalizePageTitle(candidate.title), candidate);
    bySlug.set(normalizePageTitle(candidate.slug), candidate);
  }

  function push(candidate: WikiPage | undefined, relation: WikiRelatedLink["relation"]) {
    if (!candidate) return;
    const id = pageId(candidate);
    if (!id || id === currentId || seenIds.has(id)) return;

    seenIds.add(id);
    result.push({
      id,
      title: candidate.title,
      category: candidate.category,
      relation,
    });
  }

  for (const name of explicitRelatedNames(page.content)) {
    const key = normalizePageTitle(name);
    push(byTitle.get(key) ?? bySlug.get(key), "문서 언급");
    if (result.length >= maxCount) return result;
  }

  const sessions = new Set(sessionTags(page));
  if (sessions.size > 0) {
    const sessionRelated = allPages
      .filter((candidate) =>
        sessionTags(candidate).some((tag) => sessions.has(tag)),
      )
      .sort((left, right) => {
        const leftRank = WIKI_CATEGORY_ORDER.indexOf(left.category);
        const rightRank = WIKI_CATEGORY_ORDER.indexOf(right.category);
        const normalizedLeftRank =
          leftRank === -1 ? WIKI_CATEGORY_ORDER.length : leftRank;
        const normalizedRightRank =
          rightRank === -1 ? WIKI_CATEGORY_ORDER.length : rightRank;
        if (normalizedLeftRank !== normalizedRightRank) {
          return normalizedLeftRank - normalizedRightRank;
        }
        return left.title.localeCompare(right.title, "ko");
      });

    for (const candidate of sessionRelated) {
      push(candidate, "같은 세션");
      if (result.length >= maxCount) break;
    }
  }

  return result;
}
