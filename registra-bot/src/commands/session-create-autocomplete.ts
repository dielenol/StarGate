/**
 * `/일정` 생성·일정변경·응답마감변경 문자열 옵션 자동완성
 *
 * @module commands/session-create-autocomplete
 */

import type {
  AutocompleteInteraction,
  ApplicationCommandOptionChoiceData,
} from "discord.js";
import { Ac, L } from "../constants/registrar-voice.js";
import {
  findOpenSessionsByGuild,
  findSessionByIdInGuild,
} from "../db/sessions.js";
import { Opt, Sub } from "../slash/ko-names.js";
import type { Session } from "../types/session.js";
import { parseStrictDateTimeInput } from "../utils/date-time-input.js";

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

/** 봇 호스트 로컬: `d`가 속한 주의 월요일 00:00 (한국식 달력 주) */
function mondayStartOfLocalWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + delta);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 일요일 배정 일시: 오후 8시반 / 9시 / 9시반 */
const SUNDAY_SESSION_TIMES: readonly {
  hour: number;
  minute: number;
  label: string;
}[] = [
  { hour: 20, minute: 30, label: "오후 8시반" },
  { hour: 21, minute: 0, label: "오후 9시" },
  { hour: 21, minute: 30, label: "오후 9시반" },
];

function buildSundaySessionDateSuggestions(now: Date): { label: string; d: Date }[] {
  const mon = mondayStartOfLocalWeek(now);
  const thisSunMidnight = new Date(mon);
  thisSunMidnight.setDate(mon.getDate() + 6);
  thisSunMidnight.setHours(0, 0, 0, 0);
  const nextSunMidnight = new Date(thisSunMidnight);
  nextSunMidnight.setDate(thisSunMidnight.getDate() + 7);

  const out: { label: string; d: Date }[] = [];
  for (const { base, weekLabel } of [
    { base: thisSunMidnight, weekLabel: "이번 주 일요일" },
    { base: nextSunMidnight, weekLabel: "다음 주 일요일" },
  ] as const) {
    for (const t of SUNDAY_SESSION_TIMES) {
      const d = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        t.hour,
        t.minute,
        0,
        0
      );
      out.push({
        label: `${weekLabel} ${t.label}`,
        d,
      });
    }
  }
  return out;
}

/**
 * `/일정 생성`·`일정변경`의 배정 일시 자동완성.
 * **월요일 시작 주** 기준 이번·다음 주 일요일 × (20:30, 21:00, 21:30), 과거는 제외.
 */
function buildDateChoices(q: string): ApplicationCommandOptionChoiceData<string>[] {
  const now = new Date();
  const out: { name: string; value: string }[] = [];

  for (const { label, d } of buildSundaySessionDateSuggestions(now)) {
    addIfFuture(out, label, d, now, null);
  }

  const addDaysAt = (days: number, hour: number, minute: number, label: string) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    addIfFuture(out, label, d, now, null);
  };

  if (out.length === 0) {
    addDaysAt(1, 20, 30, "내일 오후 8시반(평일 보정)");
  }

  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? out.filter(
        (c) =>
          c.value.toLowerCase().includes(ql) || c.name.toLowerCase().includes(ql)
      )
    : out;

  if (q.trim().length > 0 && /^\d{4}-\d{2}-\d{2}/.test(q.trim())) {
    const parsed = parseStrictDateTimeInput(q.trim());
    if (parsed && parsed.getTime() > now.getTime()) {
      filtered.unshift({
        name: directInputChoiceName(formatLocalDateTime(parsed)),
        value: formatLocalDateTime(parsed),
      });
    }
  }

  return filtered.slice(0, 25).map(clampChoice);
}

function buildSaturdayTenPmCloseSuggestions(now: Date): { label: string; d: Date }[] {
  const mon = mondayStartOfLocalWeek(now);
  const thisSat = new Date(mon);
  thisSat.setDate(mon.getDate() + 5);
  thisSat.setHours(22, 0, 0, 0);
  const nextSat = new Date(thisSat);
  nextSat.setDate(thisSat.getDate() + 7);
  return [
    {
      label: "이번 주 토요일 저녁 10시 (배정 전날)",
      d: thisSat,
    },
    {
      label: "다음 주 토요일 저녁 10시 (배정 전날)",
      d: nextSat,
    },
  ];
}

/**
 * 응답 마감 자동완성: 이번·다음 주 **토요일 22:00**(일요일 배정 전날). 배정 일시보다 앞서야 하면 `sessionDate`로 걸러짐.
 */
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

  for (const { label, d } of buildSaturdayTenPmCloseSuggestions(now)) {
    addIfFuture(out, label, d, now, end);
  }

  if (out.length === 0) {
    addDaysAt(1, 22, 0, "내일 저녁 10시");
    addDaysAt(2, 22, 0, "이틀 뒤 저녁 10시");
    const today2359 = new Date(now);
    today2359.setHours(23, 59, 0, 0);
    addIfFuture(out, "오늘 밤 23:59", today2359, now, end);
  }

  const ql = q.trim().toLowerCase();
  let filtered = ql
    ? out.filter(
        (c) =>
          c.value.toLowerCase().includes(ql) || c.name.toLowerCase().includes(ql)
      )
    : out;

  if (q.trim().length > 0) {
    const parsed = parseStrictDateTimeInput(q.trim());
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

/** 자동완성 시 배정 일시 상한(응답 마감 후보)용 OPEN 일정 */
async function resolveOpenSessionForAutocomplete(
  guildId: string,
  registrationIdOpt: string | null
): Promise<Session | null> {
  const trimmed = registrationIdOpt?.trim();
  if (trimmed) {
    const s = await findSessionByIdInGuild(trimmed, guildId);
    return s && s.status === "OPEN" ? s : null;
  }
  const openSessions = await findOpenSessionsByGuild(guildId);
  if (openSessions.length !== 1) return null;
  return openSessions[0] ?? null;
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
 * `/일정` 서브커맨드별 문자열 옵션 자동완성
 */
export async function handleSessionCreateAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === Sub.create) {
    const focused = interaction.options.getFocused(true);
    if (focused.type !== 3) {
      await interaction.respond([]);
      return;
    }

    const q = typeof focused.value === "string" ? focused.value : "";

    try {
      const dateStr = interaction.options.getString(Opt.date);
      const sessionDate = dateStr
        ? parseStrictDateTimeInput(dateStr)
        : null;

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
    return;
  }

  if (sub === Sub.editClose) {
    const focused = interaction.options.getFocused(true);
    if (focused.type !== 3 || focused.name !== Opt.newClose) {
      await interaction.respond([]);
      return;
    }
    const q = typeof focused.value === "string" ? focused.value : "";
    try {
      let sessionEnd: Date | null = null;
      const gid = interaction.guildId;
      if (gid) {
        const reg = interaction.options.getString(Opt.registrationId);
        const session = await resolveOpenSessionForAutocomplete(gid, reg);
        if (session) sessionEnd = session.targetDateTime;
      }
      await interaction.respond(buildCloseChoices(q, sessionEnd));
    } catch (err) {
      console.error(L.autocomplete, err);
      try {
        await interaction.respond([]);
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (sub === Sub.editDate) {
    const focused = interaction.options.getFocused(true);
    if (focused.type !== 3 || focused.name !== Opt.newDate) {
      await interaction.respond([]);
      return;
    }
    const q = typeof focused.value === "string" ? focused.value : "";
    try {
      await interaction.respond(buildDateChoices(q));
    } catch (err) {
      console.error(L.autocomplete, err);
      try {
        await interaction.respond([]);
      } catch {
        /* ignore */
      }
    }
    return;
  }

  await interaction.respond([]);
}
