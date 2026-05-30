import { findStockByTicker } from "@/lib/stocks/catalog";
import type { StockEventTier } from "@/lib/stocks/events";
import type {
  ScheduledStockTickResult,
  ScheduledStockTickSummary,
} from "@/lib/stocks/scheduled-tick";
import { kstDateTag, kstNowTag } from "@/lib/stocks/time";

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
  avatar_url?: string;
  allowed_mentions?: { parse: string[] };
  embeds: DiscordEmbed[];
};

type MarketWireStatus =
  | "sent"
  | "skipped-no-webhook"
  | "skipped-no-change"
  | "failed";

export interface MarketWireResult {
  status: MarketWireStatus;
  error?: string;
}

interface MarketWireOfficer {
  name: string;
  romanizedName: string;
  origin: string;
  code: string;
  weekday: string;
  noticeLine: string;
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

const MARKET_WIRE_OFFICERS: Record<number, MarketWireOfficer> = {
  0: {
    weekday: "일요일",
    name: "소피아 마르코비치",
    romanizedName: "Sofia Markovic",
    origin: "세르비아계 유럽권",
    code: "FIN-SUN-07",
    noticeLine: "휴일 당직 기준으로 필수 변동 사항만 공시합니다.",
  },
  1: {
    weekday: "월요일",
    name: "한서진",
    romanizedName: "Han Seo-jin",
    origin: "대한민국",
    code: "FIN-MON-01",
    noticeLine: "주간 개장 기준에 따라 정기 시세 갱신 내역을 통지합니다.",
  },
  2: {
    weekday: "화요일",
    name: "아미나 오카포르",
    romanizedName: "Amina Okafor",
    origin: "나이지리아계 아프리카권",
    code: "FIN-TUE-02",
    noticeLine: "거래 지표 중심으로 변동 폭과 특이사항을 정리합니다.",
  },
  3: {
    weekday: "수요일",
    name: "마테오 알바레스",
    romanizedName: "Mateo Alvarez",
    origin: "아르헨티나계 남미권",
    code: "FIN-WED-03",
    noticeLine: "중간장 점검 결과를 ORDO-NET 시장기록에 반영합니다.",
  },
  4: {
    weekday: "목요일",
    name: "프리야 라만",
    romanizedName: "Priya Raman",
    origin: "인도계 남아시아권",
    code: "FIN-THU-04",
    noticeLine: "기업 동향과 가격 변동의 연결 항목을 우선 기록합니다.",
  },
  5: {
    weekday: "금요일",
    name: "레일라 하다드",
    romanizedName: "Leila Haddad",
    origin: "레반트계 중동권",
    code: "FIN-FRI-05",
    noticeLine: "주간 마감 전 시세 변동과 위험 신호를 함께 고지합니다.",
  },
  6: {
    weekday: "토요일",
    name: "닐스 소렌센",
    romanizedName: "Nils Sorensen",
    origin: "북유럽권",
    code: "FIN-SAT-06",
    noticeLine: "주말 당직 관제 기준으로 시장 변동을 기록합니다.",
  },
};

function getWebhookUrl(): string | undefined {
  return (
    process.env.DISCORD_WEBHOOK_STOCK_URL ||
    process.env.DISCORD_STOCK_WEBHOOK_URL
  );
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
  return `${price.toLocaleString("ko-KR")}C`;
}

function formatSignedNumber(value: number, suffix = ""): string {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${value.toLocaleString("ko-KR")}${suffix}`;
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

function tierLabel(tier: StockEventTier): string {
  if (tier === "shock") return "충격";
  if (tier === "scenario") return "특이";
  return "정기";
}

function stockName(ticker: string): string {
  const meta = findStockByTicker(ticker);
  return meta ? `${meta.name} (${ticker})` : ticker;
}

function formatStockLine(result: ScheduledStockTickResult): string {
  const delta = result.price - result.previousPrice;
  const statusLabel =
    result.status === "initialized"
      ? " / 신규 등록"
      : result.status === "skipped"
        ? " / 이미 처리됨"
        : "";

  return [
    directionIcon(result),
    stockName(result.ticker),
    formatPrice(result.price),
    `(${formatSignedNumber(delta, "C")}, ${formatPercent(result.changePercent)})`,
    statusLabel,
  ].join(" ");
}

function buildRoutineFields(summary: ScheduledStockTickSummary): DiscordEmbedField[] {
  const changed = summary.results.filter((result) => result.status !== "skipped");
  const upCount = changed.filter((result) => result.price > result.previousPrice).length;
  const downCount = changed.filter((result) => result.price < result.previousPrice).length;
  const flatCount = changed.length - upCount - downCount;
  const eventRows = changed.filter(
    (result) => result.eventTier !== "routine" && result.status === "updated",
  );

  const priceLines = changed.map(formatStockLine);
  const eventLines = eventRows.map((result) => {
    return `${tierLabel(result.eventTier)} · ${stockName(result.ticker)}: ${sanitizeForDiscord(
      result.eventText,
    )}`;
  });

  return [
    {
      name: "시장 요약",
      value: [
        `기준: ${summary.slot} KST`,
        `처리: ${changed.length}건`,
        `방향: 상승 ${upCount} / 하락 ${downCount} / 보합 ${flatCount}`,
      ].join("\n"),
    },
    {
      name: "종목별 변동",
      value: truncateField(priceLines.join("\n")),
    },
    {
      name: "특이사항",
      value: truncateField(eventLines.length > 0 ? eventLines.join("\n") : "특이 공시 없음"),
    },
  ];
}

function buildScheduledPayload(summary: ScheduledStockTickSummary): DiscordPayload | null {
  const changed = summary.results.filter((result) => result.status !== "skipped");
  if (changed.length === 0) return null;

  const officer = getOfficerForDate(summary.date);
  const description = [
    "ORDO-NET MARKET WIRE",
    `${officer.weekday} 당직: ${officer.name} (${officer.romanizedName}) / ${officer.code}`,
    officer.noticeLine,
  ].join("\n");

  return {
    username: "재무기구 시장감시실",
    avatar_url: process.env.DISCORD_WEBHOOK_STOCK_AVATAR_URL || undefined,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "재무기구 정기 시세 공시",
        description,
        color: MARKET_WIRE_COLOR,
        fields: buildRoutineFields(summary),
        footer: { text: `${officer.code} · ${summary.slot} KST · 자동 공시` },
        timestamp: new Date().toISOString(),
      },
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
            )}\n${formatSignedNumber(delta, "C")} / ${formatPercent(percent)}`,
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

async function sendDiscordPayload(payload: DiscordPayload): Promise<MarketWireResult> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.warn(
      "[stock-market-wire] DISCORD_WEBHOOK_STOCK_URL 미설정 — silent skip",
    );
    return { status: "skipped-no-webhook" };
  }

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

export async function notifyScheduledStockMarketWire(
  summary: ScheduledStockTickSummary,
): Promise<MarketWireResult> {
  const payload = buildScheduledPayload(summary);
  if (!payload) return { status: "skipped-no-change" };
  const result = await sendDiscordPayload(payload);
  if (result.status === "failed") {
    console.warn("[stock-market-wire] 정기 공시 전송 실패:", result.error);
  }
  return result;
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
