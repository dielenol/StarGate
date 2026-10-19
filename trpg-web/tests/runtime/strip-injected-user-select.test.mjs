import assert from "node:assert/strict";
import { test } from "node:test";

import { STRIP_INJECTED_USER_SELECT_SCRIPT as TRPG_WEB_SCRIPT } from "../../lib/runtime/strip-injected-user-select.ts";
import { STRIP_INJECTED_USER_SELECT_SCRIPT as STARGATE_V2_SCRIPT } from "../../../StarGateV2/lib/runtime/strip-injected-user-select.ts";

// 스크립트 본문에서 정규식 리터럴을 꺼낸다 — 형식(`NAME =\n    /.../flags;`)이 바뀌면 이 헬퍼도 함께 고친다.
function extractRegExp(name, flags) {
  const literal = TRPG_WEB_SCRIPT.match(new RegExp(`${name} =\\s*\\/(.+)\\/${flags};`));
  assert.ok(literal, `${name} 정규식 리터럴을 찾지 못했다`);
  return new RegExp(literal[1], flags);
}

test("strip 스크립트는 trpg-web과 StarGateV2에서 같은 내용이다", () => {
  assert.equal(TRPG_WEB_SCRIPT, STARGATE_V2_SCRIPT);
});

test("strip 스크립트는 구문 오류 없이 파싱된다", () => {
  assert.doesNotThrow(() => new Function(TRPG_WEB_SCRIPT));
});

test("user-select 정규식은 none만 보존하고 그 밖의 값은 주입으로 본다", () => {
  const pattern = extractRegExp("USER_SELECT_PATTERN", "i");
  const declaration = extractRegExp("USER_SELECT_DECLARATION", "gi");
  const strip = (style) => style.replace(declaration, "").replace(/^\s*;\s*/, "");

  for (const kept of [
    "user-select:none",
    "user-select:  none;",
    "user-select: none !important;",
    "-webkit-user-select: none;",
  ]) {
    assert.equal(pattern.test(kept), false, kept);
  }
  for (const injected of [
    "user-select: auto;",
    "-webkit-user-select: auto;",
    "user-select: text !important;",
  ]) {
    assert.equal(pattern.test(injected), true, injected);
  }
  assert.equal(strip("color: red; user-select: auto; width: 1px;"), "color: red; width: 1px;");
  assert.equal(strip("user-select: auto; -webkit-user-select: auto;"), "");
  assert.equal(strip("user-select: none; -webkit-user-select: auto;"), "user-select: none;");
});
