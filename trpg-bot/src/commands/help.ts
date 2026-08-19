/** `/도움말` 전체·주제별 사용법 임베드와 비공개 응답 핸들러. */

import { EmbedBuilder, MessageFlags } from "discord.js";

import type { ChatInputCommandInteraction } from "discord.js";

import { config } from "../config.js";
import {
  HELP_TOPIC_OPTION,
  HelpTopic,
  isHelpTopic,
  type HelpTopicValue,
} from "../slash/ko-names.js";

const HELP_COLOR = 0x5865f2;

function baseEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HELP_COLOR)
    .setAuthor({ name: "다채봇 사용 안내" })
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "이 도움말은 나에게만 표시됩니다 · 다채봇" });
}

function musicChannelText(musicChannelId: string | undefined): string {
  return musicChannelId
    ? `<#${musicChannelId}> 전용 채널`
    : "운영자가 지정할 음악 전용 채널";
}

function buildOverviewEmbed(musicChannelId: string | undefined): EmbedBuilder {
  return baseEmbed(
    "다채봇 명령어 도움말",
    "현재 활성화된 명령을 한눈에 정리했습니다. 더 자세한 설명은 `기능` 옵션에서 항목을 선택해 확인하세요.",
  ).addFields(
    {
      name: "📅 세션 확인",
      value: [
        "`/세션확인` — 선택한 달의 세션 일정·월간 캘린더·웹 링크를 확인합니다.",
        "예시: `/세션확인 연도:2026 월:8 모드:상세 보기`",
        "상세: `/도움말 기능:세션 확인`",
      ].join("\n"),
      inline: false,
    },
    {
      name: "🎲 주사위",
      value: [
        "`/roll`, `/r` — 기본 주사위부터 유지·폭발·리롤·성공 판정까지 처리합니다.",
        "예시: `/roll 식:2d6+3` · `/r 식:4d6 k3`",
        "상세: `/도움말 기능:주사위` 또는 `/roll 식:help`",
      ].join("\n"),
      inline: false,
    },
    {
      name: "🎵 YouTube 음악",
      value: [
        `\`/음악\` — ${musicChannelText(musicChannelId)}에서 재생과 대기열을 제어합니다.`,
        "예시: `/음악 재생 검색어:Persona 5 Beneath the Mask`",
        "상세: `/도움말 기능:YouTube 음악`",
      ].join("\n"),
      inline: false,
    },
  );
}

function buildSessionHelpEmbed(): EmbedBuilder {
  return baseEmbed(
    "📅 세션확인 사용법",
    "선택한 달의 오늘 이후 `open` 세션을 월간 캘린더 이미지와 목록으로 보여줍니다.",
  ).addFields(
    {
      name: "명령과 옵션",
      value: [
        "`/세션확인`",
        "• `연도` — 미입력 시 KST 현재 연도",
        "• `월` — 미입력 시 KST 현재 월",
        "• `모드` — `상세 보기` 또는 `요약만 보기`",
        "• `비공개` — 결과를 나에게만 표시",
      ].join("\n"),
      inline: false,
    },
    {
      name: "실행 예시",
      value: [
        "이번 달 상세 보기: `/세션확인`",
        "특정 달 요약: `/세션확인 연도:2026 월:8 모드:요약만 보기`",
        "나에게만 표시: `/세션확인 비공개:true`",
      ].join("\n"),
      inline: false,
    },
    {
      name: "결과에 포함되는 내용",
      value:
        "월간 요약, 세션별 일시·마스터·참가자, 캘린더 PNG와 웹 캘린더 버튼을 제공합니다. 이미지 생성에 실패해도 텍스트 목록과 웹 링크는 표시됩니다.",
      inline: false,
    },
  );
}

function buildDiceHelpEmbed(): EmbedBuilder {
  return baseEmbed(
    "🎲 주사위 사용법",
    "`/roll`과 단축 명령 `/r`은 같은 Dice Maiden 계열 문법을 사용합니다.",
  ).addFields(
    {
      name: "기본 문법",
      value: [
        "• 기본: `XdY`, `d20`, `d%`, `dF`",
        "• 산술: `+`, `-`, `*`, `/`, 괄호",
        "• 여러 식: 세미콜론 `;`으로 최대 4개",
        "• 옵션: `비공개:true` 또는 식 안의 `p` 플래그",
      ].join("\n"),
      inline: false,
    },
    {
      name: "확장 문법",
      value: [
        "• `e/ie` 폭발 · `k/kl/d` 유지·제거",
        "• `r/ir` 리롤 · `t/f/b` 성공·실패·봇치 판정",
        "• `s` 간단히 · `nr` 개별 결과 숨김 · `ul` 입력 순서 유지",
      ].join("\n"),
      inline: false,
    },
    {
      name: "실행 예시",
      value: [
        "일반 판정: `/roll 식:1d20+5`",
        "능력치 생성: `/r 식:4d6 k3`",
        "성공 판정: `/roll 식:6d10 t7`",
        "반복 굴림: `/roll 식:6 4d6 k3`",
        "내장 요약: `/roll 식:help`",
      ].join("\n"),
      inline: false,
    },
  );
}

function buildMusicHelpEmbed(musicChannelId: string | undefined): EmbedBuilder {
  return baseEmbed(
    "🎵 음악 사용법",
    `먼저 일반 음성 채널에 들어간 뒤 ${musicChannelText(musicChannelId)}에서 명령을 사용하세요. 명령 응답은 나에게만 보이고 공개 상태판 한 개가 계속 갱신됩니다.`,
  ).addFields(
    {
      name: "재생",
      value: [
        "`/음악 재생 검색어:<YouTube 링크 또는 검색어>`",
        "예시: `/음악 재생 검색어:Persona 5 Beneath the Mask`",
        "예시: `/음악 재생 검색어:https://youtu.be/영상ID`",
        "단일 곡만 처리하며 재생 중이면 최대 100곡의 대기열에 추가합니다.",
        "`/음악 재생목록 링크:<YouTube 재생목록 URL>`",
        "재생목록은 앞에서부터 한 요청 최대 50곡까지 순서대로 추가합니다.",
      ].join("\n"),
      inline: false,
    },
    {
      name: "재생 제어",
      value: [
        "`/음악 일시정지` · `/음악 재개`",
        "`/음악 건너뛰기` · `/음악 반복 모드:<끔|현재 곡|대기열 전체>`",
        "`/음악 볼륨 [퍼센트:0~200]` — 생략하면 현재 음량 확인",
        "`/음악 초기화` — 현재 곡·예약곡·처리 중 요청·반복 설정을 모두 정리",
        "`/음악 대기열` · `/음악 퇴장`",
        "제어 명령은 봇과 같은 음성 채널에서만 사용할 수 있습니다.",
      ].join("\n"),
      inline: false,
    },
    {
      name: "상태판과 자동 정리",
      value:
        "상태판에는 현재 곡·요청자·음질 경로와 다음 5곡을 표시합니다. 청취자가 없으면 30초 뒤, 빈 대기열이 5분 지속되면 자동으로 음성 채널에서 나갑니다.",
      inline: false,
    },
    {
      name: "음질",
      value:
        "WebM/Opus 원본은 재인코딩 없이 전달하고, 그 외 소스만 고품질 Opus로 한 번 변환합니다. 추가 변환을 피하기 위해 봇 볼륨·EQ는 제공하지 않습니다. 음량은 음성 채널의 다채봇을 우클릭한 뒤 사용자 음량에서 조절하세요.",
      inline: false,
    },
  );
}

/** 테스트와 실제 응답에서 공유하는 도움말 임베드 생성기. */
export function buildHelpEmbed(
  topic: HelpTopicValue,
  musicChannelId: string | undefined,
): EmbedBuilder {
  switch (topic) {
    case HelpTopic.session:
      return buildSessionHelpEmbed();
    case HelpTopic.dice:
      return buildDiceHelpEmbed();
    case HelpTopic.music:
      return buildMusicHelpEmbed(musicChannelId);
    case HelpTopic.all:
      return buildOverviewEmbed(musicChannelId);
  }
}

async function replyPrivate(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

export async function handleHelpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await replyPrivate(interaction, "도움말은 서버 채널에서만 사용할 수 있습니다.");
    return;
  }
  if (interaction.guildId !== config.trpgGuildId) {
    await replyPrivate(interaction, "이 서버에서는 다채봇 도움말을 사용할 수 없습니다.");
    return;
  }

  const rawTopic = interaction.options.getString(HELP_TOPIC_OPTION);
  const topic = rawTopic && isHelpTopic(rawTopic) ? rawTopic : HelpTopic.all;
  await interaction.reply({
    embeds: [buildHelpEmbed(topic, config.trpgMusicChannelId)],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}
