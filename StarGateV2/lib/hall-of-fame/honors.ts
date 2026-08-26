import "server-only";
import "@/lib/db/init";

import {
  toHallOfFameHonorItem,
  type HallOfFameCitationPageResponse,
  type HallOfFameHonorItem,
  type HallOfFameMineResponse,
  type HallOfFameNovexResponse,
  type HallOfFameOverviewResponse,
  type HallOfFameReportAnalysisResponse,
  type HallOfFameReportAnalysisState,
  type OperationHonorCategory,
} from "@stargate/core";
import {
  buildHonorPublicKey,
  buildNovexHonorLogicalKey,
  buildOperationHonorSourceMaterial,
  countFinalizedNovexSeasons,
  countFinalizedNovexTop3Performances,
  findCharacterById,
  findHonorCandidateCharactersByCodenames,
  getHonorRecordByPublicKey,
  findReportById,
  findReportBySessionId,
  HONOR_ANALYZER_REVISION,
  honorAnalysisStatesCol,
  listCharactersByOwner,
  listFinalizedNovexSeasons,
  listHonorRecords,
  listNovexHonorRecords,
  listNovexHonorFallbackPerformances,
  normalizeSessionReportMinRole,
  type HonorRecord,
  type HonorRecordQuery,
  type RoleLevel,
  type StockInvestmentSeason,
} from "@stargate/shared-db";

import { hasRole } from "@/lib/auth/rbac";
import { canViewCharacter } from "@/lib/auth/access-policy";
import { getResearchHallOfFameResponse } from "@/lib/hall-of-fame/research";

const NOVEX_SEASON_LIMIT = 100;
const HONOR_PAGE_LIMIT = 20;
const HONOR_PUBLIC_KEY_PATTERN = /^honor_[a-f0-9]{24}$/u;

export interface HallOfFameCitationQuery {
  viewerRole: RoleLevel;
  category?: OperationHonorCategory;
  cursor?: string;
  characterId?: string;
  reportId?: string;
  limit?: number;
}

export interface HallOfFameMineQuery {
  userId: string;
  viewerRole: RoleLevel;
}

function formatKstDate(value: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(value)
    .replace(/\s/g, "");
}

function seasonLabel(season: StockInvestmentSeason): string {
  return `NOVEX · ${formatKstDate(season.startsAt)}–${formatKstDate(season.endsAt)}`;
}

function selectedSeasonSummary(season: StockInvestmentSeason) {
  return {
    key: season._id,
    label: seasonLabel(season),
    finalizedAt: (season.finalizedAt ?? season.endsAt).toISOString(),
  };
}

function withSourceHref(record: HonorRecord, sourceHref: string): HonorRecord {
  return {
    ...record,
    source: { ...record.source, href: sourceHref },
  };
}

function fallbackNovexItems(
  season: StockInvestmentSeason,
  rows: Awaited<ReturnType<typeof listNovexHonorFallbackPerformances>>,
): HallOfFameHonorItem[] {
  const sourceLabel = seasonLabel(season);
  return rows.flatMap((row) => {
    if (row.rank !== 1 && row.rank !== 2 && row.rank !== 3) return [];
    const returnPercent = new Intl.NumberFormat("ko-KR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: "always",
    }).format(row.linkedReturn * 100);
    const key = buildHonorPublicKey(
      buildNovexHonorLogicalKey(season._id, row.characterId),
    );
    return [
      {
        key,
        domain: "NOVEX",
        category: "NOVEX_PODIUM",
        codename: row.codename,
        title:
          row.title ??
          (row.rank === 1 ? "NOVEX 시즌 챔피언" : `NOVEX 시즌 ${row.rank}위`),
        citation: `${sourceLabel}에서 ${returnPercent}% 수익률로 ${row.rank}위를 기록했습니다.`,
        rank: row.rank,
        occurredAt: (season.finalizedAt ?? season.endsAt).toISOString(),
        sourceLabel,
        sourceHref: `/erp/hall-of-fame?view=novex&season=${encodeURIComponent(season._id)}`,
      } satisfies HallOfFameHonorItem,
    ];
  });
}

async function toVisibleHonorItem(
  record: HonorRecord,
): Promise<HallOfFameHonorItem | null> {
  if (record.domain === "NOVEX") {
    return toHallOfFameHonorItem(record, { includeSourceHref: true });
  }
  return null;
}

async function resolveCurrentOperationSource(sourceKey: string) {
  const report = await findReportBySessionId(sourceKey);
  if (!report || normalizeSessionReportMinRole(report.minRole) !== "U") {
    return null;
  }
  const characters = await findHonorCandidateCharactersByCodenames(
    report.relatedPersonnelCodenames ?? [],
  );
  const source = buildOperationHonorSourceMaterial({ report, characters });
  return source ? { report, source } : null;
}

/** 공개 응답 필드를 늘리지 않고 보고서 상세에 안전한 심사 진행 상태만 제공한다. */
export async function getHallOfFameReportAnalysisState(
  reportId: string,
): Promise<HallOfFameReportAnalysisState> {
  const report = await findReportById(reportId);
  if (!report || normalizeSessionReportMinRole(report.minRole) !== "U") {
    return null;
  }
  const characters = await findHonorCandidateCharactersByCodenames(
    report.relatedPersonnelCodenames ?? [],
  );
  const source = buildOperationHonorSourceMaterial({ report, characters });
  if (!source) return null;

  const state = await (await honorAnalysisStatesCol()).findOne({
    _id: `session-report:${report.sessionId}`,
  });
  if (!state) return null;
  if (
    state.sourceHash !== source.sourceHash ||
    state.analyzerRevision !== HONOR_ANALYZER_REVISION ||
    state.status === "PENDING" ||
    state.status === "RETRY" ||
    state.status === "LEASED"
  ) {
    return "PENDING";
  }
  return state.status === "SKIPPED" ? "DELAYED" : null;
}

export async function getHallOfFameReportAnalysisResponse(
  reportId: string,
): Promise<HallOfFameReportAnalysisResponse> {
  return {
    generatedAt: new Date().toISOString(),
    state: await getHallOfFameReportAnalysisState(reportId),
  };
}

async function toVisibleHonorItems(
  records: HonorRecord[],
): Promise<HallOfFameHonorItem[]> {
  const operationReports = new Map<
    string,
    ReturnType<typeof resolveCurrentOperationSource>
  >();
  const resolved = await Promise.all(
    records.map(async (record) => {
      if (
        record.domain !== "OPERATION" ||
        record.source.type !== "SESSION_REPORT"
      ) {
        return toVisibleHonorItem(record);
      }
      let pendingSource = operationReports.get(record.source.key);
      if (!pendingSource) {
        pendingSource = resolveCurrentOperationSource(record.source.key);
        operationReports.set(record.source.key, pendingSource);
      }
      const current = await pendingSource;
      if (
        record.minRole !== "U" ||
        !current ||
        current.source.sourceHash !== record.sourceHash
      ) {
        return null;
      }
      return toHallOfFameHonorItem(
        withSourceHref(
          record,
          `/erp/hall-of-fame/source/${encodeURIComponent(record.publicKey)}`,
        ),
        { includeSourceHref: true },
      );
    }),
  );
  return resolved.filter((item): item is HallOfFameHonorItem => item !== null);
}

/** 공개 응답에는 opaque key만 싣고, 실제 보고서 ObjectId는 권한 재검증 뒤 서버에서만 해석한다. */
export async function getHallOfFameSourceRedirect(
  publicKey: string,
  viewerRole: RoleLevel,
): Promise<string | null> {
  if (!hasRole(viewerRole, "U") || !HONOR_PUBLIC_KEY_PATTERN.test(publicKey)) {
    return null;
  }
  const record = await getHonorRecordByPublicKey(publicKey);
  if (
    !record ||
    record.domain !== "OPERATION" ||
    record.source.type !== "SESSION_REPORT" ||
    record.minRole !== "U"
  ) {
    return null;
  }
  const current = await resolveCurrentOperationSource(record.source.key);
  if (!current || current.source.sourceHash !== record.sourceHash) return null;
  return `/erp/sessions/report/${String(current.report._id)}`;
}

async function listAllHonorRecords(
  input: Omit<HonorRecordQuery, "cursor" | "limit">,
): Promise<HonorRecord[]> {
  const records: HonorRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await listHonorRecords({
      ...input,
      ...(cursor ? { cursor } : {}),
      limit: 100,
    });
    records.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return records;
}

export async function getHallOfFameOverviewResponse(input: {
  viewerRole: RoleLevel;
  isGuest: boolean;
}): Promise<HallOfFameOverviewResponse> {
  const canViewOperations = !input.isGuest && hasRole(input.viewerRole, "U");
  const [research, seasonCount, novexRecordCount, operationRecords] =
    await Promise.all([
      getResearchHallOfFameResponse(),
      countFinalizedNovexSeasons(),
      countFinalizedNovexTop3Performances(),
      canViewOperations
        ? listAllHonorRecords({ domain: "OPERATION", minRole: "U" })
        : Promise.resolve([]),
    ]);
  const operationRecordCount = canViewOperations
    ? (await toVisibleHonorItems(operationRecords)).length
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    totalRecords:
      research.items.length + novexRecordCount + operationRecordCount,
    seasonCount,
  };
}

export async function getHallOfFameNovexResponse(
  seasonKey?: string,
): Promise<HallOfFameNovexResponse> {
  const seasons = await listFinalizedNovexSeasons(NOVEX_SEASON_LIMIT);
  const selected = seasonKey
    ? seasons.find((season) => season._id === seasonKey) ?? null
    : seasons[0] ?? null;
  const records = selected ? await listNovexHonorRecords(selected._id) : [];
  const fallbackRows =
    selected && records.length === 0
      ? await listNovexHonorFallbackPerformances(selected._id)
      : [];

  return {
    generatedAt: new Date().toISOString(),
    selectedSeason: selected ? selectedSeasonSummary(selected) : null,
    seasons: seasons.map((season) => ({
      key: season._id,
      label: seasonLabel(season),
    })),
    items:
      selected && records.length === 0
        ? fallbackNovexItems(selected, fallbackRows)
        : records.map((record) =>
            toHallOfFameHonorItem(record, { includeSourceHref: true }),
          ),
  };
}

export async function getHallOfFameCitationPage(
  input: HallOfFameCitationQuery,
): Promise<HallOfFameCitationPageResponse> {
  if (!hasRole(input.viewerRole, "U")) {
    return { generatedAt: new Date().toISOString(), items: [] };
  }

  let sourceKey: string | undefined;
  if (input.reportId) {
    const report = await findReportById(input.reportId);
    if (!report || normalizeSessionReportMinRole(report.minRole) !== "U") {
      return { generatedAt: new Date().toISOString(), items: [] };
    }
    sourceKey = report.sessionId;
  }
  if (input.characterId) {
    const character = await findCharacterById(input.characterId);
    if (!character || !canViewCharacter(input.viewerRole, character)) {
      return { generatedAt: new Date().toISOString(), items: [] };
    }
    const [operationRecords, novexRecords] = await Promise.all([
      listAllHonorRecords({
        domain: "OPERATION",
        minRole: "U",
        characterId: input.characterId,
        ...(input.category ? { category: input.category } : {}),
      }),
      input.category
        ? Promise.resolve([])
        : listAllHonorRecords({
            domain: "NOVEX",
            characterId: input.characterId,
          }),
    ]);
    const records = [...operationRecords, ...novexRecords].sort(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        right.publicKey.localeCompare(left.publicKey),
    );
    const visibleItems = await toVisibleHonorItems(records);
    return {
      generatedAt: new Date().toISOString(),
      items: visibleItems,
    };
  }

  const limit = Math.min(
    100,
    Math.max(1, Math.trunc(input.limit ?? HONOR_PAGE_LIMIT)),
  );
  const items: HallOfFameHonorItem[] = [];
  let cursor = input.cursor;
  let nextCursor: string | undefined;
  do {
    const remaining = limit - items.length;
    const page = await listHonorRecords({
      domain: "OPERATION",
      minRole: "U",
      ...(input.category ? { category: input.category } : {}),
      ...(sourceKey
        ? { sourceType: "SESSION_REPORT" as const, sourceKey }
        : {}),
      ...(cursor ? { cursor } : {}),
      limit: remaining,
    });
    items.push(...(await toVisibleHonorItems(page.items)));
    cursor = page.nextCursor;
    nextCursor = page.nextCursor;
  } while (items.length < limit && cursor);

  return {
    generatedAt: new Date().toISOString(),
    items: items.slice(0, limit),
    ...(nextCursor ? { nextCursor } : {}),
  };
}

export async function getHallOfFameMineResponse(
  input: HallOfFameMineQuery,
): Promise<HallOfFameMineResponse> {
  if (!hasRole(input.viewerRole, "U")) return { total: 0, ribbons: [] };

  const characters = await listCharactersByOwner(input.userId);
  if (characters.length === 0) return { total: 0, ribbons: [] };

  const records: HonorRecord[] = [];
  for (const character of characters) {
    if (!character._id) continue;
    const characterId = String(character._id);
    const [operationRecords, novexRecords] = await Promise.all([
      listAllHonorRecords({
        domain: "OPERATION",
        minRole: "U",
        characterId,
      }),
      listAllHonorRecords({
        domain: "NOVEX",
        characterId: String(character._id),
      }),
    ]);
    records.push(...operationRecords, ...novexRecords);
  }
  records.sort(
    (left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() ||
      right.publicKey.localeCompare(left.publicKey),
  );
  const ribbons = await toVisibleHonorItems(records);
  return { total: ribbons.length, ribbons };
}
