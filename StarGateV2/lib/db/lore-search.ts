import {
  isSessionReportVisibleToRole,
  searchLoreDocuments,
  sessionReportVisibilityFilter,
} from "@stargate/shared-db";
import {
  ROLE_LEVEL_RANK,
  type LoreEntityKind,
  type LoreRecordStatus,
  type LoreSearchDocument,
  type UserRole,
} from "@stargate/shared-db/types";
import { ObjectId, type Document } from "mongodb";

import {
  filterCharacterForList,
  getEffectivePersonnelClearance,
  maskedDisplayName,
} from "@/lib/personnel";
import type { CharacterListItem } from "@/lib/db/characters";

import { getErpDb } from "./client";

export type LoreSearchKind =
  | "wiki"
  | "report"
  | "personnel"
  | "catalog"
  | "faction"
  | "institution";

export type LoreSearchDegradedSource = "index" | LoreSearchKind;

export interface LoreSearchResult {
  kind: LoreSearchKind;
  key: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  href: string;
  isPublic: boolean;
  updatedAt: Date;
  source: "index" | "fallback";
  status?: LoreRecordStatus;
}

export interface LoreSearchResponse {
  results: LoreSearchResult[];
  sourceMode: "index" | "fallback" | "hybrid";
  degradedSources: LoreSearchDegradedSource[];
}

interface LoreSearchViewer {
  userId: string;
  role: UserRole;
}

const FALLBACK_LIMIT_PER_KIND = 12;
const MAX_RESULTS = 50;
const FALLBACK_SOURCES: LoreSearchKind[] = [
  "wiki",
  "report",
  "personnel",
  "catalog",
  "faction",
  "institution",
];
const INDEX_SEARCH_STATUSES: LoreRecordStatus[] = [
  "canon-from-source",
  "session-confirmed",
];

interface LiveIndexResolution {
  href: string;
  updatedAt: Date;
  isPublic: boolean;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? 0));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function plainExcerpt(value: unknown, maxLength = 240): string {
  const text = asString(value)
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (_match, key, label) =>
      String(label ?? key).trim(),
    )
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/[`*_>#|~-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function resultKindForEntity(kind: LoreEntityKind): LoreSearchKind {
  if (kind === "character") return "personnel";
  if (kind === "report" || kind === "catalog" || kind === "faction" || kind === "institution") {
    return kind;
  }
  return "wiki";
}

function entityRefKey(entityRef: string): string {
  const separator = entityRef.indexOf(":");
  return separator === -1 ? entityRef : entityRef.slice(separator + 1);
}

/**
 * 보조 검색 인덱스는 SSOT가 아니다. 결과를 내보내기 전에 현재 도메인 행의
 * 존재/visibility/updatedAt을 다시 확인해 삭제·비공개 전환·수정 전 projection을
 * fail-closed 한다. 인물은 필드별 clearance projection이 필요하므로 index 본문을
 * 사용하지 않고 아래 fallback의 현재 행만 노출한다.
 */
async function resolveLiveIndexDocuments(
  docs: LoreSearchDocument[],
  viewer: LoreSearchViewer,
): Promise<Map<string, LiveIndexResolution>> {
  const db = await getErpDb();
  const keysByKind = new Map<LoreEntityKind, string[]>();
  for (const doc of docs) {
    const keys = keysByKind.get(doc.entityKind) ?? [];
    keys.push(entityRefKey(doc.entityRef));
    keysByKind.set(doc.entityKind, keys);
  }
  const ids = (values: string[]) =>
    values.filter(ObjectId.isValid).map((value) => new ObjectId(value));
  const nonEmpty = (kind: LoreEntityKind) => keysByKind.get(kind) ?? [];
  const canViewPrivate = ROLE_LEVEL_RANK[viewer.role] >= ROLE_LEVEL_RANK.V;
  const wikiVisibility = canViewPrivate ? {} : { isPublic: true };
  const catalogVisibility = canViewPrivate
    ? {}
    : {
        $or: [
          { isPublic: { $ne: false } },
          { "workshop.ownerId": viewer.userId },
        ],
      };
  const publicVisibility = canViewPrivate ? {} : { isPublic: true };
  const reportVisibility = sessionReportVisibilityFilter(viewer.role);
  const [wiki, reports, personnel, catalog, factions, institutions] =
    await Promise.all([
      db
        .collection("wiki_pages")
        .find({
          $and: [
            wikiVisibility,
            {
              $or: [
                { slug: { $in: nonEmpty("wiki") } },
                { _id: { $in: ids(nonEmpty("wiki")) } },
              ],
            },
          ],
        })
        .project({ slug: 1, isPublic: 1, updatedAt: 1 })
        .toArray(),
      db
        .collection("session_reports")
        .find({
          $and: [
            reportVisibility,
            {
              $or: [
                { sessionId: { $in: nonEmpty("report") } },
                { _id: { $in: ids(nonEmpty("report")) } },
              ],
            },
          ],
        })
        .project({ sessionId: 1, minRole: 1, updatedAt: 1 })
        .toArray(),
      // Personnel index summaries can contain fields above the viewer's
      // clearance. Only existence is read here; indexed personnel results are
      // deliberately excluded below and rebuilt by the masked fallback.
      db
        .collection("characters")
        .find({
          $and: [
            viewer.role === "GM" ? {} : { isPublic: true },
            {
              $or: [
                { codename: { $in: nonEmpty("character") } },
                { _id: { $in: ids(nonEmpty("character")) } },
              ],
            },
          ],
        })
        .project({ codename: 1, isPublic: 1, updatedAt: 1 })
        .toArray(),
      db
        .collection("master_items")
        .find({
          $and: [
            catalogVisibility,
            {
              $or: [
                { slug: { $in: nonEmpty("catalog") } },
                { _id: { $in: ids(nonEmpty("catalog")) } },
              ],
            },
          ],
        })
        .project({ slug: 1, isPublic: 1, updatedAt: 1 })
        .toArray(),
      db
        .collection("factions")
        .find({
          $and: [
            publicVisibility,
            {
              $or: [
                { code: { $in: nonEmpty("faction") } },
                { slug: { $in: nonEmpty("faction") } },
              ],
            },
          ],
        })
        .project({ code: 1, slug: 1, isPublic: 1, updatedAt: 1 })
        .toArray(),
      db
        .collection("institutions")
        .find({
          $and: [
            publicVisibility,
            {
              $or: [
                { code: { $in: nonEmpty("institution") } },
                { slug: { $in: nonEmpty("institution") } },
              ],
            },
          ],
        })
        .project({ code: 1, slug: 1, isPublic: 1, updatedAt: 1 })
        .toArray(),
    ]);

  const map = new Map<string, LiveIndexResolution>();
  const setResolution = (
    refs: string[],
    href: string,
    doc: Document,
    isPublic: boolean,
  ) => {
    const resolution = {
      href,
      updatedAt: asDate(doc.updatedAt),
      isPublic,
    };
    for (const ref of refs.filter(Boolean)) map.set(ref, resolution);
  };
  for (const doc of wiki) {
    setResolution(
      [`wiki:${asString(doc.slug)}`, `wiki:${String(doc._id)}`],
      `/erp/wiki/${String(doc._id)}`,
      doc,
      doc.isPublic === true,
    );
  }
  for (const doc of reports) {
    setResolution(
      [`report:${asString(doc.sessionId)}`, `report:${String(doc._id)}`],
      `/erp/sessions/report/${String(doc._id)}`,
      doc,
      isSessionReportVisibleToRole(doc, "U"),
    );
  }
  // Keep the query above as an explicit live existence/visibility check, but
  // never put personnel into the map: masked fallback is the only output path.
  void personnel;
  for (const doc of catalog) {
    const key = asString(doc.slug) || String(doc._id);
    const href = `/erp/wiki/catalog/item/${encodeURIComponent(key)}`;
    setResolution(
      [`catalog:${asString(doc.slug)}`, `catalog:${String(doc._id)}`],
      href,
      doc,
      doc.isPublic !== false,
    );
  }
  for (const doc of factions) {
    const code = asString(doc.code);
    const href = `/erp/factions/${code.toLocaleLowerCase("en-US")}`;
    setResolution(
      [`faction:${code}`, `faction:${asString(doc.slug)}`],
      href,
      doc,
      doc.isPublic === true,
    );
  }
  for (const doc of institutions) {
    const code = asString(doc.code);
    const href = `/erp/factions/${code.toLocaleLowerCase("en-US")}`;
    setResolution(
      [`institution:${code}`, `institution:${asString(doc.slug)}`],
      href,
      doc,
      doc.isPublic === true,
    );
  }
  return map;
}

function scoreResult(result: LoreSearchResult, query: string): number {
  const needle = query.toLocaleLowerCase("ko-KR");
  const title = result.title.toLocaleLowerCase("ko-KR");
  let score = 0;
  if (title === needle) score += 100;
  else if (title.startsWith(needle)) score += 60;
  else if (title.includes(needle)) score += 40;
  if (result.tags.some((tag) => tag.toLocaleLowerCase("ko-KR") === needle)) {
    score += 24;
  }
  if (result.excerpt.toLocaleLowerCase("ko-KR").includes(needle)) score += 10;
  return score;
}

function itemCategoryLabel(category: unknown): string {
  switch (category) {
    case "WEAPON":
    case "ARMOR":
      return "장비";
    case "CONSUMABLE":
      return "소모품";
    case "MATERIAL":
      return "샘플";
    default:
      return "특수 물품";
  }
}

async function searchIndexedLore(
  query: string,
  viewer: LoreSearchViewer,
): Promise<LoreSearchResult[]> {
  const docs = await searchLoreDocuments(
    { query, statuses: INDEX_SEARCH_STATUSES, limit: MAX_RESULTS },
    { isAuthenticated: true, role: viewer.role, userId: viewer.userId },
  );
  const liveDocuments = await resolveLiveIndexDocuments(docs, viewer);
  return docs.flatMap((doc) => {
    const live = liveDocuments.get(doc.entityRef);
    // Missing live row, unsupported kind, personnel, or an out-of-date
    // projection are excluded instead of falling back to indexed text.
    if (
      !live ||
      asDate(doc.sourceUpdatedAt).getTime() !== live.updatedAt.getTime()
    ) {
      return [];
    }
    return [{
      kind: resultKindForEntity(doc.entityKind),
      key: entityRefKey(doc.entityRef),
      title: doc.title,
      excerpt: plainExcerpt(doc.summary ?? doc.subtitle ?? doc.searchText),
      category: doc.facets.categories?.[0] ?? resultKindForEntity(doc.entityKind),
      tags: doc.facets.tags ?? [],
      href: live.href,
      isPublic: live.isPublic,
      updatedAt: live.updatedAt,
      source: "index" as const,
      status: doc.status,
    }];
  });
}

async function searchFallbackLore(
  query: string,
  viewer: LoreSearchViewer,
): Promise<{
  results: LoreSearchResult[];
  degradedSources: LoreSearchDegradedSource[];
}> {
  const db = await getErpDb();
  const regex = new RegExp(escapeRegex(query), "i");
  const canViewPrivate = ROLE_LEVEL_RANK[viewer.role] >= ROLE_LEVEL_RANK.V;

  const wikiVisibility = canViewPrivate ? {} : { isPublic: true };
  const catalogVisibility = canViewPrivate
    ? {}
    : {
        $or: [
          { isPublic: { $ne: false } },
          { "workshop.ownerId": viewer.userId },
        ],
      };
  // wiki/character/organization은 isPublic === true만 공개다. master_items만
  // 기존 카탈로그 계약상 명시적 false가 아니면 legacy public으로 처리한다.
  const publicVisibility = canViewPrivate ? {} : { isPublic: true };
  const reportVisibility = sessionReportVisibilityFilter(viewer.role);
  const characterVisibility =
    viewer.role === "GM" ? {} : { isPublic: true };
  const characterBaseSearchFields = [
    { codename: { $regex: regex } },
    { role: { $regex: regex } },
    { "lore.loreTags": { $regex: regex } },
  ];
  const characterIdentitySearchFields = [
    { "lore.nickname": { $regex: regex } },
  ];
  const characterRealNameSearchFields = [
    { "lore.name": { $regex: regex } },
    { "lore.nameNative": { $regex: regex } },
    { "lore.nameEn": { $regex: regex } },
  ];
  const ownerIds: unknown[] = [viewer.userId];
  if (ObjectId.isValid(viewer.userId)) ownerIds.push(new ObjectId(viewer.userId));
  const ownerFilter = { ownerId: { $in: ownerIds } };
  const allowedOverrideLevels = Object.entries(ROLE_LEVEL_RANK)
    .filter(([, rank]) => rank <= ROLE_LEVEL_RANK[viewer.role])
    .map(([role]) => role);
  const clearanceFilter =
    viewer.role === "GM"
      ? {}
      : {
          $or: [
            ownerFilter,
            { "clearanceOverrides.identity": { $exists: false } },
            { "clearanceOverrides.identity": { $in: allowedOverrideLevels } },
          ],
        };
  const realNameFilter =
    viewer.role === "GM"
      ? {}
      : ROLE_LEVEL_RANK[viewer.role] >= ROLE_LEVEL_RANK.G
        ? clearanceFilter
        : ownerFilter;
  const characterProjection = {
    codename: 1,
    type: 1,
    role: 1,
    agentLevel: 1,
    department: 1,
    factionCode: 1,
    institutionCode: 1,
    previewImage: 1,
    ownerId: 1,
    clearanceOverrides: 1,
    isPublic: 1,
    updatedAt: 1,
    "lore.name": 1,
    "lore.nameNative": 1,
    "lore.nickname": 1,
    "lore.nameEn": 1,
    "lore.loreTags": 1,
    "lore.mainImage": 1,
  };
  const findPersonnelCandidates = (
    fields: Document[],
    access: Document,
  ) =>
    db
      .collection("characters")
      .find({ $and: [characterVisibility, access, { $or: fields }] })
      .project(characterProjection)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(FALLBACK_LIMIT_PER_KIND)
      .toArray();
  const personnelQuery = Promise.all([
    findPersonnelCandidates(characterBaseSearchFields, {}),
    findPersonnelCandidates(characterIdentitySearchFields, clearanceFilter),
    findPersonnelCandidates(characterRealNameSearchFields, realNameFilter),
  ]).then((candidateGroups) => {
    const unique = new Map<string, Document>();
    for (const doc of candidateGroups.flat()) unique.set(String(doc._id), doc);
    return [...unique.values()];
  });

  const settled = await Promise.allSettled([
    db
      .collection("wiki_pages")
      .find({
        $and: [
          wikiVisibility,
          {
            $or: [
              { title: { $regex: regex } },
              { content: { $regex: regex } },
              { tags: { $regex: regex } },
            ],
          },
        ],
      })
      .project({
        slug: 1,
        title: 1,
        content: 1,
        category: 1,
        tags: 1,
        isPublic: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(FALLBACK_LIMIT_PER_KIND)
      .toArray(),
    db
      .collection("session_reports")
      .find({
        $and: [
          reportVisibility,
          {
            $or: [
              { sessionId: { $regex: regex } },
              { sessionTitle: { $regex: regex } },
              { summary: { $regex: regex } },
              { highlights: { $regex: regex } },
              { participants: { $regex: regex } },
              { locationLabel: { $regex: regex } },
            ],
          },
        ],
      })
      .project({
        sessionId: 1,
        sessionTitle: 1,
        summary: 1,
        highlights: 1,
        locationLabel: 1,
        minRole: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(FALLBACK_LIMIT_PER_KIND)
      .toArray(),
    personnelQuery,
    db
      .collection("master_items")
      .find({
        $and: [
          catalogVisibility,
          {
            $or: [
              { name: { $regex: regex } },
              { nameEn: { $regex: regex } },
              { description: { $regex: regex } },
              { tags: { $regex: regex } },
              { loreMd: { $regex: regex } },
            ],
          },
        ],
      })
      .project({
        slug: 1,
        name: 1,
        description: 1,
        category: 1,
        tags: 1,
        isPublic: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(FALLBACK_LIMIT_PER_KIND)
      .toArray(),
    db
      .collection("factions")
      .find({
        $and: [
          publicVisibility,
          {
            $or: [
              { code: { $regex: regex } },
              { label: { $regex: regex } },
              { labelEn: { $regex: regex } },
              { summary: { $regex: regex } },
              { ideology: { $regex: regex } },
              { tags: { $regex: regex } },
              { loreMd: { $regex: regex } },
            ],
          },
        ],
      })
      .project({
        code: 1,
        label: 1,
        summary: 1,
        tags: 1,
        isPublic: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(FALLBACK_LIMIT_PER_KIND)
      .toArray(),
    db
      .collection("institutions")
      .find({
        $and: [
          publicVisibility,
          {
            $or: [
              { code: { $regex: regex } },
              { label: { $regex: regex } },
              { labelEn: { $regex: regex } },
              { summary: { $regex: regex } },
              { mission: { $regex: regex } },
              { tags: { $regex: regex } },
              { loreMd: { $regex: regex } },
            ],
          },
        ],
      })
      .project({
        code: 1,
        label: 1,
        summary: 1,
        tags: 1,
        isPublic: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(FALLBACK_LIMIT_PER_KIND)
      .toArray(),
  ]);

  const values = settled.map((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const degradedSources = settled.flatMap((result, index) =>
    result.status === "rejected" ? [FALLBACK_SOURCES[index]] : [],
  );
  const [wiki, reports, personnel, catalog, factions, institutions] = values;

  const results: LoreSearchResult[] = [
    ...wiki.map((doc) => ({
      kind: "wiki" as const,
      key: asString(doc.slug) || String(doc._id),
      title: asString(doc.title),
      excerpt: plainExcerpt(doc.content),
      category: asString(doc.category) || "위키",
      tags: asTags(doc.tags),
      href: `/erp/wiki/${String(doc._id)}`,
      isPublic: doc.isPublic !== false,
      updatedAt: asDate(doc.updatedAt),
      source: "fallback" as const,
    })),
    ...reports.map((doc) => ({
      kind: "report" as const,
      key: asString(doc.sessionId) || String(doc._id),
      title: asString(doc.sessionTitle),
      excerpt: plainExcerpt(
        doc.summary || (Array.isArray(doc.highlights) ? doc.highlights.join(" ") : ""),
      ),
      category: "작전 보고서",
      tags: [asString(doc.sessionId), asString(doc.locationLabel)].filter(Boolean),
      href: `/erp/sessions/report/${String(doc._id)}`,
      isPublic: isSessionReportVisibleToRole(doc, "U"),
      updatedAt: asDate(doc.updatedAt),
      source: "fallback" as const,
    })),
    ...personnel.flatMap((doc) => {
      const clearance = getEffectivePersonnelClearance(
        viewer.userId,
        viewer.role,
        { ownerId: doc.ownerId ?? null },
      );
      const masked = filterCharacterForList(
        doc as unknown as CharacterListItem,
        clearance,
      );
      const lore = masked.lore;
      // Mongo candidate matching may include a field hidden by a per-character
      // override. Re-match only the clearance-filtered projection to avoid a
      // hidden-name existence oracle in the response.
      const visibleSearchText = [
        masked.codename,
        masked.role,
        lore.name,
        lore.nameNative,
        lore.nameEn,
        lore.nickname,
        ...(lore.loreTags ?? []),
      ]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLocaleLowerCase("ko-KR");
      if (!visibleSearchText.includes(query.toLocaleLowerCase("ko-KR"))) {
        return [];
      }
      return [{
        kind: "personnel" as const,
        key: asString(masked.codename) || String(doc._id),
        title: maskedDisplayName(masked, clearance),
        excerpt: plainExcerpt(
          [masked.role, lore.nickname, masked.department].filter(Boolean).join(" · "),
        ),
        category: masked.type === "AGENT" ? "AGENT" : "NPC",
        tags: asTags(lore.loreTags),
        href: `/erp/personnel/${String(doc._id)}`,
        isPublic: doc.isPublic === true,
        updatedAt: asDate(doc.updatedAt),
        source: "fallback" as const,
      }];
    }),
    ...catalog.map((doc) => ({
      kind: "catalog" as const,
      key: asString(doc.slug) || String(doc._id),
      title: asString(doc.name),
      excerpt: plainExcerpt(doc.description),
      category: itemCategoryLabel(doc.category),
      tags: asTags(doc.tags),
      href: `/erp/wiki/catalog/item/${encodeURIComponent(
        asString(doc.slug) || String(doc._id),
      )}`,
      isPublic: doc.isPublic !== false,
      updatedAt: asDate(doc.updatedAt),
      source: "fallback" as const,
    })),
    ...factions.map((doc) => ({
      kind: "faction" as const,
      key: asString(doc.code) || String(doc._id),
      title: asString(doc.label),
      excerpt: plainExcerpt(doc.summary),
      category: "세력",
      tags: asTags(doc.tags),
      href: `/erp/factions/${asString(doc.code).toLocaleLowerCase("en-US")}`,
      isPublic: doc.isPublic === true,
      updatedAt: asDate(doc.updatedAt),
      source: "fallback" as const,
    })),
    ...institutions.map((doc) => ({
      kind: "institution" as const,
      key: asString(doc.code) || String(doc._id),
      title: asString(doc.label),
      excerpt: plainExcerpt(doc.summary),
      category: "기관",
      tags: asTags(doc.tags),
      href: `/erp/factions/${asString(doc.code).toLocaleLowerCase("en-US")}`,
      isPublic: doc.isPublic === true,
      updatedAt: asDate(doc.updatedAt),
      source: "fallback" as const,
    })),
  ].filter((result) => result.title && result.href !== "/erp/factions/");

  return { results, degradedSources };
}

export async function searchLore(
  rawQuery: string,
  viewer: LoreSearchViewer,
): Promise<LoreSearchResponse> {
  const query = rawQuery.trim().slice(0, 120);
  if (query.length < 2) {
    return { results: [], sourceMode: "fallback", degradedSources: [] };
  }

  const [indexOutcome, fallbackOutcome] = await Promise.all([
    searchIndexedLore(query, viewer).then(
      (results) => ({ ok: true as const, results }),
      () => ({ ok: false as const, results: [] as LoreSearchResult[] }),
    ),
    searchFallbackLore(query, viewer),
  ]);
  const indexed = indexOutcome.results;
  const fallback = fallbackOutcome.results;
  const degradedSources: LoreSearchDegradedSource[] = [
    ...(indexOutcome.ok ? [] : (["index"] as const)),
    ...fallbackOutcome.degradedSources,
  ];
  if (
    (!indexOutcome.ok || indexed.length === 0) &&
    fallbackOutcome.degradedSources.length === FALLBACK_SOURCES.length
  ) {
    throw new Error("모든 로어 검색 소스를 조회하지 못했습니다.");
  }
  const merged = new Map<string, LoreSearchResult>();
  // href is the canonical live identity. Index refs can use an id while the
  // fallback uses a slug/code; dedupe by resolved href and let current SSOT
  // content win over the auxiliary projection.
  for (const result of [...indexed, ...fallback]) {
    merged.set(result.href, result);
  }
  const results = [...merged.values()]
    .sort((left, right) => {
      const scoreDifference =
        scoreResult(right, query) - scoreResult(left, query);
      if (scoreDifference !== 0) return scoreDifference;
      return right.updatedAt.getTime() - left.updatedAt.getTime();
    })
    .slice(0, MAX_RESULTS);

  return {
    results,
    degradedSources,
    sourceMode:
      indexed.length > 0 && fallback.length > 0
        ? "hybrid"
        : indexed.length > 0
          ? "index"
          : "fallback",
  };
}
