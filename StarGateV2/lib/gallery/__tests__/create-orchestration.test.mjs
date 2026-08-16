import assert from "node:assert/strict";
import test from "node:test";

const { persistUploadedGalleryFanart } = await import(
  "../create-orchestration.ts"
);

test("DB persist 실패는 업로드 Blob을 보상 삭제한다", async () => {
  let compensated = 0;
  await assert.rejects(
    () =>
      persistUploadedGalleryFanart({
        persist: async () => {
          throw new Error("DB_FAILED");
        },
        compensate: async () => {
          compensated += 1;
        },
      }),
    /DB_FAILED/u,
  );
  assert.equal(compensated, 1);
});

test("idempotent replay가 만든 중복 Blob만 보상 삭제한다", async () => {
  let compensated = 0;
  const result = await persistUploadedGalleryFanart({
    persist: async () => ({ created: false, document: { id: "existing" } }),
    compensate: async () => {
      compensated += 1;
    },
  });
  assert.equal(result.created, false);
  assert.equal(compensated, 1);
});

test("DB commit 성공 뒤의 응답 실패는 정상 Blob 보상 범위 밖이다", async () => {
  let compensated = 0;
  const result = await persistUploadedGalleryFanart({
    persist: async () => ({ created: true, document: { id: "created" } }),
    compensate: async () => {
      compensated += 1;
    },
  });

  assert.equal(result.created, true);
  assert.equal(compensated, 0);
  assert.throws(() => {
    throw new Error("RESPONSE_SERIALIZATION_FAILED");
  }, /RESPONSE_SERIALIZATION_FAILED/u);
  assert.equal(compensated, 0);
});
