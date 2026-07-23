export interface DiscordDirectMessageInput {
  recipientId: string;
  content: string;
  nonce?: string;
}

export interface DiscordDirectMessageResult {
  channelId: string;
  messageId: string;
}

export interface DiscordDirectMessageOptions {
  botToken?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DISCORD_USER_AGENT = "DiscordBot (https://www.ordonet.co.kr, 1.0.0)";
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const DISCORD_MESSAGE_MAX_LENGTH = 2_000;
const DISCORD_NONCE_MAX_LENGTH = 25;
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 10_000;

function getResponseErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };
    const message =
      typeof parsed.message === "string" ? parsed.message.slice(0, 300) : "";
    const code =
      typeof parsed.code === "number" || typeof parsed.code === "string"
        ? String(parsed.code)
        : "";
    if (message && code) return `${message} (code ${code})`;
    if (message) return message;
  } catch {
    // JSON 응답이 아니면 아래에서 길이만 제한한 원문을 사용한다.
  }
  return body.slice(0, 300);
}

async function discordResponseError(
  response: Response,
  action: string,
): Promise<Error> {
  const body = await response.text();
  const detail = getResponseErrorMessage(body);
  return new Error(
    `Discord ${action} 실패 (${response.status})${detail ? `: ${detail}` : ""}`,
  );
}

function getRateLimitWaitMs(response: Response, body: string): number | null {
  try {
    const parsed = JSON.parse(body) as { retry_after?: unknown };
    if (
      typeof parsed.retry_after === "number" &&
      Number.isFinite(parsed.retry_after)
    ) {
      return Math.max(0, parsed.retry_after * 1_000);
    }
  } catch {
    // 표준 Retry-After 헤더를 폴백으로 사용한다.
  }

  const retryAfterHeader = response.headers.get("retry-after");
  if (retryAfterHeader === null) return null;
  const retryAfterSeconds = Number(retryAfterHeader);
  return Number.isFinite(retryAfterSeconds)
    ? Math.max(0, retryAfterSeconds * 1_000)
    : null;
}

async function discordFetch(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetchImpl(input, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 429) return response;

    const body = await response.text();
    const waitMs = getRateLimitWaitMs(response, body);
    if (
      attempt === MAX_RATE_LIMIT_RETRIES ||
      waitMs === null ||
      waitMs > MAX_RATE_LIMIT_WAIT_MS
    ) {
      throw new Error("Discord 개인 DM rate limit 재시도 한도를 초과했습니다.");
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error("Discord 개인 DM rate limit 재시도 한도를 초과했습니다.");
}

function validateInput(input: DiscordDirectMessageInput): void {
  if (!DISCORD_SNOWFLAKE_PATTERN.test(input.recipientId)) {
    throw new Error("Discord 개인 DM 수신자 ID가 올바르지 않습니다.");
  }
  if (
    input.content.trim().length === 0 ||
    input.content.length > DISCORD_MESSAGE_MAX_LENGTH
  ) {
    throw new Error("Discord 개인 DM 내용은 1~2,000자여야 합니다.");
  }
  if (
    input.nonce !== undefined &&
    (input.nonce.length === 0 || input.nonce.length > DISCORD_NONCE_MAX_LENGTH)
  ) {
    throw new Error("Discord 개인 DM nonce는 1~25자여야 합니다.");
  }
}

export async function sendDiscordDirectMessage(
  input: DiscordDirectMessageInput,
  options: DiscordDirectMessageOptions = {},
): Promise<DiscordDirectMessageResult> {
  validateInput(input);

  const botToken = (options.botToken ?? process.env.DISCORD_BOT_TOKEN)?.trim();
  if (!botToken) {
    throw new Error(
      "Discord 개인 DM 전송에 필요한 DISCORD_BOT_TOKEN이 설정되지 않았습니다.",
    );
  }

  const apiBaseUrl = (options.apiBaseUrl ?? DISCORD_API_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const authorization = `Bot ${botToken}`;
  const dmChannelResponse = await discordFetch(
    fetchImpl,
    `${apiBaseUrl}/users/@me/channels`,
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        "User-Agent": DISCORD_USER_AGENT,
      },
      body: JSON.stringify({ recipient_id: input.recipientId }),
      cache: "no-store",
    },
  );
  if (!dmChannelResponse.ok) {
    throw await discordResponseError(dmChannelResponse, "개인 채널 생성");
  }

  const dmChannel = (await dmChannelResponse.json()) as { id?: unknown };
  if (
    typeof dmChannel.id !== "string" ||
    !DISCORD_SNOWFLAKE_PATTERN.test(dmChannel.id)
  ) {
    throw new Error("Discord 개인 채널 응답에 올바른 channel id가 없습니다.");
  }

  const messageResponse = await discordFetch(
    fetchImpl,
    `${apiBaseUrl}/channels/${encodeURIComponent(dmChannel.id)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        "User-Agent": DISCORD_USER_AGENT,
      },
      body: JSON.stringify({
        content: input.content,
        allowed_mentions: { parse: [] },
        ...(input.nonce
          ? { nonce: input.nonce, enforce_nonce: true }
          : {}),
      }),
      cache: "no-store",
    },
  );
  if (!messageResponse.ok) {
    throw await discordResponseError(messageResponse, "개인 메시지 전송");
  }

  const message = (await messageResponse.json()) as { id?: unknown };
  if (
    typeof message.id !== "string" ||
    !DISCORD_SNOWFLAKE_PATTERN.test(message.id)
  ) {
    throw new Error("Discord 개인 메시지 응답에 올바른 message id가 없습니다.");
  }

  return { channelId: dmChannel.id, messageId: message.id };
}
