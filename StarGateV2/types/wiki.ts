/**
 * @deprecated shared-db에서 직접 import하세요.
 */

export type {
  WikiPage,
  WikiPageRevision,
  CreateWikiPageInput,
  UpdateWikiPageInput,
} from "@stargate/shared-db/types";

import type { WikiPage } from "@stargate/shared-db/types";

export type WikiPageClient = Omit<
  WikiPage,
  "_id" | "createdAt" | "updatedAt"
> & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};
