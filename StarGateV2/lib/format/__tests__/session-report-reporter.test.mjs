import assert from "node:assert/strict";
import test from "node:test";

import { formatShortReporterName } from "../session-report.ts";

test("기관 명의 보고자의 표시 이름을 보존한다", () => {
  assert.equal(
    formatShortReporterName("NOVUS ORDO 사무국 기록통제실"),
    "기록통제실",
  );
  assert.equal(formatShortReporterName("NOVUS ORDO 사무국"), "NOVUS ORDO 사무국");
});

test("개인 명의와 빈 입력의 기존 표기를 유지한다", () => {
  assert.equal(
    formatShortReporterName("NOVUS ORDO 사무국 기록통제실 N.  Voss"),
    "N. Voss",
  );
  assert.equal(formatShortReporterName("NOVUS ORDO 사무국 기록통제실 홍길동"), "홍길동");
  assert.equal(formatShortReporterName("  "), "");
});
