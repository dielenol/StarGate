import type { ApplyFormInput, ContactFormInput } from "@/lib/validators";

export type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type DiscordEmbed = {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields: DiscordEmbedField[];
  footer?: { text: string };
  timestamp: string;
};

export type DiscordPayload = {
  username: string;
  avatar_url?: string;
  allowed_mentions?: { parse: string[] };
  embeds: DiscordEmbed[];
};

const DISCORD_COLORS = {
  apply: 0xc5a059,
  contact: 0x5ea3c5,
  shopRestock: 0xc5a059,
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

/** Discord embed value 길이 제약 (1024자). 안전 마진으로 1000자에서 자른다. */
const DISCORD_FIELD_VALUE_MAX = 1000;

/**
 * Discord mention syntax 무력화. 사용자 제어 가능 텍스트(quote/appearance/reason 등)가
 * embed 로 흘러갈 때 `@everyone`, `<@123>`, `<@&123>`, `<#123>` 같은 ping 트리거를
 * zero-width space 로 분리해 mention 발화를 차단.
 *
 * GM 전용 채널이라 영향 범위는 좁지만 신뢰성/혼동 방지 차원에서 적용.
 */
function sanitizeForDiscord(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<(@[!&]?|#)(\d+)>/g, "<$1​$2>");
}

/* ──────────────────────────────────────────────────────────────────────── */
/* 편의점 일일 입고 알림                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

export interface ShopRestockWebhookItem {
  name: string;
  icon: string;
  stock: number;
  price: number;
  pageGroup: "BASIC" | "RECOVERY" | "LUXURY" | "RARE";
}

export interface ShopRestockWebhookPayload {
  today: string;
  isOpen: boolean;
  openMode?: "auto" | "open" | "closed";
  scheduledOpen?: boolean;
  items: ShopRestockWebhookItem[];
}

const SHOP_GROUP_ORDER: ShopRestockWebhookItem["pageGroup"][] = [
  "BASIC",
  "RECOVERY",
  "LUXURY",
  "RARE",
];

const SHOP_GROUP_LABELS: Record<ShopRestockWebhookItem["pageGroup"], string> = {
  BASIC: "기본 물품",
  RECOVERY: "회복 물품",
  LUXURY: "기호품",
  RARE: "희귀 물품",
};
const SHOP_WEB_URL = "https://www.ordonet.co.kr/erp/shop";
const SHOP_FIELDS_PER_PAYLOAD = 5;

function formatShopRestockFields(
  items: ShopRestockWebhookItem[],
): DiscordEmbedField[] {
  return SHOP_GROUP_ORDER.flatMap((group) => {
    const lines = items
      .filter((item) => item.pageGroup === group)
      .map((item) => {
        const name = sanitizeForDiscord(item.name);
        const price = item.price.toLocaleString("ko-KR");
        return `${item.icon} ${name} x${item.stock} · ${price}C`;
      });

    if (lines.length === 0) return [];

    const values = chunkDiscordFieldLines(lines);
    return values.map((value, index) => ({
      name:
        index === 0
          ? SHOP_GROUP_LABELS[group]
          : `${SHOP_GROUP_LABELS[group]} (${index + 1})`,
      value,
    }));
  });
}

function chunkDiscordFieldLines(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const segments = Array.from(
      { length: Math.ceil(line.length / DISCORD_FIELD_VALUE_MAX) },
      (_, index) =>
        line.slice(
          index * DISCORD_FIELD_VALUE_MAX,
          (index + 1) * DISCORD_FIELD_VALUE_MAX,
        ),
    );
    for (const segment of segments) {
      const candidate = current ? `${current}\n${segment}` : segment;
      if (candidate.length > DISCORD_FIELD_VALUE_MAX) {
        if (current) chunks.push(current);
        current = segment;
      } else {
        current = candidate;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function formatShopRestockStatusLine(
  payload: ShopRestockWebhookPayload,
): string {
  if (payload.openMode === "open") {
    return "지금은 GM이 문 열어뒀어요. 필요한 거 있으면 바로 들러요.";
  }

  if (payload.openMode === "closed") {
    return "지금은 GM이 잠깐 셔터 내려뒀어요. 새로 들어온 물건은 미리 봐둬도 돼요.";
  }

  if (payload.isOpen) {
    return "지금은 문 열려 있어요. 필요한 거 있으면 바로 들러요.";
  }

  return "지금은 영업 시간이 아니라 바로 구매는 어려워요. 새로 들어온 물건은 미리 봐둬도 돼요.";
}

export function buildShopRestockDiscordPayloads(
  payload: ShopRestockWebhookPayload,
): DiscordPayload[] {
  const items = payload.items.filter((item) => item.stock > 0);
  if (items.length === 0) return [];

  const itemFields = formatShopRestockFields(items);
  const payloadCount = Math.ceil(
    itemFields.length / SHOP_FIELDS_PER_PAYLOAD,
  );
  const timestamp = new Date().toISOString();

  return Array.from({ length: payloadCount }, (_, index) => {
    const fields = itemFields.slice(
      index * SHOP_FIELDS_PER_PAYLOAD,
      (index + 1) * SHOP_FIELDS_PER_PAYLOAD,
    );
    fields.push({
      name: "편의점으로 가기",
      value: `[띠아 편의점 들어가기](${SHOP_WEB_URL})`,
    });
    return {
      username: "띠아",
      avatar_url: process.env.DISCORD_WEBHOOK_SHOP_AVATAR_URL || undefined,
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title:
            payloadCount === 1
              ? "편의점 입고 알림"
              : `편의점 입고 알림 (${index + 1}/${payloadCount})`,
          url: SHOP_WEB_URL,
          description: [
            "오늘 새로 들어온 물건들이에요.",
            formatShopRestockStatusLine(payload),
          ].join("\n"),
          color: DISCORD_COLORS.shopRestock,
          fields,
          footer: {
            text:
              payloadCount === 1
                ? `${payload.today} KST`
                : `${payload.today} KST · ${index + 1}/${payloadCount}`,
          },
          timestamp,
        },
      ],
    };
  });
}
