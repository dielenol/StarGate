import assert from "node:assert/strict";
import test from "node:test";

const {
  canonicalVttControlRequest,
  signVttControlRequest,
} = await import("../signature.ts");

test("StarGate HMAC은 Nochichim controller 고정 벡터와 일치한다", () => {
  const input = {
    secret: "0123456789abcdef0123456789abcdef",
    method: "POST",
    pathname: "/v1/actions",
    timestamp: "1787321400",
    nonce: "abcdefghijklmnop",
    body: "{\"action\":\"START\",\"requestId\":\"vtt-test-0001\"}",
  };
  assert.equal(
    canonicalVttControlRequest(input),
    [
      "POST",
      "/v1/actions",
      "1787321400",
      "abcdefghijklmnop",
      "4194085c748e1d0d18202cedf332c27c57c2275e2dd15b242cebe425d1107ed3",
    ].join("\n"),
  );
  assert.equal(
    signVttControlRequest(input),
    "v1=05f8bdb609faa4dadda2baf7ff9dffcc2d41988f8475d31b988616858718fed1",
  );
});
