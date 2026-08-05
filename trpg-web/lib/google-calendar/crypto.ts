import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ENCRYPTION_VERSION = 1;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;

export interface EncryptedGoogleCalendarPayload {
  version: typeof ENCRYPTION_VERSION;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function decodeGoogleCalendarEncryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY는 base64로 인코딩한 32바이트 키여야 합니다.",
    );
  }
  return key;
}

export function encryptGoogleCalendarPayload<T>(
  value: T,
  encodedKey: string,
  additionalAuthenticatedData?: string,
): EncryptedGoogleCalendarPayload {
  const key = decodeGoogleCalendarEncryptionKey(encodedKey);
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: AES_GCM_TAG_BYTES,
  });
  if (additionalAuthenticatedData) {
    cipher.setAAD(Buffer.from(additionalAuthenticatedData, "utf8"));
  }
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    version: ENCRYPTION_VERSION,
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function decryptGoogleCalendarPayload<T>(
  encrypted: EncryptedGoogleCalendarPayload,
  encodedKey: string,
  additionalAuthenticatedData?: string,
): T {
  if (encrypted.version !== ENCRYPTION_VERSION) {
    throw new Error("지원하지 않는 Google Calendar 암호화 버전입니다.");
  }

  const key = decodeGoogleCalendarEncryptionKey(encodedKey);
  const iv = Buffer.from(encrypted.iv, "base64url");
  const authTag = Buffer.from(encrypted.authTag, "base64url");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64url");
  if (iv.length !== AES_GCM_IV_BYTES || authTag.length !== AES_GCM_TAG_BYTES) {
    throw new Error("Google Calendar 암호화 데이터 형식이 올바르지 않습니다.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: AES_GCM_TAG_BYTES,
  });
  if (additionalAuthenticatedData) {
    decipher.setAAD(Buffer.from(additionalAuthenticatedData, "utf8"));
  }
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
