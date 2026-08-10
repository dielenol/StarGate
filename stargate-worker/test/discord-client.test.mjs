import assert from "node:assert/strict";
import test from "node:test";

import { fitDiscordWebhookPayload } from "../dist/outbox/discord-client.js";

function embedLength(embed) {
  return (
    embed.title.length +
    (embed.description?.length ?? 0) +
    (embed.footer?.text.length ?? 0) +
    embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0)
  );
}

test("Discord payload는 개별 제한과 embed 전체 6000자를 넘지 않는다", () => {
  const payload = fitDiscordWebhookPayload({
    content: "본문".repeat(1_500),
    username: "사용자".repeat(40),
    allowed_mentions: { parse: [] },
    embeds: Array.from({ length: 12 }, (_, embedIndex) => ({
      title: `제목-${embedIndex}-${"가".repeat(300)}`,
      description: "나".repeat(5_000),
      color: 0,
      fields: Array.from({ length: 30 }, (_, fieldIndex) => ({
        name: `필드-${fieldIndex}-${"다".repeat(300)}`,
        value: "라".repeat(1_500),
      })),
      footer: { text: "마".repeat(3_000) },
      timestamp: new Date().toISOString(),
    })),
  });

  assert.ok(payload.embeds.length <= 10);
  assert.equal(payload.content.length, 2_000);
  assert.equal(payload.username.length, 80);
  assert.ok(payload.embeds.every((embed) => embed.fields.length <= 25));
  assert.ok(payload.embeds.every((embed) => embed.title.length <= 256));
  assert.ok(
    payload.embeds.flatMap((embed) => embed.fields).every(
      (field) => field.name.length <= 256 && field.value.length <= 1_024,
    ),
  );
  assert.ok(payload.embeds.reduce((sum, embed) => sum + embedLength(embed), 0) <= 6_000);
  assert.match(
    payload.embeds.flatMap((embed) => embed.fields).at(-1).name,
    /내용 일부 생략/,
  );
});

test("Discord payload의 필수 문자열은 빈 값으로 전송하지 않는다", () => {
  const payload = fitDiscordWebhookPayload({
    content: "",
    username: "test",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "",
        color: 0,
        fields: [{ name: "", value: "" }],
        footer: { text: "" },
        timestamp: new Date().toISOString(),
      },
    ],
  });

  assert.equal(payload.content, undefined);
  assert.equal(payload.username, "test");
  assert.equal(payload.embeds[0].title, "Discord 알림");
  assert.deepEqual(payload.embeds[0].fields[0], {
    name: "항목",
    value: "—",
  });
  assert.equal(payload.embeds[0].footer, undefined);
});
