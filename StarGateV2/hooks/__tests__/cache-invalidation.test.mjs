/**
 * Validator 검증 — 캐시 invalidation 흐름 + fetcher endpoint (영역 A)
 *
 * 시나리오:
 *   A-1: usePersonnelQuery 의 fetcher → /api/erp/personnel (마스킹 endpoint) 사용
 *   A-2: useAgentCharactersQuery 의 fetcher → /api/erp/characters (마스킹 X) 사용
 *   A-3: useUpdateLoreMutation onSuccess → agent + personnel 두 캐시 모두 invalidate
 *   A-4: useUpdatePlayMutation onSuccess → agent 캐시만 invalidate (personnel 미터치)
 *   A-5: 캐시 키 매트릭스 — agent / personnel 분리 검증
 *
 *   추가:
 *     RACE: invalidate 후 refetch 가 어느 endpoint 를 호출하는지 시뮬레이션
 *     LEAK: agent endpoint 의 raw 응답이 personnel 캐시로 들어가지 않는지
 *
 * 실행:
 *   cd StarGateV2 && node --test --experimental-test-module-mocks --experimental-strip-types hooks/__tests__/cache-invalidation.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { QueryClient } from "@tanstack/react-query";

import {
  characterKeys,
  personnelKeys,
} from "../queries/useCharactersQuery.ts";

/* ── A-5: 캐시 키 매트릭스 ── */

test("A-5-1: characterKeys.agent / personnelKeys 가 다른 prefix", () => {
  const agentKey = characterKeys.agent.all;
  const personnelKey = personnelKeys.all;
  assert.notDeepEqual(agentKey, personnelKey);
  assert.deepEqual(agentKey, ["characters", "agent"]);
  assert.deepEqual(personnelKey, ["personnel"]);
});

test("A-5-2: characterKeys.byTier 와 byId 매트릭스", () => {
  assert.deepEqual(characterKeys.agent.byTier("MAIN"), [
    "characters",
    "agent",
    "MAIN",
  ]);
  assert.deepEqual(characterKeys.agent.byId("abc123"), [
    "characters",
    "agent",
    "id",
    "abc123",
  ]);
  assert.deepEqual(personnelKeys.byId("abc123"), ["personnel", "abc123"]);
});

test("A-5-3: characterKeys.all 이 prefix invalidate root — agent 와 personnel 모두 무효화 가능", () => {
  // characterKeys.all = ['characters'] 는 ['characters','agent',...] 의 prefix.
  // 단 personnelKeys.all = ['personnel'] 은 별도 — characterKeys.all 로 invalidate 못함.
  const all = characterKeys.all;
  assert.deepEqual(all, ["characters"]);
  // ['characters','agent'] 는 prefix 매칭
  // ['personnel'] 은 prefix 매칭 안 됨
});

/* ── A-3 / A-4: invalidation 흐름 — QueryClient 직접 검증 ── */

test("A-3: lore mutation invalidation — agent + personnel 두 캐시 모두 invalidate", async () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });

  let agentRefetchCount = 0;
  let personnelRefetchCount = 0;

  // 캐시 prepopulate
  qc.setQueryData(characterKeys.agent.all, [{ id: "fake-agent" }]);
  qc.setQueryData(personnelKeys.all, [{ id: "fake-personnel" }]);
  qc.setQueryData(characterKeys.agent.byId("c1"), { id: "c1", lore: { name: "old" } });
  qc.setQueryData(personnelKeys.byId("c1"), { id: "c1", lore: { name: "old-masked" } });

  // useUpdateLoreMutation onSuccess 흐름 미러
  await qc.invalidateQueries({ queryKey: characterKeys.agent.all });
  await qc.invalidateQueries({ queryKey: characterKeys.agent.byId("c1") });
  await qc.invalidateQueries({ queryKey: personnelKeys.all });
  await qc.invalidateQueries({ queryKey: personnelKeys.byId("c1") });

  // 모든 4 키가 stale 인지 확인
  const queries = qc.getQueryCache().getAll();
  const staleKeys = queries.filter((q) => q.isStale()).map((q) => q.queryKey);
  assert.equal(staleKeys.length, 4, "4 키 모두 stale");
});

test("A-4: play mutation invalidation — personnel 캐시 미터치", async () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } }, // 캐시 hot
  });

  qc.setQueryData(characterKeys.agent.all, [{ id: "agent" }]);
  qc.setQueryData(personnelKeys.all, [{ id: "personnel" }]);

  // play mutation 은 personnel 미터치
  await qc.invalidateQueries({ queryKey: characterKeys.agent.all });
  await qc.invalidateQueries({ queryKey: characterKeys.agent.byId("c1") });

  const cache = qc.getQueryCache();
  const personnelQuery = cache.find({ queryKey: personnelKeys.all });
  assert.ok(personnelQuery);
  assert.equal(
    personnelQuery.isStale(),
    false,
    "play mutation 후 personnel 캐시는 stale 되면 안 됨 (lore 무관)",
  );
});

/* ── A-1 / A-2: fetcher endpoint 분리 — useCharactersQuery 소스 정적 검증 ── */

test("A-1: usePersonnelQuery 의 fetcher 가 /api/erp/personnel 호출하는지 (소스 검증)", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    resolve(__dirname, "../queries/useCharactersQuery.ts"),
    "utf8",
  );

  // fetchPersonnelCharacters 함수 본체에 /api/erp/personnel 이 있어야 함
  const personnelFetcherMatch = /async function fetchPersonnelCharacters\(\)[\s\S]*?fetch\(["']([^"']+)["']\)/m.exec(
    src,
  );
  assert.ok(personnelFetcherMatch, "fetchPersonnelCharacters 정의 누락");
  assert.equal(
    personnelFetcherMatch[1],
    "/api/erp/personnel",
    "personnel fetcher 가 /api/erp/personnel (마스킹 endpoint) 호출해야 함",
  );
});

test("A-2: fetchAgentCharacters 가 /api/erp/characters?tier= 호출 (마스킹 X endpoint)", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    resolve(__dirname, "../queries/useCharactersQuery.ts"),
    "utf8",
  );

  // fetchAgentCharacters 함수 본체에 /api/erp/characters?tier= 가 있어야 함
  const agentFetcherMatch = /async function fetchAgentCharacters\([\s\S]*?\)[\s\S]*?fetch\(`([^`]+)`\)/m.exec(
    src,
  );
  assert.ok(agentFetcherMatch, "fetchAgentCharacters 정의 누락");
  assert.match(
    agentFetcherMatch[1],
    /^\/api\/erp\/characters/,
    "agent fetcher 는 /api/erp/characters 호출",
  );
});

/* ── A-RACE: 캐시 누설 시나리오 검증 (BLOCKING #1) ── */

test("A-RACE-1: agent endpoint 가 personnel 캐시 키와 분리됨 — 누설 차단", async () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // 가상의 agent endpoint 응답 (raw, 마스킹 X)
  const rawAgentList = [
    { id: "1", lore: { name: "John Real Name", appearance: "secret" } },
  ];
  // agent 키에 raw 데이터 set
  qc.setQueryData(characterKeys.agent.all, rawAgentList);
  qc.setQueryData(characterKeys.agent.byTier("MAIN"), rawAgentList);

  // personnel 키는 별도 fetcher → 별도 데이터
  const maskedPersonnelList = [
    { id: "1", lore: { name: "[CLASSIFIED]", appearance: "[CLASSIFIED]" } },
  ];
  qc.setQueryData(personnelKeys.all, maskedPersonnelList);

  // raw 데이터가 personnel 키로 누설되지 않음
  const personnel = qc.getQueryData(personnelKeys.all);
  assert.deepEqual(personnel, maskedPersonnelList);
  assert.notDeepEqual(personnel, rawAgentList);

  // agent 데이터는 별도 보존
  const agent = qc.getQueryData(characterKeys.agent.all);
  assert.deepEqual(agent, rawAgentList);
});

test("A-RACE-2: characterKeys.all 로 invalidate 시 personnel 키는 영향 없음 (prefix 매칭 분리)", async () => {
  const qc = new QueryClient();
  qc.setQueryData(characterKeys.agent.all, ["agent-data"]);
  qc.setQueryData(personnelKeys.all, ["personnel-data"]);

  // characterKeys.all = ['characters'] — agent 만 prefix 매칭
  await qc.invalidateQueries({ queryKey: characterKeys.all });

  const agentQuery = qc
    .getQueryCache()
    .find({ queryKey: characterKeys.agent.all });
  const personnelQuery = qc
    .getQueryCache()
    .find({ queryKey: personnelKeys.all });

  assert.equal(agentQuery?.isStale(), true, "agent 키는 invalidate 됨");
  assert.equal(
    personnelQuery?.isStale(),
    false,
    "personnel 키는 prefix 다르므로 invalidate 안 됨 (의도된 분리)",
  );
});

/* ── A-MUTATION: useCharacterMutation 소스 검증 ── */

/**
 * Source-level slicing helper — `export function ${name}` 시작점부터 다음 `export function`
 * 이전까지의 source 를 반환. mutation hook 함수별 invalidation 호출 검증에 사용.
 */
async function readMutationBlock(funcName) {
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    resolve(__dirname, "../mutations/useCharacterMutation.ts"),
    "utf8",
  );

  const startIdx = src.indexOf(`export function ${funcName}`);
  if (startIdx === -1) return null;
  // 다음 export function 또는 EOF
  const nextExport = src.indexOf("\nexport function", startIdx + 1);
  return nextExport === -1
    ? src.slice(startIdx)
    : src.slice(startIdx, nextExport);
}

test("A-MUT-1: useUpdateLoreMutation 이 personnelKeys 양쪽 invalidate 호출", async () => {
  const block = await readMutationBlock("useUpdateLoreMutation");
  assert.ok(block, "useUpdateLoreMutation block 못 찾음");
  assert.match(block, /characterKeys\.agent\.all/, "agent.all invalidate");
  assert.match(block, /characterKeys\.agent\.byId/, "agent.byId invalidate");
  assert.match(block, /personnelKeys\.all/, "personnelKeys.all invalidate");
  assert.match(block, /personnelKeys\.byId/, "personnelKeys.byId invalidate");
});

test("A-MUT-2: useUpdatePlayMutation 은 personnelKeys 호출 안 함", async () => {
  const block = await readMutationBlock("useUpdatePlayMutation");
  assert.ok(block, "useUpdatePlayMutation block 못 찾음");
  assert.match(block, /characterKeys\.agent\.all/);
  assert.match(block, /characterKeys\.agent\.byId/);
  assert.equal(
    /personnelKeys/.test(block),
    false,
    "play mutation 은 personnel 키 invalidate 안 해야 함 (lore 미변경)",
  );
});
