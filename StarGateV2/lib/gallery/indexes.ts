import type { Db, IndexDescription } from "mongodb";

const FANART_COLLECTION_NAME = "gallery_fanarts";
const BLOB_CLEANUP_COLLECTION_NAME = "gallery_blob_cleanup_queue";

export const GALLERY_INDEX_DEFINITIONS: IndexDescription[] = [
  {
    key: { status: 1, createdAt: -1, _id: -1 },
    name: "gallery_fanarts_status_createdAt",
  },
  {
    key: { authorId: 1, status: 1, createdAt: -1 },
    name: "gallery_fanarts_author_status_createdAt",
  },
  {
    key: { sessionId: 1, status: 1, createdAt: -1 },
    name: "gallery_fanarts_session_status_createdAt",
    partialFilterExpression: { sessionId: { $type: "string" } },
  },
  {
    key: {
      status: 1,
      blobCleanupPending: 1,
      blobCleanupNextAttemptAt: 1,
      deletedAt: 1,
      _id: 1,
    },
    name: "gallery_fanarts_blob_cleanup_pending",
    partialFilterExpression: {
      status: "DELETED",
      blobCleanupPending: true,
    },
  },
];

export const GALLERY_BLOB_CLEANUP_INDEX_DEFINITIONS: IndexDescription[] = [
  {
    key: { retryAfter: 1, updatedAt: 1, _id: 1 },
    name: "gallery_blob_cleanup_retryAfter",
  },
];

export async function ensureGalleryIndexes(database: Db): Promise<void> {
  const fanarts = database.collection(FANART_COLLECTION_NAME);
  for (const index of GALLERY_INDEX_DEFINITIONS) {
    const { key, ...options } = index;
    await fanarts.createIndex(key, options);
  }
  const cleanup = database.collection(BLOB_CLEANUP_COLLECTION_NAME);
  for (const index of GALLERY_BLOB_CLEANUP_INDEX_DEFINITIONS) {
    const { key, ...options } = index;
    await cleanup.createIndex(key, options);
  }
}
