import assert from "node:assert/strict";
import test from "node:test";

import {
  createModalRegistry,
  resolveModalKeyAction,
  resolveTabTarget,
} from "../../hooks/useModalA11y.ts";

const first = { id: "close" };
const middle = { id: "title" };
const last = { id: "submit" };
const focusable = [first, middle, last];

test("resolveTabTarget wraps Tab from the last element to the first", () => {
  assert.equal(resolveTabTarget(focusable, last, false), first);
});

test("resolveTabTarget wraps Shift+Tab from the first element to the last", () => {
  assert.equal(resolveTabTarget(focusable, first, true), last);
});

test("resolveTabTarget leaves natural Tab order inside the trap alone", () => {
  assert.equal(resolveTabTarget(focusable, first, false), null);
  assert.equal(resolveTabTarget(focusable, middle, false), null);
  assert.equal(resolveTabTarget(focusable, middle, true), null);
  assert.equal(resolveTabTarget(focusable, last, true), null);
});

test("resolveTabTarget pulls focus back in when it is outside the dialog", () => {
  assert.equal(resolveTabTarget(focusable, { id: "outside" }, false), first);
  assert.equal(resolveTabTarget(focusable, null, true), last);
  assert.equal(resolveTabTarget(focusable, undefined, false), first);
});

test("resolveTabTarget does nothing when the dialog has no focusable element", () => {
  assert.equal(resolveTabTarget([], first, false), null);
  assert.equal(resolveTabTarget([], null, true), null);
});

test("modal registry lets only the top modal handle keys and keeps the lock until the last one closes", () => {
  const registry = createModalRegistry();
  const body = { style: { overflow: "auto" } };
  const detail = Symbol("detail");
  const google = Symbol("google");

  registry.open(detail, body);
  registry.open(google, body);
  assert.equal(body.style.overflow, "hidden");
  assert.equal(registry.isTop(google), true);
  assert.equal(registry.isTop(detail), false);

  // 아래 모달이 먼저 닫혀도 위 모달이 남아 있으면 잠금은 유지된다.
  registry.close(detail, body);
  assert.equal(body.style.overflow, "hidden");
  assert.equal(registry.isTop(google), true);

  registry.close(google, body);
  assert.equal(body.style.overflow, "auto");
  assert.equal(registry.isTop(google), false);
});

test("modal registry survives StrictMode double effects without leaking the lock", () => {
  const registry = createModalRegistry();
  const body = { style: { overflow: "" } };
  const a = Symbol("a");
  const b = Symbol("b");

  // mount → 이중 실행 cleanup → 재실행 순서.
  registry.open(a, body);
  registry.open(b, body);
  registry.close(a, body);
  registry.close(b, body);
  assert.equal(body.style.overflow, "");

  registry.open(a, body);
  registry.open(b, body);
  assert.equal(body.style.overflow, "hidden");
  registry.close(b, body);
  registry.close(a, body);
  assert.equal(body.style.overflow, "");
});

test("modal registry hands the top to the lower modal when the top one closes first", () => {
  const registry = createModalRegistry();
  const body = { style: { overflow: "auto" } };
  const detail = Symbol("detail");
  const google = Symbol("google");

  // Escape 흐름: 위 모달이 먼저 닫히고 아래 모달이 다시 top 이 된다.
  registry.open(detail, body);
  registry.open(google, body);
  registry.close(google, body);
  assert.equal(registry.isTop(detail), true);
  assert.equal(body.style.overflow, "hidden");
  registry.close(detail, body);
  assert.equal(body.style.overflow, "auto");

  // 다음 사이클은 그 시점의 값을 다시 저장해야 한다.
  body.style.overflow = "scroll";
  registry.open(detail, body);
  registry.close(detail, body);
  assert.equal(body.style.overflow, "scroll");
});

test("resolveModalKeyAction acts only for the top modal on unhandled, non-composing keys", () => {
  const escape = {
    key: "Escape",
    isComposing: false,
    keyCode: 27,
    defaultPrevented: false,
  };

  assert.equal(resolveModalKeyAction(escape, true), "close");
  assert.equal(
    resolveModalKeyAction({ ...escape, key: "Tab", keyCode: 9 }, true),
    "tab",
  );
  assert.equal(
    resolveModalKeyAction({ ...escape, key: "Enter", keyCode: 13 }, true),
    null,
  );
  assert.equal(resolveModalKeyAction(escape, false), null);
  assert.equal(
    resolveModalKeyAction({ ...escape, defaultPrevented: true }, true),
    null,
  );
  assert.equal(
    resolveModalKeyAction({ ...escape, isComposing: true }, true),
    null,
  );
  assert.equal(resolveModalKeyAction({ ...escape, keyCode: 229 }, true), null);
});

test("modal registry ignores closing an id it does not know", () => {
  const registry = createModalRegistry();
  const body = { style: { overflow: "scroll" } };
  const open = Symbol("open");

  registry.open(open, body);
  registry.close(Symbol("unknown"), body);
  assert.equal(body.style.overflow, "hidden");
  assert.equal(registry.isTop(open), true);
});
