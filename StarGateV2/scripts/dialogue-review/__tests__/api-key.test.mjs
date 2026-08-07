import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseOllamaApiKeyFromEnvFile,
  resolveOllamaApiKey,
} from "../api-key.ts";

test(".env.local 파서는 OLLAMA_API_KEY만 읽고 인용부호와 주석을 처리한다", () => {
  const source = [
    "UNRELATED_SECRET=do-not-read",
    'OLLAMA_API_KEY="mock-file-key" # local only',
    "ANOTHER_VALUE=ignored",
  ].join("\n");

  assert.equal(parseOllamaApiKeyFromEnvFile(source), "mock-file-key");
});

test("process env 키를 .env.local보다 우선한다", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "dialogue-key-test-"));
  try {
    await writeFile(
      join(projectRoot, ".env.local"),
      "OLLAMA_API_KEY=mock-file-key\n",
      "utf8",
    );
    const key = await resolveOllamaApiKey({
      env: { OLLAMA_API_KEY: "mock-process-key" },
      projectRoot,
    });

    assert.equal(key, "mock-process-key");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("process env가 비어 있으면 Git 비추적 .env.local을 사용한다", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "dialogue-key-test-"));
  try {
    await writeFile(
      join(projectRoot, ".env.local"),
      "OLLAMA_API_KEY='mock-fallback-key'\n",
      "utf8",
    );
    const key = await resolveOllamaApiKey({ env: {}, projectRoot });

    assert.equal(key, "mock-fallback-key");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
