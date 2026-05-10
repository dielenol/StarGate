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
  editorName: string
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await wikiPagesCol();
  const existing = await col.findOne({ _id: new ObjectId(id) });
  if (!existing) return false;

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

  const result = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } }
  );
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
