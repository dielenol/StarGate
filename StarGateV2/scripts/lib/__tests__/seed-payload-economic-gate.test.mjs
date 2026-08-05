import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("../../upsert-seed-payload.ts", import.meta.url),
);

function cleanEnv() {
  const {
    MONGODB_URI: _uri,
    DB_NAME: _dbName,
    MONGODB_DB_NAME: _mongoDbName,
    ...rest
  } = process.env;
  void _uri;
  void _dbName;
  void _mongoDbName;
  return {
    ...rest,
    MONGODB_URI: "",
    DB_NAME: "seed-safety-test",
  };
}

test("경제 payload는 dry-run delta를 표시하고 별도 execute 승인을 요구한다", async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "stargate-seed-safety-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const payload = resolve(directory, "economic-payload.json");
  await writeFile(
    payload,
    JSON.stringify({
      collection: "master_items",
      filter: { slug: "seed-safety-test" },
      update: { $set: { price: 123.45 } },
    }),
    "utf8",
  );

  const dryRun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", SCRIPT, payload],
    { cwd: directory, env: cleanEnv(), encoding: "utf8" },
  );
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /economic price: "<absent>" -> 123\.45/u);
  assert.match(dryRun.stdout, /side-effect:/u);

  const blockedWrite = spawnSync(
    process.execPath,
    ["--experimental-strip-types", SCRIPT, payload, "--execute", "--yes"],
    { cwd: directory, env: cleanEnv(), encoding: "utf8" },
  );
  assert.notEqual(blockedWrite.status, 0);
  assert.match(blockedWrite.stderr, /--allow-economic-fields/u);

  const acknowledgedWrite = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      SCRIPT,
      payload,
      "--execute",
      "--yes",
      "--allow-economic-fields",
    ],
    { cwd: directory, env: cleanEnv(), encoding: "utf8" },
  );
  assert.notEqual(acknowledgedWrite.status, 0);
  assert.doesNotMatch(acknowledgedWrite.stderr, /--allow-economic-fields/u);
  assert.match(acknowledgedWrite.stderr, /MONGODB_URI/u);
});

test("DB 없는 pipeline 경제 upsert는 추정 delta 대신 fail-closed한다", async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "stargate-seed-pipeline-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const payload = resolve(directory, "economic-pipeline.json");
  await writeFile(
    payload,
    JSON.stringify({
      collection: "master_items",
      filter: { slug: "seed-pipeline-test" },
      update: [{ $set: { price: { $add: [{ $ifNull: ["$price", 0] }, 10] } } }],
      upsert: true,
    }),
    "utf8",
  );

  const dryRun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", SCRIPT, payload],
    { cwd: directory, env: cleanEnv(), encoding: "utf8" },
  );
  assert.notEqual(dryRun.status, 0);
  assert.match(dryRun.stderr, /pipeline 경제 변경/u);
  assert.match(dryRun.stderr, /DB 연결 dry-run/u);
});
