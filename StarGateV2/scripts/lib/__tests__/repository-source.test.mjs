import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { inspectCommittedRepositorySource } from "../repository-source.ts";

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

test("repository provenance는 seed root의 tracked HEAD-identical 파일만 허용한다", () => {
  const root = mkdtempSync(resolve(tmpdir(), "stargate-repository-source-"));
  try {
    const projectRoot = resolve(root, "StarGateV2");
    const payloadRoot = resolve(projectRoot, "scripts/seed-payloads");
    mkdirSync(payloadRoot, { recursive: true });
    const tracked = resolve(payloadRoot, "tracked.json");
    writeFileSync(tracked, '{"ok":true}\n');
    git(root, "init", "-q");
    git(root, "config", "user.name", "Codex Test");
    git(root, "config", "user.email", "codex-test@example.invalid");
    git(root, "add", "--", "StarGateV2/scripts/seed-payloads/tracked.json");
    git(root, "commit", "-q", "-m", "test fixture");

    const clean = inspectCommittedRepositorySource(tracked, {
      projectRoot,
      requiredRoot: payloadRoot,
    });
    assert.deepEqual(clean.issues, []);
    assert.equal(clean.content.toString("utf8"), '{"ok":true}\n');
    assert.equal(clean.source?.projectPath, "scripts/seed-payloads/tracked.json");
    assert.equal(clean.source?.headOid, git(root, "rev-parse", "HEAD"));
    assert.match(clean.source?.commitSha ?? "", /^[a-f0-9]{40}$/u);

    writeFileSync(tracked, '{"ok":false}\n');
    const dirty = inspectCommittedRepositorySource(tracked, {
      projectRoot,
      requiredRoot: payloadRoot,
    });
    assert.equal(dirty.source, undefined);
    assert.ok(dirty.issues.includes("working_tree_differs_from_head"));

    const untracked = resolve(payloadRoot, "untracked.json");
    writeFileSync(untracked, "{}\n");
    const untrackedResult = inspectCommittedRepositorySource(untracked, {
      projectRoot,
      requiredRoot: payloadRoot,
    });
    assert.ok(untrackedResult.issues.includes("not_tracked_at_head"));

    const outside = resolve(projectRoot, "outside.json");
    writeFileSync(outside, "{}\n");
    const outsideResult = inspectCommittedRepositorySource(outside, {
      projectRoot,
      requiredRoot: payloadRoot,
    });
    assert.ok(outsideResult.issues.includes("outside_seed_payload_root"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
