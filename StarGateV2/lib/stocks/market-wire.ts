import { findStockByTicker } from "@/lib/stocks/catalog";
import type { StockEventTier } from "@/lib/stocks/events";
import type {
  ScheduledStockTickResult,
  ScheduledStockTickSummary,
} from "@/lib/stocks/scheduled-tick";
import {
  formatSignedStockValue,
  formatStockValue,
} from "@/lib/stocks/pricing";
import {
  STOCK_MARKET_INDEX_CODE,
  buildStockMarketIndexSnapshot,
  formatIndexValue,
} from "@/lib/stocks/market-index";
import { kstDateTag, kstNowTag } from "@/lib/stocks/time";
import type { DiscordMessageBatchSyncResult } from "@/lib/discord/message-batch-sync";

type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordEmbed = {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields: DiscordEmbedField[];
  footer?: { text: string };
  timestamp: string;
};

export type DiscordPayload = {
  content?: string;
  username: string;
  avatar_url?: string;
  allowed_mentions?: { parse: string[] };
  embeds: DiscordEmbed[];
};

type MarketWireStatus =
  | "sent"
  | "queued"
  | "skipped-no-webhook"
  | "skipped-no-change"
  | "failed";

export interface MarketWireResult {
  status: MarketWireStatus;
  error?: string;
  embedCount?: number;
  messageCount?: number;
}

interface MarketWireOfficer {
  name: string;
  romanizedName: string;
  origin: string;
  code: string;
  weekday: string;
  noticeLine: string;
  linkLine: string;
}

export interface StockManualInterventionNotice {
  ticker: string;
  previousPrice: number;
  price: number;
  eventText: string;
  actor: {
    displayName: string;
    role: string;
  };
  occurredAt?: Date;
}

const DISCORD_FIELD_VALUE_MAX = 1000;
const MARKET_WIRE_COLOR = 0xc5a059;
const MARKET_WIRE_POSITIVE = 0x2fbf71;
const MARKET_WIRE_NEGATIVE = 0xd95f5f;
const STOCK_WEB_URL = "https://www.ordonet.co.kr/erp/stock";

const MARKET_WIRE_OFFICERS: Record<number, MarketWireOfficer> = {
  0: {
    weekday: "일요일",
    name: "소피아 마르코비치",
    romanizedName: "Sofia Markovic",
    origin: "세르비아계 유럽권",
    code: "FIN-SUN-07",
    noticeLine: "휴일 당직 기준으로 필수 변동 사항만 공시합니다.",
    linkLine: "휴일 공시는 축약본입니다. 세부 호가표는 ORDO-NET 주식 거래소에서 확인하십시오.",
  },
  1: {
    weekday: "월요일",
    name: "한서진",
    romanizedName: "Han Seo-jin",
    origin: "대한민국",
    code: "FIN-MON-01",
    noticeLine: "주간 개장 기준에 따라 정기 시세 갱신 내역을 통지합니다.",
    linkLine: "개장 주간 표준 장부는 거래소 화면에 맞춰두었습니다. 세부 시세를 확인하십시오.",
  },
  2: {
    weekday: "화요일",
    name: "아미나 오카포르",
    romanizedName: "Amina Okafor",
    origin: "나이지리아계 아프리카권",
    code: "FIN-TUE-02",
    noticeLine: "거래 지표 중심으로 변동 폭과 특이사항을 정리합니다.",
    linkLine: "지표 원문과 변동 폭 대조표는 ORDO-NET 주식 거래소에서 교차 확인하십시오.",
  },
  3: {
    weekday: "수요일",
    name: "마테오 알바레스",
    romanizedName: "Mateo Alvarez",
    origin: "아르헨티나계 남미권",
    code: "FIN-WED-03",
    noticeLine: "중간장 점검 결과를 ORDO-NET 시장기록에 반영합니다.",
    linkLine: "중간장 흐름과 종목별 체결 기록은 거래소 화면에 함께 정리했습니다.",
  },
  4: {
    weekday: "목요일",
    name: "프리야 라만",
    romanizedName: "Priya Raman",
    origin: "인도계 남아시아권",
    code: "FIN-THU-04",
    noticeLine: "기업 동향과 가격 변동의 연결 항목을 우선 기록합니다.",
    linkLine: "기업 동향 연결 항목은 ORDO-NET 주식 거래소에서 함께 대조하십시오.",
  },
  5: {
    weekday: "금요일",
    name: "레일라 하다드",
    romanizedName: "Leila Haddad",
    origin: "레반트계 중동권",
    code: "FIN-FRI-05",
    noticeLine: "주간 마감 전 시세 변동과 위험 신호를 함께 고지합니다.",
    linkLine: "마감 전 위험 신호는 거래소 화면에서 다시 확인한 뒤 거래하십시오.",
  },
  6: {
    weekday: "토요일",
    name: "닐스 소렌센",
    romanizedName: "Nils Sorensen",
    origin: "북유럽권",
    code: "FIN-SAT-06",
    noticeLine: "주말 당직 관제 기준으로 시장 변동을 기록합니다.",
    linkLine: "주말 관제 기록은 요약 공시입니다. 자세한 시세는 거래소 화면을 참조하십시오.",
  },
};

function getWebhookUrl(): string | undefined {
  return (
    process.env.DISCORD_WEBHOOK_STOCK_URL ||
    process.env.DISCORD_STOCK_WEBHOOK_URL
  );
}

function requireWebhookUrl(): string {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    throw new Error(
      "DISCORD_WEBHOOK_STOCK_URL/DISCORD_STOCK_WEBHOOK_URL 환경변수가 설정되지 않았습니다.",
    );
  }
  return webhookUrl;
}

function buildWebhookMessageUrl(
  webhookUrl: string,
  messageId: string,
): string {
  const url = new URL(webhookUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/messages/${encodeURIComponent(messageId)}`;
  url.search = "";
  return url.toString();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sanitizeForDiscord(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .replace(/<(@[!&]?|#)(\d+)>/g, "<$1\u200b$2>");
}

function truncateField(value: string): string {
  if (value.length <= DISCORD_FIELD_VALUE_MAX) return value;
  return `${value.slice(0, DISCORD_FIELD_VALUE_MAX - 1)}…`;
}

function weekdayIndexFromKstDate(dateTag: string): number {
  const [year, month, day] = dateTag.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function getOfficerForDate(dateTag: string): MarketWireOfficer {
  return MARKET_WIRE_OFFICERS[weekdayIndexFromKstDate(dateTag)];
}

function getOfficerForDateTime(date: Date): MarketWireOfficer {
  return getOfficerForDate(kstDateTag(date));
}

function formatPrice(price: number): string {
  return `${formatStockValue(price)}C`;
}

function formatSignedNumber(value: number, suffix = ""): string {
  return formatSignedStockValue(value, suffix);
}

function formatPercent(value: number): string {
  if (Math.abs(value) < 0.005) return "0.00%";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function directionIcon(result: ScheduledStockTickResult): string {
  if (result.price > result.previousPrice) return "▲";
  if (result.price < result.previousPrice) return "▼";
  return "·";
}

function directionLabel(result: ScheduledStockTickResult): string {
  if (result.price > result.previousPrice) return "상승";
  if (result.price < result.previousPrice) return "하락";
  return "보합";
}

function manualDirectionLabel(delta: number): string {
  if (delta > 0) return "상승";
  if (delta < 0) return "하락";
  return "보합";
}

function tierLabel(tier: StockEventTier): string {
  if (tier === "shock") return "충격";
  if (tier === "scenario") return "특이";
  return "정기";
}

function stockName(ticker: string): string {
  const meta = findStockByTicker(ticker);
  return meta ? `${meta.name} (${ticker})` : ticker;
}

function priceDelta(result: ScheduledStockTickResult): number {
  return result.price - result.previousPrice;
}

function formatPriceMove(result: ScheduledStockTickResult): string {
  return `${formatPrice(result.previousPrice)} → ${formatPrice(result.price)}`;
}

function formatMoveDelta(result: ScheduledStockTickResult): string {
  return `${formatSignedNumber(priceDelta(result), "C")} / ${formatPercent(
    result.changePercent,
  )}`;
}

function formatStockLedgerLine(result: ScheduledStockTickResult): string {
  const statusLabel =
    result.status === "initialized"
      ? " · 신규 등록"
      : result.status === "skipped"
        ? " · 이미 처리됨"
        : "";

  return `${directionIcon(result)} ${directionLabel(result)} · **${stockName(result.ticker)}**\n${formatPriceMove(
    result,
  )} (${formatMoveDelta(result)})${statusLabel}`;
}

function formatIndexMoveIcon(changePercent: number): string {
  if (changePercent > 0) return "▲";
  if (changePercent < 0) return "▼";
  return "·";
}

function marketBiasLabel(input: {
  upCount: number;
  downCount: number;
  flatCount: number;
}): string {
  if (input.upCount > input.downCount) return "상승 우세";
  if (input.downCount > input.upCount) return "하락 우세";
  if (input.flatCount > 0 && input.upCount === 0 && input.downCount === 0) {
    return "보합 관측";
  }
  return "혼조";
}

function marketWireColor(input: {
  upCount: number;
  downCount: number;
  netDelta: number;
}): number {
  if (input.upCount > input.downCount || input.netDelta > 0) {
    return MARKET_WIRE_POSITIVE;
  }
  if (input.downCount > input.upCount || input.netDelta < 0) {
    return MARKET_WIRE_NEGATIVE;
  }
  return MARKET_WIRE_COLOR;
}

function buildEventLines(
  results: readonly ScheduledStockTickResult[],
): string[] {
  return results
    .filter(
      (result) => result.eventTier !== "routine" && result.status === "updated",
    )
    .map((result) => {
      return `${tierLabel(result.eventTier)} · ${directionLabel(result)} · **${stockName(
        result.ticker,
      )}**\n${sanitizeForDiscord(result.eventText)}`;
    });
}

function stockMarketContent(): string {
  return `ORDO-NET 주식 거래소 바로가기: ${STOCK_WEB_URL}`;
}

function buildRoutineOverviewFields(
  summary: ScheduledStockTickSummary,
  changed: readonly ScheduledStockTickResult[],
): DiscordEmbedField[] {
  const upCount = changed.filter(
    (result) => result.price > result.previousPrice,
  ).length;
  const downCount = changed.filter(
    (result) => result.price < result.previousPrice,
  ).length;
  const flatCount = changed.length - upCount - downCount;
  const initializedCount = changed.filter(
    (result) => result.status === "initialized",
  ).length;
  const averagePercent =
    changed.length > 0
      ? changed.reduce((sum, result) => sum + result.changePercent, 0) /
        changed.length
      : 0;
  const marketIndex = buildStockMarketIndexSnapshot(
    summary.results.map((result) => ({
      ticker: result.ticker,
      price: result.price,
      prevPrice: result.previousPrice,
    })),
  );

  return [
    {
      name: "공시 개요",
      value: [
        `기준 슬롯: ${summary.slot} KST`,
        `처리 종목: ${changed.length}건`,
        initializedCount > 0 ? `신규 등록: ${initializedCount}건` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      inline: true,
    },
    {
      name: "시장 방향",
      value: [
        marketBiasLabel({ upCount, downCount, flatCount }),
        `상승 ${upCount} · 하락 ${downCount} · 보합 ${flatCount}`,
        `평균 변동률 ${formatPercent(averagePercent)}`,
      ].join("\n"),
      inline: true,
    },
    {
      name: `${STOCK_MARKET_INDEX_CODE} 종합지수`,
      value: [
        `${formatIndexMoveIcon(marketIndex.changePercent)} ${formatIndexValue(
          marketIndex.value,
        )} (${formatPercent(marketIndex.changePercent)})`,
      ]
        .filter(Boolean)
        .join("\n"),
      inline: true,
    },
  ];
}

function buildRoutineLedgerEmbeds(input: {
  changed: readonly ScheduledStockTickResult[];
  officer: MarketWireOfficer;
  summary: ScheduledStockTickSummary;
  timestamp: string;
}): DiscordEmbed[] {
  const { changed, officer, summary, timestamp } = input;
  const rising = changed.filter((result) => result.price > result.previousPrice);
  const falling = changed.filter((result) => result.price < result.previousPrice);
  const flat = changed.filter((result) => result.price === result.previousPrice);
  const eventLines = buildEventLines(changed);
  const embeds: DiscordEmbed[] = [
    {
      title: "상승 마감 장부",
      url: STOCK_WEB_URL,
      color: MARKET_WIRE_POSITIVE,
      fields: [
        {
          name: "상승 종목",
          value: truncateField(
            rising.length > 0
              ? rising.map(formatStockLedgerLine).join("\n\n")
              : "상승 마감 종목 없음",
          ),
        },
      ],
      footer: { text: `${officer.code} · ${summary.slot} KST · 상승 장부` },
      timestamp,
    },
    {
      title: "하락 마감 장부",
      url: STOCK_WEB_URL,
      color: MARKET_WIRE_NEGATIVE,
      fields: [
        {
          name: "하락 종목",
          value: truncateField(
            falling.length > 0
              ? falling.map(formatStockLedgerLine).join("\n\n")
              : "하락 마감 종목 없음",
          ),
        },
      ],
      footer: { text: `${officer.code} · ${summary.slot} KST · 하락 장부` },
      timestamp,
    },
  ];

  embeds.push({
    title: "보합 및 감시실 특이사항",
    url: STOCK_WEB_URL,
    description: "가격은 ORDO-NET 거래소 기준입니다.",
    color: MARKET_WIRE_COLOR,
    fields: [
      ...(flat.length > 0
        ? [
            {
              name: "보합 / 초기화",
              value: truncateField(flat.map(formatStockLedgerLine).join("\n\n")),
            },
          ]
        : []),
      {
        name: "감시실 특이사항",
        value: truncateField(
          eventLines.length > 0
            ? eventLines.join("\n\n")
            : "특이 공시 없음 · 정기 변동만 반영되었습니다.",
        ),
      },
    ],
    footer: { text: `${officer.code} · ${summary.slot} KST · 시장감시실` },
    timestamp,
  });

  return embeds;
}

function splitPayloadIntoSingleEmbedMessages(
  payload: DiscordPayload,
): DiscordPayload[] {
  return payload.embeds.map((embed, index) => ({
    ...payload,
    content: index === 0 ? payload.content : undefined,
    embeds: [embed],
  }));
}

function buildScheduledPayload(summary: ScheduledStockTickSummary): DiscordPayload | null {
  const changed = summary.results.filter((result) => result.status !== "skipped");
  if (changed.length === 0) return null;

  const officer = getOfficerForDate(summary.date);
  const upCount = changed.filter(
    (result) => result.price > result.previousPrice,
  ).length;
  const downCount = changed.filter(
    (result) => result.price < result.previousPrice,
  ).length;
  const netDelta = changed.reduce((sum, result) => sum + priceDelta(result), 0);
  const color = marketWireColor({ upCount, downCount, netDelta });
  const timestamp = new Date().toISOString();
  const description = [
    "ORDO-NET MARKET WIRE",
    `문서번호: ${officer.code}-${summary.date}`,
    `${officer.weekday} 당직: ${officer.name} (${officer.romanizedName})`,
    officer.noticeLine,
  ].join("\n");

  return {
    content: stockMarketContent(),
    username: "재무기구 시장감시실",
    avatar_url: process.env.DISCORD_WEBHOOK_STOCK_AVATAR_URL || undefined,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `재무기구 정기 시세 공시 · ${summary.date}`,
        url: STOCK_WEB_URL,
        description,
        color,
        fields: buildRoutineOverviewFields(summary, changed),
        timestamp,
      },
      ...buildRoutineLedgerEmbeds({
        changed,
        officer,
        summary,
        timestamp,
      }),
    ],
  };
}

function buildManualPayload(
  notice: StockManualInterventionNotice,
): DiscordPayload {
  const occurredAt = notice.occurredAt ?? new Date();
  const officer = getOfficerForDateTime(occurredAt);
  const percent =
    notice.previousPrice > 0
      ? ((notice.price - notice.previousPrice) / notice.previousPrice) * 100
      : 0;
  const delta = notice.price - notice.previousPrice;
  const color =
    delta > 0
      ? MARKET_WIRE_POSITIVE
      : delta < 0
        ? MARKET_WIRE_NEGATIVE
        : MARKET_WIRE_COLOR;

  return {
    content: stockMarketContent(),
    username: "재무기구 시장감시실",
    avatar_url: process.env.DISCORD_WEBHOOK_STOCK_AVATAR_URL || undefined,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "재무기구 특별 시세 공시",
        description: [
          "ORDO-NET MARKET WIRE",
          `${officer.weekday} 당직: ${officer.name} (${officer.romanizedName}) / ${officer.code}`,
          "시장감시실장 승인에 따라 수동 조정 내역을 공시합니다.",
        ].join("\n"),
        color,
        url: STOCK_WEB_URL,
        fields: [
          {
            name: "대상 종목",
            value: stockName(notice.ticker),
            inline: true,
          },
          {
            name: "조정 가격",
            value: `${formatPrice(notice.previousPrice)} → ${formatPrice(
              notice.price,
            )}\n${manualDirectionLabel(delta)} · ${formatSignedNumber(
              delta,
              "C",
            )} / ${formatPercent(percent)}`,
            inline: true,
          },
          {
            name: "조정 사유",
            value: truncateField(sanitizeForDiscord(notice.eventText)),
          },
          {
            name: "승인 기록",
            value: sanitizeForDiscord(`${notice.actor.displayName} · ${notice.actor.role}`),
          },
        ],
        footer: {
          text: `${officer.code} · ${kstNowTag(occurredAt)} KST · 특별 공시`,
        },
        timestamp: occurredAt.toISOString(),
      },
    ],
  };
}

async function postDiscordPayload(
  webhookUrl: string,
  payload: DiscordPayload,
): Promise<MarketWireResult> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: "failed",
        error: `Discord Webhook 전송 실패 (${response.status}): ${errorText}`,
      };
    }

    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: getErrorMessage(error) };
  }
}

export async function createScheduledStockMarketWireMessage(
  payload: DiscordPayload,
): Promise<string> {
  const url = new URL(requireWebhookUrl());
  url.searchParams.set("wait", "true");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Discord 주식 공시 생성 실패 (${response.status}): ${errorText}`,
    );
  }
  const message = (await response.json()) as { id?: unknown };
  if (typeof message.id !== "string" || message.id.length === 0) {
    throw new Error("Discord 주식 공시 생성 응답에 message id가 없습니다.");
  }
  return message.id;
}

export async function deleteScheduledStockMarketWireMessage(
  messageId: string,
): Promise<void> {
  const response = await fetch(
    buildWebhookMessageUrl(requireWebhookUrl(), messageId),
    {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 404 || response.ok) return;
  const errorText = await response.text();
  throw new Error(
    `Discord 주식 공시 삭제 실패 (${response.status}): ${errorText}`,
  );
}

async function sendDiscordPayload(payload: DiscordPayload): Promise<MarketWireResult> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.warn(
      "[stock-market-wire] DISCORD_WEBHOOK_STOCK_URL 미설정 — silent skip",
    );
    return { status: "skipped-no-webhook" };
  }

  const result = await postDiscordPayload(webhookUrl, payload);
  if (result.status !== "sent") return result;
  return {
    status: "sent",
    embedCount: payload.embeds.length,
    messageCount: 1,
  };
}

export async function syncScheduledStockMarketWireMessages(): Promise<DiscordMessageBatchSyncResult> {
  const { syncScheduledStockMarketWireMessages: sync } = await import(
    "@/lib/notifications/stock-market-wire-discord"
  );
  return sync();
}

interface ScheduledStockMarketWireDependencies {
  request(args: {
    date: string;
    sourceRevision?: string;
    payloads: DiscordPayload[];
  }): Promise<void>;
  sync(): Promise<DiscordMessageBatchSyncResult>;
  rebuild?(summary: ScheduledStockTickSummary): Promise<ScheduledStockTickSummary>;
}

const scheduledStockMarketWireDependencies: ScheduledStockMarketWireDependencies = {
  request: async (args) => {
    const { requestScheduledStockMarketWireSync } = await import(
      "@/lib/db/stock-market-wire"
    );
    await requestScheduledStockMarketWireSync(args);
  },
  sync: syncScheduledStockMarketWireMessages,
  rebuild: async (summary) => {
    const { rebuildScheduledStockTickSummary } = await import(
      "@/lib/stocks/scheduled-tick"
    );
    return (await rebuildScheduledStockTickSummary(summary.date)) ?? summary;
  },
};

export async function notifyScheduledStockMarketWire(
  summary: ScheduledStockTickSummary,
  dependencies: ScheduledStockMarketWireDependencies = scheduledStockMarketWireDependencies,
): Promise<MarketWireResult> {
  if (summary.results.every((result) => result.status === "skipped")) {
    if (getWebhookUrl()) {
      try {
        const recovery = await dependencies.sync();
        if (recovery === "failed" || recovery === "pass_limit") {
          return {
            status: "failed",
            error: `Discord 정기 공시 복구 실패 (${recovery})`,
          };
        }
      } catch (error) {
        return { status: "failed", error: getErrorMessage(error) };
      }
    }
    return { status: "skipped-no-change" };
  }
  if (!getWebhookUrl()) {
    console.warn(
      "[stock-market-wire] DISCORD_WEBHOOK_STOCK_URL 미설정 — silent skip",
    );
    return { status: "skipped-no-webhook" };
  }

  try {
    const canonicalSummary = dependencies.rebuild
      ? await dependencies.rebuild(summary)
      : summary;
    const payload = buildScheduledPayload(canonicalSummary);
    if (!payload) return { status: "skipped-no-change" };
    const payloads = splitPayloadIntoSingleEmbedMessages(payload);
    await dependencies.request({
      date: summary.date,
      sourceRevision: canonicalSummary.sourceRevision,
      payloads,
    });
    const result = await dependencies.sync();
    if (result === "synced") {
      return {
        status: "sent",
        embedCount: payload.embeds.length,
        messageCount: payloads.length,
      };
    }
    if (result === "idle") {
      return {
        status: "queued",
        embedCount: payload.embeds.length,
        messageCount: payloads.length,
      };
    }
    const error = `Discord 정기 공시 동기화 실패 (${result})`;
    console.warn(`[stock-market-wire] ${error}`);
    return { status: "failed", error };
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn("[stock-market-wire] 정기 공시 상태 요청 실패:", message);
    return { status: "failed", error: message };
  }
}

export async function notifyStockManualIntervention(
  notice: StockManualInterventionNotice,
): Promise<MarketWireResult> {
  const result = await sendDiscordPayload(buildManualPayload(notice));
  if (result.status === "failed") {
    console.warn("[stock-market-wire] 특별 공시 전송 실패:", result.error);
  }
  return result;
}
