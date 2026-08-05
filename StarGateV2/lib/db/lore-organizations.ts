import "./init";

import {
  buildLoreAccessFilter,
  factionsCol,
  institutionsCol,
  isLoreProjectionGenerationReady,
  LORE_DOMAIN_SEARCH_PROJECTION_OWNER,
  loreIngestionRunsCol,
  loreSearchDocumentsCol,
  sessionReportsCol,
  wikiPagesCol,
} from "@stargate/shared-db";
import type { FactionDoc, InstitutionDoc } from "@stargate/shared-db/schemas";
import type { RoleLevel } from "@stargate/shared-db/types";
import type { Document, Filter } from "mongodb";

import { isLoreSignalProjectionReady } from "@/lib/lore-projection-readiness";

export interface LoreOrganizationSnapshot {
  factions: FactionDoc[];
  institutions: InstitutionDoc[];
}

export interface LoreSignalCounts {
  wiki: Record<string, number>;
  reports: Record<string, number>;
  source: "search-projection" | "domain-fallback";
}

export interface LoreSignalQuery {
  role: RoleLevel;
  includePrivateWiki: boolean;
  keywordsByCode: Record<string, string[]>;
}

export async function listLoreOrganizations(
  includePrivate: boolean,
): Promise<LoreOrganizationSnapshot> {
  const [factionCollection, institutionCollection] = await Promise.all([
    factionsCol(),
    institutionsCol(),
  ]);
  const visibility = includePrivate ? {} : { isPublic: true };
  const [factions, institutions] = await Promise.all([
    factionCollection.find(visibility).sort({ code: 1 }).toArray(),
    institutionCollection.find(visibility).sort({ code: 1 }).toArray(),
  ]);
  return { factions, institutions };
}

function emptyCounts(codes: string[]): Record<string, number> {
  return Object.fromEntries(codes.map((code) => [code, 0]));
}

function rowsToCounts(
  codes: string[],
  rows: Array<{ _id: string; count: number }>,
): Record<string, number> {
  const counts = emptyCounts(codes);
  for (const row of rows) {
    if (row._id in counts) counts[row._id] = row.count;
  }
  return counts;
}

async function canUseSearchProjection(): Promise<boolean> {
  const generationReady = await isLoreProjectionGenerationReady();
  if (!generationReady) return false;
  const [runs, searchDocuments, wiki, reports] = await Promise.all([
    loreIngestionRunsCol(),
    loreSearchDocumentsCol(),
    wikiPagesCol(),
    sessionReportsCol(),
  ]);
  const latest = await runs.findOne(
    { mode: "search-rebuild", dryRun: false },
    { projection: { _id: 1, startedAt: 1, status: 1 }, sort: { startedAt: -1, createdAt: -1, _id: -1 } },
  );
  if (latest?.status !== "succeeded" || !(latest.startedAt instanceof Date)) return false;

  const [wikiCount, reportCount, projectedWikiCount, projectedReportCount, changedWiki, changedReport] =
    await Promise.all([
      wiki.countDocuments({}),
      reports.countDocuments({}),
      searchDocuments.countDocuments({
        entityKind: "wiki",
        projectionOwner: LORE_DOMAIN_SEARCH_PROJECTION_OWNER,
      }),
      searchDocuments.countDocuments({
        entityKind: "report",
        projectionOwner: LORE_DOMAIN_SEARCH_PROJECTION_OWNER,
      }),
      wiki.findOne(
        { updatedAt: { $gt: latest.startedAt } },
        { projection: { _id: 1 } },
      ),
      reports.findOne(
        { updatedAt: { $gt: latest.startedAt } },
        { projection: { _id: 1 } },
      ),
    ]);
  return isLoreSignalProjectionReady({
    generationReady,
    latestStatus: latest.status,
    latestStartedAt: latest.startedAt,
    wikiCount,
    reportCount,
    projectedWikiCount,
    projectedReportCount,
    wikiChangedAfterGeneration: changedWiki !== null,
    reportChangedAfterGeneration: changedReport !== null,
  });
}

async function countFromSearchProjection(
  query: LoreSignalQuery,
): Promise<LoreSignalCounts> {
  const codes = Object.keys(query.keywordsByCode);
  const collection = await loreSearchDocumentsCol();
  const accessFilter = buildLoreAccessFilter({
    isAuthenticated: true,
    role: query.role,
  }) as Filter<Document>;
  const hitExpressions = hitProjection(query.keywordsByCode, "$searchText");
  const rows = await collection
    .aggregate<{ _id: { kind: "wiki" | "report"; code: string }; count: number }>([
      {
        $match: {
          $and: [
            accessFilter,
            { entityKind: { $in: ["wiki", "report"] } },
            { projectionOwner: LORE_DOMAIN_SEARCH_PROJECTION_OWNER },
            {
              status: {
                $nin: [
                  "discarded",
                  "design-proposal",
                  "balance-candidate",
                  "corporation-candidate",
                ],
              },
            },
          ],
        },
      },
      {
        $project: {
          entityKind: 1,
          hits: hitExpressions,
        },
      },
      { $unwind: "$hits" },
      { $match: { "hits.hit": true } },
      {
        $group: {
          _id: { kind: "$entityKind", code: "$hits.code" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  return {
    wiki: rowsToCounts(
      codes,
      rows
        .filter((row) => row._id.kind === "wiki")
        .map((row) => ({ _id: row._id.code, count: row.count })),
    ),
    reports: rowsToCounts(
      codes,
      rows
        .filter((row) => row._id.kind === "report")
        .map((row) => ({ _id: row._id.code, count: row.count })),
    ),
    source: "search-projection",
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hitProjection(
  keywordsByCode: Record<string, string[]>,
  input = "$text",
): Document[] {
  return Object.entries(keywordsByCode).map(([code, keywords]) => ({
    code,
    hit: {
      $regexMatch: {
        input,
        regex: keywords.map(escapeRegex).join("|"),
        options: "i",
      },
    },
  }));
}

async function countDomainFallback(
  query: LoreSignalQuery,
): Promise<LoreSignalCounts> {
  const codes = Object.keys(query.keywordsByCode);
  const [wikiCollection, reportCollection] = await Promise.all([
    wikiPagesCol(),
    sessionReportsCol(),
  ]);
  const hitExpressions = hitProjection(query.keywordsByCode);
  const [wikiRows, reportRows] = await Promise.all([
    wikiCollection
      .aggregate<{ _id: string; count: number }>([
        ...(query.includePrivateWiki
          ? []
          : [{ $match: { isPublic: true } }]),
        {
          $project: {
            text: {
              $concat: [
                { $ifNull: ["$title", ""] },
                " ",
                { $ifNull: ["$category", ""] },
                " ",
                {
                  $reduce: {
                    input: { $ifNull: ["$tags", []] },
                    initialValue: "",
                    in: { $concat: ["$$value", " ", "$$this"] },
                  },
                },
                " ",
                { $ifNull: ["$content", ""] },
              ],
            },
          },
        },
        { $project: { hits: hitExpressions } },
        { $unwind: "$hits" },
        { $match: { "hits.hit": true } },
        { $group: { _id: "$hits.code", count: { $sum: 1 } } },
      ])
      .toArray(),
    reportCollection
      .aggregate<{ _id: string; count: number }>([
        {
          $project: {
            text: {
              $concat: [
                { $ifNull: ["$sessionTitle", ""] },
                " ",
                { $ifNull: ["$summary", ""] },
                " ",
                {
                  $reduce: {
                    input: { $ifNull: ["$highlights", []] },
                    initialValue: "",
                    in: { $concat: ["$$value", " ", "$$this"] },
                  },
                },
                " ",
                {
                  $reduce: {
                    input: { $ifNull: ["$participants", []] },
                    initialValue: "",
                    in: { $concat: ["$$value", " ", "$$this"] },
                  },
                },
                " ",
                { $ifNull: ["$locationLabel", ""] },
              ],
            },
          },
        },
        { $project: { hits: hitExpressions } },
        { $unwind: "$hits" },
        { $match: { "hits.hit": true } },
        { $group: { _id: "$hits.code", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  return {
    wiki: rowsToCounts(codes, wikiRows),
    reports: rowsToCounts(codes, reportRows),
    source: "domain-fallback",
  };
}

/**
 * 성공한 search-rebuild가 있을 때는 facet 인덱스를 사용하고, 운영 backfill 전에는
 * DB 내부 단일-pass 집계로만 fallback한다. 어느 경로도 본문 전체를 앱으로 운반하지 않는다.
 */
export async function countLoreSignals(
  query: LoreSignalQuery,
): Promise<LoreSignalCounts> {
  try {
    if (await canUseSearchProjection()) {
      return await countFromSearchProjection(query);
    }
  } catch (error) {
    console.warn(
      "[lore-organizations] projection readiness 확인 실패, domain fallback 사용",
      error,
    );
  }
  return countDomainFallback(query);
}
