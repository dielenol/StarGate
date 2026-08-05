import { createHash } from "node:crypto";

import type { Document } from "mongodb";

export const STATIC_BASELINE_MAX_AGE_MS = 31 * 24 * 60 * 60 * 1_000;
export const STATIC_BASELINE_KINDS = [
  "wiki",
  "catalog",
  "personnel",
  "report",
] as const;

export type StaticBaselineKind = (typeof STATIC_BASELINE_KINDS)[number];

export interface StaticBaselineTarget {
  kind: StaticBaselineKind;
  key: string;
  aliases: string[];
  evidence: string;
  observedUpdatedAt: string;
  contentHash: string;
}

export interface StaticLoreBaseline {
  version: 1;
  environment: string;
  database: string;
  observedAt: string;
  expiresAt: string;
  targets: StaticBaselineTarget[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIsoDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/u.test(value)) {
    throw new Error(`[static-baseline] ${field} ISO datetime이 필요합니다.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`[static-baseline] ${field} datetime이 유효하지 않습니다.`);
  }
  return parsed;
}

export function validateStaticLoreBaseline(
  value: unknown,
  now = new Date(),
): StaticLoreBaseline {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("[static-baseline] version=1 object가 필요합니다.");
  }
  for (const field of ["environment", "database"] as const) {
    if (typeof value[field] !== "string" || !value[field].trim()) {
      throw new Error(`[static-baseline] ${field} 문자열이 필요합니다.`);
    }
  }
  const observedAt = parseIsoDate(value.observedAt, "observedAt");
  const expiresAt = parseIsoDate(value.expiresAt, "expiresAt");
  if (expiresAt <= observedAt) {
    throw new Error("[static-baseline] expiresAt은 observedAt 이후여야 합니다.");
  }
  if (expiresAt.getTime() - observedAt.getTime() > STATIC_BASELINE_MAX_AGE_MS) {
    throw new Error("[static-baseline] baseline 유효기간은 31일을 초과할 수 없습니다.");
  }
  if (now > expiresAt) {
    throw new Error(`[static-baseline] baseline이 ${expiresAt.toISOString()}에 만료되었습니다.`);
  }
  if (!Array.isArray(value.targets)) {
    throw new Error("[static-baseline] targets 배열이 필요합니다.");
  }
  const seen = new Set<string>();
  const targets = value.targets.map((raw, index): StaticBaselineTarget => {
    if (!isRecord(raw)) throw new Error(`[static-baseline] targets[${index}] 객체가 필요합니다.`);
    if (!STATIC_BASELINE_KINDS.includes(raw.kind as StaticBaselineKind)) {
      throw new Error(`[static-baseline] targets[${index}].kind가 유효하지 않습니다.`);
    }
    const kind = raw.kind as StaticBaselineKind;
    const key = typeof raw.key === "string" ? raw.key.trim() : "";
    if (!key) throw new Error(`[static-baseline] targets[${index}].key가 필요합니다.`);
    const identity = `${kind}:${key}`;
    if (seen.has(identity)) throw new Error(`[static-baseline] target 중복: ${identity}`);
    seen.add(identity);
    if (
      !Array.isArray(raw.aliases) ||
      raw.aliases.some((alias) => typeof alias !== "string" || !alias.trim()) ||
      new Set(raw.aliases).size !== raw.aliases.length
    ) {
      throw new Error(`[static-baseline] targets[${index}].aliases가 유효하지 않습니다.`);
    }
    if (typeof raw.evidence !== "string" || !raw.evidence.trim()) {
      throw new Error(`[static-baseline] targets[${index}].evidence가 필요합니다.`);
    }
    parseIsoDate(raw.observedUpdatedAt, `targets[${index}].observedUpdatedAt`);
    if (typeof raw.contentHash !== "string" || !/^[a-f0-9]{64}$/u.test(raw.contentHash)) {
      throw new Error(`[static-baseline] targets[${index}].contentHash sha256가 필요합니다.`);
    }
    return {
      kind,
      key,
      aliases: raw.aliases as string[],
      evidence: raw.evidence,
      observedUpdatedAt: raw.observedUpdatedAt as string,
      contentHash: raw.contentHash,
    };
  });
  return {
    version: 1,
    environment: value.environment as string,
    database: value.database as string,
    observedAt: value.observedAt as string,
    expiresAt: value.expiresAt as string,
    targets,
  };
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  if ("toHexString" in value && typeof value.toHexString === "function") {
    return String(value.toHexString());
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

export function hashStaticBaselineDocument(value: Document): string {
  const { _id, createdAt, updatedAt, ...stable } = value;
  void _id;
  void createdAt;
  void updatedAt;
  return createHash("sha256")
    .update(JSON.stringify(canonical(stable)))
    .digest("hex");
}

export const STATIC_BASELINE_COLLECTIONS: Record<
  StaticBaselineKind,
  { collection: string; keyField: string; labelFields: string[] }
> = {
  wiki: { collection: "wiki_pages", keyField: "slug", labelFields: ["title"] },
  catalog: { collection: "master_items", keyField: "slug", labelFields: ["name", "nameEn"] },
  personnel: { collection: "characters", keyField: "codename", labelFields: ["codename", "lore.name", "lore.nameEn"] },
  report: { collection: "session_reports", keyField: "sessionId", labelFields: ["sessionTitle"] },
};

export function baselineDocumentLabels(
  target: StaticBaselineTarget,
  document: Document,
): Set<string> {
  const labels = new Set([target.key.normalize("NFKC").trim().toLocaleLowerCase()]);
  for (const path of STATIC_BASELINE_COLLECTIONS[target.kind].labelFields) {
    let current: unknown = document;
    for (const segment of path.split(".")) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[segment];
    }
    if (typeof current === "string" && current.trim()) {
      labels.add(current.normalize("NFKC").trim().toLocaleLowerCase());
    }
  }
  return labels;
}
