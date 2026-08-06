import test from "node:test";
import assert from "node:assert/strict";

process.env.DISCORD_TOKEN ||= "test-token";
process.env.DISCORD_CLIENT_ID ||= "test-client-id";
process.env.MONGODB_URI ||= "mongodb://localhost:27017/test";
process.env.TRPG_GUILD_ID ||= "test-guild-id";
process.env.TRPG_FALLBACK_CHANNEL_ID ||= "test-channel-id";
process.env.TRPG_MUSIC_CHANNEL_ID ||= "test-music-channel-id";
process.env.TRPG_WEB_BASE_URL ||= "https://example.test";

const { ACTIVE_COMMANDS } = await import("../dist/commands/register.js");
const {
  HELP_NAME,
  HELP_TOPIC_OPTION,
  HelpTopic,
  MUSIC_QUERY_OPTION,
  MUSIC_ROOT,
  MusicSubcommand,
  isMusicCommandName,
} = await import("../dist/slash/ko-names.js");

test("활성 명령은 세션·주사위·도움말·한글 음악 루트 다섯 개만 등록한다", () => {
  assert.deepEqual(
    ACTIVE_COMMANDS.map((command) => command.name),
    ["세션확인", "roll", "r", HELP_NAME, MUSIC_ROOT],
  );
});

test("도움말은 전체·세션·주사위·음악 주제를 선택할 수 있다", () => {
  const help = ACTIVE_COMMANDS.find((command) => command.name === HELP_NAME);
  assert.ok(help);
  assert.equal(help.options[0].name, HELP_TOPIC_OPTION);
  assert.deepEqual(
    help.options[0].choices.map((choice) => choice.value),
    Object.values(HelpTopic),
  );
});

test("음악 기능은 일곱 개 한글 서브커맨드로 묶인다", () => {
  assert.equal(isMusicCommandName(MUSIC_ROOT), true);
  assert.equal(isMusicCommandName("play"), false);

  const music = ACTIVE_COMMANDS.find((command) => command.name === MUSIC_ROOT);
  assert.ok(music);
  assert.deepEqual(
    music.options.map((option) => option.name),
    Object.values(MusicSubcommand),
  );
  assert.ok(music.options.every((option) => option.type === 1));

  const play = music.options.find(
    (option) => option.name === MusicSubcommand.play,
  );
  assert.ok(play && "options" in play);
  assert.deepEqual(
    play.options.map((option) => option.name),
    [MUSIC_QUERY_OPTION],
  );
});

test("Discord에 노출되는 모든 설명은 구체적이며 길이 제한 안에 있다", () => {
  const descriptions = ACTIVE_COMMANDS.flatMap((command) => [
    command.description,
    ...command.options.flatMap((option) => [
      option.description,
      ...("options" in option
        ? option.options.map((nestedOption) => nestedOption.description)
        : []),
    ]),
  ]);

  for (const description of descriptions) {
    assert.ok(description.length >= 15, `설명이 너무 짧습니다: ${description}`);
    assert.ok(description.length <= 100, `설명이 너무 깁니다: ${description}`);
  }
});
