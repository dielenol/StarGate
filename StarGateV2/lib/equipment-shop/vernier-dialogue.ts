export type VernierMood =
  | "welcome"
  | "measure"
  | "clarify"
  | "intake"
  | "accepted"
  | "blocked"
  | "idle";

export const VERNIER_DIALOGUE_LINES = {
  welcome:
    "오셨군요. 공방장 버니어입니다. 이 장비가 어디서 실패하면 안 되는지부터 들려주시겠어요?",
  noAgent:
    "잠깐만요. 제작 대상이 비어 있네요. 누구 장비인지 모르면 치수도, 사용 습관도 잡을 수 없습니다. 주 AGENT부터 연결해 주세요.",
  closed:
    "오늘 접수선은 닫았습니다. 급한 요청이라도 도면보다 사용 기록을 먼저 가져오세요. 내일 제가 직접 확인하겠습니다.",
  upgradePrompt:
    "무엇을 더하고 싶으신가요? 그 대신 포기해도 되는 건 무엇인지 같이 알려주세요.",
  customPrompt:
    "그림처럼 설명하셔도 괜찮습니다. 다만 어디에 쓰고, 어떤 순간에 망가지면 안 되는지는 꼭 남겨 주세요.",
  accepted:
    "접수됐습니다. 바로 손대진 않고, 사용 기록과 치수부터 확인한 뒤 필요한 사람을 부르죠.",
  rejected:
    "잠시만요. 요청서가 접수선에서 멈췄습니다. 같은 내용을 다시 보내기 전에, 빠진 조건부터 함께 확인하죠.",
} as const;

export const VERNIER_MOOD_LABELS: Record<VernierMood, string> = {
  welcome: "요구사항 확인",
  measure: "장비 계측",
  clarify: "조건 정리",
  intake: "설계 접수",
  accepted: "검토 이관",
  blocked: "접수 보류",
  idle: "도면 정리",
};

export const VERNIER_IDLE_LINES: readonly {
  mood: VernierMood;
  text: string;
}[] = [
  {
    mood: "idle",
    text: "음… 치수가 미세하게 남네요. 작아 보여도 그냥 넘기지는 않겠습니다.",
  },
  {
    mood: "clarify",
    text: "'멋있게' 해달라는 요청이 제일 어렵습니다. 사람마다 멋의 단위가 다르거든요.",
  },
  {
    mood: "measure",
    text: "새 장비보다 오래 쓴 장비가 더 많은 걸 말해 줍니다. 닳은 자리는 사용자가 거짓말할 수 없으니까요.",
  },
  {
    mood: "idle",
    text: "완벽한 장비는 없습니다. 다만 어떤 대가를 치르는지 숨기지 않는 장비는 만들 수 있죠.",
  },
  {
    mood: "clarify",
    text: "강하게, 가볍게, 오래. 셋 다 적으셔도 됩니다. 어느 하나가 먼저 무너져도 되는지만 정해 주세요.",
  },
  {
    mood: "measure",
    text: "사용 흔적은 지우지 마세요. 흠집 하나가 도면 열 장보다 정확한 경우도 있으니까요.",
  },
];

function stableLine(lines: readonly string[], seed: string): string {
  const index = Array.from(seed).reduce(
    (sum, char, charIndex) =>
      sum + (char.codePointAt(0) ?? 0) * (charIndex + 1),
    0,
  );
  return lines[index % lines.length] ?? lines[0] ?? "";
}

export function buildVernierWelcomeLine(codename: string | null): string {
  if (!codename) return VERNIER_DIALOGUE_LINES.welcome;
  return `${codename}, 오셨군요. 공방장 버니어입니다. 이 장비가 어디서 실패하면 안 되는지부터 들려주시겠어요?`;
}

export function buildVernierEquipmentLine(args: {
  equipmentName: string;
  codename: string | null;
}): string {
  const lines = [
    `${args.equipmentName}, 사용 기록부터 볼게요. 부족했던 순간이 언제였는지 기억나시나요?`,
    `${args.equipmentName}을 강화하시는군요. 무게, 출력, 정비 주기 중 무엇을 꼭 지켜야 할까요?`,
    `${args.equipmentName}의 닳은 자리는 그대로 두세요. 어느 동작에서 힘이 몰렸는지 확인해 보죠.`,
  ] as const;
  return stableLine(lines, `${args.codename ?? "VISITOR"}:${args.equipmentName}`);
}
