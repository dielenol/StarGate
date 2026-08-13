import assert from "node:assert/strict";
import test from "node:test";

import {
  getDiscordDefaultAvatarUrl,
  toTrpgMemberViews,
} from "../../lib/discord/avatar.ts";

function makeMember(discordUserId, discordAvatarUrl = null) {
  return {
    discordUserId,
    displayName: `Member ${discordUserId}`,
    discordUsername: `user-${discordUserId}`,
    discordAvatarUrl,
  };
}

test("Discord snowflake selects one of the six default profile images", () => {
  assert.equal(
    getDiscordDefaultAvatarUrl(String(5n << 22n)),
    "https://cdn.discordapp.com/embed/avatars/5.png",
  );
  assert.equal(
    getDiscordDefaultAvatarUrl(String(8n << 22n)),
    "https://cdn.discordapp.com/embed/avatars/2.png",
  );
  assert.equal(
    getDiscordDefaultAvatarUrl("invalid"),
    "https://cdn.discordapp.com/embed/avatars/0.png",
  );
});

test("member views resolve guild, linked, session, then default avatars", () => {
  const views = toTrpgMemberViews(
    [
      makeMember(
        "1",
        "https://cdn.discordapp.com/guilds/1/users/1/avatars/a.webp",
      ),
      makeMember("2"),
      makeMember("3"),
      makeMember("4", "https://cdn.discordapp.com.evil/avatar.png"),
    ],
    {
      linkedUsers: [
        {
          discordId: "2",
          discordAvatar: "https://cdn.discordapp.com/avatars/2/b.webp",
        },
      ],
      currentUserDiscordId: "3",
      currentUserAvatarUrl: "https://cdn.discordapp.com/avatars/3/c.webp",
    },
  );

  assert.deepEqual(
    views.map((view) => view.avatarUrl),
    [
      "https://cdn.discordapp.com/guilds/1/users/1/avatars/a.webp",
      "https://cdn.discordapp.com/avatars/2/b.webp",
      "https://cdn.discordapp.com/avatars/3/c.webp",
      "https://cdn.discordapp.com/embed/avatars/0.png",
    ],
  );
});
