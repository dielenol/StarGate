import type { DialogueSourceDefinition } from "./types.ts";

/**
 * 대사 품질 도구의 유일한 소스 등록부입니다.
 *
 * 런타임 모듈을 import하지 않고 TypeScript 소스의 정적 문자열만 읽습니다.
 * 신규 화자를 추가할 때는 런타임 파일 대신 이 목록을 갱신하세요.
 */
export const DIALOGUE_SOURCE_MANIFEST = [
  {
    speakerId: "ameri",
    displayName: "아메리",
    voiceCard:
      "피곤하지만 정확한 행정관. 정중한 존댓말과 서류·결재 비유, 건조한 유머를 짧게 섞는다.",
    allowedProperNouns: [
      "AGENT",
      "아메리",
      "이레나",
      "토와스키",
      "브리짓",
      "아케론",
      "마테오",
      "버니어",
    ],
    relativePath: "lib/equipment-shop/ameri-dialogue.ts",
  },
  {
    speakerId: "towaski",
    displayName: "토와스키",
    voiceCard:
      "짧고 단호한 반말과 명령형을 쓴다. 안전·식별·절차를 점수보다 우선하고 군더더기를 피한다.",
    allowedProperNouns: ["토와스키", "TARGET", "PROTECTED"],
    relativePath: "lib/equipment-shop/towaski-dialogue.ts",
  },
  {
    speakerId: "suture",
    displayName: "수처",
    voiceCard:
      "차분한 임상 존댓말. 환자의 동의와 안전을 먼저 확인하고, 신체 감각을 인간적으로 설명한다.",
    allowedProperNouns: ["수처", "AGENT", "ATK", "DEF", "HP", "SAN"],
    relativePath: "lib/equipment-shop/suture-dialogue.ts",
  },
  {
    speakerId: "temper",
    displayName: "템퍼",
    voiceCard:
      "거친 반말을 쓰는 장인. 손의 감각·균형·파손을 비유하며 상품보다 제작자의 책임을 강조한다.",
    allowedProperNouns: [
      "템퍼",
      "토와스키",
      "아케론",
      "브리짓",
      "AGENT",
      "RF2",
      "RF3",
    ],
    relativePath: "lib/equipment-shop/temper-dialogue.ts",
  },
  {
    speakerId: "ratchet",
    displayName: "라쳇",
    voiceCard:
      "붙임성 있고 공손한 현장 정비사. 짧은 확인 질문과 혼잣말, 끊어 말하기를 섞고 ‘-요’를 중심으로 운용·정비·회수 조건을 실무적으로 짚는다.",
    allowedProperNouns: [
      "라쳇",
      "AGENT",
      "CH-47",
      "치누크",
      "UH-60",
      "블랙 호크",
      "HMMWV",
      "M1",
      "에이브람스",
      "HEMTT",
      "EMP",
    ],
    relativePath: "lib/equipment-shop/strategic-dialogue.ts",
  },
  {
    speakerId: "vernier",
    displayName: "버니어",
    voiceCard:
      "침착하고 사려 깊은 공방장. 존댓말로 측정값·실패 조건·감수할 대가를 먼저 묻는다.",
    allowedProperNouns: ["버니어", "AGENT"],
    relativePath: "lib/equipment-shop/vernier-dialogue.ts",
  },
  {
    speakerId: "tia",
    displayName: "띠아",
    voiceCard:
      "밝고 생활감 있는 편의점 직원. 부드러운 존댓말과 가벼운 말끝 ‘~’를 쓰되 결제 안내는 명확히 한다.",
    allowedProperNouns: ["띠아", "스타마트", "AGENT", "GM"],
    relativePath: "lib/shop/tia-dialogue.ts",
  },
  {
    speakerId: "r05",
    displayName: "R-05",
    voiceCard:
      "침착한 합성 훈련 교관. 현재 상태를 짧게 알리고 다음 행동 하나만 일상적인 안내형으로 말하며, 같은 명령형 종결을 반복하지 않는다.",
    allowedProperNouns: ["R-05", "AGENT", "ATK", "DEF", "HP", "SAN"],
    relativePath:
      "app/(erp)/erp/equipment-shop/simulator/EquipmentSimulatorClient.tsx",
    propertyNames: ["speech"],
    variableNames: ["executionBlocker", "instructorBrief"],
  },
  {
    speakerId: "faction",
    displayName: "세력 연락관",
    voiceCard:
      "세력별 연락관 어조를 유지한다. 이사회는 심의체, 군부는 단문 명령체, 민간·백장미는 보호 중심 존댓말, 스페이스 제로는 계약 실무체, 적대 추적선은 검증 중심 보고체다.",
    allowedProperNouns: [
      "이사회",
      "백장미",
      "스페이스 제로",
      "NOVUS ORDO",
      "WHITE ROSE",
      "SPACE ZERO",
      "GOLDEN DAWN",
      "AHNENERBE",
      "황금여명회",
      "아넨에르베",
    ],
    relativePath: "app/(erp)/erp/factions/_game.ts",
    propertyNames: [
      "idleLines",
      "previewLine",
      "confirmedLine",
      "errorLine",
    ],
    variableNames: [
      "COUNCIL_DIALOGUE",
      "MILITARY_DIALOGUE",
      "CIVIL_DIALOGUE",
      "WHITE_ROSE_DIALOGUE",
      "SPACE_ZERO_DIALOGUE",
      "GOLDEN_DAWN_DIALOGUE",
      "AHNENERBE_DIALOGUE",
    ],
  },
] as const satisfies readonly DialogueSourceDefinition[];

export const DIALOGUE_SPEAKER_IDS = DIALOGUE_SOURCE_MANIFEST.map(
  ({ speakerId }) => speakerId,
);
