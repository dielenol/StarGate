/**
 * `/일정 생성` 문자열 옵션 자동완성
 *
 * @module commands/session-create-autocomplete
 */

import type {
  AutocompleteInteraction,
  ApplicationCommandOptionChoiceData,
} from "discord.js";
import { Ac, L } from "../constants/registrar-voice.js";
import { Opt, Sub } from "../slash/ko-names.js";

function parseDateTime(str: string): Date | null {
  const t = str.trim();
  if (!t) return null;
  const normalized = t.replace(" ", "T");
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

function formatLocalDateTime(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${m}`;
}

/** 자동완성 후보가 예시·참고용임을 드롭다운에 표시 (Discord name ≤100자) */
function exampleChoiceName(body: string): string {
  const prefix = Ac.example;
  const full = `${prefix}${body}`;
  return full.length <= 100 ? full : `${full.slice(0, 97)}…`;
}

/** 사용자가 친 값을 그대로 쓸 때 */
function directInputChoiceName(body: string): string {
  const prefix = Ac.direct;
  const full = `${prefix}${body}`;
  return full.length <= 100 ? full : `${full.slice(0, 97)}…`;
}

const TITLE_SUGGESTIONS: { name: string; value: string }[] = [
  { name: "NOVUS ORDO — 상급자 회의", value: "NOVUS ORDO — 상급자 회의" },
  { name: "NOVUS ORDO — 실험 일정 브리핑", value: "NOVUS ORDO — 실험 일정 브리핑" },
  { name: "NOVUS ORDO — 작전 투입 안내", value: "NOVUS ORDO — 작전 투입 안내" },
  { name: "NOVUS ORDO — 격리 구역 순찰", value: "NOVUS ORDO — 격리 구역 순찰" },
  { name: "NOVUS ORDO — 주간 보고 마감", value: "NOVUS ORDO — 주간 보고 마감" },
  { name: "REGISTRAR — 통합 일정 등록", value: "REGISTRAR — 통합 일정 등록" },
];

function clampChoice(
  c: ApplicationCommandOptionChoiceData<string>
): ApplicationCommandOptionChoiceData<string> {
  return {
    name: c.name.length > 100 ? `${c.name.slice(0, 97)}…` : c.name,
    value: c.value.length > 100 ? c.value.slice(0, 100) : c.value,
  };
}

function buildTitleChoices(q: string): ApplicationCommandOptionChoiceData<string>[] {
  const ql = q.toLowerCase();
  const base = TITLE_SUGGESTIONS.filter(
    (c) =>
      !ql ||
      c.name.toLowerCase().includes(ql) ||
      c.value.toLowerCase().includes(ql)
  ).map((c) => ({
    name: exampleChoiceName(c.name),
    value: c.value,
  }));
  const out: ApplicationCommandOptionChoiceData<string>[] = [...base];
  if (q.trim().length > 0 && !base.some((c) => c.value === q.trim())) {
    const snippet =
      q.trim().length > 40 ? `${q.trim().slice(0, 37)}…` : q.trim();
    out.unshift({
      name: directInputChoiceName(snippet),
      value: q.trim().slice(0, 100),
    });
  }
  return out.slice(0, 25).map(clampChoice);
}

function addIfFuture(
  out: { name: string; value: string }[],
  label: string,
  d: Date,
  now: Date,
  sessionEnd: Date | null
): void {
  if (d.getTime() <= now.getTime()) return;
  if (sessionEnd && d.getTime() >= sessionEnd.getTime()) return;
  out.push({
    name: exampleChoiceName(`${label} · ${formatLocalDateTime(d)}`),
    value: formatLocalDateTime(d),
  });
}

function buildDateChoices(q: string): ApplicationCommandOptionChoiceData<string>[] {
  const now = new Date();
  const out: { name: string; value: string }[] = [];

  const addDaysAt = (days: number, hour: number, minute: number, label: string) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    addIfFuture(out, label, d, now, null);
  };

  addDaysAt(1, 20, 0, "내일 저녁 8시");
  addDaysAt(2, 20, 0, "이틀 뒤 저녁 8시");
  addDaysAt(3, 20, 0, "3일 뒤 저녁 8시");
  addDaysAt(5, 20, 0, "5일 뒤 저녁 8시");
  addDaysAt(7, 20, 0, "일주일 뒤 저녁 8시");
  addDaysAt(14, 20, 0, "2주 뒤 저녁 8시");

  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? out.filter(
        (c) =>
          c.value.toLowerCase().includes(ql) || c.name.toLowerCase().includes(ql)
      )
    : out;

  if (q.trim().length > 0 && /^\d{4}-\d{2}-\d{2}/.test(q.trim())) {
    const parsed = parseDateTime(q.trim());
    if (parsed && parsed.getTime() > now.getTime()) {
      filtered.unshift({
        name: directInputChoiceName(formatLocalDateTime(parsed)),
        value: formatLocalDateTime(parsed),
      });
    }
  }

  return filtered.slice(0, 25).map(clampChoice);
}

function buildCloseChoices(
  q: string,
  sessionDate: Date | null
): ApplicationCommandOptionChoiceData<string>[] {
  const now = new Date();
  const out: { name: string; value: string }[] = [];

  const end = sessionDate;

  const addDaysAt = (days: number, hour: number, minute: number, label: string) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    addIfFuture(out, label, d, now, end);
  };

  const today2359 = new Date(now);
  today2359.setHours(23, 59, 0, 0);
  addIfFuture(out, "오늘 밤 23:59", today2359, now, end);

  addDaysAt(1, 23, 59, "내일 밤 23:59");
  addDaysAt(1, 18, 0, "내일 오후 6시");
  addDaysAt(2, 20, 0, "이틀 뒤 저녁 8시");
  addDaysAt(3, 12, 0, "3일 뒤 정오");
  addDaysAt(0, 18, 0, "오늘 오후 6시 (가능할 때만)");

  const ql = q.trim().toLowerCase();
  let filtered = ql
    ? out.filter(
        (c) =>
          c.value.toLowerCase().includes(ql) || c.name.toLowerCase().includes(ql)
      )
    : out;

  if (q.trim().length > 0) {
    const parsed = parseDateTime(q.trim());
    if (parsed && parsed.getTime() > now.getTime()) {
      if (!end || parsed.getTime() < end.getTime()) {
        filtered = [
          {
            name: directInputChoiceName(formatLocalDateTime(parsed)),
            value: formatLocalDateTime(parsed),
          },
          ...filtered,
        ];
      }
    }
  }

  return filtered.slice(0, 25).map(clampChoice);
}

async function buildRoleChoices(
  interaction: AutocompleteInteraction,
  q: string
): Promise<ApplicationCommandOptionChoiceData<string>[]> {
  const guild = interaction.guild;
  if (!guild) return [];

  await guild.roles.fetch().catch(() => {});

  const ql = q.toLowerCase().trim();
  const arr = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position);

  const filtered = ql
    ? arr.filter((r) => r.name.toLowerCase().includes(ql))
    : arr;

  return filtered.slice(0, 25).map((r) =>
    clampChoice({
      name: r.name,
      value: r.id,
    })
  );
}

/**
 * `/일정` → `생성` 서브커맨드의 자동완성 응답
 */
export async function handleSessionCreateAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  if (interaction.options.getSubcommand() !== Sub.create) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  if (focused.type !== 3) {
    await interaction.respond([]);
    return;
  }

  const q = typeof focused.value === "string" ? focused.value : "";

  try {
    const dateStr = interaction.options.getString(Opt.date);
    const sessionDate = dateStr ? parseDateTime(dateStr) : null;

    let choices: ApplicationCommandOptionChoiceData<string>[];

    switch (focused.name) {
      case Opt.title:
        choices = buildTitleChoices(q);
        break;
      case Opt.date:
        choices = buildDateChoices(q);
        break;
      case Opt.closeTime:
        choices = buildCloseChoices(q, sessionDate);
        break;
      case Opt.role:
        choices = await buildRoleChoices(interaction, q);
        break;
      default:
        choices = [];
    }

    await interaction.respond(choices);
  } catch (err) {
    console.error(L.autocomplete, err);
    try {
      await interaction.respond([]);
    } catch {
      /* ignore */
    }
  }
}
