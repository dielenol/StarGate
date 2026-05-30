import type { TagTone } from "@/components/ui/Tag/Tag";
import type { WikiPage } from "@/types/wiki";

const CATEGORY_TONES: Record<string, TagTone> = {
  개념: "info",
  개체: "danger",
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
  소모품: "rank-u",
};

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

    if (/^#{2,3}\s+/.test(line)) {
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
