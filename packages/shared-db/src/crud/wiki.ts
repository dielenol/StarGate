/**
 * wiki_pages / wiki_page_revisions CRUD
 */

import { ObjectId } from "mongodb";

import type {
  CreateWikiPageInput,
  UpdateWikiPageInput,
  WikiPage,
  WikiPageLite,
  WikiPageRevision,
} from "../types/index.js";

import {
  wikiPagesCol,
  wikiPageRevisionsCol,
} from "../collections.js";

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

/* ── 조회 ── */

export async function listWikiPages(): Promise<WikiPage[]> {
  const col = await wikiPagesCol();
  return col.find().sort({ category: 1, title: 1 }).toArray();
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
  limit: number
): Promise<Pick<WikiPageLite, "_id" | "title" | "updatedAt">[]> {
  if (limit <= 0) return [];
  const col = await wikiPagesCol();
  return col
    .find()
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
export async function listWikiPageRefs(): Promise<WikiPageRef[]> {
  const col = await wikiPagesCol();
  return col
    .find()
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
  return col
    .find({ isPublic: true })
    .sort({ category: 1, title: 1 })
    .toArray();
}

export async function listWikiPagesByCategory(
  category: string
): Promise<WikiPage[]> {
  const col = await wikiPagesCol();
  return col.find({ category }).sort({ title: 1 }).toArray();
}

export async function findWikiPageById(id: string): Promise<WikiPage | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await wikiPagesCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function findWikiPageBySlug(slug: string): Promise<WikiPage | null> {
  const col = await wikiPagesCol();
  return col.findOne({ slug });
}

export async function searchWikiPages(query: string): Promise<WikiPage[]> {
  const col = await wikiPagesCol();
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return col
    .find({
      $or: [
        { title: { $regex: regex } },
        { content: { $regex: regex } },
        { tags: { $regex: regex } },
      ],
    })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray();
}

/* ── 생성 ── */

export async function createWikiPage(
  input: CreateWikiPageInput
): Promise<WikiPage> {
  const col = await wikiPagesCol();
  const now = new Date();
  const slug = input.slug || toSlug(input.title);

  const doc: WikiPage = {
    ...input,
    slug,
    createdAt: now,
    updatedAt: now,
  };

  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/* ── 수정 (리비전 자동 생성) ── */

export async function updateWikiPage(
  id: string,
  update: UpdateWikiPageInput,
  editorId: string,
  editorName: string,
  expectedUpdatedAt?: Date | null
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await wikiPagesCol();
  const existing = await col.findOne({ _id: new ObjectId(id) });
  if (!existing) return false;

  const filter: Record<string, unknown> = { _id: new ObjectId(id) };
  if (expectedUpdatedAt !== undefined) {
    filter.updatedAt = expectedUpdatedAt;
  }
  const result = await col.updateOne(
    filter,
    { $set: { ...update, updatedAt: new Date() } }
  );
  if (result.modifiedCount === 0) return false;

  if (update.content && update.content !== existing.content) {
    const revCol = await wikiPageRevisionsCol();
    await revCol.insertOne({
      pageId: id,
      content: existing.content,
      editedById: editorId,
      editedByName: editorName,
      createdAt: new Date(),
    });
  }
  return result.modifiedCount > 0;
}

/* ── 삭제 ── */

export async function deleteWikiPage(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await wikiPagesCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount > 0) {
    const revCol = await wikiPageRevisionsCol();
    await revCol.deleteMany({ pageId: id });
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
