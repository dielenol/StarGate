/**
 * wiki CRUD — shared-db로 이전됨 (shim)
 */

import "./init";

export {
  listWikiPages,
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
