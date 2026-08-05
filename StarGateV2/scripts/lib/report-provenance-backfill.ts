import { loreSourceDocumentSchema } from "@stargate/shared-db/schemas";
import type { Document } from "mongodb";

export function immutableLoreSourcePayload(source: Document): Document {
  const { _id, createdAt, updatedAt, ...immutable } = source;
  void _id;
  void createdAt;
  void updatedAt;
  return immutable;
}

export function parseStoredLoreSource(source: Document): Document {
  const { _id, ...stored } = source;
  void _id;
  return loreSourceDocumentSchema.parse(stored);
}

export function currentProvenanceLedger(row: Document): string[] {
  const stored = row.provenanceSourceIds;
  if (
    stored !== undefined &&
    (!Array.isArray(stored) || stored.some((value) => typeof value !== "string"))
  ) {
    throw new Error("provenanceSourceIds는 문자열 배열이어야 합니다.");
  }

  let legacySourceId: string | undefined;
  if (Object.hasOwn(row, "provenanceSourceId")) {
    if (
      typeof row.provenanceSourceId !== "string" ||
      row.provenanceSourceId.trim() === ""
    ) {
      throw new Error("legacy provenanceSourceId는 비어 있지 않은 문자열이어야 합니다.");
    }
    legacySourceId = row.provenanceSourceId;
  }

  return [
    ...new Set([
      ...((stored as string[] | undefined) ?? []),
      ...(legacySourceId ? [legacySourceId] : []),
    ]),
  ].sort();
}

export function buildReportProvenanceUpdate(
  row: Document,
  sourceIds: readonly string[],
): {
  current: string[];
  desired: string[];
  missingCount: number;
  removesLegacy: boolean;
  needsUpdate: boolean;
} {
  const current = currentProvenanceLedger(row);
  const desired = [...new Set([...current, ...sourceIds])].sort();
  const missingCount = desired.filter(
    (sourceId) => !current.includes(sourceId),
  ).length;
  const removesLegacy = Object.hasOwn(row, "provenanceSourceId");
  return {
    current,
    desired,
    missingCount,
    removesLegacy,
    needsUpdate: missingCount > 0 || removesLegacy,
  };
}
