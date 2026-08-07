export const CENSOR3_MANUFACTURE_VOTE_PRESET_KEY =
  "zulu-0028-censor-3-manufacture-v1";

export interface BureaucratVotePreset {
  key: string;
  category: string;
  title: string;
  summary: string;
  content: string;
}

/**
 * REGISTRAR의 관료 공지 문체로 확정된 고정 안건.
 * 표결은 제작 권한만 승인하며 공방의 재료·제작·지급 mutation과 결합하지 않는다.
 */
export const CENSOR3_MANUFACTURE_VOTE_PRESET: BureaucratVotePreset = {
  key: CENSOR3_MANUFACTURE_VOTE_PRESET_KEY,
  category: "특수 자산 가공 승인",
  title: "ZULU-0028 파쇄음절탄 「CENSOR-3」 제작 승인",
  summary:
    "깨진 음절 3개를 가공해 네베드 전용 CENSOR-3 3발을 제작할 권한을 심의합니다.",
  content: [
    "**안건 분류** · 특수 자산 가공 승인",
    "",
    "**심의 대상**",
    "ZULU-0028 「검열된 비명」 교전 전리품 — 깨진 음절 ×3",
    "",
    "**승인 요청**",
    "ZULU-0028 파쇄음절탄 「CENSOR-3」 ×3 제작",
    "전용 운용자 · 네베드",
    "",
    "**운용 효과**",
    "「피안의 보루」의 기본 소총 피해에 고정 30의 방어 무시 심령 피해를 추가합니다.",
    "",
    "**운용 조건**",
    "- 「피안의 보루」 장착 및 거치 상태",
    "- U2 「파쇄음절탄 사격」으로만 사용",
    "- 사격 시 액션 1과 CENSOR-3 1발 소모",
    "- 일반 탄약은 소모하지 않음",
    "- 총기 기본 피해와 추가 심령 피해를 함께 판정",
    "",
    "**결재 범위**",
    "본 안건은 회수된 깨진 음절 3개를 가공하여 CENSOR-3 3발을 제작할 권한의 승인 여부만 확정합니다.",
    "",
    "가결은 제작 권한 부여를 의미합니다. 재료 차감·제작 착수·완성품 지급은 본 표결의 집행 범위에 포함하지 않으며, 공방 운영 절차에서 별도로 처리합니다.",
  ].join("\n"),
};

export const BUREAUCRAT_VOTE_PRESETS = [
  CENSOR3_MANUFACTURE_VOTE_PRESET,
] as const satisfies readonly BureaucratVotePreset[];

export function findBureaucratVotePreset(
  key: string,
): BureaucratVotePreset | null {
  return BUREAUCRAT_VOTE_PRESETS.find((preset) => preset.key === key) ?? null;
}
