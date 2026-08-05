import assert from "node:assert/strict";
import test from "node:test";

import {
  withoutSessionReportReferenceStorageFields,
  withoutSessionReportReferenceStorageFieldsMany,
} from "../../../dist/crud/internal-storage.js";

test("domain DTO에서 현재·legacy report reference lock metadata를 제거한다", () => {
  const source = {
    codename: "SAFE",
    __sessionReportReferenceVersion: 3,
    __sessionReportReferenceLockAt: new Date(),
  };
  const [sanitized] = withoutSessionReportReferenceStorageFieldsMany([source]);

  assert.deepEqual(sanitized, { codename: "SAFE" });
  assert.deepEqual(withoutSessionReportReferenceStorageFields(source), {
    codename: "SAFE",
  });
  assert.notEqual(sanitized, source);
});
