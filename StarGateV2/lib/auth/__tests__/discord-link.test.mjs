import assert from "node:assert/strict";
import test from "node:test";

process.env.AUTH_SECRET = "test-discord-link-secret";

const { createDiscordLinkState, verifyDiscordLinkState } = await import(
  "../discord-link.ts"
);

test("Discord link state는 userId와 만료를 서명해 복원한다", () => {
  const raw = createDiscordLinkState("user-123");
  const state = verifyDiscordLinkState(raw);

  assert.equal(state?.userId, "user-123");
  assert.ok(state && state.expiresAt > Date.now());
});

test("Discord link state 변조는 거부한다", () => {
  const raw = createDiscordLinkState("user-123");
  const [payload, signature] = raw.split(".");

  assert.equal(verifyDiscordLinkState(`${payload}x.${signature}`), null);
  assert.equal(verifyDiscordLinkState(`${payload}.${signature}x`), null);
});
