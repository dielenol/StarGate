export interface LoreSourceIdentity {
  sourceId: string;
  parentSourceId?: string;
  parentSourceIds?: string[];
}

export interface LoreSourceReference {
  owner: string;
  sourceId: string;
}

export interface LoreSourceIntegrityAudit {
  duplicateSourceIds: string[];
  orphanReferences: string[];
  parentCycles: string[];
}

function canonicalCycle(nodes: string[]): string {
  if (nodes.length === 0) return "";
  const rotations = nodes.map((_, index) => [
    ...nodes.slice(index),
    ...nodes.slice(0, index),
  ]);
  rotations.sort((left, right) =>
    left.join("\0").localeCompare(right.join("\0")),
  );
  const canonical = rotations[0];
  return [...canonical, canonical[0]].join(" -> ");
}

export function auditLoreSourceIntegrity(
  sources: LoreSourceIdentity[],
  references: LoreSourceReference[],
): LoreSourceIntegrityAudit {
  const sourceCounts = new Map<string, number>();
  const parentsBySource = new Map<string, string[]>();
  for (const source of sources) {
    sourceCounts.set(
      source.sourceId,
      (sourceCounts.get(source.sourceId) ?? 0) + 1,
    );
    const parents = [
      ...(source.parentSourceId ? [source.parentSourceId] : []),
      ...(source.parentSourceIds ?? []),
    ];
    if (parents.length > 0) parentsBySource.set(source.sourceId, parents);
  }
  const sourceIds = new Set(sourceCounts.keys());
  const duplicateSourceIds = [...sourceCounts]
    .filter(([, count]) => count > 1)
    .map(([sourceId]) => sourceId)
    .sort();

  const allReferences = [
    ...references,
    ...sources
      .filter((source) => source.parentSourceId)
      .map((source) => ({
        owner: `lore_sources.${source.sourceId}.parentSourceId`,
        sourceId: source.parentSourceId as string,
      })),
    ...sources.flatMap((source) =>
      (source.parentSourceIds ?? []).map((parentSourceId) => ({
        owner: `lore_sources.${source.sourceId}.parentSourceIds`,
        sourceId: parentSourceId,
      })),
    ),
  ];
  const orphanReferences = [
    ...new Set(
      allReferences
        .filter((reference) => !sourceIds.has(reference.sourceId))
        .map((reference) => `${reference.owner}->${reference.sourceId}`),
    ),
  ].sort();

  const cycles = new Set<string>();
  const visit = (
    current: string,
    path: string[],
    pathIndex: Map<string, number>,
  ): void => {
    const existingIndex = pathIndex.get(current);
    if (existingIndex !== undefined) {
      cycles.add(canonicalCycle(path.slice(existingIndex)));
      return;
    }
    if (!sourceIds.has(current)) return;
    const nextPath = [...path, current];
    const nextIndex = new Map(pathIndex).set(current, path.length);
    for (const parent of parentsBySource.get(current) ?? []) {
      visit(parent, nextPath, nextIndex);
    }
  };
  for (const sourceId of sourceIds) visit(sourceId, [], new Map());

  return {
    duplicateSourceIds,
    orphanReferences,
    parentCycles: [...cycles].filter(Boolean).sort(),
  };
}
