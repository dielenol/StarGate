/** Runtime-neutral, lore-grounded Discord DM copy for site and worker delivery. */

export type AmeriWorkshopDmEvent =
  | "REQUESTED"
  | "IN_REVIEW"
  | "QUOTED"
  | "IN_PROGRESS"
  | "READY"
  | "DECLINED"
  | "REJECTED"
  | "CANCELLED"
  | "COMPLETED";

export interface AmeriWorkshopSpecialistStep {
  specialistCodename: string;
  task: string;
}

export interface AmeriWorkshopDmContentInput {
  event: AmeriWorkshopDmEvent;
  kind: "upgrade" | "custom" | "reload";
  characterCodename: string;
  equipmentName?: string;
  totalCost?: number;
  durationMinutes?: number;
  readyAt?: Date | string;
  specialistWorkflow?: readonly AmeriWorkshopSpecialistStep[];
  note?: string;
  workshopUrl: string;
}

export type RegistrarTradeDmEvent =
  | "EXCHANGE_OPENED"
  | "GIFT_RECEIVED"
  | "EXCHANGE_COMPLETED"
  | "EXCHANGE_CANCELLED";

export interface RegistrarTradeDmContentInput {
  event: RegistrarTradeDmEvent;
  recipientCodename: string;
  otherCharacterCodename: string;
  offer?: unknown;
  tradeUrl: string;
}

const DISCORD_MARKDOWN_CHARACTERS = new Set(
  "\\`*_{}[]()#+-.!|>~".split(""),
);

const AMERI_SPECIALIST_LABELS: Record<string, string> = {
  VERNIER: "에이다 슈라이버 (VERNIER)",
  TEMPER: "브리짓 케인 (TEMPER)",
  TOWASKI: "립 토와스키 (TOWASKI)",
  SUTURE: "이레나 부코비치 (SUTURE)",
  RATCHET: "마테오 리바스 (RATCHET)",
};

function escapeDiscordMarkdown(value: string, maxLength: number): string {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return Array.from(normalized, (character) =>
    DISCORD_MARKDOWN_CHARACTERS.has(character)
      ? `\\${character}`
      : character,
  ).join("");
}

function formatDuration(durationMinutes: number): string {
  if (durationMinutes % 1_440 === 0) {
    return `${durationMinutes / 60}시간 · ${durationMinutes / 1_440}일`;
  }
  if (durationMinutes % 60 === 0) {
    return `${durationMinutes / 60}시간`;
  }
  return `${durationMinutes.toLocaleString("ko-KR")}분`;
}

function formatKstDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function ameriRequestLabel(
  kind: AmeriWorkshopDmContentInput["kind"],
): string {
  if (kind === "reload") return "재장전";
  return kind === "upgrade" ? "장비 강화" : "신규 제작";
}

function ameriRequestTarget(input: AmeriWorkshopDmContentInput): string {
  return [
    escapeDiscordMarkdown(input.characterCodename, 100),
    input.equipmentName
      ? escapeDiscordMarkdown(input.equipmentName, 180)
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ameriSpecialistLine(
  workflow: readonly AmeriWorkshopSpecialistStep[],
): string {
  return workflow
    .map((step) => {
      const code = escapeDiscordMarkdown(step.specialistCodename, 40);
      const specialist = AMERI_SPECIALIST_LABELS[step.specialistCodename]
        ?? code;
      const task = escapeDiscordMarkdown(step.task, 100);
      return task ? `${specialist} · ${task}` : specialist;
    })
    .join(" → ");
}

function withAmeriFooter(
  lines: readonly string[],
  workshopUrl: string,
): string {
  return [
    ...lines,
    `▶ 공방 문서함: ${workshopUrl}`,
    "— NOVUS ORDO · AMERI",
  ].join("\n");
}

export function buildAmeriWorkshopDiscordDmContent(
  input: AmeriWorkshopDmContentInput,
): string {
  const label = ameriRequestLabel(input.kind);
  const target = ameriRequestTarget(input);
  const note = input.note
    ? escapeDiscordMarkdown(input.note, 400)
    : undefined;

  switch (input.event) {
    case "REQUESTED":
      return withAmeriFooter(
        [
          `**◆ 공방 ${label} 요청을 접수했어요.**`,
          target,
          "양식은 검토 대기열에 올려뒀어요. 누락이 없으면 담당자에게 넘길게요. 다음 통지는 그 뒤예요.",
        ],
        input.workshopUrl,
      );
    case "IN_REVIEW":
      return withAmeriFooter(
        [
          `**◆ 공방 ${label} 요청을 검토 중이에요.**`,
          target,
          "담당자가 장비와 재료 기록을 대조하고 있어요. 결재선에 올라간 문서는 순서대로 처리하니, 조금만 기다리세요.",
        ],
        input.workshopUrl,
      );
    case "QUOTED": {
      const specialists = ameriSpecialistLine(
        input.specialistWorkflow ?? [],
      );
      return withAmeriFooter(
        [
          `**◆ 공방 ${label} 견적서를 정리했어요.**`,
          target,
          ...(input.totalCost !== undefined
            ? [
                `총 경제 부담: **${input.totalCost.toLocaleString("ko-KR")} CR**`,
              ]
            : []),
          ...(input.durationMinutes !== undefined
            ? [`예상 작업 시간: ${formatDuration(input.durationMinutes)}`]
            : []),
          ...(specialists ? [`담당 순서: ${specialists}`] : []),
          "표시된 견적 항목을 전부 확인한 뒤 수락하거나 거절하세요. 수락한 뒤에는 못 봤다는 말로 되돌릴 수 없으니까요.",
        ],
        input.workshopUrl,
      );
    }
    case "IN_PROGRESS":
      return withAmeriFooter(
        [
          `**◆ 공방 ${label} 작업 문서를 넘겼어요.**`,
          target,
          ...(input.readyAt
            ? [`수령 예정: ${formatKstDateTime(input.readyAt)} KST`]
            : input.durationMinutes !== undefined
              ? [`예상 작업 시간: ${formatDuration(input.durationMinutes)}`]
              : []),
          "결재는 끝났고 작업도 시작됐어요. 완료 통지가 갈 때까지 기다리세요. 재촉 문서는 제작 시간을 줄여주지 않아요.",
        ],
        input.workshopUrl,
      );
    case "READY":
      return withAmeriFooter(
        [
          `**◆ 공방 ${label} 완료 보고가 도착했어요.**`,
          target,
          "결과 장비를 수령할 수 있어요. 문서함에서 상태를 확인하고 수령 처리까지 끝내세요. 수령 확인도 절차예요.",
        ],
        input.workshopUrl,
      );
    case "DECLINED":
      return withAmeriFooter(
        [
          `**■ 공방 ${label} 견적 거절로 기록했어요.**`,
          target,
          "견적은 폐기했고 비용과 재료는 차감하지 않았어요. 같은 요청을 다시 올릴 거면 변경점을 먼저 적어주세요.",
        ],
        input.workshopUrl,
      );
    case "REJECTED":
      return withAmeriFooter(
        [
          `**■ 공방 ${label} 요청이 반려됐어요.**`,
          target,
          ...(note ? [`반려 사유: ${note}`] : []),
          "사유를 확인하고 보완해서 다시 제출하세요. 하아.. 반려 사유까지 제가 대신 없애드릴 수는 없어요.",
        ],
        input.workshopUrl,
      );
    case "CANCELLED":
      return withAmeriFooter(
        [
          `**■ 공방 ${label} 작업을 취소 처리했어요.**`,
          target,
          ...(note ? [`취소 사유: ${note}`] : []),
          "예치 비용과 물품은 반환 대장으로 넘겼어요. 문서함에서 반환 내역까지 확인하세요.",
        ],
        input.workshopUrl,
      );
    case "COMPLETED":
      return withAmeriFooter(
        input.kind === "reload"
          ? [
              "**◆ 공방 재장전 결재를 종결했어요.**",
              target,
              "장비 액션 충전 상태까지 복구됐어요. 네, 이 문서는 이제 끝이에요.",
            ]
          : [
              `**◆ 공방 ${label} 수령 처리를 종결했어요.**`,
              target,
              "결과 장비를 자산 대장에 반영했어요. 이 문서는 여기서 끝이에요. 커피가 완전히 식기 전이라 다행이네요.",
            ],
        input.workshopUrl,
      );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function summarizeTradeOffer(value: unknown): string {
  const offer = asRecord(value);
  if (!offer) return "제시 자산 없음";

  const entries: string[] = [];
  const credits = positiveNumber(offer.credits);
  if (credits !== null) {
    entries.push(`${credits.toLocaleString("ko-KR")} CR`);
  }

  if (Array.isArray(offer.items)) {
    for (const raw of offer.items) {
      const item = asRecord(raw);
      const quantity = positiveNumber(item?.quantity);
      if (!item || typeof item.itemName !== "string" || quantity === null) {
        continue;
      }
      entries.push(
        `${escapeDiscordMarkdown(item.itemName, 80)} × ${quantity.toLocaleString("ko-KR")}`,
      );
    }
  }

  if (Array.isArray(offer.stocks)) {
    for (const raw of offer.stocks) {
      const stock = asRecord(raw);
      const shares = positiveNumber(stock?.shares);
      if (!stock || typeof stock.ticker !== "string" || shares === null) {
        continue;
      }
      entries.push(
        `${escapeDiscordMarkdown(stock.ticker, 20)} ${shares.toLocaleString("ko-KR")}주`,
      );
    }
  }

  if (entries.length === 0) return "제시 자산 없음";
  const shown = entries.slice(0, 6);
  const omitted = entries.length - shown.length;
  return `${shown.join(" · ")}${omitted > 0 ? ` · 외 ${omitted}건` : ""}`;
}

function withRegistrarFooter(
  lines: readonly string[],
  tradeUrl: string,
): string {
  return [
    ...lines,
    `▶ 거래 대장: ${tradeUrl}`,
    "— NOVUS ORDO · REGISTRAR",
  ].join("\n");
}

export function buildRegistrarTradeDiscordDmContent(
  input: RegistrarTradeDmContentInput,
): string {
  const recipient = escapeDiscordMarkdown(input.recipientCodename, 100);
  const other = escapeDiscordMarkdown(
    input.otherCharacterCodename,
    100,
  );

  switch (input.event) {
    case "EXCHANGE_OPENED":
      return withRegistrarFooter(
        [
          "**◆ 자산 교환 요청이 대장에 등재되었습니다.**",
          `${recipient}님, ${other} 측에서 교환 절차를 요청했습니다.`,
          `제시 자산: ${summarizeTradeOffer(input.offer)}`,
          "구성을 검토한 뒤 거래 대장에서 수락 또는 거절을 회신하십시오. 양측 확정 전까지 자산 이동은 승인되지 않습니다.",
        ],
        input.tradeUrl,
      );
    case "GIFT_RECEIVED":
      return withRegistrarFooter(
        [
          "**◆ 자산 전달이 대장에 확정되었습니다.**",
          `${recipient}님, ${other} 측의 자산 전달 절차가 완료되었습니다.`,
          `전달 자산: ${summarizeTradeOffer(input.offer)}`,
          "별도 회신은 필요하지 않습니다. 이상이 있다면 거래 대장의 반영 내역을 기준으로 확인 바랍니다.",
        ],
        input.tradeUrl,
      );
    case "EXCHANGE_COMPLETED":
      return withRegistrarFooter(
        [
          "**◆ 자산 교환이 최종 확정되었습니다.**",
          `${recipient}님, ${other} 측과의 교환은 양측 확인이 일치하여 체결되었습니다.`,
          "해당 이전 내역은 자산 대장에 확정 기록되었습니다. 이후 변경은 별도 절차 없이는 허용되지 않습니다.",
        ],
        input.tradeUrl,
      );
    case "EXCHANGE_CANCELLED":
      return withRegistrarFooter(
        [
          "**■ 자산 교환 요청이 취소·종결되었습니다.**",
          `${recipient}님, ${other} 측에서 진행 중인 교환 절차를 취소했습니다.`,
          "미확정 제안은 즉시 효력을 상실했으며 자산 이동은 발생하지 않았습니다. 본 건은 취소 상태로 대장에 종결 기록되었습니다.",
        ],
        input.tradeUrl,
      );
  }
}
