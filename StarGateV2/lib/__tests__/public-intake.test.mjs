import assert from "node:assert/strict";
import test from "node:test";

import {
  getFeatureClosedBody,
  isPublicIntakeOpen,
  PUBLIC_INTAKE_CONFIG,
} from "../public-intake.ts";

test("공개 신청과 문의 창구는 같은 SSOT에서 마감 상태를 제공한다", () => {
  for (const kind of ["apply", "contact"]) {
    assert.equal(PUBLIC_INTAKE_CONFIG[kind].status, "CLOSED");
    assert.equal(isPublicIntakeOpen(kind), false);
    assert.deepEqual(getFeatureClosedBody(kind), {
      ok: false,
      code: "FEATURE_CLOSED",
      message: PUBLIC_INTAKE_CONFIG[kind].closedMessage,
    });
  }
});
