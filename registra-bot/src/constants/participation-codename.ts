/**
 * 참여확인 인사용: 디스코드 표시명(길드 닉네임 우선) → 플레이어블 코드네임
 *
 * @see README.md «Discord Nickname → Character Name»
 */

const RULES: readonly { keys: readonly string[]; codename: string }[] = [
  { keys: ["춤추기사랑하기노래부르기"], codename: "빅보이" },
  { keys: ["라면"], codename: "클라운" },
  { keys: ["모스"], codename: "인덱서" },
  { keys: ["세슘"], codename: "메리골드" },
  { keys: ["대형마법"], codename: "우디" },
  { keys: ["Bush Dog"], codename: "네베드" },
  { keys: ["힘이"], codename: "타이거" },
  { keys: ["Arkaiyu"], codename: "마리아" },
  { keys: ["치자도우"], codename: "이동식" },
  { keys: ["버터누나"], codename: "오틸리아" },
  { keys: ["홀로서기"], codename: "운연" },
  { keys: ["순대", "soondae"], codename: "크로노스" },
  { keys: ["pitboy", "흑우", "레놀"], codename: "관리자님" },
];

function keyMatchesDisplay(key: string, displayTrimmed: string): boolean {
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(key)) {
    return displayTrimmed === key;
  }
  return displayTrimmed.toLowerCase() === key.toLowerCase();
}

/**
 * 표시명이 매핑표에 있으면 코드네임, 없으면 `null`
 */
export function resolveParticipationCodename(displayName: string): string | null {
  const d = displayName.trim();
  if (!d) return null;
  for (const rule of RULES) {
    for (const key of rule.keys) {
      if (keyMatchesDisplay(key, d)) return rule.codename;
    }
  }
  return null;
}
