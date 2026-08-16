import assert from "node:assert/strict";
import test from "node:test";

import "./module-hooks.mjs";

const { buildGalleryFeed } = await import("../feed.ts");

const now = new Date("2026-08-17T12:00:00.000Z");

function report(overrides = {}) {
  return {
    _id: "report-1",
    sessionId: "session-1",
    sessionTitle: "S1E1 질서",
    reportNumber: "01",
    minRole: "U",
    summary: "![첫 장](/assets/session-reports/first.webp)",
    participants: ["AGENT_A"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function fanart(overrides = {}) {
  return {
    _id: "gallery-upload:test-1",
    title: "팬아트",
    description: "설명",
    artistName: "작가",
    altText: "팬아트 이미지",
    tags: ["팬아트"],
    image: {
      pathname: "gallery/test.webp",
      sha256: "a".repeat(64),
      width: 1200,
      height: 900,
      bytes: 100,
      contentType: "image/webp",
      thumbnail: {
        pathname: "gallery/test-thumb.webp",
        width: 768,
        height: 576,
        bytes: 40,
        contentType: "image/webp",
      },
    },
    requestFingerprint: "b".repeat(64),
    authorId: "user-1",
    authorName: "등록자",
    authorRole: "U",
    status: "PUBLISHED",
    rightsConfirmedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function build(overrides = {}) {
  return buildGalleryFeed({
    reports: [report()],
    fanarts: [fanart()],
    viewer: {
      id: "user-1",
      isGuest: false,
      canModerate: false,
      canCleanupOrphans: false,
    },
    uploadEnabled: true,
    generatedAt: now,
    ...overrides,
  });
}

test("guest feed는 보고서와 fanart를 모두 비운다", () => {
  const feed = build({
    viewer: {
      id: "guest",
      isGuest: true,
      canModerate: false,
      canCleanupOrphans: false,
    },
  });
  assert.deepEqual(feed.items, []);
  assert.deepEqual(feed.albums, []);
  assert.equal(feed.viewer.canUpload, false);
  assert.equal(feed.storage.uploadEnabled, false);
});

test("보고서 이미지와 fanart를 album으로 합치고 권한 플래그를 계산한다", () => {
  const feed = build({
    fanarts: [fanart({ sessionId: "session-1", status: "HIDDEN", hiddenReason: "검토" })],
  });
  assert.equal(feed.albums.length, 1);
  assert.equal(feed.items.length, 2);
  const item = feed.items.find((candidate) => candidate.kind === "FANART");
  assert.equal(item?.albumSessionId, "session-1");
  assert.equal(
    item?.image.src,
    "/api/erp/gallery/image/gallery-upload%3Atest-1?variant=thumbnail",
  );
  assert.equal(
    item?.image.fullSrc,
    "/api/erp/gallery/image/gallery-upload%3Atest-1?variant=original",
  );
  assert.equal(item?.canEdit, true);
  assert.equal(item?.hiddenReason, "검토");
});

test("현재 보이는 보고서가 없는 linked fanart도 소유자는 정리할 수 있다", () => {
  const feed = build({
    reports: [],
    fanarts: [fanart({ sessionId: "session-1" })],
  });
  const item = feed.items[0];
  assert.equal(item?.kind, "FANART");
  assert.equal(item?.albumSessionId, null);
  assert.equal(item?.canEdit, true);
  assert.equal(item?.canDelete, true);
});

test("보이지 않는 보고서의 linked fanart는 타인에게 노출하지 않는다", () => {
  const feed = build({
    reports: [],
    fanarts: [fanart({ authorId: "user-2", sessionId: "session-1" })],
  });
  assert.deepEqual(feed.items, []);
});

test("다른 사용자의 숨김 사유는 moderator가 아니면 마스킹한다", () => {
  const hidden = fanart({
    authorId: "user-2",
    status: "HIDDEN",
    hiddenReason: "운영 메모",
  });
  const regular = build({ fanarts: [hidden] });
  const moderator = build({
    fanarts: [hidden],
    viewer: {
      id: "mod",
      isGuest: false,
      canModerate: true,
      canCleanupOrphans: false,
    },
  });
  assert.equal(
    regular.items.find((item) => item.kind === "FANART")?.hiddenReason,
    null,
  );
  assert.equal(
    moderator.items.find((item) => item.kind === "FANART")?.hiddenReason,
    "운영 메모",
  );
});

test("같은 보고서의 10장 이상 이미지도 Markdown 원본 순서를 보존한다", () => {
  const summary = Array.from(
    { length: 12 },
    (_, index) =>
      `![이미지 ${index}](/assets/session-reports/image-${index}.webp)`,
  ).join("\n");
  const feed = build({ reports: [report({ summary })], fanarts: [] });
  assert.deepEqual(
    feed.items.map((item) => item.title),
    Array.from({ length: 12 }, (_, index) => `이미지 ${index}`),
  );
});
