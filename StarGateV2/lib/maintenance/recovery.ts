/**
 * 침해 복구 연출 상태. 점검 구간의 경과 시간만으로 복구율·단계·구역·로그·공지를 정하므로
 * 같은 시각에 접속한 요원은 모두 같은 화면을 본다.
 */

export type RecoveryTone = "alert" | "warn" | "info" | "ok" | "threat";
export type SectorState = "corrupted" | "quarantined" | "recovering" | "restored";

export type RecoveryLogLine = {
  seq: number;
  time: string;
  tag: string;
  tone: RecoveryTone;
  text: string;
};

export type SectorRow = {
  code: string;
  label: string;
  cells: SectorState[];
  restored: number;
};

export type RecoveryUpdate = {
  /** 시작 후 경과 분. 이 시각에 공지가 게시된다. */
  minute: number;
  label: string;
  tone: "alert" | "warn" | "ok";
  text: string;
};

export type PublishedUpdate = RecoveryUpdate & { at: number; time: string };

type LogTemplate = { tag: string; tone: RecoveryTone; text: string };

/**
 * 보안관제센터의 대응 경과 공지. 16시간 일정의 단계 전환(약 +88분 정화, +360분 복원, +712분 검증)
 * 직후에 맞춰 두었다. 세션 전개에 맞춰 문구만 바꾸면 된다.
 */
export const RECOVERY_UPDATES: readonly RecoveryUpdate[] = [
  { minute: 0, label: "탐지", tone: "alert", text: "관리자 계정으로 비인가 접근이 탐지되었습니다. 해당 계정을 즉시 정지했습니다." },
  { minute: 2, label: "격리", tone: "alert", text: "ERP 전 구역을 외부망에서 분리하고 접속 중이던 요원 세션을 모두 종료했습니다." },
  { minute: 14, label: "분석", tone: "alert", text: "접근 기록과 변조 흔적을 분석하고 있습니다. 침입 경로는 아직 확인되지 않았습니다." },
  { minute: 47, label: "차단", tone: "alert", text: "추가 확산 경로를 차단했습니다. 남아 있는 악성 프로세스를 제거하고 있습니다." },
  { minute: 92, label: "정화", tone: "warn", text: "확산 차단을 마치고 오염 구역 정화를 시작했습니다. 일부 기록에서 변조가 확인되어 백업과 대조하고 있습니다." },
  { minute: 185, label: "정화", tone: "warn", text: "인증 계통을 우선 정화하고 있습니다. 신원조회 데이터는 손상 범위가 가장 넓어 복원에 시간이 더 걸립니다." },
  { minute: 364, label: "복원", tone: "ok", text: "오염 구역 정화를 마쳤습니다. 백업 스냅샷을 기준으로 기록 복원을 시작했습니다." },
  { minute: 718, label: "검증", tone: "ok", text: "기록 복원이 마무리 단계에 들어섰습니다. 무결성 최종 검증을 시작했습니다." },
  { minute: 900, label: "재개 준비", tone: "ok", text: "요원 접근 권한 재발급을 준비하고 있습니다. 예정된 시각에 업무망을 재개합니다." },
];

/** 단계는 복구율 `until` 미만까지 유지된다. 마지막 단계는 종료까지 이어진다. */
export const RECOVERY_STAGES = [
  {
    code: "CONTAINMENT",
    label: "침해 확산 차단",
    until: 0.15,
    ticker: ["비인가 침입 감지", "내부망 전 구역 긴급 격리", "ERP 전 기능 중지", "관리자 권한 탈취 확인", "출처 불명 복구 요청 무시", "BREACH CONTAINMENT IN PROGRESS"],
  },
  {
    code: "PURGE",
    label: "오염 구역 정화",
    until: 0.55,
    ticker: ["오염 구역 정화 진행", "잔존 백도어 추적", "요원 인증 전면 재검증", "외부 링크·인증 요청 무시", "PURGE IN PROGRESS"],
  },
  {
    code: "RESTORE",
    label: "기록 복원",
    until: 0.9,
    ticker: ["백업 스냅샷 복원", "기록 무결성 대조", "업무 데이터 순차 복구", "RESTORATION IN PROGRESS"],
  },
  {
    code: "VERIFY",
    label: "무결성 최종 검증",
    until: Number.POSITIVE_INFINITY,
    ticker: ["무결성 최종 검증", "접근 권한 재발급 준비", "업무망 재개 대기", "FINAL VERIFICATION"],
  },
] as const;

/** 표시 순서대로 나열한다. bias가 클수록 늦게 복구된다. */
export const RECOVERY_SECTORS = [
  { code: "AUTH", label: "인증 게이트", bias: 0 },
  { code: "PERSONNEL", label: "신원조회", bias: 1 },
  { code: "CHARACTER", label: "캐릭터 기록", bias: 0.68 },
  { code: "OPERATION", label: "작전 보고서", bias: 0.3 },
  { code: "LEDGER", label: "크레딧 원장", bias: 0.55 },
  { code: "ARMORY", label: "인벤토리·병기", bias: 0.42 },
  { code: "ARCHIVE", label: "위키·기록보관", bias: 0.82 },
  { code: "COMMS", label: "알림·통신", bias: 0.15 },
] as const;

export const SECTOR_COLUMNS = 24;

/** 1보다 클수록 초반에 빠르게 오르고 종료에 가까울수록 느려진다. */
const RECOVERY_CURVE = 1.7;
const KST_OFFSET_MS = 9 * 60 * 60_000;
const LOG_SLOT_MS = 2_300;

const LOG_FILES = [
  "personnel/dossier.db",
  "characters/lore.idx",
  "credits/ledger.dat",
  "inventory/manifest.db",
  "sessions/report.log",
  "wiki/archive.pak",
  "auth/token.store",
  "comms/outbox.q",
];

/** 사고 직후 첫 로그. 시작 시각에 접속한 요원만 볼 수 있다. */
const OPENING_LOG: readonly LogTemplate[] = [
  { tag: "ALERT", tone: "alert", text: "관리자 계정 비정상 로그인 탐지" },
  { tag: "ALERT", tone: "threat", text: "관리자 권한 탈취 · 변조 페이지 배포 확인" },
  { tag: "LOCK", tone: "alert", text: "내부망 전 구역 긴급 격리 발령" },
  { tag: "LOCK", tone: "warn", text: "ERP 전 기능 중지 · 외부 접속 차단" },
  { tag: "TRACE", tone: "warn", text: "침입 경로 분석 착수" },
];

const LOG_TEMPLATES: readonly (readonly LogTemplate[])[] = [
  [
    { tag: "LOCK", tone: "alert", text: "{sector} 경로 차단 · 외부 세션 {n}건 강제 종료" },
    { tag: "KILL", tone: "alert", text: "악성 프로세스 PID {pid} 강제 종료" },
    { tag: "TRACE", tone: "warn", text: "침입 경로 역추적 · 경유지 {n}곳 · 출발지 미확인" },
    { tag: "QUAR", tone: "warn", text: "{sector} 오염 블록 격리" },
    { tag: "SEAL", tone: "info", text: "요원 인증 토큰 {n}건 일괄 폐기" },
    { tag: "WARN", tone: "warn", text: "관리자 계정 {hex} 권한 상승 흔적 확인" },
    { tag: "SCAN", tone: "info", text: "{file} 변조 여부 검사" },
  ],
  [
    { tag: "PURGE", tone: "info", text: "{file} 변조 레코드 {n}건 제거" },
    { tag: "SCAN", tone: "info", text: "{sector} 무결성 검사 {pct}%" },
    { tag: "QUAR", tone: "warn", text: "은닉 페이로드 {hex} 격리" },
    { tag: "KILL", tone: "alert", text: "잔존 백도어 {hex} 제거" },
    { tag: "OK", tone: "ok", text: "{sector} 블록 {n}개 정화 완료" },
    { tag: "TRACE", tone: "warn", text: "외부 송신 기록 {n}건 · 유출 범위 분석" },
  ],
  [
    { tag: "RESTORE", tone: "ok", text: "{file} 백업 스냅샷 복원 {pct}%" },
    { tag: "VERIFY", tone: "info", text: "서명 대조 {hex} · 일치" },
    { tag: "OK", tone: "ok", text: "{sector} 블록 {n}개 복원" },
    { tag: "WARN", tone: "warn", text: "{file} 손상 구간 발견 · 재복원 예약" },
    { tag: "SCAN", tone: "info", text: "{sector} 교차 검증 {pct}%" },
  ],
  [
    { tag: "AUDIT", tone: "info", text: "요원 접근 권한 재검증 {n}건" },
    { tag: "VERIFY", tone: "ok", text: "{sector} 해시 체인 검증 통과" },
    { tag: "OK", tone: "ok", text: "업무망 재개 준비 {pct}%" },
    { tag: "AUDIT", tone: "info", text: "사고 기록 봉인 · 분석 보고서 작성" },
  ],
];

/** 침입자의 재시도를 막아 낸 기록. 단계가 진행될수록 드물어진다. */
const THREAT_LOG = [
  "C2 서버 통신 시도 차단 · {ip}",
  "악성 프로세스 재실행 감지 · PID {pid} 종료",
  "비인가 관리자 세션 재접속 시도 차단 · {ip}",
  "변조 페이지 재배포 시도 차단",
  "외부 반출 시도 {n}건 차단 · {file}",
];
const THREAT_RATE = [0.22, 0.1, 0.04, 0];

/** 같은 입력에 항상 같은 0~1 값을 돌려주는 결정론적 난수(mulberry32 1단계). */
function hash(seed: number): number {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.floor(hash(seed) * items.length)];
}

export function formatKstClock(time: number): string {
  const date = new Date(time + KST_OFFSET_MS);
  return [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .map((unit) => String(unit).padStart(2, "0"))
    .join(":");
}

export function incidentCode(startsAt: string): string {
  const date = new Date(Date.parse(startsAt) + KST_OFFSET_MS);
  const stamp = [date.getUTCFullYear() % 100, date.getUTCMonth() + 1, date.getUTCDate()]
    .map((unit) => String(unit).padStart(2, "0"))
    .join("");
  return `INC-${stamp}-01`;
}

export function recoveryProgress(startsAt: string, endsAt: string, now: number): number {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now) || end <= start) return 0;
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
  return 1 - (1 - elapsed) ** RECOVERY_CURVE;
}

export function recoveryStageIndex(progress: number): number {
  return Math.max(0, RECOVERY_STAGES.findIndex((stage) => progress < stage.until));
}

export function sectorRows(progress: number): SectorRow[] {
  return RECOVERY_SECTORS.map((sector, row) => {
    const cells = Array.from({ length: SECTOR_COLUMNS }, (_, column): SectorState => {
      const seed = (row * SECTOR_COLUMNS + column) * 5;
      // 일부 블록은 처음부터 침해되지 않았다.
      if (hash(seed + 3) < 0.07) return "restored";
      const restoreAt = 0.04 + (sector.bias * 0.55 + hash(seed + 1) * 0.45) * 0.92;
      // 대부분은 차단 단계에서 격리되지만, 일부 잔존 오염은 정화 단계 중반까지 버틴다.
      const stubborn = hash(seed + 4) < 0.15;
      const quarantineAt = Math.min(
        restoreAt - 0.04,
        stubborn ? 0.15 + hash(seed + 2) * 0.35 : 0.004 + hash(seed + 2) * 0.13,
      );
      if (progress >= restoreAt) return "restored";
      if (progress >= restoreAt - 0.035) return "recovering";
      if (progress >= quarantineAt) return "quarantined";
      return "corrupted";
    });
    return {
      code: sector.code,
      label: sector.label,
      cells,
      restored: cells.filter((state) => state === "restored").length / SECTOR_COLUMNS,
    };
  });
}

function fillTemplate(template: string, seq: number): string {
  let slot = 0;
  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    slot += 1;
    const seed = seq * 31 + slot * 7;
    const value = hash(seed);
    switch (token) {
      case "sector": return pick(RECOVERY_SECTORS, seed).label;
      case "file": return pick(LOG_FILES, seed);
      case "hex": return `0x${Math.floor(value * 0xffffff).toString(16).toUpperCase().padStart(6, "0")}`;
      case "pid": return String(1_000 + Math.floor(value * 8_999));
      case "n": return String(2 + Math.floor(value * 46));
      case "pct": return String(Math.floor(value * 100));
      // 문서용 예약 대역(TEST-NET)만 쓴다.
      case "ip": return `${value < 0.5 ? "198.51.100" : "203.0.113"}.${1 + Math.floor(((value * 2) % 1) * 254)}`;
      default: return token;
    }
  });
}

/** 각 로그 칸은 자기 구간 안의 고정된 순간에 찍혀 시간 순서가 뒤집히지 않는다. */
function logSlotTime(start: number, seq: number): number {
  return start + seq * LOG_SLOT_MS + Math.floor(hash(seq * 17 + 5) * LOG_SLOT_MS);
}

function logLine(seq: number, startsAt: string, endsAt: string, time: number): RecoveryLogLine {
  const clock = formatKstClock(time);
  if (seq < OPENING_LOG.length) return { seq, time: clock, ...OPENING_LOG[seq] };
  const stage = recoveryStageIndex(recoveryProgress(startsAt, endsAt, time));
  if (hash(seq * 11 + 3) < THREAT_RATE[stage]) {
    return { seq, time: clock, tag: "BLOCK", tone: "threat", text: fillTemplate(pick(THREAT_LOG, seq * 11 + 4), seq) };
  }
  const template = pick(LOG_TEMPLATES[stage], seq * 11 + 5);
  return { seq, time: clock, tag: template.tag, tone: template.tone, text: fillTemplate(template.text, seq) };
}

export function recoveryLog(startsAt: string, endsAt: string, now: number, count: number): RecoveryLogLine[] {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start) || !(now >= start)) return [];
  let last = Math.floor((now - start) / LOG_SLOT_MS);
  if (logSlotTime(start, last) > now) last -= 1;
  const lines: RecoveryLogLine[] = [];
  for (let seq = Math.max(0, last - count + 1); seq <= last; seq += 1) {
    lines.push(logLine(seq, startsAt, endsAt, logSlotTime(start, seq)));
  }
  return lines;
}

/** 게시된 공지(최신순)와 점검 종료 전에 예정된 다음 공지 시각(HH:MM)을 돌려준다. */
export function recoveryUpdates(startsAt: string, endsAt: string, now: number): {
  published: PublishedUpdate[];
  next: string | null;
} {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  const scheduled = RECOVERY_UPDATES.map((update) => {
    const at = start + update.minute * 60_000;
    return { ...update, at, time: formatKstClock(at).slice(0, 5) };
  });
  const upcoming = scheduled.find((update) => update.at > now && update.at < end);
  return {
    published: scheduled.filter((update) => update.at <= now).reverse(),
    next: upcoming?.time ?? null,
  };
}
