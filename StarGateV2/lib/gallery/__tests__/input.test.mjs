import assert from "node:assert/strict";
import test from "node:test";

const {
  GalleryInputError,
  detectGalleryImageType,
  parseGalleryFanartMetadata,
  parseGalleryFanartMetadataUpdate,
  parseGalleryFanartModeration,
} = await import("../input.ts");

test("팬아트 metadata를 trim·정규화한다", () => {
  assert.deepEqual(
    parseGalleryFanartMetadata({
      title: "  제목   사이  ",
      description: " 설명\n문장 ",
      artistName: " NOVUS ",
      altText: " 상황도 ",
      tags: ["작전", "팬아트"],
      sessionId: " SESSION-1 ",
      rightsConfirmed: true,
    }),
    {
      title: "제목 사이",
      description: "설명 문장",
      artistName: "NOVUS",
      altText: "상황도",
      tags: ["작전", "팬아트"],
      sessionId: "SESSION-1",
      rightsConfirmed: true,
    },
  );
});

test("게시 권한·태그 중복·필드 길이 위반을 거절한다", () => {
  const valid = {
    title: "제목",
    artistName: "작가",
    rightsConfirmed: true,
  };
  assert.throws(
    () => parseGalleryFanartMetadata({ ...valid, rightsConfirmed: false }),
    GalleryInputError,
  );
  assert.throws(
    () => parseGalleryFanartMetadata({ ...valid, tags: ["TAG", "tag"] }),
    /중복/u,
  );
  assert.throws(
    () => parseGalleryFanartMetadata({ ...valid, title: "x".repeat(81) }),
    /80자/u,
  );
});

test("수정·운영 입력은 expectedUpdatedAt과 숨김 사유를 요구한다", () => {
  const base = {
    title: "제목",
    artistName: "작가",
    rightsConfirmed: true,
    expectedUpdatedAt: "2026-08-17T00:00:00.000Z",
  };
  assert.equal(
    parseGalleryFanartMetadataUpdate(base).expectedUpdatedAt,
    base.expectedUpdatedAt,
  );
  assert.throws(
    () =>
      parseGalleryFanartModeration({
        status: "HIDDEN",
        reason: "",
        expectedUpdatedAt: base.expectedUpdatedAt,
      }),
    /사유/u,
  );
  assert.deepEqual(
    parseGalleryFanartModeration({
      status: "PUBLISHED",
      reason: "",
      expectedUpdatedAt: base.expectedUpdatedAt,
    }),
    {
      status: "PUBLISHED",
      reason: "",
      expectedUpdatedAt: base.expectedUpdatedAt,
    },
  );
});

test("PNG/JPEG/WebP magic bytes를 식별하고 spoof를 거절할 수 있다", () => {
  assert.equal(
    detectGalleryImageType(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(
    detectGalleryImageType(Uint8Array.from([0xff, 0xd8, 0xff])),
    "image/jpeg",
  );
  assert.equal(
    detectGalleryImageType(
      Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      ]),
    ),
    "image/webp",
  );
  assert.equal(detectGalleryImageType(Uint8Array.from([1, 2, 3])), null);
});
