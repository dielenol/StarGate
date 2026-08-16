import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = {
  blobGets: 0,
  blobPuts: 0,
  cleanupMutations: 0,
  dailyCapacityChecks: 0,
  dbReads: 0,
  fanart: null,
  formDataReads: 0,
  imageNormalizations: 0,
  session: null,
  tokenReads: 0,
  uploadLeaseAcquisitions: 0,
  uploadLeaseBusy: false,
  uploadLeaseReleases: 0,
};
globalThis.__galleryRouteBehaviorTestState = state;

function moduleUrl(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return {
        url: moduleUrl(`
          export const NextResponse = {
            json(value, init) {
              return Response.json(value, init);
            },
          };
          export function after() {}
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@vercel/blob") {
      return {
        url: moduleUrl(`
          export async function get() {
            globalThis.__galleryRouteBehaviorTestState.blobGets += 1;
            throw new Error("Unexpected Blob get");
          }
          export async function put() {
            globalThis.__galleryRouteBehaviorTestState.blobPuts += 1;
            throw new Error("Unexpected Blob put");
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/api/idempotency") {
      return {
        url: moduleUrl(`
          export function isValidIdempotencyKey(value) {
            return typeof value === "string" && value.length > 0;
          }
          export function readIdempotencyKey(request) {
            return request.headers.get("idempotency-key");
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/auth/active-session") {
      return {
        url: moduleUrl(`
          export async function getActiveSession() {
            return globalThis.__galleryRouteBehaviorTestState.session;
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/auth/guest") {
      return {
        url: moduleUrl(`
          export const GUEST_READ_ONLY_ERROR_CODE = "GUEST_READ_ONLY";
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/auth/rbac") {
      return {
        url: moduleUrl(`
          const levels = { U: 0, J: 1, G: 2, H: 3, M: 4, A: 5, V: 6, GM: 7 };
          export function hasRole(role, required) {
            return levels[role] >= levels[required];
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/db/gallery") {
      return {
        url: moduleUrl(`
          const state = globalThis.__galleryRouteBehaviorTestState;
          export class GalleryDailyUploadLimitError extends Error {}
          export class GalleryFanartIdConflictError extends Error {}
          export class GalleryLinkedSessionNotVisibleError extends Error {}
          export class GalleryUploadBusyError extends Error {}
          export async function acquireGalleryUploadLease() {
            state.uploadLeaseAcquisitions += 1;
            if (state.uploadLeaseBusy) {
              throw new GalleryUploadBusyError("upload already in progress");
            }
          }
          export async function assertGalleryDailyUploadCapacity() {
            state.dailyCapacityChecks += 1;
          }
          export async function createGalleryFanartWithDailyLimit() {
            throw new Error("Unexpected gallery mutation");
          }
          export async function findGalleryFanartById() {
            state.dbReads += 1;
            return state.fanart;
          }
          export async function hasVisibleGallerySessionReportBySessionId() {
            return true;
          }
          export async function markGalleryBlobUploadIntentComplete() {
            throw new Error("Unexpected gallery mutation");
          }
          export async function recordGalleryBlobUploadIntent() {
            throw new Error("Unexpected gallery mutation");
          }
          export async function releaseGalleryUploadLease() {
            state.uploadLeaseReleases += 1;
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/gallery/access") {
      return {
        url: moduleUrl(`
          export async function hasGalleryApiAccess() { return true; }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/gallery/blob-cleanup") {
      return {
        url: moduleUrl(`
          export async function compensateGalleryBlobUploads() {
            throw new Error("Unexpected Blob compensation");
          }
          export async function retryGalleryBlobCleanup() {
            globalThis.__galleryRouteBehaviorTestState.cleanupMutations += 1;
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/gallery/blob-config") {
      return {
        url: moduleUrl(`
          export function getGalleryBlobToken() {
            globalThis.__galleryRouteBehaviorTestState.tokenReads += 1;
            return "mock-private-token";
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/gallery/image-server") {
      return {
        url: moduleUrl(`
          export class GalleryImageError extends Error {}
          export async function normalizeGalleryImage() {
            globalThis.__galleryRouteBehaviorTestState.imageNormalizations += 1;
            throw new Error("Unexpected image normalization");
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/gallery/input") {
      return {
        url: moduleUrl(`
          export class GalleryInputError extends Error {}
          export function parseGalleryFanartMetadata(value) { return value; }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/gallery/request-fingerprint") {
      return {
        url: moduleUrl(`
          export function galleryFanartRequestFingerprint() {
            throw new Error("Unexpected fingerprint calculation");
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/gallery/create-orchestration") {
      return {
        url: moduleUrl(`
          export async function persistUploadedGalleryFanart() {
            throw new Error("Unexpected gallery persistence");
          }
        `),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const cacheBust = Date.now();
const { POST: createFanart } = await import(
  `../../../app/api/erp/gallery/fanart/route.ts?test=${cacheBust}`
);
const { GET: getPrivateImage } = await import(
  `../../../app/api/erp/gallery/image/[id]/route.ts?test=${cacheBust}`
);
const { GET: runCleanupCron } = await import(
  `../../../app/api/cron/gallery/cleanup/route.ts?test=${cacheBust}`
);

function resetState() {
  state.blobGets = 0;
  state.blobPuts = 0;
  state.cleanupMutations = 0;
  state.dailyCapacityChecks = 0;
  state.dbReads = 0;
  state.fanart = null;
  state.formDataReads = 0;
  state.imageNormalizations = 0;
  state.session = {
    user: {
      id: "member-1",
      displayName: "Member",
      role: "U",
      isGuest: false,
    },
  };
  state.tokenReads = 0;
  state.uploadLeaseAcquisitions = 0;
  state.uploadLeaseBusy = false;
  state.uploadLeaseReleases = 0;
}

function uploadRequest(contentLength) {
  const headers = new Headers({ "idempotency-key": "gallery-request-1" });
  if (contentLength !== undefined) {
    headers.set("content-length", String(contentLength));
  }
  const request = new Request("http://localhost/api/erp/gallery/fanart", {
    method: "POST",
    headers,
  });
  Object.defineProperty(request, "formData", {
    value: async () => {
      state.formDataReads += 1;
      throw new Error("Unexpected formData read");
    },
  });
  return request;
}

test("팬아트 POST는 Content-Length 누락을 body 처리 전에 411로 거절한다", async () => {
  resetState();

  const response = await createFanart(uploadRequest());

  assert.equal(response.status, 411);
  assert.equal((await response.json()).code, "GALLERY_CONTENT_LENGTH_REQUIRED");
  assert.equal(state.formDataReads, 0);
  assert.equal(state.imageNormalizations, 0);
  assert.equal(state.blobPuts, 0);
  assert.equal(state.dbReads, 0);
  assert.equal(state.tokenReads, 0);
});

test("팬아트 POST는 크기 상한 초과를 body 처리 전에 413으로 거절한다", async () => {
  resetState();
  const maxRequestBytes = 4 * 1024 * 1024 + 128 * 1024;

  const response = await createFanart(uploadRequest(maxRequestBytes + 1));

  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "GALLERY_UPLOAD_TOO_LARGE");
  assert.equal(state.formDataReads, 0);
  assert.equal(state.imageNormalizations, 0);
  assert.equal(state.blobPuts, 0);
  assert.equal(state.dbReads, 0);
  assert.equal(state.tokenReads, 0);
});

test("팬아트 POST는 같은 사용자의 동시 업로드를 이미지 처리 전에 429로 거절한다", async () => {
  resetState();
  state.uploadLeaseBusy = true;

  const response = await createFanart(uploadRequest(1));

  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "GALLERY_UPLOAD_IN_PROGRESS");
  assert.equal(state.dailyCapacityChecks, 1);
  assert.equal(state.uploadLeaseAcquisitions, 1);
  assert.equal(state.uploadLeaseReleases, 0);
  assert.equal(state.formDataReads, 0);
  assert.equal(state.imageNormalizations, 0);
  assert.equal(state.blobPuts, 0);
});

test("팬아트 POST는 타인의 기존 ID를 본문 처리와 lease 전에 거절한다", async () => {
  resetState();
  state.fanart = {
    _id: "gallery-request-1",
    authorId: "another-member",
    status: "PUBLISHED",
  };

  const response = await createFanart(uploadRequest(1));

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "DUPLICATE_REQUEST");
  assert.equal(state.dailyCapacityChecks, 0);
  assert.equal(state.uploadLeaseAcquisitions, 0);
  assert.equal(state.uploadLeaseReleases, 0);
  assert.equal(state.formDataReads, 0);
  assert.equal(state.imageNormalizations, 0);
  assert.equal(state.blobPuts, 0);
  assert.equal(state.tokenReads, 0);
});

test("팬아트 POST는 lease 획득 뒤 입력 파싱 실패에도 lease를 해제한다", async () => {
  resetState();

  const response = await createFanart(uploadRequest(1));

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_GALLERY_UPLOAD");
  assert.equal(state.uploadLeaseAcquisitions, 1);
  assert.equal(state.uploadLeaseReleases, 1);
  assert.equal(state.formDataReads, 1);
  assert.equal(state.imageNormalizations, 0);
  assert.equal(state.blobPuts, 0);
});

test("private image GET은 guest에게 존재를 숨기고 Blob을 조회하지 않는다", async () => {
  resetState();
  state.session.user.isGuest = true;

  const response = await getPrivateImage(
    new Request("http://localhost/api/erp/gallery/image/fanart-1"),
    { params: Promise.resolve({ id: "fanart-1" }) },
  );

  assert.equal(response.status, 404);
  assert.equal(state.dbReads, 0);
  assert.equal(state.blobGets, 0);
  assert.equal(state.tokenReads, 0);
});

test("private image GET은 숨김 작품의 비소유 일반 회원에게 404를 반환한다", async () => {
  resetState();
  state.fanart = {
    _id: "fanart-1",
    authorId: "owner-1",
    status: "HIDDEN",
    image: { pathname: "gallery/fanart/private.webp" },
  };

  const response = await getPrivateImage(
    new Request("http://localhost/api/erp/gallery/image/fanart-1"),
    { params: Promise.resolve({ id: "fanart-1" }) },
  );

  assert.equal(response.status, 404);
  assert.equal(state.dbReads, 1);
  assert.equal(state.blobGets, 0);
  assert.equal(state.tokenReads, 0);
});

test("cleanup cron은 CRON_SECRET 불일치 요청을 mutation 전에 401로 거절한다", async () => {
  resetState();
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "expected-secret";
  try {
    const response = await runCleanupCron(
      new Request("http://localhost/api/cron/gallery/cleanup", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(state.cleanupMutations, 0);
    assert.equal(state.tokenReads, 0);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousSecret;
    }
  }
});
