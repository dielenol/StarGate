import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkerConfigurationError,
  loadWorkerConfig,
} from "../dist/config.js";

const validEnvironment = {
  WORKER_MODE: "shadow",
  WORKER_REPLICA_COUNT: "1",
  WORKER_PORT: "3001",
  MONGODB_URI: "mongodb://example.invalid/stargate",
  REALTIME_TICKET_SECRET: "0123456789abcdef0123456789abcdef",
  REALTIME_ALLOWED_ORIGINS:
    "https://ordonet.co.kr,http://localhost:3000",
};

test("worker 설정은 shadow와 단일 replica를 기본 안전 경계로 사용한다", () => {
  const config = loadWorkerConfig(validEnvironment);
  assert.equal(config.mode, "shadow");
  assert.equal(config.replicaCount, 1);
  assert.equal(config.pollIntervalMs, 30_000);
  assert.deepEqual(config.enabledConsumers, []);
  assert.equal(config.realtime.maxConnections, 500);
  assert.equal(config.realtime.maxConnectionsPerUser, 5);
  assert.deepEqual(config.realtime.allowedOrigins, [
    "https://ordonet.co.kr",
    "http://localhost:3000",
  ]);
});

test("consumer는 지원 목록만 중복 없이 opt-in한다", () => {
  const config = loadWorkerConfig({
    ...validEnvironment,
    WORKER_CONSUMERS:
      "ameri-dm,research-card,ameri-dm,stock-market-wire",
  });
  assert.deepEqual(config.enabledConsumers, [
    "ameri-dm",
    "research-card",
    "stock-market-wire",
  ]);

  assert.throws(
    () =>
      loadWorkerConfig({
        ...validEnvironment,
        WORKER_CONSUMERS: "unknown-consumer",
      }),
    WorkerConfigurationError,
  );
});

test("active worker는 domain consumer 전체를 명시하지 않으면 기동을 거부한다", () => {
  assert.deepEqual(
    loadWorkerConfig({
      ...validEnvironment,
      WORKER_MODE: "active",
      WORKER_CONSUMERS: "all",
    }).enabledConsumers,
    ["ameri-dm", "research-card", "shop-restock", "stock-market-wire"],
  );
  assert.throws(
    () =>
      loadWorkerConfig({
        ...validEnvironment,
        WORKER_MODE: "active",
        WORKER_CONSUMERS: "research-card,shop-restock,stock-market-wire",
      }),
    /누락: ameri-dm/,
  );
  assert.deepEqual(
    loadWorkerConfig({
      ...validEnvironment,
      WORKER_MODE: "active",
      WORKER_CONSUMERS_ALLOW_PARTIAL: "true",
      WORKER_CONSUMERS: "ameri-dm",
    }).enabledConsumers,
    ["ameri-dm"],
  );
  assert.throws(
    () => loadWorkerConfig({ ...validEnvironment, WORKER_MODE: "active" }),
    /WORKER_CONSUMERS=all/,
  );
});

test("두 개 이상의 replica 설정은 거부한다", () => {
  assert.throws(
    () =>
      loadWorkerConfig({
        ...validEnvironment,
        WORKER_REPLICA_COUNT: "2",
      }),
    WorkerConfigurationError,
  );
});

test("짧은 ticket secret은 거부한다", () => {
  assert.throws(
    () =>
      loadWorkerConfig({
        ...validEnvironment,
        REALTIME_TICKET_SECRET: "short",
      }),
    WorkerConfigurationError,
  );
});
