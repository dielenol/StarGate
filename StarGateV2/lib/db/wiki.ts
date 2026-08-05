/**
 * wiki CRUD — shared-db로 이전됨 (shim)
 */

import "./init";

export {
  listWikiPages,
  InvalidWikiPageCursorError,
  listWikiPageSummaries,
  listWikiPagesLite,
  listWikiPageRefs,
  listRecentWikiPagesLite,
  listPublicWikiPages,
  listWikiPagesByCategory,
  findWikiPageById,
  findVisibleWikiPageById,
  findWikiPageBySlug,
  searchWikiPages,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  listRevisions,
} from "@stargate/shared-db";

export type {
  ListWikiPageSummariesOptions,
  WikiPageRef,
} from "@stargate/shared-db";
