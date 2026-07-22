export interface DiscordWebhookHistoryMessage {
  id: string;
  webhook_id?: string;
  timestamp?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    footer?: { text?: string };
    fields?: Array<{ name?: string; value?: string }>;
  }>;
}

export interface DiscordWebhookPruneResult {
  status: "deleted" | "idle";
  scannedCount: number;
  matchedCount: number;
  deletedCount: number;
}

interface DiscordWebhookPruneOptions {
  webhookUrl: string;
  keepMessageIds: readonly string[];
  matches(message: DiscordWebhookHistoryMessage): boolean;
  botToken?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface DiscordWebhookMetadata {
  id?: unknown;
  channel_id?: unknown;
}

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_PAGES = 100;
const MAX_RATE_LIMIT_RETRIES = 5;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

function parseWebhookUrl(webhookUrl: string): {
  webhookId: string;
  baseUrl: string;
} {
  const url = new URL(webhookUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const webhookIndex = segments.lastIndexOf("webhooks");
  const webhookId = segments[webhookIndex + 1];
  const webhookToken = segments[webhookIndex + 2];
  if (webhookIndex < 0 || !webhookId || !webhookToken) {
    throw new Error("Discord 웹훅 URL 형식이 올바르지 않습니다.");
  }

  url.pathname = `/${segments.slice(0, webhookIndex + 3).join("/")}`;
  url.search = "";
  url.hash = "";
  return { webhookId, baseUrl: url.toString().replace(/\/$/, "") };
}

function buildWebhookMessageUrl(baseUrl: string, messageId: string): string {
  return `${baseUrl}/messages/${encodeURIComponent(messageId)}`;
}

function oldestKeepMessageId(messageIds: readonly string[]): string {
  if (messageIds.length === 0) {
    throw new Error("Discord 정리에는 보존할 현재 message id가 필요합니다.");
  }

  let oldest: bigint | null = null;
  for (const messageId of messageIds) {
    if (!/^\d+$/.test(messageId)) {
      throw new Error("Discord message id가 snowflake 형식이 아닙니다.");
    }
    const snowflake = BigInt(messageId);
    if (oldest === null || snowflake < oldest) oldest = snowflake;
  }
  return String(oldest);
}

async function responseError(
  response: Response,
  action: string,
): Promise<Error> {
  const body = (await response.text()).slice(0, 1000);
  return new Error(
    `Discord ${action} 실패 (${response.status})${body ? `: ${body}` : ""}`,
  );
}

function rateLimitSeconds(response: Response, body: string): number | null {
  try {
    const parsed = JSON.parse(body) as { retry_after?: unknown };
    if (
      typeof parsed.retry_after === "number" &&
      Number.isFinite(parsed.retry_after)
    ) {
      return parsed.retry_after;
    }
  } catch {
    // JSON body가 없으면 표준 Retry-After 헤더를 사용한다.
  }
  const header = Number(response.headers.get("retry-after"));
  return Number.isFinite(header) ? header : null;
}

async function discordFetch(
  fetchImpl: typeof fetch,
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetchImpl(input, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 429) return response;

    const body = await response.text();
    const seconds = rateLimitSeconds(response, body);
    const waitMs = seconds === null ? NaN : Math.max(0, seconds * 1000);
    if (
      attempt === MAX_RATE_LIMIT_RETRIES ||
      !Number.isFinite(waitMs) ||
      waitMs > MAX_RATE_LIMIT_WAIT_MS
    ) {
      throw new Error(
        `Discord rate limit 재시도 실패 (429)${body ? `: ${body.slice(0, 1000)}` : ""}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error("Discord rate limit 재시도 한도를 초과했습니다.");
}

async function getWebhookChannelId(
  baseUrl: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await discordFetch(fetchImpl, baseUrl, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response, "웹훅 채널 조회");

  const metadata = (await response.json()) as DiscordWebhookMetadata;
  if (
    typeof metadata.channel_id !== "string" ||
    metadata.channel_id.length === 0
  ) {
    throw new Error("Discord 웹훅 응답에 channel_id가 없습니다.");
  }
  return metadata.channel_id;
}

async function listChannelMessages(args: {
  apiBaseUrl: string;
  botToken: string;
  channelId: string;
  before?: string;
  fetchImpl: typeof fetch;
}): Promise<DiscordWebhookHistoryMessage[]> {
  const url = new URL(
    `${args.apiBaseUrl.replace(/\/$/, "")}/channels/${encodeURIComponent(args.channelId)}/messages`,
  );
  url.searchParams.set("limit", String(HISTORY_PAGE_SIZE));
  if (args.before) url.searchParams.set("before", args.before);

  const response = await discordFetch(args.fetchImpl, url, {
    method: "GET",
    headers: { Authorization: `Bot ${args.botToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response, "채널 기록 조회");

  const messages = (await response.json()) as unknown;
  if (!Array.isArray(messages)) {
    throw new Error("Discord 채널 기록 응답이 배열이 아닙니다.");
  }
  return messages.filter(
    (message): message is DiscordWebhookHistoryMessage =>
      typeof message === "object" &&
      message !== null &&
      typeof (message as { id?: unknown }).id === "string",
  );
}

async function getWebhookMessage(args: {
  baseUrl: string;
  messageId: string;
  fetchImpl: typeof fetch;
}): Promise<DiscordWebhookHistoryMessage | null> {
  const response = await discordFetch(
    args.fetchImpl,
    buildWebhookMessageUrl(args.baseUrl, args.messageId),
    {
      method: "GET",
      cache: "no-store",
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await responseError(response, "웹훅 메시지 조회");
  return (await response.json()) as DiscordWebhookHistoryMessage;
}

async function deleteWebhookMessage(args: {
  baseUrl: string;
  messageId: string;
  fetchImpl: typeof fetch;
}): Promise<boolean> {
  const response = await discordFetch(
    args.fetchImpl,
    buildWebhookMessageUrl(args.baseUrl, args.messageId),
    {
      method: "DELETE",
      cache: "no-store",
    },
  );
  if (response.status === 404) return false;
  if (!response.ok) throw await responseError(response, "웹훅 메시지 삭제");
  return true;
}

export async function pruneDiscordWebhookMessages(
  options: DiscordWebhookPruneOptions,
): Promise<DiscordWebhookPruneResult> {
  const botToken = options.botToken ?? process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    throw new Error(
      "Discord 과거 메시지 정리에 필요한 DISCORD_BOT_TOKEN이 설정되지 않았습니다.",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? DISCORD_API_BASE_URL;
  const { webhookId, baseUrl } = parseWebhookUrl(options.webhookUrl);
  const channelId = await getWebhookChannelId(baseUrl, fetchImpl);
  const keepMessageIds = new Set(options.keepMessageIds);
  const oldestKeepId = oldestKeepMessageId(options.keepMessageIds);
  const oldestKeepSnowflake = BigInt(oldestKeepId);
  // canonical보다 오래된 기록에서 시작해 정리 도중 생성된 새 revision을
  // 절대 조회하거나 삭제하지 않는다.
  let before: string | undefined = oldestKeepId;
  let scannedCount = 0;
  let matchedCount = 0;
  let deletedCount = 0;

  for (let pageIndex = 0; pageIndex < MAX_HISTORY_PAGES; pageIndex += 1) {
    const messages = await listChannelMessages({
      apiBaseUrl,
      botToken,
      channelId,
      ...(before ? { before } : {}),
      fetchImpl,
    });
    scannedCount += messages.length;

    for (const message of messages) {
      if (
        message.webhook_id !== webhookId ||
        keepMessageIds.has(message.id) ||
        !/^\d+$/.test(message.id) ||
        BigInt(message.id) >= oldestKeepSnowflake
      ) {
        continue;
      }

      // 채널 목록의 embed가 intent 설정에 따라 비어 있을 수 있으므로,
      // 같은 웹훅 토큰으로 메시지 본문을 다시 조회한 뒤 삭제 대상을 판정한다.
      const detail = await getWebhookMessage({
        baseUrl,
        messageId: message.id,
        fetchImpl,
      });
      if (!detail || !options.matches(detail)) continue;

      matchedCount += 1;
      if (
        await deleteWebhookMessage({
          baseUrl,
          messageId: message.id,
          fetchImpl,
        })
      ) {
        deletedCount += 1;
      }
    }

    if (messages.length < HISTORY_PAGE_SIZE) {
      return {
        status: deletedCount > 0 ? "deleted" : "idle",
        scannedCount,
        matchedCount,
        deletedCount,
      };
    }
    before = messages.at(-1)?.id;
    if (!before) break;
  }

  throw new Error(
    `Discord 채널 기록 정리가 ${MAX_HISTORY_PAGES * HISTORY_PAGE_SIZE}개 메시지 한도를 초과했습니다.`,
  );
}
