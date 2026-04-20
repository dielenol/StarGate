/**
 * 디스코드에서 복사된 플레이어블 AGENT 시트 텍스트를 파싱해 Draft 객체로 변환.
 *
 * 순수 함수. 외부 의존성 없음 (fetch/DB 접근 금지).
 */

import type { AgentSheet } from "@/types/character";

export type ParsedCharacterDraft = {
  suggestedCodename: string;
  name: string;
  sheet: Partial<AgentSheet>;
  lore: string;
  rawText: string;
};

/* ── 라벨 → AgentSheet 필드 매핑 ──
 *
 * 값 타입이 string인 필드만 다룬다 (Partial<AgentSheet>에 동적 대입 시
 * union 타입이 never로 좁혀지는 문제를 피하기 위해 key 타입을 string-value 필드로 제한).
 */

type StringKeysOf<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

type AgentSheetStringKey = StringKeysOf<AgentSheet>;

const LABEL_TO_FIELD: Record<string, AgentSheetStringKey> = {
  성별: "gender",
  직업: "className",
  나이: "age",
  신장: "height",
  체중: "weight",
};

/* ── 라인 패턴 ── */

// 헤더: [ 값 ]  (내부에 ':' 없음)
const HEADER_RE = /^\s*\[\s*([^\][:]+?)\s*\]\s*$/;

// 능력 헤더: [ 능력명 : 값 ]
const ABILITY_HEADER_RE = /^\s*\[\s*능력명\s*:\s*(.+?)\s*\]\s*$/;

// 파이프 라벨: 라벨 | 값
const PIPE_RE = /^\s*(.+?)\s*\|\s*(.+?)\s*$/;

// 번호+쉼표 시작 문단: "01, ..." "12, ..."
const NUMBERED_RE = /^\s*\d+,\s*.+/;

// 따옴표 줄: "..." 또는 “...”
const QUOTE_RE = /^\s*["“](.+?)["”]\s*$/;

/* ── Parser ── */

function createEmptyDraft(): ParsedCharacterDraft {
  return {
    suggestedCodename: `AGENT_${Date.now().toString(36).toUpperCase()}`,
    name: "",
    sheet: {},
    lore: "",
    rawText: "",
  };
}

export function parseCharacterText(raw: string): ParsedCharacterDraft {
  const draft = createEmptyDraft();
  draft.rawText = raw;

  if (!raw || !raw.trim()) {
    return draft;
  }

  const lines = raw.split(/\r?\n/);
  const loreParts: string[] = [];
  let headerFound = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1) 능력 헤더 — 헤더보다 먼저 체크 (둘 다 '['로 시작)
    //    abilityType는 첫 등장만 채택. 이후 능력 블록은 rawText로만 보존.
    const abilityMatch = trimmed.match(ABILITY_HEADER_RE);
    if (abilityMatch) {
      if (draft.sheet.abilityType === undefined) {
        draft.sheet.abilityType = abilityMatch[1].trim();
      }
      continue;
    }

    // 2) 첫 번째 일반 헤더 → name
    if (!headerFound) {
      const headerMatch = trimmed.match(HEADER_RE);
      const headerValue = headerMatch?.[1].trim();
      if (headerValue) {
        draft.name = headerValue;
        draft.sheet.name = headerValue;
        headerFound = true;
        continue;
      }
    } else {
      // 두 번째 이후 일반 헤더(능력 헤더 제외)는 무시
      if (HEADER_RE.test(trimmed)) {
        continue;
      }
    }

    // 3) 파이프 라벨
    const pipeMatch = trimmed.match(PIPE_RE);
    if (pipeMatch) {
      const label = pipeMatch[1].trim();
      const value = pipeMatch[2].trim();
      const field = LABEL_TO_FIELD[label];
      if (field) {
        draft.sheet[field] = value;
      }
      continue;
    }

    // 4) 번호+쉼표 문단 → lore
    if (NUMBERED_RE.test(trimmed)) {
      loreParts.push(trimmed);
      continue;
    }

    // 5) 따옴표 줄 → quote
    const quoteMatch = trimmed.match(QUOTE_RE);
    if (quoteMatch) {
      draft.sheet.quote = quoteMatch[1].trim();
      continue;
    }

    // 그 외 라인은 무시
  }

  draft.lore = loreParts.join("\n\n");

  return draft;
}
