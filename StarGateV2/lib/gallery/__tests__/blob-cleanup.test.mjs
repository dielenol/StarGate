import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = {
  completedDocuments: [],
  completedIntents: [],
  completedOrphans: [],
  deferredDocuments: [],
  deleted: [],
  documents: [],
  failDeletes: new Set(),
  orphans: [],
  queued: [],
  referenced: new Set(),
};
globalThis.__galleryBlobCleanupTestState = state;

function moduleUrl(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: moduleUrl("export {};"), shortCircuit: true };
    }
    if (specifier === "@vercel/blob") {
      return {
        url: moduleUrl(`
          export async function del(pathname) {
            const state = globalThis.__galleryBlobCleanupTestState;
            const pathnames = Array.isArray(pathname) ? pathname : [pathname];
            for (const value of pathnames) {
              if (state.failDeletes.has(value)) throw new Error("DELETE_FAILED");
              state.deleted.push(value);
            }
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/db/gallery") {
      return {
        url: moduleUrl(`
          const state = globalThis.__galleryBlobCleanupTestState;
          export async function listGalleryDocumentBlobCleanupPending() { return state.documents; }
          export async function listGalleryOrphanBlobCleanupPending() { return state.orphans; }
          export async function isGalleryBlobReferenced(pathname) { return state.referenced.has(pathname); }
          export async function markGalleryBlobCleanupComplete(id) { state.completedDocuments.push(id); }
          export async function markGalleryBlobUploadIntentComplete(pathname) { state.completedIntents.push(pathname); }
          export async function markGalleryOrphanBlobCleanupComplete(id) { state.completedOrphans.push(id); }
          export async function recordGalleryDocumentBlobCleanupFailure(input) { state.deferredDocuments.push(input.id); }
          export async function recordGalleryOrphanBlobCleanup(input) { state.queued.push(input.pathname); }
        `),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { compensateGalleryBlobUploads, retryGalleryBlobCleanup } = await import(
  `../blob-cleanup.ts?test=${Date.now()}`
);

function resetState() {
  state.completedDocuments.length = 0;
  state.completedIntents.length = 0;
  state.completedOrphans.length = 0;
  state.deleted.length = 0;
  state.deferredDocuments.length = 0;
  state.documents.length = 0;
  state.failDeletes.clear();
  state.orphans.length = 0;
  state.queued.length = 0;
  state.referenced.clear();
}

test("복수 Blob 보상 중 일부 삭제 실패는 실패한 intent만 queue에 보존한다", async () => {
  resetState();
  state.failDeletes.add("thumbnail.webp");

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await compensateGalleryBlobUploads(
      [{ pathname: "original.webp" }, { pathname: "thumbnail.webp" }],
      "test-token",
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(state.deleted, ["original.webp"]);
  assert.deepEqual(state.completedIntents, ["original.webp"]);
  assert.deepEqual(state.queued, ["thumbnail.webp"]);
});

test("cleanup retry는 정상 document가 참조하는 Blob을 삭제하지 않는다", async () => {
  resetState();
  state.orphans.push(
    { _id: "referenced", pathname: "kept.webp" },
    { _id: "orphan", pathname: "removed.webp" },
  );
  state.referenced.add("kept.webp");

  await retryGalleryBlobCleanup("test-token");

  assert.deepEqual(state.deleted, ["removed.webp"]);
  assert.deepEqual(state.completedOrphans, ["referenced", "orphan"]);
});

test("document Blob 삭제 실패는 다음 batch로 미루고 완료 처리하지 않는다", async () => {
  resetState();
  state.documents.push({
    _id: "document-1",
    image: { pathname: "failed-original.webp" },
  });
  state.failDeletes.add("failed-original.webp");

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await retryGalleryBlobCleanup("test-token");
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(state.completedDocuments, []);
  assert.deepEqual(state.deferredDocuments, ["document-1"]);
});
