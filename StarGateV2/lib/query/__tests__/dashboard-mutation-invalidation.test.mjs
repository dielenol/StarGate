import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { MutationObserver, QueryClient } from "@tanstack/react-query";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../../../", import.meta.url);
const groups = [
  ["useTradesMutation", ["useCreateTradeMutation", "useUpdateTradeMutation"]],
  ["useResearchMutation", ["useStartInitialResearch", "useQueueResearchJob", "useCancelResearchJob", "useClaimResearchJob"]],
  ["useEquipmentShopMutation", ["useEquipmentWorkshopRequest", "useUpdateEquipmentWorkshopRequest", "useAcceptEquipmentWorkshopQuote", "useDeclineEquipmentWorkshopQuote", "useClaimEquipmentWorkshopResult", "useQuoteEquipmentWorkshopRequest", "useCancelEquipmentWorkshopRequest", "useApproveEquipmentWorkshopReload"]],
];

function loadHookModule(name, client, fail) {
  class ApiError extends Error {}
  const queryModule = new Proxy({}, { get(_target, name) {
    if (name === "__esModule") return true;
    if (name === "dashboardKeys") return { all: ["dashboard"] };
    if (String(name).endsWith("Keys")) return new Proxy({}, { get: (_target, part) => [String(name), String(part)] });
    if (String(name).endsWith("ApiError")) return ApiError;
    if (name === "throwResearchError") return async () => { throw new ApiError("fixture failed"); };
    if (name === "createIdempotencyKey") return () => "fixture-key";
    return undefined;
  } });
  const exports = {};
  const source = readFileSync(new URL(`hooks/mutations/${name}.ts`, root), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText, { exports, Error, encodeURIComponent,
    fetch: async () => Response.json(fail ? { error:"fixture failed" } : { ok:true, trade:{id:"fixture"} }, { status:fail?409:200 }),
    require: (id) => id === "@tanstack/react-query" ? {
      useQueryClient: () => client,
      useMutation: (options) => new MutationObserver(client, { ...options, retry:false }),
    } : queryModule,
  });
  return exports;
}

for (const [file, names] of groups) {
  test(`${file}: successful actions invalidate the dashboard; failed actions preserve its cache`, async () => {
    const client = new QueryClient({ defaultOptions: { queries:{retry:false}, mutations:{retry:false} } });
    try {
      for (const fail of [false, true]) {
        const hooks = loadHookModule(file, client, fail);
        for (const name of names) {
          client.setQueryData(["dashboard"], { count:1 });
          const mutation = hooks[name]();
          const operation = mutation.mutate({ tradeId:"fixture", requestId:"fixture", jobId:"fixture", recipeId:"fixture", operationId:"fixture", action:{action:"CONFIRM",expectedRevision:1} });
          if (fail) await assert.rejects(operation);
          else await operation;
          assert.equal(client.getQueryState(["dashboard"]).isInvalidated, !fail, name);
        }
      }
    } finally { client.clear(); }
  });
}

test("dashboard polling remains active without realtime events for completion times and deadlines", () => {
  const source = readFileSync(new URL("hooks/queries/useDashboardQuery.ts", root), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions:{module:ts.ModuleKind.CommonJS} }).outputText, {
    exports, require: () => ({useQuery:options=>options}),
  });
  const options = exports.useDashboard({initialData:{count:1}});
  assert.equal(options.refetchInterval,60_000);
  assert.equal(options.refetchIntervalInBackground,false);
  assert.equal(options.staleTime,60_000);
});
