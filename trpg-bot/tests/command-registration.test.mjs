import test from "node:test";
import assert from "node:assert/strict";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv();

const { ACTIVE_COMMANDS } = await import("../dist/commands/register.js");
const {
  HELP_NAME,
  HELP_TOPIC_OPTION,
  HelpTopic,
  MUSIC_PLAYLIST_OPTION,
  MUSIC_QUERY_OPTION,
  MUSIC_REPEAT_MODE_OPTION,
  MUSIC_ROOT,
  MusicSubcommand,
  isMusicCommandName,
} = await import("../dist/slash/ko-names.js");
const { MusicRepeatMode } = await import("../dist/music/types.js");

test("활성 명령은 세션·주사위·도움말·음악·운영 명령만 등록한다", () => {
  assert.deepEqual(
    ACTIVE_COMMANDS.map((command) => command.name),
    ["세션확인", "내세션", "일정투표", "roll", "r", "비밀굴림", HELP_NAME, MUSIC_ROOT, "상태"],
  );
});

test("모든 명령은 서버 채널 전용이고 /상태 만 서버 관리 권한자에게 보인다", () => {
  for (const command of ACTIVE_COMMANDS) {
    assert.deepEqual(command.contexts, [0], command.name);
  }
  const status = ACTIVE_COMMANDS.find((command) => command.name === "상태");
  assert.equal(status.default_member_permissions, "32");
  assert.ok(
    ACTIVE_COMMANDS.filter((command) => command.name !== "상태").every(
      (command) => command.default_member_permissions === null,
    ),
  );
});

test("필수 옵션은 선택 옵션보다 앞에 등록한다 (Discord 규칙)", () => {
  for (const command of ACTIVE_COMMANDS) {
    const options = command.options.filter((option) => option.type !== 1);
    const firstOptional = options.findIndex((option) => !option.required);
    if (firstOptional === -1) continue;
    assert.ok(
      options.slice(firstOptional).every((option) => !option.required),
      `${command.name}: 선택 옵션 뒤에 필수 옵션이 있습니다`,
    );
  }
  const poll = ACTIVE_COMMANDS.find((command) => command.name === "일정투표");
  assert.equal(poll.options.length, 14);
  assert.ok(poll.options.length <= 25);
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

test("음악 기능은 MusicSubcommand 의 한글 서브커맨드와 같은 순서로 등록된다", () => {
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

  const playlist = music.options.find(
    (option) => option.name === MusicSubcommand.playlist,
  );
  assert.ok(playlist && "options" in playlist);
  assert.deepEqual(
    playlist.options.map((option) => option.name),
    [MUSIC_PLAYLIST_OPTION],
  );

  const repeat = music.options.find(
    (option) => option.name === MusicSubcommand.repeat,
  );
  assert.ok(repeat && "options" in repeat);
  assert.equal(repeat.options[0].name, MUSIC_REPEAT_MODE_OPTION);
  assert.deepEqual(
    repeat.options[0].choices.map((choice) => choice.value),
    Object.values(MusicRepeatMode),
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
