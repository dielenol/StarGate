import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTERNAL_SUB_ORGS,
  getExternalSubOrg,
} from "../external-sub-orgs.ts";

test("러시아 정부를 군부 하위 조직으로 노출한다", () => {
  const russia = getExternalSubOrg("RUSSIA");

  assert.deepEqual(russia, {
    code: "RUSSIA",
    label: "러시아 정부",
    labelEn: "Russian Government",
    summary: "군부 산하 러시아 정치·군사·정보기관 라인",
    parentCode: "MILITARY",
    parentLabel: "군부",
    logoUrl: "",
    logoVariant: "badge",
    doctrine: "국가 통제 · 군사 행정망",
  });
  assert.equal(
    EXTERNAL_SUB_ORGS.filter((org) => org.code === "RUSSIA").length,
    1,
  );
});
