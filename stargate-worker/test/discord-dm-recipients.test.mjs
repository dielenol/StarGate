import assert from "node:assert/strict";
import test from "node:test";

import {
  JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE,
  resolveDiscordDmRecipients,
} from "@stargate/shared-db";

function user(overrides = {}) {
  const now = new Date();
  return {
    username: "user",
    hashedPassword: null,
    displayName: "사용자",
    discordId: null,
    discordUsername: null,
    discordGlobalName: null,
    discordAvatar: null,
    role: "J",
    status: "ACTIVE",
    characterIds: [],
    lastLoginAt: null,
    passwordChangedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("아메리 공방은 Discord 미연결 JTEST의 DM을 ACTIVE GM admin에게 추가 전달한다", async () => {
  const resolution = await resolveDiscordDmRecipients(
    "jtest-id",
    { mirror: JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE },
    {
      async findUserById() {
        return user({ username: "JTEST", role: "J" });
      },
      async findUserByUsername(username) {
        assert.equal(username, "admin");
        return user({
          username: "admin",
          role: "GM",
          discordId: "12345678901234567",
        });
      },
    },
  );

  assert.deepEqual(resolution, {
    sourceState: "active",
    recipients: [
      { kind: "mirror", discordId: "12345678901234567" },
    ],
  });
});

test("아메리 공방은 JTEST와 GM Discord가 다르면 둘 다 유지하고 같으면 중복 제거한다", async () => {
  const source = user({
    username: "JTEST",
    role: "J",
    discordId: "12345678901234567",
  });
  const different = await resolveDiscordDmRecipients(
    "jtest-id",
    { mirror: JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE },
    {
      async findUserById() {
        return source;
      },
      async findUserByUsername() {
        return user({
          username: "admin",
          role: "GM",
          discordId: "22345678901234567",
        });
      },
    },
  );
  const same = await resolveDiscordDmRecipients(
    "jtest-id",
    { mirror: JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE },
    {
      async findUserById() {
        return source;
      },
      async findUserByUsername() {
        return user({
          username: "admin",
          role: "GM",
          discordId: "12345678901234567",
        });
      },
    },
  );

  assert.deepEqual(
    different.recipients.map(({ kind }) => kind),
    ["primary", "mirror"],
  );
  assert.deepEqual(same.recipients, [
    { kind: "primary", discordId: "12345678901234567" },
  ]);
});

test("아메리 공방은 일반 계정·비활성 JTEST·GM이 아닌 대상을 미러하지 않는다", async () => {
  let targetLookupCount = 0;
  const regular = await resolveDiscordDmRecipients(
    "regular-id",
    { mirror: JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE },
    {
      async findUserById() {
        return user({
          username: "HTEST",
          role: "H",
          discordId: "12345678901234567",
        });
      },
      async findUserByUsername() {
        targetLookupCount += 1;
        return null;
      },
    },
  );
  const inactive = await resolveDiscordDmRecipients(
    "jtest-id",
    { mirror: JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE },
    {
      async findUserById() {
        return user({
          username: "JTEST",
          role: "J",
          status: "INACTIVE",
        });
      },
      async findUserByUsername() {
        targetLookupCount += 1;
        return null;
      },
    },
  );
  const wrongTargetRole = await resolveDiscordDmRecipients(
    "jtest-id",
    { mirror: JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE },
    {
      async findUserById() {
        return user({ username: "JTEST", role: "J" });
      },
      async findUserByUsername() {
        targetLookupCount += 1;
        return user({
          username: "admin",
          role: "V",
          discordId: "22345678901234567",
        });
      },
    },
  );

  assert.deepEqual(regular.recipients, [
    { kind: "primary", discordId: "12345678901234567" },
  ]);
  assert.equal(inactive.sourceState, "inactive");
  assert.deepEqual(wrongTargetRole.recipients, []);
  assert.equal(targetLookupCount, 1);
});
