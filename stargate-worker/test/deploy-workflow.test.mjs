import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../.github/workflows/deploy-bots.yml", import.meta.url),
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
});

test("초기 shadow 배포의 수동 확인 경계는 유지한다", () => {
  const workerJob = workflow.slice(workflow.indexOf("  deploy-worker:\n"));
  assert.match(workerJob, /inputs\.target == 'worker-shadow'/);
  assert.match(workerJob, /inputs\.confirm_worker_shadow_mode == true/);
});
