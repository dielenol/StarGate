/**
 * @deprecated shared-db에서 직접 import하세요.
 */

export type {
  WikiPage,
  WikiPageSummary,
  WikiCategoryFacet,
  WikiPageSummaryConnection,
  WikiPageRevision,
  CreateWikiPageInput,
  UpdateWikiPageInput,
} from "@stargate/shared-db/types";

import type { WikiPage } from "@stargate/shared-db/types";
import type {
  WikiCategoryFacet,
  WikiPageSummary,
} from "@stargate/shared-db/types";

export type WikiPageClient = Omit<
  WikiPage,
  "_id" | "authorId" | "createdAt" | "updatedAt"
> & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export type WikiPageSummaryClient = Omit<
  WikiPageSummary,
  "_id" | "createdAt" | "updatedAt"
> & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export interface WikiPageSummaryConnectionClient {
  pages: WikiPageSummaryClient[];
  facets: WikiCategoryFacet[];
  recent: WikiPageSummaryClient[];
  totalCount: number;
  nextCursor: string | null;
}
