import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../.github/workflows/deploy-bots.yml", import.meta.url),
  "utf8",
);
const deployScript = await readFile(
  new URL("../../deploy/trigger-stargate-worker-deploy.sh", import.meta.url),
  "utf8",
);
const dockerfile = await readFile(
  new URL("../Dockerfile", import.meta.url),
  "utf8",
);

function sectionBetween(startMarker, endMarker) {
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `workflow section not found: ${startMarker}`);
  assert.notEqual(end, -1, `workflow section end not found: ${endMarker}`);
  return workflow.slice(start, end);
}

test("worker와 공용 core 변경은 배포 workflow를 시작한다", () => {
  const pushTrigger = sectionBetween("on:\n", "  workflow_dispatch:");
  assert.match(pushTrigger, /- 'stargate-worker\/\*\*'/);
  assert.match(pushTrigger, /- 'packages\/core\/\*\*'/);
  assert.match(pushTrigger, /- '\.dockerignore'/);
});

test("main push에서 worker 변경을 감지하면 Dokploy 배포를 실행한다", () => {
  const workerFilter = sectionBetween("            worker:\n", "\n\n  #");
  const workerJob = workflow.slice(workflow.indexOf("  deploy-worker:\n"));
  assert.match(
    workerJob,
    /github\.event_name == 'push' && needs\.detect-changes\.outputs\.worker == 'true'/,
  );
  assert.match(
    workerFilter,
    /- '\.github\/workflows\/deploy-bots\.yml'/,
  );
  assert.match(workerFilter, /- 'deploy\/trigger-stargate-worker-deploy\.sh'/);
  assert.match(workerFilter, /- '\.dockerignore'/);
  assert.match(workerJob, /uses: actions\/checkout@v4/);
  assert.match(workerJob, /node stargate-worker\/source-revision\.mjs/);
  assert.match(workerJob, /bash deploy\/trigger-stargate-worker-deploy\.sh/);
});

test("worker 배포는 redirect를 따르지 않고 timeout과 runtime revision을 검증한다", () => {
  assert.doesNotMatch(deployScript, /(?:^|\s)(?:-L|--location)(?:\s|$)/m);
  assert.match(deployScript, /--connect-timeout 10/);
  assert.match(deployScript, /--max-time 30/);
  assert.match(deployScript, /\.message \| select\(type == "string"\)/);
  assert.match(deployScript, /\.sourceRevision == \$expected/);
  assert.match(
    dockerfile,
    /source-revision\.mjs > stargate-worker\/dist\/source-revision/,
  );
});

test("초기 shadow 배포의 수동 확인 경계는 유지한다", () => {
  const workerJob = workflow.slice(workflow.indexOf("  deploy-worker:\n"));
  assert.match(workerJob, /inputs\.target == 'worker-shadow'/);
  assert.match(workerJob, /inputs\.confirm_worker_shadow_mode == true/);
});
