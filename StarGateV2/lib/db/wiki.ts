/**
 * wiki CRUD — shared-db로 이전됨 (shim)
 */

import "./init";

export {
  listWikiPages,
  listWikiPagesLite,
  listWikiPageRefs,
  listRecentWikiPagesLite,
  listPublicWikiPages,
  listWikiPagesByCategory,
  findWikiPageById,
  findWikiPageBySlug,
  searchWikiPages,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  listRevisions,
} from "@stargate/shared-db";

export type { WikiPageRef } from "@stargate/shared-db";
