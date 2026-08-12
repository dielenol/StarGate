import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(
  new URL("../../deploy/trigger-stargate-worker-deploy.sh", import.meta.url),
);
const expectedRevision = "a".repeat(64);

async function runDeployScript({ webhook, readiness }) {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      const configured = request.url === "/webhook" ? webhook : readiness;
      response.writeHead(configured.status, {
        "content-type": configured.contentType ?? "application/json",
      });
      response.end(
        typeof configured.body === "string"
          ? configured.body
          : JSON.stringify(configured.body),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const child = spawn("bash", [scriptPath], {
      env: {
        ...process.env,
        WEBHOOK_URL: `${origin}/webhook`,
        HEALTH_URL: `${origin}/readyz`,
        EXPECTED_SOURCE_REVISION: expectedRevision,
        CHANGED_PATH: "stargate-worker/package.json",
        GITHUB_REF: "refs/heads/main",
        GITHUB_REF_NAME: "main",
        GITHUB_SHA: "b".repeat(40),
        GITHUB_REPOSITORY: "dielenol/StarGate",
        GITHUB_WORKFLOW: "Deploy bots",
        DEPLOY_VERIFY_TIMEOUT_SECONDS: "1",
        DEPLOY_POLL_INTERVAL_SECONDS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    return { exitCode, stdout, stderr, requests };
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("Dokploy 301 branch 불일치는 배포 실패로 판정한다", async () => {
  const result = await runDeployScript({
    webhook: { status: 301, body: { message: "Branch Not Match" } },
    readiness: { status: 200, body: { ready: true, sourceRevision: expectedRevision } },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /HTTP 301.*Branch Not Match/);
  assert.equal(result.requests.filter((request) => request.url === "/readyz").length, 0);
});

test("Dokploy 200 거절 메시지는 배포 실패로 판정한다", async () => {
  const result = await runDeployScript({
    webhook: { status: 200, body: { message: "Watch Paths Not Match" } },
    readiness: { status: 200, body: { ready: true, sourceRevision: expectedRevision } },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /Watch Paths Not Match/);
});

test("Dokploy 비 JSON 응답은 본문을 노출하지 않고 실패한다", async () => {
  const result = await runDeployScript({
    webhook: { status: 200, contentType: "text/html", body: "private proxy diagnostics" },
    readiness: { status: 200, body: { ready: true, sourceRevision: expectedRevision } },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /unexpected or non-JSON response/);
  assert.doesNotMatch(result.stdout + result.stderr, /private proxy diagnostics/);
});

test("배포 접수 뒤 health source revision이 일치해야 성공한다", async () => {
  const result = await runDeployScript({
    webhook: { status: 200, body: { message: "Application deployed successfully" } },
    readiness: { status: 200, body: { ready: true, sourceRevision: expectedRevision } },
  });
  assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /기대한 source revision으로 준비됐습니다/);
  const webhookRequest = result.requests.find((request) => request.url === "/webhook");
  assert.ok(webhookRequest);
  const payload = JSON.parse(webhookRequest.body);
  assert.equal(payload.ref, "refs/heads/main");
  assert.equal(payload.repository.full_name, "dielenol/StarGate");
});

test("배포 접수 뒤 구버전 worker만 준비되면 timeout으로 실패한다", async () => {
  const result = await runDeployScript({
    webhook: { status: 200, body: { message: "Application deployed successfully" } },
    readiness: { status: 200, body: { ready: true, sourceRevision: "stale" } },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /제한 시간 안에 기대한 source revision/);
});
