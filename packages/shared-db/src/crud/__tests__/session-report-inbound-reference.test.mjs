import assert from "node:assert/strict";
import test from "node:test";

const testApi = await import("node:test");
const HAS_MODULE_MOCK =
  testApi.mock && typeof testApi.mock.module === "function";

if (!HAS_MODULE_MOCK) {
  test("보고서 inbound reference — module mock 미지원", { skip: true }, () => {});
} else {
  let referenced = false;
  let captured = null;
  testApi.mock.module(
    new URL("../../../dist/client.js", import.meta.url).href,
    {
      namedExports: {
        getDb: async () => ({
          collection(name) {
            assert.equal(name, "session_reports");
            return {
              async findOne(filter, options) {
                captured = { filter, options };
                return referenced ? { _id: "report-id" } : null;
              },
            };
          },
        }),
      },
    },
  );

  const {
    assertNoSessionReportInboundReference,
    hasSessionReportInboundReference,
    SessionReportInboundReferenceError,
  } = await import(
    "../../../dist/crud/session-report-reference-integrity.js"
  );

  test("inbound lookup은 exact array identity와 전달된 transaction session을 사용한다", async () => {
    const session = { id: "transaction-session" };
    referenced = false;
    assert.equal(
      await hasSessionReportInboundReference(
        "relatedPersonnelCodenames",
        "AGENT_ZULU",
        { session },
      ),
      false,
    );
    assert.deepEqual(captured.filter, {
      relatedPersonnelCodenames: "AGENT_ZULU",
    });
    assert.equal(captured.options.session, session);
  });

  test("inbound report가 있으면 target lifecycle mutation을 명시적 conflict로 차단한다", async () => {
    referenced = true;
    await assert.rejects(
      assertNoSessionReportInboundReference(
        "relatedWikiSlugs",
        "black-pyramid",
      ),
      (error) => {
        assert.ok(error instanceof SessionReportInboundReferenceError);
        assert.equal(error.code, "SESSION_REPORT_INBOUND_REFERENCE");
        assert.equal(error.field, "relatedWikiSlugs");
        return true;
      },
    );
  });
}
