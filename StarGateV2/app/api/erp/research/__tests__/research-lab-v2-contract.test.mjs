import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("공개 연구 타입은 관계 점수와 선택지 변화량을 노출하지 않는다", async () => {
  const [types, overview, dialogue] = await Promise.all([
    source("types/research.ts"),
    source("lib/db/research-lab-overview.ts"),
    import(new URL("lib/research/xeno-dialogue.ts", ROOT)),
  ]);

  assert.doesNotMatch(types, /relationshipScore|relationship\.score|\bscore\s*:/);
  assert.doesNotMatch(overview, /getOrCreateNpcRelationship/);
  assert.match(overview, /npcRelationshipsCol\(\)\)\.findOne/);
  const choices = dialogue.listXenoPublicChoices("INTRODUCTION");
  assert.ok(choices.length > 0);
  for (const choice of choices) {
    assert.deepEqual(Object.keys(choice).sort(), [
      "choiceId",
      "label",
      "playerLine",
      "sceneId",
    ]);
    assert.equal("delta" in choice, false);
    assert.equal("response" in choice, false);
  }
});

test("경제 연구 API는 멱등 operation 안에서만 트랜잭션 도메인을 호출한다", async () => {
  const paths = [
    "app/api/erp/research/[recipeId]/initial/route.ts",
    "app/api/erp/research/[recipeId]/jobs/route.ts",
    "app/api/erp/research/jobs/[jobId]/cancel/route.ts",
    "app/api/erp/research/jobs/[jobId]/claim/route.ts",
  ];
  const routes = await Promise.all(paths.map(source));
  const calls = [
    "beginInitialResearch({",
    "enqueueResearchJob({",
    "cancelResearchJob({",
    "claimResearchJob({",
  ];

  routes.forEach((route, index) => {
    const keyIndex = route.indexOf("readIdempotencyKey(request)");
    const operationIndex = route.indexOf("executeEconomicOperationResult<");
    const transactionIndex = route.indexOf("run: async (mongoSession)");
    const domainIndex = route.indexOf(calls[index]);
    assert.ok(keyIndex >= 0, `${paths[index]} 멱등 키 검증 누락`);
    assert.ok(operationIndex > keyIndex, `${paths[index]} operation 순서 오류`);
    assert.ok(transactionIndex > operationIndex, `${paths[index]} transaction 누락`);
    assert.ok(domainIndex > transactionIndex, `${paths[index]} transaction 밖 mutation`);
    assert.match(route, /session: mongoSession/);
    assert.match(route, /session\.user\.isGuest/);
    assert.doesNotMatch(
      route.slice(route.indexOf("export async function POST"), operationIndex),
      /ResearchLab(?:ProductionReady|MutationConfigured)/,
      `${paths[index]} readiness gate가 완료 operation replay보다 먼저 실행됨`,
    );
  });
  assert.match(routes[0], /prepare: requireResearchLabProductionReady/);
  assert.match(routes[1], /prepare: requireResearchLabProductionReady/);
  assert.match(
    routes[2],
    /prepare: async \(\) => requireResearchLabMutationConfigured\(\)/,
  );
  assert.match(
    routes[3],
    /executeEconomicOperationResult<[\s\S]*prepare: async \(\) => \{[\s\S]*requireResearchLabMutationConfigured\(\)[\s\S]*prepareResearchJobClaimInventoryLock/,
  );
  const domain = await source("lib/db/research-lab.ts");
  const operation = await source("lib/db/execute-economic-operation.ts");
  assert.match(
    domain,
    /requestId: childIdempotencyKey\(input\.requestId, "research-debit"\)/,
  );
  assert.match(
    domain,
    /const character = await requireActiveMainCharacter\(input\.actor, input\.session\);[\s\S]*existing\.characterId !== character\.id/,
  );
  assert.match(
    domain,
    /claimResearchLabCharacterOutput\(\{[\s\S]*characterId: character\.id/,
  );
  assert.ok(
    domain.indexOf("workerHaltedAt: { $exists: true }") <
      domain.indexOf("debit = await addCredit"),
    "안전정지 확인은 500 CR 차감보다 먼저 실행해야 한다",
  );
  assert.match(
    domain,
    /findOneAndUpdate\([\s\S]*workerHaltedAt: \{ \$exists: false \}[\s\S]*\$inc: \{ queueAdmissionVersion: 1 \}[\s\S]*session: input\.session/,
  );
  assert.match(domain, /"LINE_HALTED",[\s\S]*503/);
  assert.ok(
    operation.indexOf("const existing = await findEconomicOperation(args)") <
      operation.indexOf("if (args.prepare)"),
    "완료 operation replay는 claim preflight보다 먼저 확인해야 한다",
  );
  assert.match(
    operation,
    /catch \(error\) \{[\s\S]*const replay = await findEconomicOperation\(args\)/,
  );
});

test("제노 선택·자유대화 API는 서버 registry와 제한·fallback 경계를 사용한다", async () => {
  const [choice, chat, ollama, actor] = await Promise.all([
    source("app/api/erp/research/xeno/choices/route.ts"),
    source("app/api/erp/research/xeno/chat/route.ts"),
    source("lib/research/xeno-ollama.ts"),
    source("lib/db/xeno-research.ts"),
  ]);

  assert.match(choice, /getXenoChoiceDefinition\(choiceId\)/);
  assert.match(choice, /getXenoChoiceDefinition\(result\.choiceId\)/);
  assert.match(choice, /resolvedChoice\.playerLine/);
  assert.match(choice, /CHOICE_NOT_AVAILABLE/);
  assert.match(choice, /sceneId: choice\.sceneId/);
  assert.doesNotMatch(choice, /body\?\.delta|body\.delta/);
  assert.match(chat, /sanitizeXenoChatInput/);
  assert.match(chat, /reserveXenoConversationTurn/);
  assert.match(chat, /XENO_CHAT_DAILY_LIMIT/);
  assert.match(chat, /XENO_CHAT_COOLDOWN_MS/);
  assert.match(chat, /after\(async \(\) =>/);
  assert.match(chat, /reservation\.summaryLease/);
  assert.match(chat, /summaryLeaseToken: summaryLease\.token/);
  assert.match(chat, /turnLeaseToken: reservation\.turnLease\.token/);
  assert.match(choice, /isResearchLabMutationConfigured\(\)/);
  assert.match(chat, /isResearchLabMutationConfigured\(\)/);
  assert.match(
    chat,
    /assistantCreatedAt\.getTime\(\) \+ XENO_CHAT_COOLDOWN_MS/,
  );
  assert.match(ollama, /XENO_CHAT_TIMEOUT_MS = 12_000/);
  assert.match(ollama, /XENO_CHAT_OUTPUT_LIMIT = 220/);
  assert.match(ollama, /model: input\.model/);
  assert.match(actor, /character\.isPublic === true/);
  assert.doesNotMatch(chat, /fallbackReason/);
  assert.doesNotMatch(chat, /process\.env\.OLLAMA_API_KEY[\s\S]*NextResponse\.json\([^)]*OLLAMA_API_KEY/);
});

test("Query mutation은 연구·인벤토리·크레딧·알림 캐시를 함께 갱신한다", async () => {
  const [query, mutation, client] = await Promise.all([
    source("hooks/queries/useResearchQuery.ts"),
    source("hooks/mutations/useResearchMutation.ts"),
    source("app/(erp)/erp/research/ResearchClient.tsx"),
  ]);

  assert.match(query, /queryKey: researchKeys\.overview/);
  assert.match(query, /initialData: options\?\.initialData/);
  assert.match(query, /refetchOnWindowFocus: "always"/);
  assert.match(mutation, /researchKeys\.all/);
  assert.match(mutation, /inventoryKeys\.all/);
  assert.match(mutation, /adminInventoryOverviewKeys\.all/);
  assert.match(mutation, /creditKeys\.all/);
  assert.match(mutation, /notificationKeys\.all/);
  assert.doesNotMatch(mutation, /router\.refresh/);
  assert.match(client, /retainIdempotencyOperation/);
  assert.match(client, /window\.confirm/);
  const choiceMutation = mutation.slice(
    mutation.indexOf("export function useXenoChoice"),
    mutation.indexOf("export function useXenoChat"),
  );
  assert.doesNotMatch(choiceMutation, /text: response\.dialogue\.text/);
  assert.doesNotMatch(choiceMutation, /expression: response\.dialogue\.expression/);
  assert.match(choiceMutation, /choices: \[\]/);
  assert.match(client, /interactionHasCurrentDialogue/);
  assert.doesNotMatch(client, /relationshipScore|호감도.*\d|게이지/);
});

test("overview는 active job을 전역 500건으로 잘라내지 않고 안전정지를 노출한다", async () => {
  const [overview, types] = await Promise.all([
    source("lib/db/research-lab-overview.ts"),
    source("types/research.ts"),
  ]);

  assert.match(overview, /researchLabJobsCol\(\)/);
  assert.match(
    overview,
    /recipeId: \{ \$in: \[\.\.\.RESEARCH_RECIPE_IDS\] \}/,
  );
  assert.match(overview, /OVERVIEW_JOB_PROJECTION/);
  assert.match(
    overview,
    /type OverviewResearchJob = Pick<[\s\S]*project<OverviewResearchJob>\(OVERVIEW_JOB_PROJECTION\)/,
  );
  const projection = overview.slice(
    overview.indexOf("const OVERVIEW_JOB_PROJECTION"),
    overview.indexOf("const RECIPE_COPY"),
  );
  assert.doesNotMatch(
    projection,
    /requestId|requesterDisplayName|creditCost|output|lastError/,
  );
  assert.match(
    overview,
    /sort\(\{ recipeId: 1, status: 1, queuedAt: 1, _id: 1 \}\)/,
  );
  assert.doesNotMatch(overview, /limit:\s*500|\.limit\(500\)/);
  assert.match(overview, /workerHaltedAt !== undefined/);
  assert.match(overview, /activeJobsByRecipe/);
  assert.match(types, /isHalted: boolean/);
  assert.match(types, /productionEnabled: boolean/);
});
