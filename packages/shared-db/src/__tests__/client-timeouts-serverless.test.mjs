/**
 * serverless 모드 연결 타임아웃 투과 검증 (DB 불필요).
 *
 * 닫힌 로컬 포트를 URI 로 쓴다 — 거부(ECONNREFUSED)돼도 서버 선택은
 * serverSelectionTimeoutMS 까지 재시도하므로, 기본값(30s)이면 5초 안에 끝나지 않는다.
 * connectTimeoutMS 는 연결은 받되 응답하지 않는 서버로 monitor hello 시간 초과를 관찰한다.
 * 모드가 모듈 전역이라 long-running 케이스는 별도 파일에서 돈다.
 */

import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test, before } from "node:test";

import { getClient, initServerless } from "../../dist/index.js";

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

/** 연결은 받지만 아무것도 응답하지 않는 서버 → monitor hello 가 connectTimeoutMS 에서 끊긴다. */
async function silentServer() {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    uri: `mongodb://127.0.0.1:${server.address().port}/`,
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

async function expectFastServerSelectionError() {
  const started = Date.now();
  await assert.rejects(getClient(), { name: "MongoServerSelectionError" });
  const elapsed = Date.now() - started;
  assert.ok(
    elapsed < FAST_ENOUGH_MS,
    `서버 선택 실패까지 ${elapsed}ms — 타임아웃이 투과되지 않았다`,
  );
}

let baseUri;

before(async () => {
  baseUri = `mongodb://127.0.0.1:${await closedLocalPort()}/`;
});

test("옵션으로 준 serverSelectionTimeoutMS 가 적용되고, 실패 뒤 재호출도 같은 식으로 실패한다", async () => {
  initServerless({
    uri: baseUri,
    serverSelectionTimeoutMS: 200,
    connectTimeoutMS: 200,
  });
  await expectFastServerSelectionError();
  // 실패 경로가 캐시된 promise 를 비우므로 두 번째 호출도 새로 시도해 같은 식으로 실패한다.
  await expectFastServerSelectionError();
});

test("옵션을 생략하면 URI 쿼리의 serverSelectionTimeoutMS 가 그대로 쓰인다", async () => {
  initServerless({ uri: `${baseUri}?serverSelectionTimeoutMS=200` });
  await expectFastServerSelectionError();
});

test("옵션의 serverSelectionTimeoutMS 가 URI 쿼리 값보다 우선한다", async () => {
  initServerless({
    uri: `${baseUri}?serverSelectionTimeoutMS=60000`,
    serverSelectionTimeoutMS: 200,
    connectTimeoutMS: 200,
  });
  await expectFastServerSelectionError();
});

test("옵션으로 준 connectTimeoutMS 가 적용되어 응답 없는 서버의 hello 가 시간 초과된다", async (t) => {
  const silent = await silentServer();
  t.after(silent.close);
  initServerless({
    uri: silent.uri,
    serverSelectionTimeoutMS: 1_000,
    connectTimeoutMS: 100,
  });
  await assert.rejects(getClient(), (err) => {
    assert.equal(err.name, "MongoServerSelectionError");
    const [server] = err.reason.servers.values();
    // 옵션이 투과되지 않으면(기본 30s) hello 가 아직 대기 중이라 error 가 비어 있다.
    assert.equal(server.error?.name, "MongoNetworkTimeoutError");
    return true;
  });
});
