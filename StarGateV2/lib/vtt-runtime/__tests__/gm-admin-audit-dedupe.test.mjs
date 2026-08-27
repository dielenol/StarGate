import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = {
  existingStoredKeys: [],
  findFilter: null,
};
globalThis.__gmAdminAuditDedupeTestState = state;

function moduleUrl(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/db/init") {
      return { url: moduleUrl("export {};"), shortCircuit: true };
    }
    if (specifier === "@stargate/shared-db") {
      return {
        url: moduleUrl(`
          export async function getDb() {
            return {
              collection() {
                return {
                  find(filter) {
                    globalThis.__gmAdminAuditDedupeTestState.findFilter = filter;
                    return {
                      async toArray() {
                        return globalThis.__gmAdminAuditDedupeTestState.existingStoredKeys
                          .map(dedupeKey => ({ dedupeKey }));
                      }
                    };
                  }
                };
              }
            };
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/outbox/integration") {
      return {
        url: moduleUrl("export async function enqueueGmAdminAudit() {}"),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { findMissingGmAdminAuditDedupeKeys } = await import(
  `../../notifications/gm-admin-audit.ts?test=${Date.now()}`
);

test("완료 audit dedupe는 outbox prefix를 한 번에 조회하고 없는 키만 반환한다", async () => {
  state.existingStoredKeys = [
    "gm_admin_audit:vtt-host-completed:vtt-host-action-01",
  ];
  const missing = await findMissingGmAdminAuditDedupeKeys([
    "vtt-host-completed:vtt-host-action-01",
    "vtt-host-completed:vtt-host-action-02",
    "vtt-host-completed:vtt-host-action-02",
  ]);

  assert.deepEqual(missing, ["vtt-host-completed:vtt-host-action-02"]);
  assert.equal(state.findFilter.kind, "GM_ADMIN_AUDIT");
  assert.deepEqual(state.findFilter.dedupeKey.$in, [
    "gm_admin_audit:vtt-host-completed:vtt-host-action-01",
    "gm_admin_audit:vtt-host-completed:vtt-host-action-02",
  ]);
});
