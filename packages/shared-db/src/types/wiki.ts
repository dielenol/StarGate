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

/**
 * 목록/대시보드 카드용 경량 projection.
 *
 * - content / tags / authorName / slug 등 본문 필드는 포함하지 않는다 →
 *   wiki 본문이 평균 수 KB 일 때 list 응답이 page 수 비례로 비대해지는 것을 차단.
 * - createdBy 는 일부 도큐먼트가 추가로 갖는 필드(레거시) — dashboard 가
 *   "내가 작성한 위키" 카운트에 사용해 optional 로 노출.
 * - 본문이 필요한 화면(상세, 검색, tags 카드)은 절대 이 타입을 쓰지 말고
 *   findWikiPageById / searchWikiPages / listWikiPages 를 사용.
 */
export interface WikiPageLite {
  _id?: ObjectId;
  title: string;
  category: string;
  isPublic: boolean;
  authorId: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 위키 목록/검색 카드 전용 경량 projection.
 *
 * 본문 전문 대신 서버에서 생성한 짧은 excerpt만 전달하여 목록 응답 크기가
 * 문서 본문 총량에 비례해 커지지 않게 한다.
 */
export interface WikiPageSummary {
  _id: ObjectId;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WikiCategoryFacet {
  category: string;
  count: number;
}

export interface WikiPageSummaryConnection {
  pages: WikiPageSummary[];
  facets: WikiCategoryFacet[];
  recent: WikiPageSummary[];
  totalCount: number;
  nextCursor: string | null;
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
