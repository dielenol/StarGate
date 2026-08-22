import { createHash } from "node:crypto";

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DISCORD_USER_AGENT = "DiscordBot (https://www.ordonet.co.kr, 1.0.0)";
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 10_000;
const MAX_USERNAME = 80;
const MAX_CONTENT = 2_000;
const MAX_EMBEDS = 10;
const MAX_EMBED_FIELDS = 25;
const MAX_EMBED_TEXT = 6_000;
const MAX_EMBED_TITLE = 256;
const MAX_EMBED_DESCRIPTION = 4_096;
const MAX_FIELD_NAME = 256;
const MAX_FIELD_VALUE = 1_024;
const MAX_FOOTER_TEXT = 2_048;

export interface DiscordWebhookPayload {
  content?: string;
  username: string;
  avatar_url?: string;
  allowed_mentions: { parse: string[] };
  embeds: Array<{
    title: string;
    url?: string;
    description?: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    image?: { url: string };
    footer?: { text: string };
    timestamp: string;
  }>;
}

export class DiscordDeliveryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DiscordDeliveryError";
  }
}

/**
 * Discord가 메시지를 생성했는지 응답만 유실됐는지 판별할 수 없는 오류.
 * Incoming Webhook에는 idempotency key가 없어 자동 재전송하면 중복될 수 있다.
 */
export class DiscordDeliveryUnknownError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "DiscordDeliveryUnknownError";
  }
}

function truncate(value: string | undefined, max: number): string | undefined {
  if (value === undefined || value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function embedTextLength(
  embed: DiscordWebhookPayload["embeds"][number],
): number {
  return (
    embed.title.length +
    (embed.description?.length ?? 0) +
    (embed.footer?.text.length ?? 0) +
    embed.fields.reduce(
      (sum, field) => sum + field.name.length + field.value.length,
      0,
    )
  );
}

/** Discord embed의 개별 제한과 전체 6,000자 제한을 발송 직전에 보장한다. */
export function fitDiscordWebhookPayload(
  payload: DiscordWebhookPayload,
): DiscordWebhookPayload {
  let omittedEmbeds = Math.max(0, payload.embeds.length - MAX_EMBEDS);
  let omittedFields = 0;
  const embeds = payload.embeds.slice(0, MAX_EMBEDS).map((embed) => {
    omittedFields += Math.max(0, embed.fields.length - MAX_EMBED_FIELDS);
    return {
      title: truncate(embed.title, MAX_EMBED_TITLE) || "Discord 알림",
      ...(embed.url ? { url: embed.url } : {}),
      ...(embed.description
        ? { description: truncate(embed.description, MAX_EMBED_DESCRIPTION) }
        : {}),
      color: embed.color,
      fields: embed.fields.slice(0, MAX_EMBED_FIELDS).map((field) => ({
        ...field,
        name: truncate(field.name, MAX_FIELD_NAME) || "항목",
        value: truncate(field.value, MAX_FIELD_VALUE) || "—",
      })),
      ...(embed.image ? { image: embed.image } : {}),
      ...(embed.footer?.text
        ? { footer: { text: truncate(embed.footer.text, MAX_FOOTER_TEXT) || "—" } }
        : {}),
      timestamp: embed.timestamp,
    };
  });

  const totalLength = () =>
    embeds.reduce((sum, embed) => sum + embedTextLength(embed), 0);
  const summaryReserve = 96;
  while (totalLength() > MAX_EMBED_TEXT - summaryReserve) {
    const lastWithFields = [...embeds]
      .reverse()
      .find((embed) => embed.fields.length > 0);
    if (lastWithFields) {
      lastWithFields.fields.pop();
      omittedFields += 1;
      continue;
    }
    const last = embeds.at(-1);
    if (last?.description && last.description.length > 1) {
      const overflow = totalLength() - (MAX_EMBED_TEXT - summaryReserve);
      last.description =
        truncate(last.description, Math.max(1, last.description.length - overflow)) ??
        "";
      continue;
    }
    if (embeds.length > 1) {
      embeds.pop();
      omittedEmbeds += 1;
      continue;
    }
    break;
  }

  if (embeds.length === 0) {
    embeds.push({
      title: "Discord 알림",
      color: 0xc5a059,
      fields: [],
      timestamp: new Date().toISOString(),
    });
  }
  if (omittedFields > 0 || omittedEmbeds > 0) {
    const first = embeds[0];
    if (first.fields.length >= MAX_EMBED_FIELDS) {
      first.fields.pop();
      omittedFields += 1;
    }
    first.fields.push({
      name: "내용 일부 생략",
      value: [
        omittedFields > 0 ? `필드 ${omittedFields}개` : null,
        omittedEmbeds > 0 ? `embed ${omittedEmbeds}개` : null,
        "Discord 표시 한도로 나머지를 줄였습니다.",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  while (totalLength() > MAX_EMBED_TEXT) {
    const overflow = totalLength() - MAX_EMBED_TEXT;
    let changed = false;
    for (const embed of [...embeds].reverse()) {
      const field = [...embed.fields]
        .reverse()
        .find((candidate) => candidate.value.length > 1 || candidate.name.length > 1);
      if (field?.value && field.value.length > 1) {
        field.value = truncate(
          field.value,
          Math.max(1, field.value.length - overflow),
        ) || "—";
        changed = true;
        break;
      }
      if (field?.name && field.name.length > 1) {
        field.name = truncate(
          field.name,
          Math.max(1, field.name.length - overflow),
        ) || "—";
        changed = true;
        break;
      }
      if (embed.description && embed.description.length > 1) {
        embed.description = truncate(
          embed.description,
          Math.max(1, embed.description.length - overflow),
        );
        changed = true;
        break;
      }
      if (embed.footer?.text && embed.footer.text.length > 1) {
        embed.footer.text = truncate(
          embed.footer.text,
          Math.max(1, embed.footer.text.length - overflow),
        ) || "—";
        changed = true;
        break;
      }
      if (embed.title.length > 1) {
        embed.title = truncate(
          embed.title,
          Math.max(1, embed.title.length - overflow),
        ) || "—";
        changed = true;
        break;
      }
    }
    if (changed) continue;
    embeds.splice(0, embeds.length, {
      title: "Discord 알림",
      description: "내용이 Discord 표시 한도를 초과해 축약되었습니다.",
      color: 0xc5a059,
      fields: [],
      timestamp: new Date().toISOString(),
    });
  }
  const content = truncate(payload.content, MAX_CONTENT);
  return {
    ...payload,
    username: truncate(payload.username, MAX_USERNAME) || "StarGate",
    ...(content ? { content } : { content: undefined }),
    embeds,
  };
}

async function discordMessageId(
  response: Response,
  action: string,
): Promise<string> {
  const message = (await response.json()) as { id?: unknown };
  if (
    typeof message.id !== "string" ||
    !DISCORD_SNOWFLAKE_PATTERN.test(message.id)
  ) {
    throw new Error(`Discord ${action} 응답에 올바른 message id가 없습니다.`);
  }
  return message.id;
}

async function responseError(
  response: Response,
  action: string,
): Promise<DiscordDeliveryError> {
  const body = (await response.text()).slice(0, 300);
  return new DiscordDeliveryError(
    `Discord ${action} 실패 (${response.status})${body ? `: ${body}` : ""}`,
    response.status,
  );
}

async function rateLimitWaitMs(response: Response): Promise<number | null> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { retry_after?: unknown };
    if (
      typeof parsed.retry_after === "number" &&
      Number.isFinite(parsed.retry_after)
    ) {
      return Math.max(0, parsed.retry_after * 1_000);
    }
  } catch {
    // Retry-After header fallback
  }
  const header = response.headers.get("retry-after");
  if (header === null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1_000) : null;
}

async function discordFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 429) return response;

    const waitMs = await rateLimitWaitMs(response);
    if (
      attempt === MAX_RATE_LIMIT_RETRIES ||
      waitMs === null ||
      waitMs > MAX_RATE_LIMIT_WAIT_MS
    ) {
      throw new DiscordDeliveryError(
        "Discord rate limit 재시도 한도를 초과했습니다.",
        429,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new DiscordDeliveryError(
    "Discord rate limit 재시도 한도를 초과했습니다.",
    429,
  );
}

export async function sendDiscordWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  const response = await discordFetch(fetchImpl, url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fitDiscordWebhookPayload(payload)),
  });
  if (!response.ok) throw await responseError(response, "Webhook 전송");
  return discordMessageId(response, "Webhook 전송");
}

export async function createDiscordWebhookMessage(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  let response: Response;
  try {
    response = await discordFetch(fetchImpl, url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fitDiscordWebhookPayload(payload)),
    });
  } catch (error) {
    if (error instanceof DiscordDeliveryError) throw error;
    throw new DiscordDeliveryUnknownError(
      "Discord Webhook 생성 결과를 확인할 수 없습니다.",
      error,
    );
  }
  if (!response.ok) throw await responseError(response, "Webhook 생성");
  try {
    return await discordMessageId(response, "Webhook 생성");
  } catch (error) {
    throw new DiscordDeliveryUnknownError(
      "Discord Webhook 생성 응답의 message id를 확인할 수 없습니다.",
      error,
    );
  }
}

function webhookMessageUrl(
  webhookUrl: string,
  messageId: string,
): { url: string; webhookId: string } {
  if (!DISCORD_SNOWFLAKE_PATTERN.test(messageId)) {
    throw new DiscordDeliveryError(
      "조회할 Discord Webhook message id가 올바르지 않습니다.",
    );
  }
  const url = new URL(webhookUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const webhookIndex = segments.lastIndexOf("webhooks");
  const webhookId = segments[webhookIndex + 1];
  const token = segments[webhookIndex + 2];
  if (
    webhookIndex < 0 ||
    !webhookId ||
    !DISCORD_SNOWFLAKE_PATTERN.test(webhookId) ||
    !token
  ) {
    throw new DiscordDeliveryError(
      "Discord Webhook URL에서 webhook identity를 확인할 수 없습니다.",
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/messages/${encodeURIComponent(messageId)}`;
  url.search = "";
  url.hash = "";
  return { url: url.toString(), webhookId };
}

/**
 * 정확한 webhook token으로 후보 메시지를 읽어 해당 webhook 소유임을 확인한다.
 * 반환 증거에는 webhook URL이나 token을 넣지 않는다.
 */
export async function verifyDiscordWebhookMessageOwnership(
  webhookUrl: string,
  messageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const target = webhookMessageUrl(webhookUrl, messageId);
  let response: Response;
  try {
    response = await discordFetch(fetchImpl, target.url, { method: "GET" });
  } catch {
    throw new DiscordDeliveryError(
      "Discord Webhook 후보 메시지의 소유권을 확인하지 못했습니다.",
    );
  }
  if (!response.ok) {
    throw await responseError(response, "Webhook 후보 메시지 조회");
  }
  let message: { id?: unknown; webhook_id?: unknown };
  try {
    message = (await response.json()) as {
      id?: unknown;
      webhook_id?: unknown;
    };
  } catch {
    throw new DiscordDeliveryError(
      "Discord Webhook 후보 메시지 응답을 확인하지 못했습니다.",
    );
  }
  if (message.id !== messageId || message.webhook_id !== target.webhookId) {
    throw new DiscordDeliveryError(
      "Discord Webhook 후보 메시지가 설정된 연구 webhook 소유가 아닙니다.",
    );
  }
  const digest = createHash("sha256")
    .update(`discord-webhook-message-v1\0${target.webhookId}\0${messageId}`)
    .digest("hex");
  return `discord-webhook-message-v1:${digest}`;
}

export async function deleteDiscordWebhookMessage(
  webhookUrl: string,
  messageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!DISCORD_SNOWFLAKE_PATTERN.test(messageId)) {
    throw new Error("삭제할 Discord Webhook message id가 올바르지 않습니다.");
  }
  const url = new URL(webhookUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/messages/${encodeURIComponent(messageId)}`;
  url.search = "";
  url.hash = "";
  const response = await discordFetch(fetchImpl, url.toString(), {
    method: "DELETE",
  });
  if (response.status === 404 || response.ok) return;
  throw await responseError(response, "Webhook 삭제");
}

export async function sendDiscordDirectMessage(
  input: {
    recipientId: string;
    content: string;
    nonce: string;
    botToken: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!DISCORD_SNOWFLAKE_PATTERN.test(input.recipientId)) {
    throw new Error("Discord 개인 DM 수신자 ID가 올바르지 않습니다.");
  }
  if (input.content.length < 1 || input.content.length > 2_000) {
    throw new Error("Discord 개인 DM 내용은 1~2,000자여야 합니다.");
  }
  if (input.nonce.length < 1 || input.nonce.length > 25) {
    throw new Error("Discord 개인 DM nonce는 1~25자여야 합니다.");
  }

  const headers = {
    Authorization: `Bot ${input.botToken}`,
    "Content-Type": "application/json",
    "User-Agent": DISCORD_USER_AGENT,
  };
  const channelResponse = await discordFetch(
    fetchImpl,
    `${DISCORD_API_BASE_URL}/users/@me/channels`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ recipient_id: input.recipientId }),
    },
  );
  if (!channelResponse.ok) {
    throw await responseError(channelResponse, "개인 채널 생성");
  }
  const channel = (await channelResponse.json()) as { id?: unknown };
  if (
    typeof channel.id !== "string" ||
    !DISCORD_SNOWFLAKE_PATTERN.test(channel.id)
  ) {
    throw new Error("Discord 개인 채널 응답에 올바른 channel id가 없습니다.");
  }

  const messageResponse = await discordFetch(
    fetchImpl,
    `${DISCORD_API_BASE_URL}/channels/${encodeURIComponent(channel.id)}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: input.content,
        allowed_mentions: { parse: [] },
        nonce: input.nonce,
        enforce_nonce: true,
      }),
    },
  );
  if (!messageResponse.ok) {
    throw await responseError(messageResponse, "개인 메시지 전송");
  }
  return discordMessageId(messageResponse, "개인 메시지 전송");
}
