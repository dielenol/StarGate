/**
 * 디스코드에서 복사된 플레이어블 AGENT 시트 텍스트를 파싱해 Draft 객체로 변환.
 *
 * 순수 함수. 외부 의존성 없음 (fetch/DB 접근 금지).
 *
 * Phase 1 sheet 분리 이후 결과는 lore/play 두 sub-document partial 로 산출.
 *  - lore: name, gender, age, height, weight, quote
 *  - play: className, abilityType
 */

import type { LoreSheet, PlaySheet } from "@/types/character";

export type ParsedCharacterDraft = {
  suggestedCodename: string;
  name: string;
  /** lore 영역 partial — 외형/성격/배경 같은 긴 서술은 lore 본문 산문에 포함되어 따로 다룬다. */
  lore: Partial<LoreSheet>;
  /** play 영역 partial — Discord 시트는 className / abilityType 만 안정적 추출 가능. */
  play: Partial<PlaySheet>;
  /** 산문/번호 문단 lore body. characters.loreMd 로 적재. */
  loreMd: string;
  rawText: string;
};

/* ── 라벨 매핑 ──
 * Discord 시트 라벨 → (lore | play) 도메인 + 필드명.
 * value 타입은 모두 string. play 의 hp/san/def/atk 같은 number 필드는 본 파서가 처리하지 않는다 (수동 입력).
 */

type LoreStringKey = Exclude<keyof LoreSheet, "loreTags" | "appearsInEvents">;
type PlayStringKey = Extract<keyof PlaySheet, "className" | "abilityType">;

interface FieldRoute {
  domain: "lore" | "play";
  field: LoreStringKey | PlayStringKey;
}

const LABEL_TO_FIELD: Record<string, FieldRoute> = {
  성별: { domain: "lore", field: "gender" },
  나이: { domain: "lore", field: "age" },
  신장: { domain: "lore", field: "height" },
  체중: { domain: "lore", field: "weight" },
  직업: { domain: "play", field: "className" },
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
    lore: {},
    play: {},
    loreMd: "",
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
    //    abilityType 는 첫 등장만 채택. 이후 능력 블록은 rawText/loreMd 로만 보존.
    const abilityMatch = trimmed.match(ABILITY_HEADER_RE);
    if (abilityMatch) {
      if (draft.play.abilityType === undefined) {
        draft.play.abilityType = abilityMatch[1].trim();
      }
      continue;
    }

    // 2) 첫 번째 일반 헤더 → name (lore.name)
    if (!headerFound) {
      const headerMatch = trimmed.match(HEADER_RE);
      const headerValue = headerMatch?.[1].trim();
      if (headerValue) {
        draft.name = headerValue;
        draft.lore.name = headerValue;
        headerFound = true;
        continue;
      }
    } else {
      // 두 번째 이후 일반 헤더(능력 헤더 제외)는 무시
      if (HEADER_RE.test(trimmed)) {
        continue;
      }
    }

    // 3) 파이프 라벨 → lore/play 분기
    const pipeMatch = trimmed.match(PIPE_RE);
    if (pipeMatch) {
      const label = pipeMatch[1].trim();
      const value = pipeMatch[2].trim();
      const route = LABEL_TO_FIELD[label];
      if (route) {
        if (route.domain === "lore") {
          (draft.lore as Record<string, string>)[route.field] = value;
        } else {
          (draft.play as Record<string, string>)[route.field] = value;
        }
      }
      continue;
    }

    // 4) 번호+쉼표 문단 → lore body (loreMd)
    if (NUMBERED_RE.test(trimmed)) {
      loreParts.push(trimmed);
      continue;
    }

    // 5) 따옴표 줄 → quote (lore.quote)
    const quoteMatch = trimmed.match(QUOTE_RE);
    if (quoteMatch) {
      draft.lore.quote = quoteMatch[1].trim();
      continue;
    }

    // 그 외 라인은 무시
  }

  draft.loreMd = loreParts.join("\n\n");

  return draft;
}
