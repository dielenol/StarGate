const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DISCORD_USER_AGENT = "DiscordBot (https://www.ordonet.co.kr, 1.0.0)";
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 10_000;

export interface DiscordWebhookPayload {
  username: string;
  avatar_url?: string;
  allowed_mentions: { parse: string[] };
  embeds: Array<{
    title: string;
    url?: string;
    description?: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
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
): Promise<void> {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  const response = await discordFetch(fetchImpl, url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await responseError(response, "Webhook 전송");
}

export async function createDiscordWebhookMessage(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = new URL(webhookUrl);
  url.searchParams.set("wait", "true");
  const response = await discordFetch(fetchImpl, url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await responseError(response, "Webhook 생성");
  const message = (await response.json()) as { id?: unknown };
  if (
    typeof message.id !== "string" ||
    !DISCORD_SNOWFLAKE_PATTERN.test(message.id)
  ) {
    throw new Error("Discord Webhook 응답에 올바른 message id가 없습니다.");
  }
  return message.id;
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
): Promise<void> {
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
}
