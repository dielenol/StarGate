import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const ts = createRequire(import.meta.url)("typescript");
function load(relativePath, dependencies) {
  const exports = {};
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText, { exports, URL, Error, Date, Request, Response, console,
    require: (name) => dependencies[name] ?? {},
  });
  return exports;
}

const targetId = "aaaaaaaaaaaaaaaaaaaaaaaa";
test("workshop string keys follow the API idempotency contract while trade/research require ObjectId", () => {
  const { parseDashboardBusinessRecordId: parse } = load("../dashboard-business-link.ts", {});
  const { isValidIdempotencyKey } = load("../../api/idempotency.ts", {});
  for (const value of ["workshop:550e8400-e29b-41d4-a716-446655440000", "abcdefgh", "a".repeat(128), "a".repeat(129), "bad/key", "short", "bad key :", targetId]) {
    assert.equal(parse(value,"workshop"), isValidIdempotencyKey(value) ? value : null);
  }
  assert.equal(parse("workshop:550e8400-e29b-41d4-a716-446655440000"),null);
  assert.equal(parse(targetId.toUpperCase()),targetId);
});
function tradeApi({ guest = false, targetOwner = "owner", targetExists = true } = {}) {
  let targetReads = 0;
  let listReads = 0;
  const base = [{ _id:"bbbbbbbbbbbbbbbbbbbbbbbb", initiator:{userId:"owner"}, counterparty:{userId:"other"} }];
  const api = load("../../../app/api/erp/trades/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/auth/config": { auth: async () => ({ user: { id:"owner", isGuest:guest } }) },
    "@/lib/api/http-cache": { jsonWithETag: (_request,body) => Response.json(body) },
    "@/lib/stocks/novex": { serializeStockMarketState: () => ({}) },
    "@/lib/db/characters": { findMainCharacterLiteByOwner: async () => null },
    "@/lib/db/trades": {
      listPlayerTradeCounterparties: async () => [],
      listPlayerTradesForUser: async (id) => { assert.equal(id,"owner"); listReads++; return base; },
      findPlayerTradeById: async (id) => { assert.equal(id,targetId); targetReads++; return targetExists ? {_id:targetId,initiator:{userId:targetOwner},counterparty:{userId:"other"}} : null; },
      serializePlayerTrade: (row) => ({ id:String(row._id) }),
    },
  });
  return { get: (id) => api.GET(new Request("http://localhost/api/erp/trades?tradeId="+id)), counts: () => ({ targetReads, listReads }) };
}

test("old trade target outside list limit is appended only for a participant", async () => {
  const mine = tradeApi();
  const own = await (await mine.get(targetId)).json();
  assert(own.trades.some(t=>t.id===targetId));
  const foreign = tradeApi({ targetOwner:"stranger" });
  const hidden = await (await foreign.get(targetId)).json();
  assert.equal(hidden.trades.some(t=>t.id===targetId),false);
  const missing = tradeApi({ targetExists:false });
  assert.deepEqual(await (await missing.get(targetId)).json(), hidden, "missing and inaccessible records disclose the same response");
});

test("invalid target and guest do not cause personal trade reads", async () => {
  const invalid = tradeApi();
  assert.equal((await invalid.get("bad")).status,400);
  assert.deepEqual(invalid.counts(),{targetReads:0,listReads:0});
  const guest = tradeApi({guest:true});
  assert.equal((await (await guest.get(targetId)).json()).trades.length,0);
  assert.deepEqual(guest.counts(),{targetReads:0,listReads:0});
});

function research({ active = true, count = 1 } = {}) {
  let claims = 0;
  class ResearchLabError extends Error {
    constructor(code,status,message) { super(message); this.code=code; this.status=status; }
  }
  const api = load("../../db/research-lab.ts", {
    "../research/research-lab": { ResearchLabError },
    "@stargate/shared-db": {
      findUserById: async () => ({status:active?"ACTIVE":"SUSPENDED",displayName:"Tester"}),
      charactersCol: async () => ({find(filter) {
        assert.equal(filter.ownerId,"owner");
        assert.equal(filter.type,"AGENT");
        return {project(projection) { return {toArray: async () => Array.from({length:count},(_,index)=>({
          _id:"main-"+index,
          ...(projection.type ? {type:"AGENT"} : {}),
          codename:"MAIN",play:{className:"과학자"},
        }))};}};
      }}),
      claimResearchLabCharacterOutput: async (input) => {
        claims++;
        assert.equal(input.requesterUserId,"owner");
        assert.equal(input.characterId,"main-0");
        return {job:{_id:targetId}};
      },
    },
  });
  return { claim: () => api.claimResearchJob({jobId:targetId,actor:{id:"owner",displayName:"Tester"},session:{}}), claims:()=>claims };
}

test("research claim retains the projected AGENT type before passing ownership to the claim operation", async () => {
  const harness = research();
  assert.equal((await harness.claim()).job._id,targetId);
  assert.equal(harness.claims(),1);
});

test("inactive, missing MAIN and duplicate MAIN never reach the research claim mutation", async () => {
  for(const [options,code] of [[{active:false},"UNAUTHORIZED"],[{count:0},"NO_MAIN_CHARACTER"],[{count:2},"MAIN_CHARACTER_INTEGRITY"]]) {
    const harness = research(options);
    await assert.rejects(harness.claim(),(error)=>error.code===code);
    assert.equal(harness.claims(),0);
  }
});
