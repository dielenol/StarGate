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
  // IV 가 무작위라 글자를 고정값으로 바꾸면 원래 글자와 같을 때가 있다.
  // 바이트를 직접 비트 반전해 매번 실제로 변조되게 한다.
  const tamperedCiphertext = Buffer.from(encrypted.ciphertext, "base64url");
  tamperedCiphertext[0] ^= 0x01;
  const tampered = {
    ...encrypted,
    ciphertext: tamperedCiphertext.toString("base64url"),
  };
  assert.notEqual(tampered.ciphertext, encrypted.ciphertext);

  assert.throws(() =>
    decryptGoogleCalendarPayload(tampered, KEY, "guild:user-1"),
  );
  assert.throws(() =>
    decryptGoogleCalendarPayload(encrypted, KEY, "guild:user-2"),
  );
  assert.throws(() => encryptGoogleCalendarPayload({}, "not-a-32-byte-key"));
});
