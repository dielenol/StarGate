import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../migrate-pitboy-susan-account.mjs", import.meta.url),
  "utf8",
);

test("pitboy/Susan migration is dry-run by default and double-gated", () => {
  assert.match(source, /process\.argv\.includes\("--execute"\)/);
  assert.match(source, /process\.argv\.includes\("--yes"\)/);
  assert.match(source, /EXECUTE !== CONFIRMED/);
  assert.match(source, /PITBOY_CREDENTIAL_PASSWORD/);
  assert.doesNotMatch(source, /hashedPassword:\s*["'][^"']+["']/);
});

test("pitboy/Susan migration preserves GM authority and legacy economy", () => {
  assert.match(source, /role:\s*"GM"/);
  assert.match(source, /status:\s*"ACTIVE"/);
  assert.match(source, /tier:\s*"MAIN"/);
  assert.match(source, /ownerPreserved:\s*true/);
  assert.match(source, /economicMainPreserved:\s*true/);
  assert.match(source, /economicCollectionsModified:\s*false/);
  assert.match(source, /session\.withTransaction/);
  assert.doesNotMatch(
    source,
    /collection\("(?:character_inventory|credit_transactions|credit_balances|stock_holdings)"\)\.update/,
  );
});

test("pitboy credentials update is CAS-protected and does not rotate on rerun", () => {
  assert.match(source, /hashedPassword:\s*plan\.user\.hashedPassword \?\? null/);
  assert.match(source, /characterIds:\s*plan\.user\.characterIds/);
  assert.match(source, /await compare\(password, plan\.user\.hashedPassword\)/);
  assert.match(source, /비밀번호 회전을 허용하지 않습니다/);
  assert.match(source, /\$addToSet:\s*\{ characterIds:/);
  assert.match(source, /password\.length >= 8 && password\.length <= 128/);
});

test("pitboy/Susan migration CAS-protects the complete account linkage preimage", () => {
  assert.match(source, /const TARGET_USER_ID = "[a-f0-9]{24}"/);
  assert.match(source, /const TARGET_DISCORD_ID = "\d+"/);
  assert.match(source, /discordId:\s*TARGET_DISCORD_ID/);
  assert.match(source, /legacyMainResult = await db\.collection\("characters"\)\.updateOne/);
  assert.doesNotMatch(source, /susanNeedsUpdate/);
  assert.match(source, /const susanResult = await db\.collection\("characters"\)\.updateOne/);
  assert.match(source, /ownerId:\s*plan\.susan\.ownerId \?\? null/);
  assert.match(source, /previewImage:\s*plan\.susan\.previewImage \?\? null/);
  assert.match(
    source,
    /pixelCharacterImage:\s*plan\.susan\.pixelCharacterImage \?\? null/,
  );
  assert.match(source, /"lore\.mainImage":\s*plan\.susan\.lore\?\.mainImage \?\? null/);
});

test("pitboy/Susan migration links all three character image roles", () => {
  assert.match(source, /Clairvoyance-pixel-profile\.webp/);
  assert.match(source, /Clairvoyance-pixel-character\.webp/);
  assert.match(source, /Clairvoyance-profile\.webp/);
  assert.match(source, /"lore\.mainImage"/);
});
