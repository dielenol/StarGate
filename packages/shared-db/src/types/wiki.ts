import type { ObjectId } from "mongodb";

export interface WikiPage {
  _id?: ObjectId;
  slug: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WikiPageRevision {
  _id?: ObjectId;
  pageId: string;
  content: string;
  editedById: string;
  editedByName: string;
  createdAt: Date;
}

export type CreateWikiPageInput = Omit<
  WikiPage,
  "_id" | "createdAt" | "updatedAt"
>;

export type UpdateWikiPageInput = Partial<
  Pick<WikiPage, "title" | "content" | "category" | "tags" | "isPublic">
>;
