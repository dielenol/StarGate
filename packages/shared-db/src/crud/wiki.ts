/**
 * wiki_pages / wiki_page_revisions CRUD
 */

import { ObjectId, type ClientSession, type Filter } from "mongodb";

import type {
  CreateWikiPageInput,
  UpdateWikiPageInput,
  WikiPage,
  WikiPageSummary,
  WikiPageSummaryConnection,
  WikiPageLite,
  WikiPageRevision,
} from "../types/index.js";

import {
  wikiPagesCol,
  wikiPageRevisionsCol,
} from "../collections.js";
import { getClient } from "../client.js";
import { lockAndAssertNoSessionReportInboundReference } from "./session-report-reference-integrity.js";
import {
  withoutSessionReportReferenceStorageFields,
  withoutSessionReportReferenceStorageFieldsMany,
} from "./internal-storage.js";

/* ── 슬러그 생성 ── */

function toSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

const WIKI_PAGE_DEFAULT_LIMIT = 20;
const WIKI_PAGE_MAX_LIMIT = 50;

interface WikiPageCursor {
  id: string;
  updatedAt: string;
}

export interface ListWikiPageSummariesOptions {
  category?: string;
  cursor?: string;
  includePrivate?: boolean;
  limit?: number;
  query?: string;
}

export class InvalidWikiPageCursorError extends Error {
  constructor() {
    super("잘못된 위키 페이지 커서입니다.");
    this.name = "InvalidWikiPageCursorError";
  }
}

function visibilityFilter(includePrivate: boolean): Filter<WikiPage> {
  return includePrivate ? {} : { isPublic: true };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wikiSearchFilter(query?: string): Filter<WikiPage> {
  const normalized = query?.trim();
  if (!normalized) return {};
  const regex = new RegExp(escapeRegex(normalized), "i");
  return {
    $or: [
      { title: { $regex: regex } },
      { content: { $regex: regex } },
      { tags: { $regex: regex } },
    ],
  };
}

function encodeCursor(page: Pick<WikiPage, "_id" | "updatedAt">): string {
  return Buffer.from(
    JSON.stringify({
      id: page._id?.toString() ?? "",
      updatedAt: page.updatedAt.toISOString(),
    } satisfies WikiPageCursor),
  ).toString("base64url");
}

function decodeCursor(cursor: string): { id: ObjectId; updatedAt: Date } {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<WikiPageCursor>;
    if (!value.id || !ObjectId.isValid(value.id) || !value.updatedAt) {
      throw new InvalidWikiPageCursorError();
    }
    const updatedAt = new Date(value.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      throw new InvalidWikiPageCursorError();
    }
    return { id: new ObjectId(value.id), updatedAt };
  } catch (error) {
    if (error instanceof InvalidWikiPageCursorError) throw error;
    throw new InvalidWikiPageCursorError();
  }
}

function plainWikiExcerpt(content: string, maxLength = 220): string {
  const normalized = content
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (_match, key, label) =>
      String(label ?? key).trim(),
    )
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/[`*_>#|~-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

type WikiPageSummarySource = Pick<
  WikiPage,
  | "_id"
  | "slug"
  | "title"
  | "content"
  | "category"
  | "tags"
  | "isPublic"
  | "authorName"
  | "createdAt"
  | "updatedAt"
>;

function toWikiPageSummary(page: WikiPageSummarySource): WikiPageSummary {
  return {
    _id: page._id!,
    slug: page.slug,
    title: page.title,
    excerpt: plainWikiExcerpt(page.content),
    category: page.category,
    tags: page.tags ?? [],
    isPublic: page.isPublic === true,
    authorName: page.authorName,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

/**
 * 서버 페이지네이션 위키 목록.
 *
 * visibility/category/search/cursor 조건을 Mongo 쿼리에 적용한 뒤 제한된 행만
 * 읽고, 본문은 excerpt로 축약한다. facets는 현재 검색어와 visibility를 공유하되
 * category 선택은 제외하여 다른 분류로 이동할 수 있게 한다.
 */
export async function listWikiPageSummaries(
  options: ListWikiPageSummariesOptions = {},
): Promise<WikiPageSummaryConnection> {
  const col = await wikiPagesCol();
  const includePrivate = options.includePrivate === true;
  const requestedLimit = Math.trunc(options.limit ?? WIKI_PAGE_DEFAULT_LIMIT);
  const limit = Math.min(Math.max(requestedLimit, 1), WIKI_PAGE_MAX_LIMIT);
  const baseFilters: Filter<WikiPage>[] = [
    visibilityFilter(includePrivate),
    wikiSearchFilter(options.query),
  ];
  const listFilters = [...baseFilters];
  const category = options.category?.trim();
  if (category) listFilters.push({ category });
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    listFilters.push({
      $or: [
        { updatedAt: { $lt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
      ],
    });
  }

  const listFilter: Filter<WikiPage> = { $and: listFilters };
  const countFilters = [...baseFilters];
  if (category) countFilters.push({ category });
  const countFilter: Filter<WikiPage> = { $and: countFilters };
  const facetFilter: Filter<WikiPage> = { $and: baseFilters };
  const publicFilter = visibilityFilter(includePrivate);

  const projection = {
    _id: 1,
    slug: 1,
    title: 1,
    content: 1,
    category: 1,
    tags: 1,
    isPublic: 1,
    authorName: 1,
    createdAt: 1,
    updatedAt: 1,
  } as const;

  const rowsPromise = col
    .find(listFilter)
    .project<WikiPageSummarySource>(projection)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  // cursor 후속 페이지는 첫 응답의 metadata를 재사용하므로 count/facet/recent를
  // 다시 집계하지 않는다. 데이터가 커져도 "더 보기" 비용은 limit 행 조회에 고정된다.
  const metadataPromise = options.cursor
    ? Promise.resolve([
        0,
        [] as { _id: string; count: number }[],
        [] as WikiPageSummarySource[],
      ] as const)
    : Promise.all([
        col.countDocuments(countFilter),
        col
          .aggregate<{ _id: string; count: number }>([
            { $match: facetFilter },
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ])
          .toArray(),
        col
          .find(publicFilter)
          .project<WikiPageSummarySource>(projection)
          .sort({ updatedAt: -1, _id: -1 })
          .limit(5)
          .toArray(),
      ] as const);
  const [rows, [totalCount, facetRows, recentRows]] = await Promise.all([
    rowsPromise,
    metadataPromise,
  ]);

  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;
  const lastPage = visibleRows.at(-1);
  return {
    pages: visibleRows.map(toWikiPageSummary),
    facets: facetRows.map((facet) => ({
      category: facet._id || "미분류",
      count: facet.count,
    })),
    recent: recentRows.map(toWikiPageSummary),
    totalCount,
    nextCursor: hasMore && lastPage ? encodeCursor(lastPage) : null,
  };
}

/* ── 조회 ── */

export async function listWikiPages(
  options: { includePrivate?: boolean } = {},
): Promise<WikiPage[]> {
  const col = await wikiPagesCol();
  return withoutSessionReportReferenceStorageFieldsMany(
    await col
      .find(visibilityFilter(options.includePrivate === true))
      .sort({ category: 1, title: 1 })
      .toArray(),
  );
}

/**
 * 본문(content/tags/authorName/slug) 을 제외한 경량 list.
 *
 * - 대시보드 카운트, 최근 갱신 N개 카드처럼 본문이 필요 없는 표시 경로 전용.
 * - projection 으로 네트워크/메모리/직렬화 비용을 본문 길이에 무관하게 유지.
 * - 본문이 필요한 화면(상세, 검색, tags 카드)은 listWikiPages / searchWikiPages
 *   / findWikiPageById 를 사용. 타입 시스템상 WikiPageLite 에는 content 필드가
 *   없어 잘못 사용 시 컴파일 단계에서 차단된다.
 */
export async function listWikiPagesLite(): Promise<WikiPageLite[]> {
  const col = await wikiPagesCol();
  return col
    .find()
    .project<WikiPageLite>({
      _id: 1,
      title: 1,
      category: 1,
      isPublic: 1,
      authorId: 1,
      createdBy: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ category: 1, title: 1 })
    .toArray();
}

/**
 * 최근 갱신 순 상위 N 개의 초경량 위키 행 — 대시보드 "최근 위키" 카드 전용.
 *
 * `listWikiPagesLite` 전체 로드 + JS 재정렬 대체: projection 을 title/updatedAt 만으로
 * 더 좁히고 정렬(`updatedAt: -1`)·limit 을 DB 로 내린다.
 * 카테고리/공개여부 등 목록 필드가 필요한 화면은 `listWikiPagesLite` 를 사용할 것.
 * limit ≤ 0 은 빈 배열 — Mongo `limit(0)` 의 "무제한" 함정 방지.
 */
export async function listRecentWikiPagesLite(
  limit: number,
  options: { includePrivate?: boolean } = {},
): Promise<Pick<WikiPageLite, "_id" | "title" | "updatedAt">[]> {
  if (limit <= 0) return [];
  const col = await wikiPagesCol();
  return col
    .find(visibilityFilter(options.includePrivate === true))
    .project<Pick<WikiPageLite, "_id" | "title" | "updatedAt">>({
      _id: 1,
      title: 1,
      updatedAt: 1,
    })
    // _id 보조 키: seed 일괄 쓰기의 동일 updatedAt 동점 순서 결정화 (ETag 해시 입력 안정).
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
}

/** 자동링크/카테고리 내비/연관 매칭용 참조 행 — 본문(content) 제외. */
export type WikiPageRef = Pick<
  WikiPage,
  "_id" | "slug" | "title" | "category" | "tags" | "isPublic"
>;

/**
 * 위키 상세의 자동링크 타깃/카테고리 내비 전용 참조 list — `listWikiPages()` 대체.
 *
 * - auto-link 타깃 빌더(`buildWikiAutoLinkTargets`)와 `wikiRelatedLinks` 후보 매칭이
 *   소비하는 필드(_id/slug/title/category/tags)+공개여부 필터(isPublic)만 포함.
 * - **본문(content)이 매칭에 참여하는 경로는 사용 금지** — 작전 보고서 상세의
 *   `relatedWikiForReport`, 카탈로그 상세의 `relatedWikiForCatalogItem`, 세력 보드의
 *   본문 키워드 카운트는 content 전문 스캔이 필요하므로 `listWikiPages()` 를 유지할 것.
 * - 정렬은 `listWikiPages` 와 동일한 `{ category: 1, title: 1 }` — 목록 대체 시 순서 보존.
 */
export async function listWikiPageRefs(
  options: { includePrivate?: boolean } = {},
): Promise<WikiPageRef[]> {
  const col = await wikiPagesCol();
  return col
    .find(visibilityFilter(options.includePrivate === true))
    .project<WikiPageRef>({
      _id: 1,
      slug: 1,
      title: 1,
      category: 1,
      tags: 1,
      isPublic: 1,
    })
    .sort({ category: 1, title: 1 })
    .toArray();
}

export async function listPublicWikiPages(): Promise<WikiPage[]> {
  const col = await wikiPagesCol();
  return withoutSessionReportReferenceStorageFieldsMany(
    await col
      .find({ isPublic: true })
      .sort({ category: 1, title: 1 })
      .toArray(),
  );
}

export async function listWikiPagesByCategory(
  category: string
): Promise<WikiPage[]> {
  const col = await wikiPagesCol();
  return withoutSessionReportReferenceStorageFieldsMany(
    await col.find({ category }).sort({ title: 1 }).toArray(),
  );
}

export async function findWikiPageById(
  id: string,
  options: { session?: ClientSession } = {},
): Promise<WikiPage | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await wikiPagesCol();
  const page = await col.findOne(
    { _id: new ObjectId(id) },
    { session: options.session },
  );
  return page ? withoutSessionReportReferenceStorageFields(page) : null;
}

export async function findVisibleWikiPageById(
  id: string,
  options: { includePrivate?: boolean } = {},
): Promise<WikiPage | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await wikiPagesCol();
  const page = await col.findOne({
    $and: [
      { _id: new ObjectId(id) },
      visibilityFilter(options.includePrivate === true),
    ],
  });
  return page ? withoutSessionReportReferenceStorageFields(page) : null;
}

export async function findWikiPageBySlug(slug: string): Promise<WikiPage | null> {
  const col = await wikiPagesCol();
  const page = await col.findOne({ slug });
  return page ? withoutSessionReportReferenceStorageFields(page) : null;
}

export async function searchWikiPages(query: string): Promise<WikiPage[]> {
  const col = await wikiPagesCol();
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return withoutSessionReportReferenceStorageFieldsMany(
    await col
      .find({
        $or: [
          { title: { $regex: regex } },
          { content: { $regex: regex } },
          { tags: { $regex: regex } },
        ],
      })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray(),
  );
}

/* ── 생성 ── */

export async function createWikiPage(
  input: CreateWikiPageInput,
  options: { session?: ClientSession } = {},
): Promise<WikiPage> {
  const col = await wikiPagesCol();
  const now = new Date();
  const safeInput = withoutSessionReportReferenceStorageFields(input);
  const slug = safeInput.slug || toSlug(safeInput.title);

  const doc: WikiPage = {
    ...safeInput,
    slug,
    createdAt: now,
    updatedAt: now,
  };

  const result = await col.insertOne(doc, { session: options.session });
  return { ...doc, _id: result.insertedId };
}

/* ── 수정 (리비전 자동 생성) ── */

export async function updateWikiPage(
  id: string,
  update: UpdateWikiPageInput,
  editorId: string,
  editorName: string,
  expectedUpdatedAt?: Date | null,
  options: { session?: ClientSession } = {},
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  if (update.isPublic === false && !options.session) {
    const session = (await getClient()).startSession();
    let updated = false;
    try {
      await session.withTransaction(async () => {
        updated = await updateWikiPage(
          id,
          update,
          editorId,
          editorName,
          expectedUpdatedAt,
          { session },
        );
      });
      return updated;
    } finally {
      await session.endSession();
    }
  }
  const col = await wikiPagesCol();
  const existing = await col.findOne(
    { _id: new ObjectId(id) },
    { session: options.session },
  );
  if (!existing) return false;
  if (update.isPublic === false && existing.isPublic === true) {
    await lockAndAssertNoSessionReportInboundReference(
      "relatedWikiSlugs",
      existing.slug,
      options.session!,
    );
  }

  const filter: Record<string, unknown> = { _id: new ObjectId(id) };
  if (expectedUpdatedAt !== undefined) {
    filter.updatedAt = expectedUpdatedAt;
  }
  const result = await col.updateOne(
    filter,
    { $set: { ...update, updatedAt: new Date() } },
    { session: options.session },
  );
  if (result.modifiedCount === 0) return false;

  if (update.content && update.content !== existing.content) {
    const revCol = await wikiPageRevisionsCol();
    await revCol.insertOne(
      {
        pageId: id,
        content: existing.content,
        editedById: editorId,
        editedByName: editorName,
        createdAt: new Date(),
      },
      { session: options.session },
    );
  }
  return result.modifiedCount > 0;
}

/* ── 삭제 ── */

export async function deleteWikiPage(
  id: string,
  expectedUpdatedAt?: Date | null,
  options: { session?: ClientSession } = {},
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  if (!options.session) {
    const session = (await getClient()).startSession();
    let deleted = false;
    try {
      await session.withTransaction(async () => {
        deleted = await deleteWikiPage(id, expectedUpdatedAt, { session });
      });
      return deleted;
    } finally {
      await session.endSession();
    }
  }
  const col = await wikiPagesCol();
  const existing = await col.findOne(
    { _id: new ObjectId(id) },
    { session: options.session },
  );
  if (!existing) return false;
  await lockAndAssertNoSessionReportInboundReference(
    "relatedWikiSlugs",
    existing.slug,
    options.session,
  );
  const filter: Record<string, unknown> = { _id: new ObjectId(id) };
  if (expectedUpdatedAt !== undefined) filter.updatedAt = expectedUpdatedAt;
  const result = await col.deleteOne(filter, { session: options.session });

  if (result.deletedCount > 0) {
    const revCol = await wikiPageRevisionsCol();
    await revCol.deleteMany({ pageId: id }, { session: options.session });
  }

  return result.deletedCount > 0;
}

/* ── 리비전 조회 ── */

export async function listRevisions(
  pageId: string
): Promise<WikiPageRevision[]> {
  const revCol = await wikiPageRevisionsCol();
  return revCol.find({ pageId }).sort({ createdAt: -1 }).limit(50).toArray();
}
