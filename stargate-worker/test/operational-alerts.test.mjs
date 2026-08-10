import assert from "node:assert/strict";
import test from "node:test";

import { DiscordOperationalAlertReporter } from "../dist/outbox/operational-alerts.js";

function memoryIncidentStore() {
  const incidents = new Map();
  return {
    async find(consumer) {
      return incidents.get(consumer) ?? null;
    },
    async record(input) {
      const previous = incidents.get(input.consumer);
      incidents.set(input.consumer, {
        fingerprint: input.fingerprint,
        severity: input.severity,
        openedAt: previous?.openedAt ?? input.sentAt,
        lastSentAt: input.sentAt,
      });
    },
    async resolve(input) {
      const current = incidents.get(input.consumer);
      if (!current || current.fingerprint !== input.fingerprint) return false;
      return incidents.delete(input.consumer);
    },
    incidents,
  };
}

test("운영 알림은 같은 장애를 cooldown하고 복구를 한 번 알린다", async () => {
  const requests = [];
  let now = 1_000;
  const incidentStore = memoryIncidentStore();
  const options = {
    now: () => now,
    cooldownMs: 60_000,
    async fetchImpl(url, init) {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ id: "22345678901234567" });
    },
  };
  let reporter = new DiscordOperationalAlertReporter(
    "https://discord.com/api/webhooks/ops/token",
    { info() {}, warn() {}, error() {} },
    incidentStore,
    options,
  );
  const failure = {
    observedDue: 2,
    failed: 2,
    operationalAlert: {
      fingerprint: "outbox-overdue:2",
      severity: "WARNING",
      summary: "10분 초과 outbox 2건",
    },
  };

  await reporter.observe("integration-health", failure);
  now += 10_000;
  reporter = new DiscordOperationalAlertReporter(
    "https://discord.com/api/webhooks/ops/token",
    { info() {}, warn() {}, error() {} },
    incidentStore,
    options,
  );
  await reporter.observe("integration-health", {
    ...failure,
    observedDue: 3,
    failed: 3,
    operationalAlert: {
      ...failure.operationalAlert,
      summary: "10분 초과 outbox 3건",
    },
  });
  await reporter.observe("integration-health", {
    observedDue: 0,
    operationalRecovery: true,
  });

  assert.equal(requests.length, 2);
  assert.match(requests[0].body.embeds[0].title, /연동 지연/);
  assert.match(requests[1].body.embeds[0].title, /연동 복구/);
  assert.ok(requests.every((request) => request.url.endsWith("?wait=true")));
});

test("재시도 backoff 중 빈 poll과 다른 작업 성공은 복구로 오인하지 않는다", async () => {
  const requests = [];
  const incidentStore = memoryIncidentStore();
  const reporter = new DiscordOperationalAlertReporter(
    "https://discord.com/api/webhooks/ops/token",
    { info() {}, warn() {}, error() {} },
    incidentStore,
    {
      async fetchImpl(_url, init) {
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "22345678901234567" });
      },
    },
  );

  await reporter.observe("ameri-dm", {
    observedDue: 1,
    claimed: 1,
    failed: 1,
    operationalAlert: {
      fingerprint: "event-a",
      severity: "WARNING",
      summary: "A 전달 실패",
    },
  });
  await reporter.observe("ameri-dm", { observedDue: 0, claimed: 0, failed: 0 });
  assert.equal(requests.length, 1);

  await reporter.observe("ameri-dm", { observedDue: 1, claimed: 1, failed: 0 });
  assert.equal(requests.length, 1);

  await reporter.observe("ameri-dm", {
    observedDue: 1,
    claimed: 1,
    failed: 0,
    operationalRecovery: true,
  });
  assert.equal(requests.length, 2);
  assert.match(requests[1].embeds[0].title, /복구/);
});
