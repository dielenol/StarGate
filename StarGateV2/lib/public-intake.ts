export type PublicIntakeKind = "apply" | "contact";
export type PublicIntakeStatus = "OPEN" | "CLOSED";

interface PublicIntakeConfig {
  status: PublicIntakeStatus;
  sealedAtLabel: string;
  closedMessage: string;
}

export const PUBLIC_INTAKE_CONFIG: Readonly<
  Record<PublicIntakeKind, PublicIntakeConfig>
> = {
  apply: {
    status: "CLOSED",
    sealedAtLabel: "2026 · 04 · 24 · 23:59 KST",
    closedMessage: "입회 심사 기록 접수가 마감되었습니다.",
  },
  contact: {
    status: "CLOSED",
    sealedAtLabel: "2026 · 04 · 24 · 23:59 KST",
    closedMessage: "기밀 문의 접수가 마감되었습니다.",
  },
};

export function isPublicIntakeOpen(kind: PublicIntakeKind): boolean {
  return PUBLIC_INTAKE_CONFIG[kind].status === "OPEN";
}

export function getFeatureClosedBody(kind: PublicIntakeKind) {
  return {
    ok: false as const,
    code: "FEATURE_CLOSED" as const,
    message: PUBLIC_INTAKE_CONFIG[kind].closedMessage,
  };
}
