import type { ApplyFormInput, ContactFormInput } from "@/lib/validators";

type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordPayload = {
  username: string;
  embeds: Array<{
    title: string;
    color: number;
    fields: DiscordEmbedField[];
    timestamp: string;
  }>;
};

const DISCORD_COLORS = {
  apply: 0xc5a059,
  contact: 0x5ea3c5,
};

// Webhook URL은 서버 환경변수에서만 읽어 클라이언트 노출을 방지합니다.
function getWebhookUrl() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_URL 환경변수가 설정되지 않았습니다.");
  }

  return webhookUrl;
}

function buildPayload(title: string, color: number, fields: DiscordEmbedField[]): DiscordPayload {
  return {
    username: "StarGate Intake Bot",
    embeds: [
      {
        title,
        color,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function sendDiscordWebhook(payload: DiscordPayload) {
  const webhookUrl = getWebhookUrl();
  // Discord Webhook은 단순 POST 요청으로 동작합니다.
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord Webhook 전송 실패 (${response.status}): ${errorText}`);
  }
}

export async function notifyApplySubmission(input: ApplyFormInput) {
  // 가입 신청 전용 임베드 포맷입니다.
  const payload = buildPayload("가입 신청 접수", DISCORD_COLORS.apply, [
    { name: "이름", value: input.name, inline: true },
    { name: "이메일", value: input.email, inline: true },
    { name: "지원 동기", value: input.motivation || "(비어 있음)" },
  ]);

  await sendDiscordWebhook(payload);
}

export async function notifyContactSubmission(input: ContactFormInput) {
  // 문의 전용 임베드 포맷입니다.
  const payload = buildPayload("문의 접수", DISCORD_COLORS.contact, [
    { name: "이름", value: input.name, inline: true },
    { name: "이메일", value: input.email, inline: true },
    { name: "제목", value: input.subject || "(비어 있음)" },
    { name: "문의 내용", value: input.message || "(비어 있음)" },
  ]);

  await sendDiscordWebhook(payload);
}
