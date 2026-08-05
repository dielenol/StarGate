import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createGoogleOAuthAttempt,
  verifyGoogleOAuthAttempt,
} from "../../lib/google-calendar/oauth-state.ts";

const SECRET = "test-auth-secret";
const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);

test("OAuth attempt binds state, PKCE verifier, Discord user and expiry", () => {
  const attempt = createGoogleOAuthAttempt("discord-1", SECRET, NOW);
  const verified = verifyGoogleOAuthAttempt(
    attempt.cookieValue,
    attempt.state,
    "discord-1",
    SECRET,
    NOW + 1_000,
  );

  assert.ok(verified);
  assert.equal(
    createHash("sha256").update(verified.codeVerifier).digest("base64url"),
    attempt.codeChallenge,
  );
});

test("OAuth attempt rejects mismatched, expired and tampered values", () => {
  const attempt = createGoogleOAuthAttempt("discord-1", SECRET, NOW);

  assert.equal(
    verifyGoogleOAuthAttempt(
      attempt.cookieValue,
      "other-state",
      "discord-1",
      SECRET,
      NOW,
    ),
    null,
  );
  assert.equal(
    verifyGoogleOAuthAttempt(
      attempt.cookieValue,
      attempt.state,
      "discord-2",
      SECRET,
      NOW,
    ),
    null,
  );
  assert.equal(
    verifyGoogleOAuthAttempt(
      attempt.cookieValue,
      attempt.state,
      "discord-1",
      SECRET,
      NOW + 10 * 60 * 1_000,
    ),
    null,
  );
  assert.equal(
    verifyGoogleOAuthAttempt(
      `${attempt.cookieValue}x`,
      attempt.state,
      "discord-1",
      SECRET,
      NOW,
    ),
    null,
  );
});
