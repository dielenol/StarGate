import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// 플레인 node 에는 next 패키지의 번들러용 "next/server" export 가 없어
// 실제 파일 경로인 "next/server.js" 로 리다이렉트한다 (테스트 전용 훅).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    return nextResolve(specifier, context);
  },
});

const { jsonWithETag } = await import("../http-cache.ts");

function pollingRequest(headers = {}) {
  return new Request("http://localhost/api/erp/poll-test", { headers });
}

test("첫 요청(If-None-Match 없음)은 200 + strong ETag + private no-cache", async () => {
  const response = jsonWithETag(pollingRequest(), { value: 1 });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-cache");
  assert.equal(response.headers.get("content-type"), "application/json");
  const etag = response.headers.get("etag");
  assert.ok(etag);
  assert.match(etag, /^"[0-9a-f]{40}"$/);
  assert.deepEqual(await response.json(), { value: 1 });
});

test("동일 payload 의 ETag 재전송은 304 (빈 본문 + 동일 ETag 유지)", async () => {
  const first = jsonWithETag(pollingRequest(), { value: 1 });
  const etag = first.headers.get("etag");

  const second = jsonWithETag(
    pollingRequest({ "If-None-Match": etag }),
    { value: 1 },
  );

  assert.equal(second.status, 304);
  assert.equal(second.headers.get("etag"), etag);
  assert.equal(second.headers.get("cache-control"), "private, no-cache");
  assert.equal(await second.text(), "");
});

test("payload 가 달라지면 ETag 불일치로 200 + 새 ETag", async () => {
  const first = jsonWithETag(pollingRequest(), { value: 1 });
  const etag = first.headers.get("etag");

  const second = jsonWithETag(
    pollingRequest({ "If-None-Match": etag }),
    { value: 2 },
  );

  assert.equal(second.status, 200);
  assert.notEqual(second.headers.get("etag"), etag);
  assert.deepEqual(await second.json(), { value: 2 });
});

test("W/ 프리픽스(weak) 와 콤마 리스트 If-None-Match 도 일치로 판정", () => {
  const first = jsonWithETag(pollingRequest(), { value: 1 });
  const etag = first.headers.get("etag");

  const weak = jsonWithETag(
    pollingRequest({ "If-None-Match": `W/${etag}` }),
    { value: 1 },
  );
  assert.equal(weak.status, 304);

  const listed = jsonWithETag(
    pollingRequest({ "If-None-Match": `"stale-etag", ${etag}` }),
    { value: 1 },
  );
  assert.equal(listed.status, 304);
});

test("init.headers 는 기본 헤더와 병합되고 동일 키는 호출측이 우선 (200/304 공통)", () => {
  const init = {
    headers: {
      "X-Custom": "yes",
      "Cache-Control": "private, no-cache, max-age=0",
    },
  };

  const fresh = jsonWithETag(pollingRequest(), { value: 1 }, init);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.headers.get("x-custom"), "yes");
  assert.equal(
    fresh.headers.get("cache-control"),
    "private, no-cache, max-age=0",
  );
  assert.ok(fresh.headers.get("etag"));

  const notModified = jsonWithETag(
    pollingRequest({ "If-None-Match": fresh.headers.get("etag") }),
    { value: 1 },
    init,
  );
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get("x-custom"), "yes");
  assert.equal(
    notModified.headers.get("cache-control"),
    "private, no-cache, max-age=0",
  );
});
