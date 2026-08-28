import "server-only";
import "@/lib/db/init";

import { cache } from "react";

import {
  rankNovexLifetimeReturnCandidates,
  toHallOfFameHonorItem,
  type HallOfFameCitationPageResponse,
  type HallOfFameHonorItem,
  type HallOfFameMineResponse,
  type HallOfFameNovexResponse,
  type HallOfFameOverviewResponse,
  type HallOfFameReportReviewResponse,
  type HallOfFameReportReviewState,
  type OperationHonorCategory,
} from "@stargate/core";
import {
  buildOperationHonorSourceMaterial,
  findCharacterById,
  findHonorCandidateCharactersByCodenames,
  getHonorRecordByPublicKey,
  findReportById,
  findReportBySessionId,
  HONOR_LORE_REVIEW_REVISION,
  honorAnalysisStatesCol,
  listCharactersByOwner,
  listHonorRecords,
  normalizeSessionReportMinRole,
  type HonorRecord,
  type HonorRecordQuery,
  type RoleLevel,
} from "@stargate/shared-db";

import { hasRole } from "@/lib/auth/rbac";
import { canViewCharacter } from "@/lib/auth/access-policy";
import { listStockLifetimeReturnCandidates } from "@/lib/db/stock-account";
import { getResearchHallOfFameResponse } from "@/lib/hall-of-fame/research";

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

function withSourceHref(record: HonorRecord, sourceHref: string): HonorRecord {
  return {
    ...record,
    source: { ...record.source, href: sourceHref },
  };
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

/** 공개 응답 필드를 늘리지 않고 보고서 상세에 lore 검토 대기 상태만 제공한다. */
export async function getHallOfFameReportReviewState(
  reportId: string,
): Promise<HallOfFameReportReviewState> {
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
  const isCurrentReview =
    state?.sourceHash === source.sourceHash &&
    state.analyzerRevision === HONOR_LORE_REVIEW_REVISION &&
    state.status === "SUCCEEDED";
  return isCurrentReview ? null : "PENDING";
}

export async function getHallOfFameReportReviewResponse(
  reportId: string,
): Promise<HallOfFameReportReviewResponse> {
  return {
    generatedAt: new Date().toISOString(),
    state: await getHallOfFameReportReviewState(reportId),
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
        // NOVEX는 honor_records의 시즌 리본이 아니라 공개 누적 수익 read model만 사용한다.
        return null;
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

const loadHallOfFameNovexResponse = cache(
  async (): Promise<HallOfFameNovexResponse> => {
    const candidates = await listStockLifetimeReturnCandidates();
    return {
      period: "ALL_TIME",
      basis: "TOTAL_REALIZED_RETURN",
      generatedAt: new Date().toISOString(),
      items: rankNovexLifetimeReturnCandidates(candidates),
    };
  },
);

export async function getHallOfFameOverviewResponse(input: {
  viewerRole: RoleLevel;
  isGuest: boolean;
}): Promise<HallOfFameOverviewResponse> {
  const canViewOperations = !input.isGuest && hasRole(input.viewerRole, "U");
  const [research, novex, operationRecords] = await Promise.all([
    getResearchHallOfFameResponse(),
    getHallOfFameNovexResponse(),
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
      research.items.length + novex.items.length + operationRecordCount,
    novexHonoreeCount: novex.items.length,
  };
}

export async function getHallOfFameNovexResponse(): Promise<HallOfFameNovexResponse> {
  // overview와 NOVEX 패널이 같은 RSC 렌더에서 요청해도 원장 집계는 한 번만 수행한다.
  return loadHallOfFameNovexResponse();
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
    const records = await listAllHonorRecords({
      domain: "OPERATION",
      minRole: "U",
      characterId: input.characterId,
      ...(input.category ? { category: input.category } : {}),
    });
    records.sort(
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
    records.push(
      ...(await listAllHonorRecords({
        domain: "OPERATION",
        minRole: "U",
        characterId,
      })),
    );
  }
  records.sort(
    (left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() ||
      right.publicKey.localeCompare(left.publicKey),
  );
  const ribbons = await toVisibleHonorItems(records);
  return { total: ribbons.length, ribbons };
}
