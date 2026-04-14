/**
 * wiki_pages / wiki_page_revisions CRUD
 */

import { ObjectId } from "mongodb";

import type {
  CreateWikiPageInput,
  UpdateWikiPageInput,
  WikiPage,
  WikiPageRevision,
} from "@/types/wiki";

import { wikiPagesCollection, wikiRevisionsCollection } from "./collections";

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
  const col = await wikiPagesCollection();
  return col.find().sort({ category: 1, title: 1 }).toArray();
}

export async function listPublicWikiPages(): Promise<WikiPage[]> {
  const col = await wikiPagesCollection();
  return col
    .find({ isPublic: true })
    .sort({ category: 1, title: 1 })
    .toArray();
}

export async function listWikiPagesByCategory(
  category: string,
): Promise<WikiPage[]> {
  const col = await wikiPagesCollection();
  return col.find({ category }).sort({ title: 1 }).toArray();
}

export async function findWikiPageById(
  id: string,
): Promise<WikiPage | null> {
  const col = await wikiPagesCollection();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function findWikiPageBySlug(
  slug: string,
): Promise<WikiPage | null> {
  const col = await wikiPagesCollection();
  return col.findOne({ slug });
}

export async function searchWikiPages(query: string): Promise<WikiPage[]> {
  const col = await wikiPagesCollection();
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
  input: CreateWikiPageInput,
): Promise<WikiPage> {
  const col = await wikiPagesCollection();
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
): Promise<boolean> {
  const col = await wikiPagesCollection();
  const existing = await col.findOne({ _id: new ObjectId(id) });
  if (!existing) return false;

  // 내용이 변경되면 리비전 저장
  if (update.content && update.content !== existing.content) {
    const revCol = await wikiRevisionsCollection();
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
    { $set: { ...update, updatedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}

/* ── 삭제 ── */

export async function deleteWikiPage(id: string): Promise<boolean> {
  const col = await wikiPagesCollection();
  const result = await col.deleteOne({ _id: new ObjectId(id) });

  // 리비전도 삭제
  if (result.deletedCount > 0) {
    const revCol = await wikiRevisionsCollection();
    await revCol.deleteMany({ pageId: id });
  }

  return result.deletedCount > 0;
}

/* ── 리비전 조회 ── */

export async function listRevisions(
  pageId: string,
): Promise<WikiPageRevision[]> {
  const revCol = await wikiRevisionsCollection();
  return revCol
    .find({ pageId })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
}

/* ── 인덱스 보장 ── */

export async function ensureWikiIndexes(): Promise<void> {
  const col = await wikiPagesCollection();
  await col.createIndex({ slug: 1 }, { unique: true });
  await col.createIndex({ category: 1 });
  await col.createIndex({ tags: 1 });
  await col.createIndex({ isPublic: 1 });

  const revCol = await wikiRevisionsCollection();
  await revCol.createIndex({ pageId: 1, createdAt: -1 });
}
