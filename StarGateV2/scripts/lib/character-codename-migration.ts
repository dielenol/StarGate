import { createHash } from "node:crypto";

import type { Document } from "mongodb";

export interface CodenameMigrationBlocker {
  collection: string;
  documentId: string;
  path: string;
  reason: "unsupported-exact-reference" | "embedded-reference-needs-review";
}

export interface CodenameDocumentPlan {
  changed: boolean;
  after: Document;
  changedPaths: string[];
  blockers: CodenameMigrationBlocker[];
}

const EXACT_REFERENCE_PATHS: Record<string, RegExp[]> = {
  characters: [
    /^codename$/u,
    /^lore\.relations\.\*\.targetCodename$/u,
  ],
  session_reports: [
    /^participants\.\*$/u,
    /^relatedPersonnelCodenames\.\*$/u,
  ],
  factions: [/^notableMembers\.\*$/u],
  institutions: [/^leaderCodename$/u],
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedPath(path: string[]): string {
  return path.map((segment) => (/^\d+$/u.test(segment) ? "*" : segment)).join(".");
}

function exactReferenceAllowed(collection: string, path: string[]): boolean {
  const normalized = normalizedPath(path);
  return (EXACT_REFERENCE_PATHS[collection] ?? []).some((pattern) =>
    pattern.test(normalized),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function replaceTypedWikiRefs(value: string, from: string, to: string): string {
  return value.replace(
    new RegExp(`(\\[\\[(?:personnel|dossier|character):)${escapeRegExp(from)}(?=[|\\]])`, "gu"),
    `$1${to}`,
  );
}

export function planCodenameDocument(
  collection: string,
  document: Document,
  from: string,
  to: string,
): CodenameDocumentPlan {
  const blockers: CodenameMigrationBlocker[] = [];
  const changedPaths = new Set<string>();
  const documentId = String(document._id ?? "<missing>");

  const visit = (value: unknown, path: string[]): unknown => {
    if (typeof value === "string") {
      if (value === from) {
        if (exactReferenceAllowed(collection, path)) {
          changedPaths.add(normalizedPath(path));
          return to;
        }
        blockers.push({
          collection,
          documentId,
          path: normalizedPath(path),
          reason: "unsupported-exact-reference",
        });
        return value;
      }
      if (!value.includes(from)) return value;
      if (collection === "wiki_pages" && normalizedPath(path) === "content") {
        const replaced = replaceTypedWikiRefs(value, from, to);
        if (replaced !== value && !replaced.includes(from)) {
          changedPaths.add("content");
          return replaced;
        }
      }
      blockers.push({
        collection,
        documentId,
        path: normalizedPath(path),
        reason: "embedded-reference-needs-review",
      });
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry, index) => visit(entry, [...path, String(index)]));
    }
    if (!isPlainRecord(value)) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, visit(entry, [...path, key])]),
    );
  };

  const after = visit(document, []) as Document;
  return {
    changed: changedPaths.size > 0,
    after,
    changedPaths: [...changedPaths].sort(),
    blockers,
  };
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (!isPlainRecord(value)) {
    if (
      value &&
      typeof value === "object" &&
      "toHexString" in value &&
      typeof value.toHexString === "function"
    ) {
      return String(value.toHexString());
    }
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

export function codenameMigrationHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
