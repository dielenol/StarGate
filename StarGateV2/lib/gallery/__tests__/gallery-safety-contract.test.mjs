import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const POST_ROUTE = new URL(
  "../../../app/api/erp/gallery/fanart/route.ts",
  import.meta.url,
);
const ITEM_ROUTE = new URL(
  "../../../app/api/erp/gallery/fanart/[id]/route.ts",
  import.meta.url,
);
const PRIVATE_IMAGE_ROUTE = new URL(
  "../../../app/api/erp/gallery/image/[id]/route.ts",
  import.meta.url,
);
const REPORT_ITEM_ROUTE = new URL(
  "../../../app/api/erp/session-reports/[id]/route.ts",
  import.meta.url,
);
const BLOB_CLEANUP = new URL("../blob-cleanup.ts", import.meta.url);
const CLEANUP_ROUTE = new URL(
  "../../../app/api/cron/gallery/cleanup/route.ts",
  import.meta.url,
);
const VERCEL_CONFIG = new URL("../../../vercel.json", import.meta.url);
const DB = new URL("../../db/gallery.ts", import.meta.url);
const ACCESS = new URL("../access.ts", import.meta.url);
const IMAGE = new URL("../image-server.ts", import.meta.url);
const INDEXES = new URL("../indexes.ts", import.meta.url);
const ENSURE_INDEXES_SCRIPT = new URL(
  "../../../scripts/ensure-indexes.ts",
  import.meta.url,
);

test("fanart create는 guest·lock·idempotency·payload fingerprint를 방어한다", async () => {
  const source = await readFile(POST_ROUTE, "utf8");
  assert.match(source, /session\.user\.isGuest/u);
  assert.match(source, /hasGalleryApiAccess/u);
  assert.match(source, /readIdempotencyKey\(request\)/u);
  assert.match(source, /galleryFanartRequestFingerprint/u);
  assert.match(source, /normalizeGalleryImage/u);
  assert.match(source, /compensateGalleryBlobUpload/u);
  assert.match(source, /persistUploadedGalleryFanart/u);
  assert.doesNotMatch(source, /galleryItemResponse/u);
  assert.match(source, /access: "private"/u);
  assert.match(source, /GALLERY_CONTENT_LENGTH_REQUIRED/u);
  assert.match(source, /GALLERY_UPLOAD_TOO_LARGE/u);
  assert.match(source, /recordGalleryBlobUploadIntent/u);
  assert.match(source, /addRandomSuffix: false/u);
  assert.match(source, /normalizedImage\.thumbnail/u);
  assert.ok(
    source.indexOf("assertGalleryDailyUploadCapacity") <
      source.indexOf("normalizeGalleryImage(file)"),
  );
  assert.ok(
    source.indexOf("acquireGalleryUploadLease") <
      source.indexOf("normalizeGalleryImage(file)"),
  );
  assert.match(source, /releaseGalleryUploadLease/u);
  assert.match(source, /ownerToken: uploadLeaseOwnerToken/u);
  assert.ok(
    source.indexOf("recordGalleryBlobUploadIntent") <
      source.indexOf("blob = await put"),
  );
  assert.match(source, /if \(created\.created\) \{/u);
});

test("fanart 이미지는 회원·잠금·숨김·세션 권한을 재검증해 private Blob을 중계한다", async () => {
  const source = await readFile(PRIVATE_IMAGE_ROUTE, "utf8");
  assert.match(source, /session\.user\.isGuest/u);
  assert.match(source, /hasGalleryApiAccess/u);
  assert.match(source, /fanart\.status === "HIDDEN"/u);
  assert.match(source, /hasVisibleGallerySessionReportBySessionId/u);
  assert.match(source, /access: "private"/u);
  assert.match(source, /"Cache-Control": "private, no-store"/u);
  assert.match(source, /variant !== "original"/u);
});

test("gallery DB 생성은 transaction quota와 fingerprint conflict를 함께 고정한다", async () => {
  const source = await readFile(DB, "utf8");
  assert.match(source, /withTransaction/u);
  assert.match(source, /uploadedCount: \{ \$gte: 0, \$lt: GALLERY_DAILY_UPLOAD_LIMIT \}/u);
  assert.match(source, /existing\.requestFingerprint !== document\.requestFingerprint/u);
  assert.match(source, /updatedAt: input\.expectedUpdatedAt/u);
  assert.match(source, /status: \{ \$ne: "DELETED" \}/u);
  assert.match(source, /lockGallerySessionLinkGuard/u);
  assert.match(source, /GalleryLinkedSessionNotVisibleError/u);
  assert.match(source, /UPLOAD_LEASE_MS/u);
  assert.match(source, /lease\.ownerToken === input\.ownerToken/u);
  assert.match(source, /blobCleanupNextAttemptAt/u);
  assert.match(source, /recordGalleryDocumentBlobCleanupFailure/u);
});

test("수정·삭제도 route 자체 guest/lock/CAS 방어를 갖는다", async () => {
  const source = await readFile(ITEM_ROUTE, "utf8");
  assert.match(source, /GUEST_READ_ONLY_ERROR_CODE/u);
  assert.match(source, /hasGalleryApiAccess/u);
  assert.match(source, /parseExpectedUpdatedAt/u);
  assert.match(source, /STALE_VERSION/u);
  assert.match(source, /hasVisibleGallerySessionReportBySessionId/u);
  assert.match(source, /session\.user\.role !== "GM"/u);
});

test("페이지 접근은 운영 lock override를 조회하고 이미지 서버는 decode cap을 둔다", async () => {
  const [accessSource, imageSource] = await Promise.all([
    readFile(ACCESS, "utf8"),
    readFile(IMAGE, "utf8"),
  ]);
  assert.match(accessSource, /getErpPageLockOverrides/u);
  assert.match(accessSource, /isNavPathLocked/u);
  assert.match(imageSource, /limitInputPixels: GALLERY_IMAGE_MAX_PIXELS/u);
  assert.match(imageSource, /\.rotate\(\)/u);
  assert.match(imageSource, /\.webp\(\{ effort: 2, quality: 82 \}\)/u);
});

test("보고서 삭제와 Blob cleanup은 연결 race와 정상 Blob 삭제를 방어한다", async () => {
  const [reportSource, cleanupSource, cleanupRouteSource, vercelConfigSource] =
    await Promise.all([
    readFile(REPORT_ITEM_ROUTE, "utf8"),
    readFile(BLOB_CLEANUP, "utf8"),
    readFile(CLEANUP_ROUTE, "utf8"),
    readFile(VERCEL_CONFIG, "utf8"),
  ]);
  assert.match(reportSource, /lockGallerySessionLinkGuard/u);
  assert.match(reportSource, /hasActiveGalleryFanartForSession/u);
  assert.match(reportSource, /GALLERY_FANART_INBOUND/u);
  assert.match(cleanupSource, /isGalleryBlobReferenced/u);
  assert.match(cleanupSource, /markGalleryBlobUploadIntentComplete/u);
  assert.match(cleanupSource, /document\.image\.thumbnail/u);
  assert.match(cleanupRouteSource, /process\.env\.CRON_SECRET/u);
  assert.match(cleanupRouteSource, /retryGalleryBlobCleanup/u);
  const vercelConfig = JSON.parse(vercelConfigSource);
  assert.deepEqual(vercelConfig.crons, [
    {
      path: "/api/cron/gallery/cleanup",
      schedule: "0 18 * * *",
    },
  ]);
});

test("갤러리 조회 인덱스는 기존 명시적 ensure 명령에만 연결된다", async () => {
  const [indexSource, scriptSource] = await Promise.all([
    readFile(INDEXES, "utf8"),
    readFile(ENSURE_INDEXES_SCRIPT, "utf8"),
  ]);
  assert.match(indexSource, /status: 1, createdAt: -1/u);
  assert.match(indexSource, /authorId: 1, status: 1/u);
  assert.match(indexSource, /sessionId: 1, status: 1/u);
  assert.match(indexSource, /blobCleanupNextAttemptAt: 1/u);
  assert.match(indexSource, /retryAfter: 1, updatedAt: 1/u);
  assert.match(scriptSource, /ensureGalleryIndexes\(await getDb\(\)\)/u);
});
