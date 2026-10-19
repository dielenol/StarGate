/**
 * long-running 모드 연결 타임아웃 투과 검증 (DB 불필요).
 *
 * 닫힌 로컬 포트를 URI 로 쓴다 — 거부(ECONNREFUSED)돼도 서버 선택은
 * serverSelectionTimeoutMS 까지 재시도하므로, 기본값(30s)이면 5초 안에 끝나지 않는다.
 * 모드가 모듈 전역이라 serverless 케이스는 별도 파일에서 돈다.
 */

import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test, before } from "node:test";

import { connect } from "../../dist/index.js";

const FAST_ENOUGH_MS = 5_000;

/** port 0 서버를 열어 포트 번호를 얻은 뒤 닫는다 → 연결이 즉시 거부되는 포트. */
function closedLocalPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

let uri;

before(async () => {
  uri = `mongodb://127.0.0.1:${await closedLocalPort()}/`;
});

test("connect 에 준 serverSelectionTimeoutMS 가 적용되어 빠르게 실패한다", async () => {
  const started = Date.now();
  await assert.rejects(
    connect({ uri, serverSelectionTimeoutMS: 200, connectTimeoutMS: 200 }),
    { name: "MongoServerSelectionError" },
  );
  const elapsed = Date.now() - started;
  assert.ok(
    elapsed < FAST_ENOUGH_MS,
    `서버 선택 실패까지 ${elapsed}ms — 타임아웃이 투과되지 않았다`,
  );
});
