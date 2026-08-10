import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

for (const [label, path, replacementField] of [
  [
    "편의점·주식 카드",
    "../src/consumers/discord-desired-state.ts",
    "replacementMessageIds",
  ],
  ["연구 카드", "../src/consumers/research-card.ts", "replacementMessageId"],
]) {
  test(`${label} 교체는 새 메시지 활성화 후 이전 메시지를 삭제한다`, async () => {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const createAt = source.indexOf("await createDiscordWebhookMessage(");
    const activateAt = source.indexOf("activationAttempted = true", createAt);
    const deleteOldAt = source.indexOf("for (const messageId of previousIds)", activateAt);

    assert.ok(createAt >= 0 && activateAt > createAt && deleteOldAt > activateAt);
    assert.match(source, /replacementMessageId/);
    assert.match(source, /staleMessageIds/);
    assert.match(
      source,
      /preserveReplacement = activationAttempted && !activated/,
    );
    const cleanupOnlyAt = source.indexOf(
      "requestedRevision <= state.syncedRevision",
    ) >= 0
      ? source.indexOf("requestedRevision <= state.syncedRevision")
      : source.indexOf("requestedRevision <= card.syncedRevision");
    const cleanupOnlyReturnAt = source.indexOf("return summary", cleanupOnlyAt);
    assert.ok(cleanupOnlyAt >= 0 && cleanupOnlyReturnAt > cleanupOnlyAt);
    assert.match(
      source.slice(cleanupOnlyAt, cleanupOnlyReturnAt),
      new RegExp(`${replacementField}: \\\"\\\"`),
    );
  });
}
