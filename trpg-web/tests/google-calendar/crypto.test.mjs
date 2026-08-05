import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptGoogleCalendarPayload,
  encryptGoogleCalendarPayload,
} from "../../lib/google-calendar/crypto.ts";

const KEY = Buffer.alloc(32, 7).toString("base64");

test("Google Calendar payload encryption round-trips without plaintext fields", () => {
  const payload = {
    refreshToken: "refresh-secret",
    selectedCalendarIds: ["calendar@example.com"],
  };
  const encrypted = encryptGoogleCalendarPayload(payload, KEY);

  assert.equal(encrypted.version, 1);
  assert.equal(JSON.stringify(encrypted).includes("refresh-secret"), false);
  assert.deepEqual(decryptGoogleCalendarPayload(encrypted, KEY), payload);
});

test("Google Calendar payload decryption rejects tampering and invalid keys", () => {
  const encrypted = encryptGoogleCalendarPayload(
    { value: "secret" },
    KEY,
    "guild:user-1",
  );
  const tampered = {
    ...encrypted,
    ciphertext: `${encrypted.ciphertext.slice(0, -1)}A`,
  };

  assert.throws(() =>
    decryptGoogleCalendarPayload(tampered, KEY, "guild:user-1"),
  );
  assert.throws(() =>
    decryptGoogleCalendarPayload(encrypted, KEY, "guild:user-2"),
  );
  assert.throws(() => encryptGoogleCalendarPayload({}, "not-a-32-byte-key"));
});
