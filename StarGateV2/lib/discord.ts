import type { ApplyFormInput, ContactFormInput } from "@/lib/validators";

type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordEmbed = {
  title: string;
  description?: string;
  color: number;
  fields: DiscordEmbedField[];
  footer?: { text: string };
  timestamp: string;
};

type DiscordPayload = {
  username: string;
  embeds: DiscordEmbed[];
};

const DISCORD_COLORS = {
  apply: 0xc5a059,
  contact: 0x5ea3c5,
  /** 캐릭터 편집 — admin 모드 (관리자 편집 강조 색상) */
  charEditAdmin: 0xc5a059,
  /** 캐릭터 편집 — player 모드 (일반 인포 톤) */
  charEditPlayer: 0x5ea3c5,
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

async function sendDiscordWebhook(payload: DiscordPayload, urlOverride?: string) {
  const webhookUrl = urlOverride ?? getWebhookUrl();
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

/* ──────────────────────────────────────────────────────────────────────── */
/* P7 — 캐릭터 편집 GM 채널 알림                                           */
/* ──────────────────────────────────────────────────────────────────────── */

/** Discord embed value 길이 제약 (1024자). 안전 마진으로 1000자에서 자른다. */
const DISCORD_FIELD_VALUE_MAX = 1000;
/** Discord embed 최대 field 수 (25). audit 노이즈/UX 고려해 10개로 제한. */
const MAX_CHANGE_FIELDS = 10;

/**
 * P7 — 캐릭터 편집 알림 페이로드.
 *
 * route handler 가 audit insert 직후 fire-and-forget 으로 호출.
 * 응답 시간/사용자 경험에 영향 X (실패는 console.warn 만).
 */
export interface CharacterEditWebhookPayload {
  character: { id: string; codename: string; name: string };
  actor: { id: string; displayName: string; role: string };
  source: "admin" | "player";
  actorIsOwner: boolean;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  reason?: string;
  timestamp: Date;
}

/**
 * Discord embed 의 field value 로 변환. 1000자 컷, 줄바꿈 보존.
 *
 * 객체/배열은 JSON 직렬화. 이미지 URL도 그대로 노출 (Discord 가 자동 미리보기).
 */
function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return "(비어 있음)";
  if (typeof value === "string") return value || "(빈 문자열)";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 한 변경 항목을 Discord field value 로 직렬화.
 * `before → after` 형식. 길이 초과 시 절단.
 */
function formatChange(change: {
  field: string;
  before: unknown;
  after: unknown;
}): string {
  const before = formatChangeValue(change.before);
  const after = formatChangeValue(change.after);
  const combined = `${before}\n→\n${after}`;
  if (combined.length <= DISCORD_FIELD_VALUE_MAX) return combined;

  // 양쪽 절반 균등 컷
  const half = Math.floor((DISCORD_FIELD_VALUE_MAX - 8) / 2);
  return `${before.slice(0, half)}…\n→\n${after.slice(0, half)}…`;
}

function formatKstTimestamp(date: Date): string {
  // KST 한국어 포맷 (footer 표시용)
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * P7 — 캐릭터 편집 GM 채널 알림.
 *
 * 환경변수 `DISCORD_WEBHOOK_CHAR_EDIT_URL` 미설정 시 silent skip (warning log).
 * 기존 `DISCORD_WEBHOOK_URL` 과 별개 채널 (GM 전용 가시성).
 *
 * fire-and-forget 호출 가정 — 본 함수는 throw 하지 않고 모든 실패를 console.warn 으로 흡수.
 * 호출자가 `.catch()` 등록만 해도 안전하지만 본 함수가 swallow 해 두 번째 안전망 제공.
 */
export async function notifyCharacterEdit(
  payload: CharacterEditWebhookPayload,
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_CHAR_EDIT_URL;
  if (!webhookUrl) {
    console.warn(
      "[notifyCharacterEdit] DISCORD_WEBHOOK_CHAR_EDIT_URL 미설정 — silent skip",
    );
    return;
  }

  try {
    const { character, actor, source, actorIsOwner, changes, reason, timestamp } =
      payload;

    const total = changes.length;
    const visibleChanges = changes.slice(0, MAX_CHANGE_FIELDS);
    const overflow = total - visibleChanges.length;

    const fields: DiscordEmbedField[] = visibleChanges.map((change) => ({
      name: change.field.slice(0, 256), // Discord field name 256자 제한
      value: formatChange(change),
    }));

    if (overflow > 0) {
      fields.push({
        name: "더 많은 변경",
        value: `+${overflow} more`,
      });
    }

    if (reason && reason.trim()) {
      // reason 은 별도 field 로 추가 — embed 최상단 가까이 노출되도록 changes 보다 앞엔
      // 두지 않고 명시적 라벨로 구분.
      fields.push({
        name: "변경 사유",
        value: reason.slice(0, DISCORD_FIELD_VALUE_MAX),
      });
    }

    const description = `${actor.displayName} · ${actor.role}\n${
      actorIsOwner ? "소유자 자가편집" : "관리자 편집"
    }`;

    const embed: DiscordEmbed = {
      title: `캐릭터 편집: ${character.name} (${character.codename})`.slice(
        0,
        256,
      ),
      description,
      color:
        source === "admin"
          ? DISCORD_COLORS.charEditAdmin
          : DISCORD_COLORS.charEditPlayer,
      fields,
      footer: { text: formatKstTimestamp(timestamp) },
      timestamp: timestamp.toISOString(),
    };

    const discordPayload: DiscordPayload = {
      username: "StarGate Audit Bot",
      embeds: [embed],
    };

    await sendDiscordWebhook(discordPayload, webhookUrl);
  } catch (err) {
    console.warn(
      `[notifyCharacterEdit] 전송 실패 character=${payload.character.id} actor=${payload.actor.id}:`,
      err,
    );
  }
}
