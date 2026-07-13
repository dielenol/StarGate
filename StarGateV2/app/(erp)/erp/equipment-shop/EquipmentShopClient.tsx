"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type CreditsResponse,
  useCredits,
} from "@/hooks/queries/useCreditsQuery";
import { useNpcDialogue } from "@/hooks/useNpcDialogue";
import {
  type EquipmentResearchScope,
  useCompleteEquipmentResearch,
  useContributeEquipmentResearch,
  useAcceptEquipmentWorkshopQuote,
  useClaimEquipmentWorkshopResult,
  useDeclineEquipmentWorkshopQuote,
  useEquipmentShopQuote,
  useEquipmentWorkshopRequest,
  useUpdateEquipmentWorkshopRequest,
  usePurchaseEquipmentShopItem,
  useRegisterTowaskiArmorReferral,
  useRushEquipmentResearch,
  useStartEquipmentResearch,
} from "@/hooks/mutations/useEquipmentShopMutation";
import {
  EquipmentShopApiError,
  type EquipmentShopCatalogEntry,
  type EquipmentShopCatalogResponse,
  type EquipmentShopErrorCode,
  type EquipmentResearchOverviewResponse,
  type EquipmentResearchProjectEntry,
  useEquipmentShopCatalog,
  useEquipmentResearch,
  useEquipmentWorkshopRequests,
} from "@/hooks/queries/useEquipmentShopQuery";
import { useCharacterInventory } from "@/hooks/queries/useInventoryQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import { describeApiError } from "@/lib/api/describe-error";
import {
  requiresEquipmentWorkshopOperatorNote,
  type EquipmentWorkshopComputedStatus,
  type EquipmentWorkshopRequestStatus,
  type EquipmentWorkshopSpecialist,
} from "@/lib/equipment-shop/workshop-request";
import {
  AMERI_DIALOGUE_LINES,
  AMERI_IDLE_LINES,
  AMERI_MOOD_LABELS,
  buildAmeriDestinationLine,
  buildAmeriWelcomeLine,
  type AmeriMood,
} from "@/lib/equipment-shop/ameri-dialogue";
import {
  getTowaskiLicenseTestProgram,
  TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
} from "@/lib/equipment-shop/license-test";
import {
  hasTowaskiBasicPurchaseAccess,
  isTowaskiLicenseSlug,
  type TowaskiLicenseSlug,
} from "@/lib/equipment-shop/licenses";
import {
  hasEquipmentShopZonePurchaseAccess,
  requiresTowaskiBasicLicense,
} from "@/lib/equipment-shop/purchase-zone-access";
import {
  getTowaskiDialogueContext,
  getTowaskiQualificationDialogueLine,
  shouldScheduleTowaskiShopIdle,
  type TowaskiQualificationDialogueEvent,
} from "@/lib/equipment-shop/towaski-dialogue";
import {
  buildTemperArmorReferralLine,
  buildTemperBlockedLine,
  buildTemperCartLine,
  buildTemperCheckoutLine,
  buildTemperItemLine,
  buildTemperTabLine,
  buildTemperWelcomeLine,
  TEMPER_DIALOGUE_LINES,
  TEMPER_IDLE_LINES,
  TEMPER_MOOD_LABELS,
  type TemperMood,
} from "@/lib/equipment-shop/temper-dialogue";
import {
  buildStrategicCheckoutLine,
  buildStrategicDispatchLine,
  buildStrategicItemLine,
  buildStrategicWelcomeLine,
  STRATEGIC_DIALOGUE_LINES,
  STRATEGIC_IDLE_LINES,
  STRATEGIC_MOOD_LABELS,
  type StrategicMood,
} from "@/lib/equipment-shop/strategic-dialogue";
import {
  getStrategicScene,
  STRATEGIC_SCENE_INFO,
  STRATEGIC_SCENE_REFRESH_MS,
  type StrategicScene,
} from "@/lib/equipment-shop/strategic-scene";
import {
  buildSutureBlockedLine,
  buildSutureContributionLine,
  buildSutureNodeLine,
  buildSutureRecoveryLine,
  buildSutureResearchStartedLine,
  buildSutureRushLine,
  buildSutureScopeLine,
  buildSutureWelcomeLine,
  SUTURE_DEBUG_LINES,
  SUTURE_DIALOGUE_LINES,
  SUTURE_IDLE_LINES,
  SUTURE_MOOD_LABELS,
  type SutureBlockReason,
  type SutureMood,
} from "@/lib/equipment-shop/suture-dialogue";
import {
  buildVernierEquipmentLine,
  buildVernierWelcomeLine,
  VERNIER_DIALOGUE_LINES,
  VERNIER_IDLE_LINES,
  VERNIER_MOOD_LABELS,
  type VernierMood,
} from "@/lib/equipment-shop/vernier-dialogue";
import { ArmoryZoneIcon } from "@/lib/equipment-shop/zone-icons";
import { WORKSHOP_REQUEST_DETAIL_MIN_LENGTH } from "@/lib/equipment-shop/workshop-request";
import { formatCredits } from "@/lib/format/credit";
import {
  DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
  describeEquipmentResearchEffect,
  type EquipmentResearchStat,
  getEquipmentResearchPrerequisiteTier,
  isEquipmentResearchApplyLeaseStale,
  isEquipmentResearchEffectOperational,
  quoteEquipmentResearchRush,
  quoteEquipmentResearchStart,
  scopeLabel,
} from "@/lib/equipment-shop/research";

import ShopItemIcon from "../shop/ShopItemIcon";

import TowaskiLicenseTest from "./TowaskiLicenseTest";
import styles from "./page.module.css";

type ArmoryZone = "lab" | "towaski" | "acheron" | "strategic" | "custom";
type ArmoryDestination = ArmoryZone | "simulator";
type EquipmentShopMode = "hub" | "zone";
type EquipmentShopTabValue =
  | "ALL"
  | "WEAPON"
  | "ARMOR"
  | "CONSUMABLE"
  | "LICENSE";

const WORKSHOP_STATUS_LABELS: Record<
  EquipmentWorkshopRequestStatus,
  string
> = {
  REQUESTED: "접수",
  IN_REVIEW: "검토 중",
  APPROVED: "기존 승인",
  QUOTED: "견적 도착",
  IN_PROGRESS: "제작 중",
  DECLINED: "견적 거절",
  REJECTED: "반려",
  CANCELLED: "제작 취소",
  COMPLETED: "완료",
};
const WORKSHOP_NEXT_STATUSES: Record<
  EquipmentWorkshopRequestStatus,
  readonly EquipmentWorkshopRequestStatus[]
> = {
  REQUESTED: ["IN_REVIEW", "APPROVED", "REJECTED"],
  IN_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["COMPLETED", "REJECTED"],
  QUOTED: ["REJECTED"],
  IN_PROGRESS: [],
  DECLINED: [],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};
type FeedbackTone = "success" | "info" | "error";
type NoticeState = {
  tone: Exclude<FeedbackTone, "error">;
  title: string;
  text: string;
} | null;
type FeedbackState = {
  id: number;
  tone: FeedbackTone;
  title: string;
  detail: string;
} | null;
type TowaskiDebugMode = "live" | "unlicensed" | "licensed" | "no-agent";
type MainCharacterStats = Record<EquipmentResearchStat, number>;
type TowaskiMood =
  | "welcome"
  | "inspect"
  | "stock"
  | "cart"
  | "license"
  | "checkout"
  | "range"
  | "rangeFailed"
  | "blocked"
  | "idle";
type SutureDebugMode = "live" | SutureMood;
type MainCharacterProfile = "assault" | "guard" | "endurance" | "focus" | "balanced";
type ArmoryZoneDef = {
  value: ArmoryDestination;
  href: string;
  label: string;
  eyebrow: string;
  description: string;
  npc: string;
};

const TOWASKI_PROFILE_SRC = "/assets/npcs/Towaski-profile.webp?v=cutout-1";
const TOWASKI_PORTRAIT_SRC = "/assets/npcs/Towaski-profile.webp?v=cutout-1";
const TOWASKI_IDLE_DELAY_MS = 12000;
const AMERI_PROFILE_SRC = "/assets/npcs/Ameri-main-image.webp";
const AMERI_IDLE_DELAY_MS = 13500;
const SUTURE_PROFILE_SRC = "/assets/npcs/Irena-Vukovic-Suture-profile.webp";
const SUTURE_IDLE_DELAY_MS = 14000;
const TEMPER_PROFILE_SRC = "/assets/npcs/Brigid-Kane-Temper-profile.webp";
const TEMPER_IDLE_DELAY_MS = 13000;
const TEMPER_ENTRY_SFX_SRC =
  "/assets/equipment-shop/sfx/temper-forge-double-strike.m4a";
const RATCHET_PROFILE_SRC = "/assets/npcs/Mateo-Rivas-Ratchet-profile.webp";
const RATCHET_IDLE_DELAY_MS = 12500;
const VERNIER_PROFILE_SRC = "/assets/npcs/Ada-Schreiber-Vernier-profile.webp";

const WORKSHOP_SPECIALISTS: Record<
  EquipmentWorkshopSpecialist,
  { label: string; portrait: string }
> = {
  VERNIER: { label: "VERNIER · 접수/종합", portrait: VERNIER_PROFILE_SRC },
  TEMPER: { label: "TEMPER · 냉병기", portrait: TEMPER_PROFILE_SRC },
  TOWASKI: { label: "TOWASKI · 화기", portrait: TOWASKI_PROFILE_SRC },
  SUTURE: { label: "SUTURE · 증강체", portrait: SUTURE_PROFILE_SRC },
  RATCHET: { label: "RATCHET · 전략 장비", portrait: RATCHET_PROFILE_SRC },
};

function workshopDialogue(
  specialist: EquipmentWorkshopSpecialist,
  status: EquipmentWorkshopComputedStatus,
): string {
  const name = WORKSHOP_SPECIALISTS[specialist].label.split(" · ")[0];
  if (status === "QUOTED") return `${name}: 견적과 납품 목록을 확인해. 수락하면 바로 분해 공정에 들어간다.`;
  if (status === "IN_PROGRESS") return `${name}: 작업대에 올라갔다. 완료 시각 전에는 장비를 되돌릴 수 없다.`;
  if (status === "READY") return `${name}: 개조 완료. 수령하면 현재 슬롯을 정리하고 결과 장비를 장착한다.`;
  if (status === "COMPLETED") return `${name}: 인계 기록 완료. 현장에서 다시 점검해.`;
  if (status === "DECLINED") return `${name}: 견적 거절 확인. 원본 장비에는 손대지 않았다.`;
  if (status === "CANCELLED") return `${name}: 제작 취소 처리. 에스크로 물품과 비용을 반환했다.`;
  if (status === "REJECTED") return `${name}: 현재 조건으로는 작업을 진행할 수 없다.`;
  return "VERNIER: 요청을 접수했다. 담당 기술자 배정과 견적을 기다려 줘.";
}

function workshopPortrait(
  specialist: EquipmentWorkshopSpecialist,
  status: EquipmentWorkshopComputedStatus,
): string {
  const blocked = status === "DECLINED" || status === "REJECTED" || status === "CANCELLED";
  if (specialist === "TEMPER") {
    return blocked
      ? "/assets/npcs/Brigid-Kane-Temper-blocked.webp"
      : status === "QUOTED"
        ? "/assets/npcs/Brigid-Kane-Temper-balance.webp"
        : status === "IN_PROGRESS"
          ? "/assets/npcs/Brigid-Kane-Temper-cart.webp"
          : "/assets/npcs/Brigid-Kane-Temper-checkout.webp";
  }
  if (specialist === "TOWASKI") {
    return blocked
      ? "/assets/npcs/Towaski-blocked.webp?v=cutout-1"
      : status === "QUOTED"
        ? "/assets/npcs/Towaski-inspect.webp?v=cutout-1"
        : "/assets/npcs/Towaski-checkout.webp?v=cutout-1";
  }
  if (specialist === "SUTURE") {
    return blocked
      ? "/assets/npcs/Irena-Vukovic-Suture-blocked.webp?v=clean-stop-2"
      : status === "QUOTED"
        ? "/assets/npcs/Irena-Vukovic-Suture-assessment.webp"
        : status === "IN_PROGRESS"
          ? "/assets/npcs/Irena-Vukovic-Suture-procedure.webp"
          : "/assets/npcs/Irena-Vukovic-Suture-recovery.webp";
  }
  if (specialist === "RATCHET") {
    return blocked
      ? "/assets/npcs/Mateo-Rivas-Ratchet-blocked.webp"
      : status === "QUOTED"
        ? "/assets/npcs/Mateo-Rivas-Ratchet-inspect.webp"
        : status === "IN_PROGRESS"
          ? "/assets/npcs/Mateo-Rivas-Ratchet-dispatch.webp"
          : "/assets/npcs/Mateo-Rivas-Ratchet-checkout.webp";
  }
  return VERNIER_PROFILE_SRC;
}
const VERNIER_IDLE_DELAY_MS = 13200;

const AMERI_MOOD_ASSETS: Record<AmeriMood, string> = {
  welcome: "/assets/npcs/Ameri-welcome.webp",
  routing: "/assets/npcs/Ameri-routing.webp",
  review: "/assets/npcs/Ameri-review.webp",
  blocked: "/assets/npcs/Ameri-blocked.webp",
  idle: "/assets/npcs/Ameri-idle.webp",
};

const RATCHET_MOOD_ASSETS: Record<StrategicMood, string> = {
  welcome: RATCHET_PROFILE_SRC,
  inspect: "/assets/npcs/Mateo-Rivas-Ratchet-inspect.webp",
  systems: "/assets/npcs/Mateo-Rivas-Ratchet-systems.webp",
  dispatch: "/assets/npcs/Mateo-Rivas-Ratchet-dispatch.webp",
  checkout: "/assets/npcs/Mateo-Rivas-Ratchet-checkout.webp",
  blocked: "/assets/npcs/Mateo-Rivas-Ratchet-blocked.webp",
  idle: "/assets/npcs/Mateo-Rivas-Ratchet-idle.webp",
};

const TEMPER_MOOD_ASSETS: Record<TemperMood, string> = {
  welcome: TEMPER_PROFILE_SRC,
  inspect: "/assets/npcs/Brigid-Kane-Temper-inspect.webp",
  balance: "/assets/npcs/Brigid-Kane-Temper-balance.webp",
  cart: "/assets/npcs/Brigid-Kane-Temper-cart.webp",
  checkout: "/assets/npcs/Brigid-Kane-Temper-checkout.webp",
  blocked: "/assets/npcs/Brigid-Kane-Temper-blocked.webp",
  idle: "/assets/npcs/Brigid-Kane-Temper-idle.webp",
};

const SUTURE_MOOD_ASSETS: Record<SutureMood, string> = {
  welcome: "/assets/npcs/Irena-Vukovic-Suture-welcome.webp",
  assessment: "/assets/npcs/Irena-Vukovic-Suture-assessment.webp",
  protocol: "/assets/npcs/Irena-Vukovic-Suture-protocol.webp",
  funding: "/assets/npcs/Irena-Vukovic-Suture-funding.webp",
  procedure: "/assets/npcs/Irena-Vukovic-Suture-procedure.webp",
  recovery: "/assets/npcs/Irena-Vukovic-Suture-recovery.webp",
  blocked: "/assets/npcs/Irena-Vukovic-Suture-blocked.webp?v=clean-stop-2",
  idle: "/assets/npcs/Irena-Vukovic-Suture-idle.webp",
};

const SUTURE_DEBUG_MODES: readonly {
  value: SutureDebugMode;
  label: string;
}[] = [
  { value: "live", label: "실제 상태" },
  { value: "welcome", label: "입장 인사" },
  { value: "assessment", label: "생체 판독" },
  { value: "protocol", label: "연구 설명" },
  { value: "funding", label: "재원 검토" },
  { value: "procedure", label: "시술 준비" },
  { value: "recovery", label: "회복 관찰" },
  { value: "blocked", label: "승인 거부" },
  { value: "idle", label: "의체 정비" },
];

const TOWASKI_DEBUG_MODES: readonly {
  value: TowaskiDebugMode;
  label: string;
}[] = [
  { value: "live", label: "실제 GM" },
  { value: "unlicensed", label: "무면허" },
  { value: "licensed", label: "면허 보유" },
  { value: "no-agent", label: "AGENT 없음" },
];

const TOWASKI_MOOD_ASSETS: Record<TowaskiMood, string> = {
  welcome: "/assets/npcs/Towaski-welcome.webp?v=cutout-1",
  inspect: "/assets/npcs/Towaski-inspect.webp?v=cutout-1",
  stock: "/assets/npcs/Towaski-stock.webp?v=cutout-1",
  cart: "/assets/npcs/Towaski-cart.webp?v=cutout-1",
  license: "/assets/npcs/Towaski-checkout.webp?v=cutout-1",
  checkout: "/assets/npcs/Towaski-checkout.webp?v=cutout-1",
  range: "/assets/npcs/Towaski-blocked.webp?v=cutout-1",
  rangeFailed: "/assets/npcs/Towaski-blocked.webp?v=cutout-1",
  blocked: "/assets/npcs/Towaski-blocked.webp?v=cutout-1",
  idle: "/assets/npcs/Towaski-idle.webp?v=cutout-1",
};

const TOWASKI_MOOD_LABELS: Record<TowaskiMood, string> = {
  welcome: "입점 확인",
  inspect: "품목 감정",
  stock: "재고 판정",
  cart: "반출 준비",
  license: "라이센스 발급",
  checkout: "반출 승인",
  range: "사격 감독",
  rangeFailed: "시험 탈락",
  blocked: "반출 거부",
  idle: "정비 중",
};

const TOWASKI_DIALOGUE_LINES = {
  welcome: "토와스키다. 반출 장부에 남길 물건만 손대.",
  noAgent: "반출 명단에 네 이름이 안 뜬다. 사무국에서 신원표부터 갱신하고 와.",
  closed: "카운터 닫았다. 급하면 반출 승인권자부터 데려와.",
  category:
    "분류부터 보자. 화기, 방호구, 폭발 장구는 허가 줄이 다르다.",
  cart: "반출대에 올렸다. 손에 맞는지는 훈련장에서 확인해.",
  checkout: "반출 처리 끝. 봉인은 뜯지 말고, 작전 전 점검표부터 확인해.",
  licenseIssued:
    "라이센스 발급 끝. 자격 장부 갱신됐으니 해당 품목 반출 조건을 다시 확인해.",
  checkoutError:
    "반출 기록이 막혔다. 잔액, 허가, 재고 중 하나가 장부랑 안 맞아.",
  unavailable:
    "그건 오늘 못 나간다. 빈 칸 쳐다봐도 창고 문은 안 열린다.",
  gmOnly: "여긴 승인 라인이다. 구경은 해도 반출 서명은 따로 받아.",
  qualification:
    "기본 화기 라이센스가 없군. 진열장은 나중이다. 먼저 사격선에서 식별과 명중부터 증명해.",
  qualificationPassed:
    "합격. 기본 화기 라이센스 발급했다. 이제 장부에 이름 올리고 물건을 봐.",
} as const;

const TOWASKI_ARMOR_REFERRAL_LINES = [
  "쇳덩이 성직자 쪽에서도 같은 방호구를 맞춘다. 여기서 규격 봤다고 해. 조율비 10%는 뺄 거야.",
  "입어봤으면 기록 남긴다. TEMPER한테 가도 같은 물건 나온다. 내 열람표가 있으면 중복 측정값은 안 받을 거다.",
  "방호구는 양쪽에서 판다. 난 재고를 보고, 그 여자는 네 몸을 봐. 둘 다 거치면 적어도 같은 값 두 번 내진 않아.",
] as const;

const TOWASKI_IDLE_LINES: readonly { mood: TowaskiMood; text: string }[] = [
  {
    mood: "idle",
    text: "보고만 있을 거면 유리장에 숨결 남기지 마. 닦는 건 내 일이다.",
  },
  {
    mood: "stock",
    text: "수량표 믿지 마. 마지막 한 정은 늘 누가 먼저 눈독 들이고 있어.",
  },
  {
    mood: "inspect",
    text: "총열 안쪽을 보면 전 주인이 보인다. 그래서 반납품은 오래 본다.",
  },
  {
    mood: "idle",
    text: "안 살 거면 총열 앞 막지 말고 한 발 물러서. 물건도 숨은 쉬어야지.",
  },
  {
    mood: "stock",
    text: "반출 서류 기다리는 동안 손은 주머니 밖에 둬. 여기선 그게 예의야.",
  },
  {
    mood: "inspect",
    text: "방호구는 거울 앞에서 고르는 물건이 아니야. 맞기 전에 고르는 물건이지.",
  },
  {
    mood: "idle",
    text: "도미니크 매장처럼 웃어주진 않는다. 여긴 탄창이 웃는 곳이야.",
  },
  {
    mood: "stock",
    text: "탄약 냄새 맡는다고 사격 실력 안 는다. 살 거면 용도를 말해.",
  },
];

const TOWASKI_PROFILE_LINES: Record<MainCharacterProfile, readonly string[]> = {
  assault: [
    "손부터 앞으로 나가는 타입이군. 반동 잡을 물건부터 봐.",
    "화력 욕심은 죄가 아니야. 명중 못 하면 창고 낭비일 뿐이지.",
  ],
  guard: [
    "맞고 버티는 쪽이면 방어구부터 봐. 영웅 흉내는 비싸게 먹혀.",
    "방호구는 자존심보다 싸다. 그 계산은 현장에서 빨리 배우게 돼.",
  ],
  endurance: [
    "오래 구르는 타입이면 소모품을 아끼지 마. 빈손으로 오래 버티는 놈은 없어.",
    "체력 믿고 들어가도 탄과 장갑은 따로 챙겨. 몸은 보급 상자가 아니니까.",
  ],
  focus: [
    "머리가 먼저 도는 타입이군. 반출 조건 끝까지 읽는 손님은 오래 살아.",
    "침착한 놈일수록 안전장치를 확인하지. 그 버릇은 유지해.",
  ],
  balanced: [
    "스펙이 고르게 잡혔군. 그러면 임무 성격에 맞춰 고르면 돼.",
    "특화가 없다는 건 핑계가 아니야. 오늘 필요한 물건만 골라.",
  ],
};

type TowaskiItemDialogue = {
  mood: TowaskiMood;
  inspect: readonly string[];
  cart: readonly string[];
  remove?: readonly string[];
};

const TOWASKI_ITEM_DIALOGUE_LINES = {
  "basic-pistol": {
    mood: "inspect",
    inspect: [
      "권총은 가장 많이 살아남고, 가장 많이 들킨다. 숨길 생각이면 손버릇부터 고쳐.",
      "가벼운 총일수록 거짓말을 못 한다. 네 조준이 그대로 드러나거든.",
    ],
    cart: [
      "권총 한 정 올렸다. 예비 탄창은 반출 기록에 맞춰 챙긴다.",
      "소형 화기 봉인한다. 허리춤에 넣기 전에 안전장치부터 확인해.",
    ],
    remove: ["권총은 다시 넣었다. 빈 손이 더 조용할 때도 있지."],
  },
  "basic-assault-rifle": {
    mood: "inspect",
    inspect: [
      "돌격소총은 표준품이 제일 무섭다. 누구 손에 쥐어도 제 일을 하니까.",
      "근거리부터 장거리까지 욕심내는 총이다. 대신 네 어깨가 대가를 치른다.",
    ],
    cart: [
      "소총 케이스째 올렸다. 운반 중 조정간 건드리지 마.",
      "돌격소총 반출로 잡았다. 사격장 로그도 같이 남겨.",
    ],
    remove: ["소총은 창고로 돌린다. 어깨가 고맙다 하겠군."],
  },
  "basic-shotgun": {
    mood: "inspect",
    inspect: [
      "샷건은 복도에서 대화가 짧아지는 물건이다. 아군 위치부터 외워.",
      "산탄은 친절하지 않다. 가까운 쪽부터 똑같이 물어뜯지.",
    ],
    cart: [
      "샷건 올렸다. 산탄은 따로 묶어둔다.",
      "산탄총 반출 준비한다. 문 열기 전에 뒤에 누가 있는지 봐.",
    ],
    remove: ["샷건은 뺐다. 문짝들이 잠깐 안심하겠군."],
  },
  "basic-heavy-machine-gun": {
    mood: "stock",
    inspect: [
      "중기관총은 총보다 자리에 가깝다. 설치할 곳을 못 고르면 짐덩이다.",
      "이건 들고 뛰는 물건이 아니야. 전선을 정하고 눌러앉을 때 꺼내.",
    ],
    cart: [
      "중기관총 반출대에 올렸다. 운반 인원부터 잡아.",
      "설치화기 한 기 예약한다. 삼각대 빠지면 그냥 비싼 고철이야.",
    ],
    remove: ["중기관총은 내려놨다. 바닥이 제일 먼저 좋아하겠군."],
  },
  "basic-sniper-rifle": {
    mood: "inspect",
    inspect: [
      "저격소총은 방아쇠보다 기다리는 시간이 더 길다. 조급하면 다른 걸 골라.",
      "장거리 한 발은 멋있어 보이지. 빗나가면 모두가 네 위치를 안다.",
    ],
    cart: [
      "저격 케이스 올렸다. 렌즈는 닦아뒀고, 흔들리는 건 네 몫이다.",
      "장거리 화기 반출로 잡는다. 관측자 없이 나가면 반쪽짜리야.",
    ],
    remove: ["저격소총은 보관함으로 돌린다. 기다리는 일도 재능이지."],
  },
  "basic-flamethrower": {
    mood: "stock",
    inspect: [
      "화염방사기는 적보다 보고서가 먼저 무서워지는 물건이다. 쓸 자리만 골라.",
      "연료통 달린 장비는 배짱으로 쓰는 게 아니야. 바람 방향부터 봐.",
    ],
    cart: [
      "화염방사기 봉인 확인한다. 새면 임무가 아니라 화재야.",
      "연료통까지 묶어 올렸다. 실내 사용 승인부터 확인해.",
    ],
    remove: ["화염방사기는 뺐다. 소방팀이 멀리서 고개 끄덕이겠군."],
  },
  "basic-sonic-emitter": {
    mood: "inspect",
    inspect: [
      "음파 방출기는 귀로 쏘는 총이 아니다. 출력값 틀리면 네 분대가 먼저 운다.",
      "소리 장비는 조용한 놈이 제일 위험해. 스위치 올리기 전엔 다들 방심하거든.",
    ],
    cart: [
      "음파 장비 반출로 잡았다. 출력 봉인은 연구소 값 그대로 둬.",
      "방출기 올렸다. 시험장 밖에서 주파수 장난치지 마.",
    ],
    remove: ["음파 장비는 뺐다. 귀마개는 그래도 챙겨."],
  },
  "military-fragment-grenade": {
    mood: "stock",
    inspect: [
      "수류탄은 작아서 무시하기 좋지. 그래서 사고도 작게 안 끝난다.",
      "핀은 약속이고 파편은 결과다. 던질 곳을 못 정했으면 들지 마.",
    ],
    cart: [
      "세열탄 한 묶음 올렸다. 핀 상태부터 확인한다.",
      "수류탄 반출한다. 주머니 속 농담거리로 쓰면 손목부터 날아가.",
    ],
    remove: ["수류탄은 다시 잠갔다. 조용한 선택이군."],
  },
  "rocket-launcher": {
    mood: "stock",
    inspect: [
      "로켓은 한 발짜리 결정이다. 맞으면 전황이 바뀌고, 빗나가면 예산 회의가 열린다.",
      "중화기는 허세로 들 수 없다. 후폭풍까지 네 책임으로 적힌다.",
    ],
    cart: [
      "로켓 런처 반출 예약한다. 발사각 잘못 잡으면 아군도 기록에 남아.",
      "중화기 한 정 올렸다. 탄은 한 발, 변명은 안 받는다.",
    ],
    remove: ["로켓 런처는 내렸다. 오늘 천장은 멀쩡하겠군."],
  },
  "basic-standard-ballistic-vest": {
    mood: "stock",
    inspect: [
      "기본형 방탄복은 첫 현장용이다. 총알과 정식으로 인사하지 않게 해 주는 정도지.",
      "가볍고 싸다. 대신 믿을 구석도 그만큼만 잡아.",
    ],
    cart: [
      "기본형 조끼 올렸다. 끈은 네 몸에 맞춰 다시 조여.",
      "기본 방호구 반출한다. 한 번 막아주면 자기 할 일은 다 한 거야.",
    ],
    remove: ["기본형 방탄복은 뺐다. 가벼운 건 몸뿐이겠군."],
  },
  "basic-intermediate-ballistic-vest": {
    mood: "stock",
    inspect: [
      "중급형은 보강판이 한 장 더 들어간다. 뛰는 속도보다 살아남는 쪽을 고른 셈이지.",
      "RF2급 위협을 예상하면 이쪽부터 봐. 기본형으로 버티겠다는 말은 싸게 죽겠다는 말이야.",
    ],
    cart: [
      "중급 방탄판으로 잡았다. 어깨끈 조정은 출동 전에 끝내.",
      "중급형 조끼 올렸다. 무게는 늘고, 후회는 줄어든다.",
    ],
    remove: ["중급형은 내려놨다. 움직임은 편해지겠지."],
  },
  "basic-advanced-ballistic-vest": {
    mood: "stock",
    inspect: [
      "고급형은 고위험 반출 칸이다. 이걸 보는 임무면 이미 나쁜 소식이 있다는 뜻이야.",
      "RF3급 충격을 생각하는 날엔 회복보다 먼저 방호를 계산해.",
    ],
    cart: [
      "고급 방호구 반출 예약했다. 이걸 입는 임무면 농담 줄여.",
      "고급형 조끼 올렸다. 몸값 높은 작전엔 몸값 높은 방호구가 맞다.",
    ],
    remove: ["고급형은 보관함으로 돌린다. 그 판단이 맞길 바라지."],
  },
} satisfies Record<string, TowaskiItemDialogue>;

type TowaskiKnownItemKey = keyof typeof TOWASKI_ITEM_DIALOGUE_LINES;

const ARMORY_DESK_META: Pick<
  ArmoryZoneDef,
  "label" | "eyebrow" | "npc"
> = {
  label: "병기부 안내데스크",
  eyebrow: "INFORMATION",
  npc: "아메리",
};

const ZONE_DEFS: ArmoryZoneDef[] = [
  {
    value: "lab",
    href: "/erp/equipment-shop/lab",
    label: "신체증강 연구소",
    eyebrow: "RESEARCH LAB",
    description: "개인 강화와 전체 AGENT 팀 강화를 실제 스탯에 반영합니다.",
    npc: "이레나 부코비치",
  },
  {
    value: "towaski",
    href: "/erp/equipment-shop/towaski",
    label: "토와스키 건샵",
    eyebrow: "TOWASKI",
    description: "화기, 방어구, 전투 소모품을 구매해 인벤토리에 반출합니다.",
    npc: "립 토와스키",
  },
  {
    value: "acheron",
    href: "/erp/equipment-shop/acheron",
    label: "아케론 대장간",
    eyebrow: "ACHERON FORGE",
    description: "근접무기와 냉병기류를 구매해 인벤토리에 반출합니다.",
    npc: "브리짓 케인",
  },
  {
    value: "strategic",
    href: "/erp/equipment-shop/strategic",
    label: "전략 장비 보급소",
    eyebrow: "STRATEGIC ASSETS",
    description: "차량, 전략 자산, 전투 보조품을 구매합니다.",
    npc: "마테오 리바스",
  },
  {
    value: "custom",
    href: "/erp/equipment-shop/custom",
    label: "공방",
    eyebrow: "CUSTOM WORKSHOP",
    description:
      "장착 장비 강화와 커스텀 장비 제작 문의를 접수합니다. 전용 장비 제작은 정비 중입니다.",
    npc: "에이다 슈라이버",
  },
  {
    value: "simulator",
    href: "/erp/equipment-shop/simulator",
    label: "훈련장",
    eyebrow: "TEST RANGE",
    description: "보급형 장비의 사거리와 탄환 운용을 시험합니다.",
    npc: "시험장 담당관",
  },
];

const TAB_DEFS: { value: EquipmentShopTabValue; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "WEAPON", label: "무기" },
  { value: "ARMOR", label: "방어구" },
  { value: "CONSUMABLE", label: "소모품" },
  { value: "LICENSE", label: "라이센스" },
];

const CATEGORY_LABELS: Record<EquipmentShopCatalogEntry["category"], string> = {
  WEAPON: "WEAPON",
  ARMOR: "ARMOR",
  CONSUMABLE: "CONSUMABLE",
  SPECIAL: "STRATEGIC",
};

const STAT_DEFS: Array<{
  value: EquipmentResearchStat;
  label: string;
  hint: string;
}> = [
  { value: "hp", label: "HP", hint: "체력" },
  { value: "san", label: "SAN", hint: "정신력" },
  { value: "def", label: "DEF", hint: "방어력" },
  { value: "atk", label: "ATK", hint: "공격력" },
];

const ERROR_MESSAGE: Record<EquipmentShopErrorCode, string> = {
  INSUFFICIENT_BALANCE: "잔액이 부족합니다.",
  NO_MAIN_CHARACTER: "메인 AGENT 캐릭터가 등록되지 않았습니다.",
  MAIN_CHARACTER_INTEGRITY:
    "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의하세요.",
  NO_AGENT_TARGETS: "강화를 적용할 AGENT 캐릭터가 없습니다.",
  INVENTORY_FAILED_REFUNDED:
    "구매에 실패했습니다. 차감된 잔액은 자동 환불되었습니다.",
  REFUND_FAILED:
    "구매 실패 + 자동 환불 실패. 운영자(GM)에게 문의해 잔액 정정을 요청하세요.",
  INVALID_CART: "장비 구매 요청이 올바르지 않습니다.",
  LICENSE_REQUIRED: "반출에 필요한 토와스키 라이센스가 없습니다.",
  LICENSE_ALREADY_OWNED: "이미 보유한 라이선스입니다.",
  INVALID_LICENSE_TEST: "사격 시험 기록 형식이 올바르지 않습니다.",
  LICENSE_TEST_FAILED: "기본 화기 자격시험 합격 기준에 미달했습니다.",
  LICENSE_TEST_EXPIRED: "사격 시험 시간이 만료되었습니다. 다시 시작해 주세요.",
  LICENSE_TEST_STALE_ROUND: "이미 처리됐거나 순서가 맞지 않는 표적입니다.",
  LICENSE_TEST_TOO_FAST: "표적 반응 시간이 시험 범위를 벗어났습니다.",
  INVALID_IDEMPOTENCY_KEY: "요청 식별자가 올바르지 않습니다. 다시 시도해 주세요.",
  DUPLICATE_REQUEST: "동일한 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요.",
  CHECKOUT_TRANSACTION_FAILED:
    "반출 결제를 완료하지 못했습니다. 결제 내역을 확인한 뒤 다시 시도해 주세요.",
  LICENSE_TEST_CONFLICT: "사격 기록이 동시에 처리되었습니다. 다시 시도해 주세요.",
  LICENSE_ITEM_MISSING: "기본 화기 라이센스 마스터 품목이 없습니다.",
  LICENSE_GRANT_FAILED: "기본 화기 라이센스 지급에 실패했습니다.",
  BASIC_LICENSE_REQUIRED: "토와스키 기본 화기 자격시험을 먼저 통과해야 합니다.",
  FORBIDDEN_EQUIPMENT_ZONE:
    "현재 구역에서 반출할 수 없는 병기부 품목입니다.",
  INVALID_RESEARCH: "연구 적용값이 올바르지 않습니다.",
  ITEM_NOT_AVAILABLE: "판매 가능한 병기부 카탈로그 품목이 아닙니다.",
  PRICE_NOT_SET: "가격이 확정되지 않은 장비는 구매할 수 없습니다.",
  PRICE_CHANGED: "가격 또는 할인 상태가 변경되었습니다. 다시 확인해 주세요.",
  RESEARCH_CAP_REACHED: "연구 누적 상한에 도달했습니다.",
  RESEARCH_PREREQUISITE_MISSING:
    "같은 범위의 이전 티어 연구를 먼저 적용해야 합니다.",
  RESEARCH_NOT_READY: "아직 완료되지 않은 연구입니다.",
  RUSH_LIMIT_REACHED: "더 이상 연구 시간을 단축할 수 없습니다.",
  TEAM_RESEARCH_REQUIRES_CONTRIBUTION:
    "팀 연구는 기여 누적을 통해서만 시작할 수 있습니다.",
  RESEARCH_ALREADY_STARTED: "이미 시작되었거나 적용된 연구입니다.",
  RESEARCH_FUNDING_CONFLICT:
    "동시에 다른 기여가 처리되었습니다. 다시 시도해 주세요.",
  RESEARCH_START_FAILED: "연구 시작 처리에 실패했습니다.",
  FORBIDDEN_RESEARCH_PROJECT: "이 연구를 조작할 권한이 없습니다.",
  CUSTOM_WEAPON_SLOT_REQUIRED:
    "전용무기 설계 슬롯 연구를 완료해야 제작 의뢰를 보낼 수 있습니다.",
  QUOTE_CHANGED: "견적이 수정되었습니다. 최신 내용을 다시 확인해 주세요.",
  INSUFFICIENT_MATERIALS: "납품할 재료가 부족합니다.",
  SOURCE_ITEM_CHANGED: "강화 대상 장비의 장착 상태가 변경되었습니다.",
  REQUEST_STATE_CHANGED: "공방 요청 상태가 변경되었습니다. 다시 확인해 주세요.",
  WORKSHOP_NOT_READY: "아직 제작이 완료되지 않았습니다.",
  BLOB_NOT_CONFIGURED: "이미지 업로드 저장소가 설정되지 않았습니다.",
};

const FEEDBACK_SOUND_PATTERNS: Record<
  FeedbackTone,
  readonly { delay: number; duration: number; frequency: number }[]
> = {
  info: [{ delay: 0, duration: 0.06, frequency: 520 }],
  success: [
    { delay: 0, duration: 0.07, frequency: 620 },
    { delay: 0.08, duration: 0.08, frequency: 780 },
    { delay: 0.17, duration: 0.12, frequency: 1040 },
  ],
  error: [
    { delay: 0, duration: 0.11, frequency: 210 },
    { delay: 0.1, duration: 0.15, frequency: 150 },
  ],
};

const FEEDBACK_LABELS: Record<FeedbackTone, string> = {
  info: "병기부 안내",
  success: "처리 완료",
  error: "처리 실패",
};

function playFeedbackTone(context: AudioContext, tone: FeedbackTone) {
  const baseTime = context.currentTime + 0.01;
  const peakGain = tone === "info" ? 0.025 : 0.04;

  FEEDBACK_SOUND_PATTERNS[tone].forEach((note) => {
    const start = baseTime + note.delay;
    const end = start + note.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = tone === "error" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(note.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  });
}

interface Props {
  mode: EquipmentShopMode;
  initialZone?: ArmoryZone;
  initialCatalog: EquipmentShopCatalogResponse;
  initialResearch: EquipmentResearchOverviewResponse;
  mainCharacter: {
    id: string;
    codename: string;
    stats: MainCharacterStats;
    hasBasicFirearmLicense: boolean;
  } | null;
  initialBalance: number;
  initialCredits: CreditsResponse | undefined;
  mainCharacterError: string | null;
  isGM: boolean;
  initialStrategicScene: StrategicScene;
}

type ResearchNodeEntry = EquipmentResearchOverviewResponse["tree"][number];
type ResearchNodeMapStatus =
  | EquipmentResearchProjectEntry["computedStatus"]
  | "available";

const RESEARCH_TIER_LABELS: Record<number, string> = {
  1: "기초 실험",
  2: "개인 안정화",
  3: "실전 프로토콜",
  4: "고급 병기 연구",
  5: "시즌급 최종 연구",
};

const RESEARCH_TIER_FEEL: Record<number, string> = {
  1: "미세 보정",
  2: "소폭 성장",
  3: "확실한 성장",
  4: "대형 해금",
  5: "피날레 보상",
};

const RESEARCH_BRANCH_ORDER = [
  "bio",
  "psy",
  "mun",
  "log",
  "lab",
  "trn",
  "cnt",
  "cst",
  "aeg",
  "pts",
] as const;

const RESEARCH_BRANCH_META: Record<string, { label: string; code: string }> = {
  bio: { label: "생체", code: "BIO" },
  psy: { label: "정신", code: "PSY" },
  mun: { label: "화력", code: "MUN" },
  log: { label: "보급 정산", code: "LOG" },
  lab: { label: "연구 운영", code: "LAB" },
  trn: { label: "훈련", code: "TRN" },
  cnt: { label: "개체 대응", code: "CNT" },
  cst: { label: "제작", code: "CST" },
  aeg: { label: "방호", code: "AEG" },
  pts: { label: "성장 배정", code: "PTS" },
};

function describeEquipmentShopError(err: unknown): string {
  if (err instanceof EquipmentShopApiError && err.code === "LICENSE_REQUIRED") {
    return err.message;
  }
  return describeApiError(err, EquipmentShopApiError, ERROR_MESSAGE);
}

function activeZoneMeta(zone: ArmoryZone) {
  return ZONE_DEFS.find((item) => item.value === zone) ?? ZONE_DEFS[0];
}

function renderCatalogIcon(item: EquipmentShopCatalogEntry, size: number) {
  if (item.previewImage) {
    return (
      <Image
        src={item.previewImage}
        width={size}
        height={size}
        alt=""
        aria-hidden
        draggable={false}
        unoptimized
      />
    );
  }

  return <ShopItemIcon slug={item.slug ?? item.key} size={size} />;
}

function isTowaskiLicenseCatalogItem(
  item: EquipmentShopCatalogEntry,
): boolean {
  return item.zone === "towaski" && isTowaskiLicenseSlug(item.slug);
}

function isEquipmentLicenseBlocked(item: EquipmentShopCatalogEntry): boolean {
  return Boolean(
    item.licenseRequirement && item.licenseStatus?.satisfied !== true,
  );
}

function describeEquipmentLicenseAccess(
  item: EquipmentShopCatalogEntry,
): string | null {
  if (!item.licenseRequirement) return null;
  if (item.licenseStatus?.source === "character_qualification") {
    return `적성 승인 · ${item.licenseStatus.matchedKeyword ?? item.licenseRequirement.label}`;
  }
  if (item.licenseStatus?.source === "owned_license") {
    return `${item.licenseRequirement.label} 라이센스 보유`;
  }
  return `${item.licenseRequirement.label} 라이센스 필요`;
}

function describeEquipmentLicenseDetail(
  item: EquipmentShopCatalogEntry,
): string | null {
  if (item.licenseOwned) {
    return "이미 발급되어 인벤토리에 등록된 라이센스입니다.";
  }
  if (!item.licenseRequirement) return null;
  if (item.licenseStatus?.source === "character_qualification") {
    return (
      item.licenseStatus.note ??
      `캐릭터 적성 승인: ${item.licenseStatus.matchedKeyword ?? item.licenseRequirement.label}`
    );
  }
  if (item.licenseStatus?.source === "owned_license") {
    return `보유 중인 ${item.licenseRequirement.licenseName}로 구매할 수 있습니다.`;
  }
  return `${item.licenseRequirement.licenseName}를 발급받으면 구매할 수 있습니다. 해당 화기 적성이 캐릭터 기록에 있으면 라이센스 없이 승인됩니다.`;
}

function matchesEquipmentShopTab(
  item: EquipmentShopCatalogEntry,
  tab: EquipmentShopTabValue,
): boolean {
  if (tab === "ALL") return true;
  if (tab === "LICENSE") return isTowaskiLicenseCatalogItem(item);
  return item.category === tab;
}

function getCatalogCategoryLabel(item: EquipmentShopCatalogEntry): string {
  if (isTowaskiLicenseCatalogItem(item)) return "LICENSE";
  return CATEGORY_LABELS[item.category];
}

function getResearchBranchRank(branch: string): number {
  const index = (RESEARCH_BRANCH_ORDER as readonly string[]).indexOf(branch);
  return index >= 0 ? index : RESEARCH_BRANCH_ORDER.length;
}

function getResearchBranchMeta(branch: string): { label: string; code: string } {
  return (
    RESEARCH_BRANCH_META[branch] ?? {
      label: branch.toUpperCase(),
      code: branch.toUpperCase(),
    }
  );
}

function stableStringSeed(value: string): number {
  return Array.from(value).reduce(
    (sum, char, index) => sum + (char.codePointAt(0) ?? 0) * (index + 1),
    0,
  );
}

function pickStableLine(lines: readonly string[], seed: string): string {
  return lines[stableStringSeed(seed) % lines.length] ?? lines[0] ?? "";
}

function pickCyclingLine(lines: readonly string[], variant: number): string {
  return lines[Math.abs(Math.trunc(variant)) % lines.length] ?? lines[0] ?? "";
}

function buildTowaskiArmorReferralLine(
  item: EquipmentShopCatalogEntry,
  variant: number,
): string {
  return `${item.name}. ${pickCyclingLine(TOWASKI_ARMOR_REFERRAL_LINES, variant)}`;
}

function getTowaskiItemDialogue(
  item: EquipmentShopCatalogEntry,
): TowaskiItemDialogue | null {
  if (
    Object.prototype.hasOwnProperty.call(TOWASKI_ITEM_DIALOGUE_LINES, item.key)
  ) {
    return TOWASKI_ITEM_DIALOGUE_LINES[item.key as TowaskiKnownItemKey];
  }

  return null;
}

function getMainCharacterProfile(
  stats: MainCharacterStats | null,
): MainCharacterProfile {
  if (!stats) return "balanced";

  const entries: Array<[MainCharacterProfile, number]> = [
    ["assault", stats.atk],
    ["guard", stats.def],
    ["endurance", stats.hp],
    ["focus", stats.san],
  ];
  const values = entries.map(([, value]) => value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max - min <= 1) return "balanced";

  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "balanced";
}

function buildTowaskiWelcomeLine(args: {
  codename: string | null;
  profile: MainCharacterProfile;
}) {
  const callsign = args.codename ? `왔냐, ${args.codename}.` : "왔냐.";
  const profileLine = pickStableLine(
    TOWASKI_PROFILE_LINES[args.profile],
    `${args.codename ?? "UNASSIGNED"}:${args.profile}`,
  );
  return `${callsign} ${profileLine}`;
}

function buildTowaskiItemLine(
  item: EquipmentShopCatalogEntry,
  codename?: string | null,
): { mood: TowaskiMood; text: string } {
  if (!item.available) {
    return { mood: "stock", text: TOWASKI_DIALOGUE_LINES.unavailable };
  }

  if (codename === "BIG BOY" && item.key === "basic-flamethrower") {
    return {
      mood: "stock",
      text:
        "박애솔 건은 따로 봐둔다. 화염방사기 훈련 기록이랑 내 예외 장부가 같이 움직여.",
    };
  }

  if (item.key.startsWith("towaski-license-")) {
    return {
      mood: "license",
      text:
        "라이센스는 물건이 아니라 반출 자격이다. 훈련 기록이 없으면 이 줄부터 처리해.",
    };
  }

  const itemDialogue = getTowaskiItemDialogue(item);
  if (itemDialogue) {
    return {
      mood: itemDialogue.mood,
      text: pickStableLine(itemDialogue.inspect, `${item.key}:inspect`),
    };
  }

  const variants: Record<
    EquipmentShopCatalogEntry["category"] | "ALL",
    readonly string[]
  > = {
    ALL: [TOWASKI_DIALOGUE_LINES.category],
    WEAPON: [
      "화기류는 방아쇠보다 사거리부터 봐. 못 맞히면 비싼 소음이야.",
      "총은 항상 충분히 시끄럽다. 문제는 네 손목과 판단이지.",
    ],
    ARMOR: [
      "방호구는 맞고 버티는 물건이지, 맞으러 가라는 허가는 아니야.",
      "방어구는 보험에 가깝다. 보험 쓰는 날은 보통 재수 없는 날이고.",
    ],
    CONSUMABLE: [
      "소모품은 쓰고 끝이다. 아까우면 애초에 카운터에 올리지 마.",
      "일회성 장구는 결심이 빠른 놈한테만 쓸모가 있다.",
    ],
    SPECIAL: [
      "전략 자산은 반출 사유가 먼저고, 가격표는 그다음이야.",
      "특수 장비는 장비보다 책임에 가깝다. 서명란 비워두지 마.",
    ],
  };

  return {
    mood: item.category === "ARMOR" ? "stock" : "inspect",
    text: pickStableLine(variants[item.category] ?? variants.ALL, item.key),
  };
}

function buildTowaskiCartLine(item: EquipmentShopCatalogEntry): string {
  if (item.key.startsWith("towaski-license-")) {
    return "라이센스 장부에 올렸다. 종이 한 장이 총보다 조용해도, 막히면 그게 제일 무겁다.";
  }

  const itemDialogue = getTowaskiItemDialogue(item);
  if (itemDialogue) {
    return pickStableLine(itemDialogue.cart, `${item.key}:cart`);
  }

  const variants: Record<
    EquipmentShopCatalogEntry["category"] | "ALL",
    readonly string[]
  > = {
    ALL: [TOWASKI_DIALOGUE_LINES.cart],
    WEAPON: [
      "화기 한 정 올렸다. 시리얼 넘버는 장부에 남긴다.",
      "무기 케이스 잠근다. 훈련장 밖에서 시험하지 마.",
    ],
    ARMOR: [
      "방호구 올렸다. 출동 전에 몸에 맞춰 다시 조여.",
      "방어구 반출로 잡았다. 멋보다 착용감을 먼저 봐.",
    ],
    CONSUMABLE: [
      "소모품 묶어놨다. 쓸 때 망설이면 들고 나갈 이유가 없어.",
      "일회성 장구 올렸다. 봉인 훼손하면 반품은 없다.",
    ],
    SPECIAL: [
      "특수 장비 반출대에 올렸다. 승인선 다시 확인해.",
      "전략 자산으로 잡았다. 이동 동선까지 적어 둬.",
    ],
  };

  return pickStableLine(variants[item.category] ?? variants.ALL, item.key);
}

function buildTowaskiTabLine(tab: EquipmentShopTabValue): string {
  switch (tab) {
    case "WEAPON":
      return "화기 진열대다. 손맛보다 사거리, 탄종, 반동부터 봐.";
    case "ARMOR":
      return "방호구 쪽이군. 방탄복은 한 번 피격되면 부서진다. 그래도 스타마트 회복품보다 성능은 낫다. 맞고 나서 고치는 것보다 맞기 전에 막아.";
    case "CONSUMABLE":
      return "소모품은 쓰고 사라진다. 그래서 필요할 때 없으면 제일 욕먹지.";
    case "LICENSE":
      return "라이센스는 총이 아니지만, 총보다 먼저 나간다. 자격 없는 반출은 내 카운터에서 끝이야.";
    default:
      return TOWASKI_DIALOGUE_LINES.category;
  }
}

function getResearchNodeMapStatus(
  projects: EquipmentResearchProjectEntry[],
  key: string,
  scope: EquipmentResearchScope,
): ResearchNodeMapStatus {
  const related = projects.filter(
    (project) => project.key === key && project.scope === scope,
  );
  if (related.some((project) => project.computedStatus === "completed")) {
    return "completed";
  }
  if (related.some((project) => project.computedStatus === "applying")) {
    return "applying";
  }
  if (related.some((project) => project.computedStatus === "in_progress")) {
    return "in_progress";
  }
  if (related.some((project) => project.computedStatus === "applied")) {
    return "applied";
  }
  return "available";
}

function researchNodeMapStatusLabel(status: ResearchNodeMapStatus): string {
  if (status === "completed") return "완료 대기";
  if (status === "applied") return "적용됨";
  if (status === "applying") return "적용 중";
  if (status === "in_progress") return "진행 중";
  return "연구 가능";
}

function researchNodeMapStatusTone(status: ResearchNodeMapStatus): string {
  if (status === "completed") return "ready";
  if (status === "applied") return "applied";
  if (status === "applying" || status === "in_progress") return "progress";
  return "available";
}

function researchNodeClassName(
  status: ResearchNodeMapStatus,
  isSelected: boolean,
  isLocked: boolean,
): string {
  const classes = [styles.techNode];
  if (isLocked) classes.push(styles["techNode--locked"]);
  if (status === "completed") classes.push(styles["techNode--completed"]);
  if (status === "applied") classes.push(styles["techNode--applied"]);
  if (status === "applying" || status === "in_progress") {
    classes.push(styles["techNode--active"]);
  }
  if (isSelected) classes.push(styles["techNode--selected"]);
  return classes.join(" ");
}

function getFirstResearchKeyForScope(
  tree: EquipmentResearchOverviewResponse["tree"],
  scope: EquipmentResearchScope,
): string {
  return tree.find((node) => node.allowedScopes.includes(scope))?.key ?? "";
}

function isResearchNodeUnlocked(args: {
  node: ResearchNodeEntry;
  projects: EquipmentResearchProjectEntry[];
  scope: EquipmentResearchScope;
  targetCharacterId: string | null;
}): boolean {
  const requiredTier = getEquipmentResearchPrerequisiteTier(args.node.tier);
  const hasAppliedProject = (project: EquipmentResearchProjectEntry) => {
    if (project.scope !== args.scope) return false;
    if (project.computedStatus !== "applied") return false;
    if (args.scope === "team") return true;
    return args.targetCharacterId
      ? project.targetCharacterIds.includes(args.targetCharacterId)
      : false;
  };
  const hasRequiredTier =
    !requiredTier ||
    args.projects.some(
      (project) => project.tier === requiredTier && hasAppliedProject(project),
    );
  const hasRequiredNodes = (args.node.prerequisiteKeys ?? []).every((key) =>
    args.projects.some(
      (project) => project.key === key && hasAppliedProject(project),
    ),
  );
  return hasRequiredTier && hasRequiredNodes;
}

function researchNodeLockLabel(node: ResearchNodeEntry): string | null {
  const requiredTier = getEquipmentResearchPrerequisiteTier(node.tier);
  const labels = [
    requiredTier ? `T${requiredTier} 필요` : "",
    ...(node.prerequisiteKeys ?? []).map((key) => `${key} 필요`),
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(" · ") : null;
}

function ResearchPixelIcon({
  node,
  active,
}: {
  node: ResearchNodeEntry;
  active: boolean;
}) {
  function renderGlyph() {
    switch (node.branch) {
      case "bio":
        return (
          <>
            <rect x="10" y="5" width="4" height="14" />
            <rect x="5" y="10" width="14" height="4" />
            <rect x="6" y="6" width="2" height="2" />
            <rect x="16" y="16" width="2" height="2" />
          </>
        );
      case "psy":
        return (
          <>
            <rect x="8" y="5" width="8" height="8" />
            <rect x="7" y="13" width="10" height="4" />
            <rect x="10" y="17" width="4" height="2" />
            <rect x="18" y="6" width="2" height="2" />
            <rect x="20" y="8" width="2" height="2" />
          </>
        );
      case "mun":
        return (
          <>
            <rect x="11" y="4" width="2" height="16" />
            <rect x="4" y="11" width="16" height="2" />
            <rect x="8" y="8" width="2" height="2" />
            <rect x="14" y="8" width="2" height="2" />
            <rect x="8" y="14" width="2" height="2" />
            <rect x="14" y="14" width="2" height="2" />
          </>
        );
      case "log":
        return (
          <>
            <rect x="6" y="7" width="12" height="3" />
            <rect x="5" y="10" width="14" height="7" />
            <rect x="8" y="12" width="3" height="3" />
            <rect x="13" y="12" width="3" height="3" />
            <rect x="9" y="18" width="6" height="2" />
          </>
        );
      case "lab":
        return (
          <>
            <rect x="9" y="4" width="6" height="3" />
            <rect x="10" y="7" width="4" height="5" />
            <rect x="7" y="12" width="10" height="7" />
            <rect x="9" y="14" width="6" height="2" />
            <rect x="18" y="15" width="2" height="2" />
          </>
        );
      case "trn":
        return (
          <>
            <rect x="6" y="6" width="12" height="4" />
            <rect x="8" y="10" width="8" height="8" />
            <rect x="10" y="12" width="4" height="2" />
            <rect x="6" y="18" width="4" height="2" />
            <rect x="14" y="18" width="4" height="2" />
          </>
        );
      case "cnt":
        return (
          <>
            <rect x="6" y="5" width="12" height="4" />
            <rect x="7" y="9" width="10" height="6" />
            <rect x="9" y="15" width="6" height="3" />
            <rect x="11" y="18" width="2" height="2" />
            <rect x="11" y="10" width="2" height="4" />
          </>
        );
      case "cst":
        return (
          <>
            <rect x="6" y="6" width="5" height="3" />
            <rect x="10" y="9" width="4" height="4" />
            <rect x="13" y="13" width="5" height="3" />
            <rect x="5" y="15" width="4" height="4" />
            <rect x="16" y="5" width="3" height="5" />
          </>
        );
      case "aeg":
        return (
          <>
            <rect x="6" y="5" width="12" height="3" />
            <rect x="5" y="8" width="14" height="5" />
            <rect x="7" y="13" width="10" height="4" />
            <rect x="10" y="17" width="4" height="3" />
            <rect x="11" y="9" width="2" height="6" />
          </>
        );
      case "pts":
        return (
          <>
            <rect x="11" y="4" width="2" height="4" />
            <rect x="8" y="8" width="8" height="2" />
            <rect x="5" y="10" width="14" height="3" />
            <rect x="8" y="13" width="8" height="2" />
            <rect x="7" y="15" width="3" height="4" />
            <rect x="14" y="15" width="3" height="4" />
          </>
        );
      default:
        return <rect x="7" y="7" width="10" height="10" />;
    }
  }

  function renderTierMark() {
    switch (node.tier) {
      case 2:
        return (
          <>
            <rect x="4" y="4" width="4" height="2" />
            <rect x="16" y="18" width="4" height="2" />
          </>
        );
      case 3:
        return (
          <>
            <rect x="4" y="4" width="3" height="3" />
            <rect x="17" y="4" width="3" height="3" />
            <rect x="4" y="17" width="3" height="3" />
            <rect x="17" y="17" width="3" height="3" />
          </>
        );
      case 4:
        return (
          <>
            <rect x="3" y="11" width="3" height="2" />
            <rect x="18" y="11" width="3" height="2" />
            <rect x="11" y="3" width="2" height="3" />
            <rect x="11" y="18" width="2" height="3" />
          </>
        );
      case 5:
        return (
          <>
            <rect x="7" y="3" width="2" height="3" />
            <rect x="11" y="2" width="2" height="4" />
            <rect x="15" y="3" width="2" height="3" />
            <rect x="7" y="6" width="10" height="2" />
            <rect x="5" y="19" width="14" height="2" />
          </>
        );
      default:
        return <rect x="11" y="20" width="2" height="1" />;
    }
  }

  return (
    <svg
      className={[
        styles.researchPixelIcon,
        styles[`researchPixelIcon--tier${node.tier}`],
        active ? styles["researchPixelIcon--active"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
      viewBox="0 0 24 24"
      aria-hidden
      shapeRendering="crispEdges"
      focusable="false"
    >
      <rect x="1" y="1" width="22" height="22" className={styles.iconFrame} />
      <rect x="3" y="3" width="18" height="18" className={styles.iconPlate} />
      <g className={styles.iconGlyph}>{renderGlyph()}</g>
      <g className={styles.iconTierMark}>{renderTierMark()}</g>
    </svg>
  );
}

export default function EquipmentShopClient({
  mode,
  initialZone = "lab",
  initialCatalog,
  initialResearch,
  mainCharacter,
  initialBalance,
  initialCredits,
  mainCharacterError,
  isGM,
  initialStrategicScene,
}: Props) {
  const router = useRouter();
  const catalogQuery = useEquipmentShopCatalog({
    initialData: initialCatalog,
    scope:
      initialZone === "towaski" ||
      initialZone === "acheron" ||
      initialZone === "strategic"
        ? initialZone
        : "all",
    characterId: mainCharacter?.id ?? null,
    enabled: initialZone !== "custom",
  });
  const researchQuery = useEquipmentResearch({
    initialData: initialResearch,
    enabled: isGM && (mode === "hub" || initialZone === "lab"),
  });
  const creditsQuery = useCredits({ initialData: initialCredits });
  const characterInventoryQuery = useCharacterInventory(
    mainCharacter?.id ?? "",
    {
      enabled: initialZone === "custom" && mainCharacter !== null,
    },
  );
  const purchaseMutation = usePurchaseEquipmentShopItem();
  const armorReferralMutation = useRegisterTowaskiArmorReferral();
  const quoteMutation = useEquipmentShopQuote();
  const startResearchMutation = useStartEquipmentResearch();
  const rushResearchMutation = useRushEquipmentResearch();
  const contributeResearchMutation = useContributeEquipmentResearch();
  const completeResearchMutation = useCompleteEquipmentResearch();
  const workshopRequestMutation = useEquipmentWorkshopRequest();
  const acceptWorkshopQuoteMutation = useAcceptEquipmentWorkshopQuote();
  const declineWorkshopQuoteMutation = useDeclineEquipmentWorkshopQuote();
  const claimWorkshopResultMutation = useClaimEquipmentWorkshopResult();
  const workshopRequestsQuery = useEquipmentWorkshopRequests({
    viewerKey: isGM ? "gm" : (mainCharacter?.id ?? "unassigned"),
    enabled: initialZone === "custom",
  });
  const updateWorkshopRequestMutation = useUpdateEquipmentWorkshopRequest();

  const [activeTab, setActiveTab] = useState<EquipmentShopTabValue>("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const purchaseLockRef = useRef(false);
  const towaskiQualificationPassedRef = useRef(false);
  const towaskiDialogueRevisionRef = useRef(0);
  const sutureDialogueRevisionRef = useRef(0);
  const temperDialogueRevisionRef = useRef(0);
  const strategicDialogueRevisionRef = useRef(0);
  const ameriDialogueRevisionRef = useRef(0);
  const [localStats, setLocalStats] = useState<MainCharacterStats | null>(
    () => mainCharacter?.stats ?? null,
  );
  const [activeResearchScope, setActiveResearchScope] =
    useState<EquipmentResearchScope>("personal");
  const [isResearchBonusMenuOpen, setIsResearchBonusMenuOpen] =
    useState(false);
  const researchBonusMenuRef = useRef<HTMLDivElement>(null);
  const [selectedResearchKeys, setSelectedResearchKeys] = useState<
    Record<EquipmentResearchScope, string>
  >(() => ({
    personal: getFirstResearchKeyForScope(initialResearch.tree, "personal"),
    team: getFirstResearchKeyForScope(initialResearch.tree, "team"),
  }));
  const [teamContributionAmount, setTeamContributionAmount] = useState("100");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const feedbackSequenceRef = useRef(0);
  const feedbackTimerRef = useRef<number | null>(null);
  const feedbackAudioContextRef = useRef<AudioContext | null>(null);
  const workshopStatusRef = useRef<Map<string, EquipmentWorkshopComputedStatus> | null>(null);
  const [hasBasicFirearmLicense, setHasBasicFirearmLicense] = useState(
    () => mainCharacter?.hasBasicFirearmLicense ?? false,
  );
  const [towaskiDebugMode, setTowaskiDebugMode] =
    useState<TowaskiDebugMode>("live");
  const [towaskiLicenseTestOpen, setTowaskiLicenseTestOpen] = useState(false);
  const [selectedTowaskiLicenseTestSlug, setSelectedTowaskiLicenseTestSlug] =
    useState<TowaskiLicenseSlug | null>(null);
  const [sutureDebugMode, setSutureDebugMode] =
    useState<SutureDebugMode>("live");
  const [towaskiDebugRevision, setTowaskiDebugRevision] = useState(0);
  const [towaskiLicenseTestBusy, setTowaskiLicenseTestBusy] = useState(false);
  const [activeHubDestination, setActiveHubDestination] =
    useState<ArmoryDestination>("towaski");
  const [strategicScene, setStrategicScene] = useState<StrategicScene>(
    initialStrategicScene,
  );
  const [upgradeEntryId, setUpgradeEntryId] = useState("");
  const [upgradeRequestDetails, setUpgradeRequestDetails] = useState("");
  const [customRequestDetails, setCustomRequestDetails] = useState("");
  const [workshopOperatorNotes, setWorkshopOperatorNotes] = useState<
    Record<string, string>
  >({});
  const [workshopClock, setWorkshopClock] = useState(0);

  useEffect(() => {
    if (initialZone !== "custom") return;
    const timer = window.setInterval(() => setWorkshopClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [initialZone]);

  const catalog = catalogQuery.data ?? initialCatalog;
  const research = researchQuery.data ?? initialResearch;
  const researchDataUnavailable =
    isGM && (researchQuery.isError || researchQuery.isRefetchError);
  const researchTree = research.tree;
  const researchProjects = research.projects;
  const selectedResearchKey = selectedResearchKeys[activeResearchScope];
  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const isHub = mode === "hub";
  const activeZone = initialZone;
  const isTowaskiDebug =
    isGM && activeZone === "towaski" && towaskiDebugMode !== "live";
  const isSutureDebug =
    isGM && activeZone === "lab" && sutureDebugMode !== "live";
  const strategicSceneInfo = STRATEGIC_SCENE_INFO[strategicScene];
  const equippedEntries = useMemo(
    () =>
      Object.values(characterInventoryQuery.data?.equipped ?? {}).filter(
        (entry): entry is NonNullable<typeof entry> => Boolean(entry),
      ),
    [characterInventoryQuery.data?.equipped],
  );

  const playFeedbackSound = useCallback((tone: FeedbackTone) => {
    try {
      const audioWindow = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextConstructor =
        audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
      if (!AudioContextConstructor) return;

      const context =
        feedbackAudioContextRef.current ?? new AudioContextConstructor();
      feedbackAudioContextRef.current = context;
      if (context.state === "suspended") {
        void context
          .resume()
          .then(() => playFeedbackTone(context, tone))
          .catch(() => undefined);
        return;
      }
      playFeedbackTone(context, tone);
    } catch {
      // Ignore unsupported audio environments and browser playback policies.
    }
  }, []);

  useEffect(() => {
    if (activeZone !== "custom" || !workshopRequestsQuery.data) return;
    const nextStatuses = new Map(
      workshopRequestsQuery.data.requests.map((request) => [request._id, request.computedStatus]),
    );
    const previousStatuses = workshopStatusRef.current;
    workshopStatusRef.current = nextStatuses;
    if (!previousStatuses) return;
    const changed = workshopRequestsQuery.data.requests.find(
      (request) => previousStatuses.get(request._id) !== request.computedStatus,
    );
    if (!changed) return;
    playFeedbackSound(
      changed.computedStatus === "READY" || changed.computedStatus === "COMPLETED"
        ? "success"
        : changed.computedStatus === "REJECTED" || changed.computedStatus === "CANCELLED"
          ? "error"
          : "info",
    );
  }, [activeZone, playFeedbackSound, workshopRequestsQuery.data]);

  const dismissFeedback = useCallback(() => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setFeedback(null);
  }, []);

  const showFeedback = useCallback(
    (tone: FeedbackTone, title: string, detail: string) => {
      const id = feedbackSequenceRef.current + 1;
      feedbackSequenceRef.current = id;
      setFeedback({ id, tone, title, detail });
      playFeedbackSound(tone);

      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = window.setTimeout(
        () => {
          setFeedback((current) => (current?.id === id ? null : current));
          feedbackTimerRef.current = null;
        },
        tone === "error" ? 7000 : 5000,
      );
    },
    [playFeedbackSound],
  );

  const setErrorMessage = useCallback(
    (message: string | null) => {
      if (message) {
        showFeedback("error", "요청을 처리하지 못했습니다", message);
        return;
      }
      setFeedback((current) =>
        current?.tone === "error" ? null : current,
      );
    },
    [showFeedback],
  );

  const setNotice = useCallback(
    (notice: NoticeState) => {
      if (notice) {
        showFeedback(notice.tone, notice.title, notice.text);
        return;
      }
      setFeedback((current) =>
        current?.tone !== "error" ? null : current,
      );
    },
    [showFeedback],
  );

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      const context = feedbackAudioContextRef.current;
      feedbackAudioContextRef.current = null;
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (activeZone !== "strategic") return;
    const refreshScene = () => setStrategicScene(getStrategicScene());
    const timer = window.setInterval(refreshScene, STRATEGIC_SCENE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [activeZone]);
  const effectiveHasMainCharacter = isTowaskiDebug
    ? towaskiDebugMode !== "no-agent"
    : hasMainCharacter;
  const effectiveHasBasicLicense = isTowaskiDebug
    ? towaskiDebugMode === "licensed"
    : hasBasicFirearmLicense;
  const hasCharacterQualificationAccess = catalog.items.some(
    (item) =>
      item.zone === "towaski" &&
      item.licenseStatus?.source === "character_qualification",
  );
  const effectiveHasQualificationAccess =
    !isTowaskiDebug && hasCharacterQualificationAccess;
  const effectiveTowaskiGm = isGM && !isTowaskiDebug;
  const activeZoneDef = activeZoneMeta(activeZone);
  const zoneMeta = isHub ? ARMORY_DESK_META : activeZoneDef;
  const headerZoneKey = isHub ? "hub" : activeZone;
  const requiresTowaskiLicenseTest =
    activeZone === "towaski" &&
    !effectiveTowaskiGm &&
    effectiveHasMainCharacter &&
    !effectiveHasBasicLicense;
  const showTowaskiBasicLicenseTest =
    requiresTowaskiLicenseTest &&
    (!effectiveHasQualificationAccess || towaskiLicenseTestOpen);
  const showTowaskiLicenseTest =
    showTowaskiBasicLicenseTest || selectedTowaskiLicenseTestSlug !== null;
  const activeTowaskiLicenseTestSlug = showTowaskiBasicLicenseTest
    ? TOWASKI_BASIC_FIREARM_LICENSE_SLUG
    : (selectedTowaskiLicenseTestSlug ?? TOWASKI_BASIC_FIREARM_LICENSE_SLUG);
  const towaskiDialogueContext = getTowaskiDialogueContext(
    showTowaskiLicenseTest,
  );
  const mainCharacterProfile = useMemo(
    () => getMainCharacterProfile(localStats),
    [localStats],
  );
  const towaskiWelcomeLine = useMemo(
    () => {
      if (showTowaskiLicenseTest) {
        if (
          activeTowaskiLicenseTestSlug ===
          TOWASKI_BASIC_FIREARM_LICENSE_SLUG
        ) {
          return TOWASKI_DIALOGUE_LINES.qualification;
        }
        const program = getTowaskiLicenseTestProgram(
          activeTowaskiLicenseTestSlug,
        );
        return `${program.licenseName} 시험선이다. ${program.briefing}`;
      }
      return buildTowaskiWelcomeLine({
        codename: mainCharacter?.codename ?? null,
        profile: mainCharacterProfile,
      });
    },
    [
      activeTowaskiLicenseTestSlug,
      mainCharacter?.codename,
      mainCharacterProfile,
      showTowaskiLicenseTest,
    ],
  );
  const sutureWelcomeLine = useMemo(
    () =>
      buildSutureWelcomeLine({
        codename: mainCharacter?.codename ?? null,
        profile: mainCharacterProfile,
      }),
    [mainCharacter?.codename, mainCharacterProfile],
  );
  const temperWelcomeLine = useMemo(
    () =>
      buildTemperWelcomeLine({
        codename: mainCharacter?.codename ?? null,
        profile: mainCharacterProfile,
      }),
    [mainCharacter?.codename, mainCharacterProfile],
  );
  const strategicWelcomeLine = useMemo(
    () =>
      buildStrategicWelcomeLine({
        codename: mainCharacter?.codename ?? null,
        profile: mainCharacterProfile,
      }),
    [mainCharacter?.codename, mainCharacterProfile],
  );
  const vernierWelcomeLine = useMemo(
    () => buildVernierWelcomeLine(mainCharacter?.codename ?? null),
    [mainCharacter?.codename],
  );
  const ameriWelcomeLine = useMemo(
    () => buildAmeriWelcomeLine(mainCharacter?.codename ?? null),
    [mainCharacter?.codename],
  );

  const {
    mood: ameriMood,
    visibleLine: ameriVisibleLine,
    typing: ameriTyping,
    playLine: playAmeriLine,
  } = useNpcDialogue<AmeriMood>({
    isOpen: isHub,
    hasMainCharacter,
    idleDelayMs: AMERI_IDLE_DELAY_MS,
    idleLines: AMERI_IDLE_LINES,
    closedMood: "blocked",
    closedLine: AMERI_DIALOGUE_LINES.closed,
    noAgentMood: "blocked",
    noAgentLine: AMERI_DIALOGUE_LINES.noAgent,
    welcomeMood: "welcome",
    welcomeLine: ameriWelcomeLine,
    beepPreset: "operator",
    beepDefaults: { pitch: 680, speed: 48, volume: 0.44 },
    engineVolume: 0.44,
    entrySfxSrc: null,
    entrySfxVolume: 0,
  });
  const ameriPortraitSrc = AMERI_MOOD_ASSETS[ameriMood];

  const {
    mood: towaskiMood,
    visibleLine: towaskiVisibleLine,
    typing: towaskiTyping,
    playLine: playTowaskiLine,
    clearIdleTimer: clearTowaskiIdleTimer,
    scheduleIdle: scheduleTowaskiIdle,
    showLineImmediately: showTowaskiLineImmediately,
    resetIdleCycle: resetTowaskiIdleCycle,
    stopEngine: stopTowaskiEngine,
  } = useNpcDialogue<TowaskiMood>({
    isOpen: activeZone === "towaski" && catalog.isOpen,
    hasMainCharacter: effectiveHasMainCharacter,
    idleDelayMs: TOWASKI_IDLE_DELAY_MS,
    idleLines: TOWASKI_IDLE_LINES,
    closedMood: "blocked",
    closedLine: TOWASKI_DIALOGUE_LINES.closed,
    noAgentMood: "blocked",
    noAgentLine: TOWASKI_DIALOGUE_LINES.noAgent,
    welcomeMood: showTowaskiLicenseTest ? "range" : "welcome",
    welcomeLine: towaskiWelcomeLine,
    beepPreset: "towaski",
    beepDefaults: { pitch: 510, speed: 50, volume: 0.58 },
    engineVolume: 0.58,
    entrySfxSrc: null,
    entrySfxVolume: 0,
  });
  const towaskiPortraitSrc =
    TOWASKI_MOOD_ASSETS[towaskiMood] ?? TOWASKI_PORTRAIT_SRC;
  const {
    mood: sutureMood,
    visibleLine: sutureVisibleLine,
    typing: sutureTyping,
    playLine: playSutureLine,
    clearIdleTimer: clearSutureIdleTimer,
    scheduleIdle: scheduleSutureIdle,
    showLineImmediately: showSutureLineImmediately,
    resetIdleCycle: resetSutureIdleCycle,
    stopEngine: stopSutureEngine,
  } = useNpcDialogue<SutureMood>({
    isOpen: activeZone === "lab",
    hasMainCharacter,
    idleDelayMs: SUTURE_IDLE_DELAY_MS,
    idleLines: SUTURE_IDLE_LINES,
    closedMood: "blocked",
    closedLine: "연구실 응대 채널이 닫혔습니다.",
    noAgentMood: "blocked",
    noAgentLine: SUTURE_DIALOGUE_LINES.noAgent,
    welcomeMood: "welcome",
    welcomeLine: sutureWelcomeLine,
    beepPreset: "suture",
    beepDefaults: { pitch: 720, speed: 47, volume: 0.46 },
    engineVolume: 0.46,
    entrySfxSrc: null,
    entrySfxVolume: 0,
  });
  const suturePortraitSrc =
    SUTURE_MOOD_ASSETS[sutureMood] ?? SUTURE_PROFILE_SRC;
  const {
    mood: temperMood,
    visibleLine: temperVisibleLine,
    typing: temperTyping,
    playLine: playTemperLine,
    clearIdleTimer: clearTemperIdleTimer,
    scheduleIdle: scheduleTemperIdle,
    showLineImmediately: showTemperLineImmediately,
    resetIdleCycle: resetTemperIdleCycle,
    stopEngine: stopTemperEngine,
  } = useNpcDialogue<TemperMood>({
    isOpen: activeZone === "acheron" && catalog.isOpen,
    hasMainCharacter,
    idleDelayMs: TEMPER_IDLE_DELAY_MS,
    idleLines: TEMPER_IDLE_LINES,
    closedMood: "blocked",
    closedLine: TEMPER_DIALOGUE_LINES.closed,
    noAgentMood: "blocked",
    noAgentLine: TEMPER_DIALOGUE_LINES.noAgent,
    welcomeMood: "welcome",
    welcomeLine: temperWelcomeLine,
    beepPreset: "temper",
    beepDefaults: { pitch: 440, speed: 46, volume: 0.54 },
    engineVolume: 0.54,
    entrySfxSrc: TEMPER_ENTRY_SFX_SRC,
    entrySfxVolume: 0.34,
  });
  const temperPortraitSrc = TEMPER_MOOD_ASSETS[temperMood];
  const {
    mood: strategicMood,
    visibleLine: strategicVisibleLine,
    typing: strategicTyping,
    playLine: playStrategicLine,
    clearIdleTimer: clearStrategicIdleTimer,
    scheduleIdle: scheduleStrategicIdle,
    showLineImmediately: showStrategicLineImmediately,
    resetIdleCycle: resetStrategicIdleCycle,
    stopEngine: stopStrategicEngine,
  } = useNpcDialogue<StrategicMood>({
    isOpen: activeZone === "strategic" && catalog.isOpen,
    hasMainCharacter,
    idleDelayMs: RATCHET_IDLE_DELAY_MS,
    idleLines: STRATEGIC_IDLE_LINES,
    closedMood: "blocked",
    closedLine: STRATEGIC_DIALOGUE_LINES.closed,
    noAgentMood: "blocked",
    noAgentLine: STRATEGIC_DIALOGUE_LINES.noAgent,
    welcomeMood: "welcome",
    welcomeLine: strategicWelcomeLine,
    beepPreset: "ratchet",
    beepDefaults: { pitch: 590, speed: 43, volume: 0.5 },
    engineVolume: 0.5,
    entrySfxSrc: null,
    entrySfxVolume: 0,
  });
  const ratchetPortraitSrc = RATCHET_MOOD_ASSETS[strategicMood];
  const {
    mood: vernierMood,
    visibleLine: vernierVisibleLine,
    typing: vernierTyping,
    playLine: playVernierLine,
    clearIdleTimer: clearVernierIdleTimer,
    scheduleIdle: scheduleVernierIdle,
    showLineImmediately: showVernierLineImmediately,
    resetIdleCycle: resetVernierIdleCycle,
    stopEngine: stopVernierEngine,
  } = useNpcDialogue<VernierMood>({
    isOpen: activeZone === "custom",
    hasMainCharacter,
    idleDelayMs: VERNIER_IDLE_DELAY_MS,
    idleLines: VERNIER_IDLE_LINES,
    closedMood: "blocked",
    closedLine: VERNIER_DIALOGUE_LINES.closed,
    noAgentMood: "blocked",
    noAgentLine: VERNIER_DIALOGUE_LINES.noAgent,
    welcomeMood: "welcome",
    welcomeLine: vernierWelcomeLine,
    beepPreset: "operator",
    beepDefaults: { pitch: 640, speed: 45, volume: 0.46 },
    engineVolume: 0.46,
    entrySfxSrc: null,
    entrySfxVolume: 0,
  });
  const handleTowaskiQualificationDialogue = useCallback(
    (event: TowaskiQualificationDialogueEvent) => {
      clearTowaskiIdleTimer();
      const line = getTowaskiQualificationDialogueLine(event);
      if (event.type === "start") {
        setNotice({
          tone: "info",
          title: "자격시험 시작",
          text: "카운트다운 후 표적 판정이 시작됩니다. 민간 표적에는 사격하지 마십시오.",
        });
      } else if (event.type === "failed") {
        showFeedback(
          "error",
          event.reasons.includes("invalid")
            ? "자격시험 처리 오류"
            : "자격시험 불합격",
          event.reasons.includes("invalid")
            ? "시험 결과를 처리하지 못했습니다. 시험 안내에서 다시 시도해 주십시오."
            : line,
        );
      }
      playTowaskiLine(
        event.type === "failed" ? "rangeFailed" : "range",
        line,
        { returnToIdle: false, sound: true },
      );
    },
    [clearTowaskiIdleTimer, playTowaskiLine, setNotice, showFeedback],
  );

  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const towaskiItems = useMemo(() => {
    return catalog.items.filter(
      (item) => item.zone === "towaski" && matchesEquipmentShopTab(item, activeTab),
    );
  }, [activeTab, catalog.items]);

  const acheronItems = useMemo(() => {
    return catalog.items.filter(
      (item) => item.zone === "acheron" && matchesEquipmentShopTab(item, activeTab),
    );
  }, [activeTab, catalog.items]);

  const strategicItems = useMemo(
    () => catalog.items.filter((item) => item.zone === "strategic"),
    [catalog.items],
  );

  const towaskiItemCount = useMemo(
    () => catalog.items.filter((item) => item.zone === "towaski").length,
    [catalog.items],
  );
  const acheronItemCount = useMemo(
    () => catalog.items.filter((item) => item.zone === "acheron").length,
    [catalog.items],
  );
  const strategicItemCount = strategicItems.length;
  const salesItems =
    activeZone === "strategic"
      ? strategicItems
      : activeZone === "acheron"
        ? acheronItems
        : towaskiItems;

  const selectedItem = useMemo(() => {
    const selectedInZone = selectedKey
      ? salesItems.find((item) => item.key === selectedKey)
      : undefined;
    return selectedInZone ?? salesItems[0] ?? null;
  }, [salesItems, selectedKey]);

  const canUseShop =
    effectiveHasMainCharacter &&
    catalog.isOpen &&
    !catalogQuery.isError &&
    !catalogQuery.isRefetchError;
  const purchasingKey = purchaseMutation.isPending
    ? (purchaseMutation.variables?.key ?? null)
    : null;
  const selectedIsLicenseItem = Boolean(
    selectedItem && isTowaskiLicenseCatalogItem(selectedItem),
  );
  const selectedLicenseProgram =
    selectedItem && isTowaskiLicenseSlug(selectedItem.slug)
      ? getTowaskiLicenseTestProgram(selectedItem.slug)
      : null;
  const selectedLicenseBlocked = Boolean(
    selectedItem && isEquipmentLicenseBlocked(selectedItem),
  );
  const selectedLicenseDetail = selectedItem
    ? describeEquipmentLicenseDetail(selectedItem)
    : null;
  const selectedHasBasicPurchaseAccess = selectedItem
    ? !requiresTowaskiBasicLicense(selectedItem.zone) ||
      hasTowaskiBasicPurchaseAccess({
        isGM: effectiveTowaskiGm,
        hasBasicLicense: effectiveHasBasicLicense,
        licenseStatus: selectedItem.licenseStatus,
      })
    : false;
  const selectedHasZonePurchaseAccess = Boolean(
    selectedItem &&
      hasEquipmentShopZonePurchaseAccess({
        isGM: effectiveTowaskiGm,
        purchaseZone: selectedItem.zone,
        sourceZone: selectedItem.sourceZone,
        category: selectedItem.category,
      }),
  );
  const selectedCanStartLicenseTest = Boolean(
    selectedItem &&
      selectedLicenseProgram &&
      canUseShop &&
      selectedItem.available &&
      selectedItem.licenseOwned !== true &&
      (!selectedLicenseProgram.requiresBasicLicense ||
        effectiveHasBasicLicense) &&
      !towaskiLicenseTestBusy,
  );
  const selectedCanPurchase = selectedIsLicenseItem
    ? selectedCanStartLicenseTest
    : Boolean(selectedItem) &&
      canUseShop &&
      !isTowaskiDebug &&
      selectedItem?.available === true &&
      selectedHasZonePurchaseAccess &&
      selectedHasBasicPurchaseAccess &&
      selectedItem.licenseOwned !== true &&
      !selectedLicenseBlocked &&
      selectedItem.price <= balance &&
      !purchaseMutation.isPending;

  useEffect(() => {
    if (!isResearchBonusMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !researchBonusMenuRef.current?.contains(event.target)
      ) {
        setIsResearchBonusMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsResearchBonusMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isResearchBonusMenuOpen]);

  useEffect(() => {
    if (activeZone !== "towaski") {
      clearTowaskiIdleTimer();
      stopTowaskiEngine();
      return;
    }

    if (!catalog.isOpen) {
      clearTowaskiIdleTimer();
      stopTowaskiEngine();
      playTowaskiLine("blocked", TOWASKI_DIALOGUE_LINES.closed, {
        returnToIdle: false,
        sound: false,
      });
      return;
    }

    if (!effectiveHasMainCharacter) {
      playTowaskiLine("blocked", TOWASKI_DIALOGUE_LINES.noAgent, {
        returnToIdle: false,
        sound: false,
      });
      return;
    }

    if (!shouldScheduleTowaskiShopIdle(towaskiDialogueContext)) {
      clearTowaskiIdleTimer();
      stopTowaskiEngine();
      showTowaskiLineImmediately("range", towaskiWelcomeLine);
      return;
    }

    if (towaskiQualificationPassedRef.current) {
      towaskiQualificationPassedRef.current = false;
      resetTowaskiIdleCycle();
      return;
    }

    showTowaskiLineImmediately("welcome", towaskiWelcomeLine);
    resetTowaskiIdleCycle();
    scheduleTowaskiIdle();
  }, [
    activeZone,
    catalog.isOpen,
    clearTowaskiIdleTimer,
    effectiveHasMainCharacter,
    playTowaskiLine,
    resetTowaskiIdleCycle,
    scheduleTowaskiIdle,
    showTowaskiLineImmediately,
    stopTowaskiEngine,
    towaskiDialogueContext,
    towaskiWelcomeLine,
  ]);

  useEffect(() => {
    if (activeZone !== "lab") {
      clearSutureIdleTimer();
      stopSutureEngine();
      return;
    }

    if (sutureDebugMode !== "live") {
      clearSutureIdleTimer();
      stopSutureEngine();
      playSutureLine(
        sutureDebugMode,
        SUTURE_DEBUG_LINES[sutureDebugMode],
        { returnToIdle: false, sound: true },
      );
      return;
    }

    if (!hasMainCharacter) {
      playSutureLine(
        "blocked",
        buildSutureBlockedLine(
          "noAgent",
          sutureDialogueRevisionRef.current++,
        ),
        {
          returnToIdle: false,
          sound: true,
        },
      );
      return;
    }

    showSutureLineImmediately("welcome", sutureWelcomeLine);
    resetSutureIdleCycle();
    scheduleSutureIdle();
  }, [
    activeZone,
    clearSutureIdleTimer,
    hasMainCharacter,
    playSutureLine,
    resetSutureIdleCycle,
    scheduleSutureIdle,
    showSutureLineImmediately,
    stopSutureEngine,
    sutureDebugMode,
    sutureWelcomeLine,
  ]);

  useEffect(() => {
    if (activeZone !== "acheron") {
      clearTemperIdleTimer();
      stopTemperEngine();
      return;
    }

    if (!catalog.isOpen) {
      clearTemperIdleTimer();
      stopTemperEngine();
      playTemperLine(
        "blocked",
        buildTemperBlockedLine(
          "closed",
          temperDialogueRevisionRef.current++,
        ),
        {
          returnToIdle: false,
          sound: false,
        },
      );
      return;
    }

    if (!hasMainCharacter) {
      playTemperLine(
        "blocked",
        buildTemperBlockedLine(
          "noAgent",
          temperDialogueRevisionRef.current++,
        ),
        {
          returnToIdle: false,
          sound: false,
        },
      );
      return;
    }

    showTemperLineImmediately("welcome", temperWelcomeLine);
    resetTemperIdleCycle();
    scheduleTemperIdle();
  }, [
    activeZone,
    catalog.isOpen,
    clearTemperIdleTimer,
    hasMainCharacter,
    playTemperLine,
    resetTemperIdleCycle,
    scheduleTemperIdle,
    showTemperLineImmediately,
    stopTemperEngine,
    temperWelcomeLine,
  ]);

  useEffect(() => {
    if (activeZone !== "strategic") {
      clearStrategicIdleTimer();
      stopStrategicEngine();
      return;
    }

    if (!catalog.isOpen) {
      clearStrategicIdleTimer();
      stopStrategicEngine();
      playStrategicLine("blocked", STRATEGIC_DIALOGUE_LINES.closed, {
        returnToIdle: false,
        sound: false,
      });
      return;
    }

    if (!hasMainCharacter) {
      playStrategicLine("blocked", STRATEGIC_DIALOGUE_LINES.noAgent, {
        returnToIdle: false,
        sound: false,
      });
      return;
    }

    showStrategicLineImmediately("welcome", strategicWelcomeLine);
    resetStrategicIdleCycle();
    scheduleStrategicIdle();
  }, [
    activeZone,
    catalog.isOpen,
    clearStrategicIdleTimer,
    hasMainCharacter,
    playStrategicLine,
    resetStrategicIdleCycle,
    scheduleStrategicIdle,
    showStrategicLineImmediately,
    stopStrategicEngine,
    strategicWelcomeLine,
  ]);

  useEffect(() => {
    if (activeZone !== "custom") {
      clearVernierIdleTimer();
      stopVernierEngine();
      return;
    }

    if (!hasMainCharacter) {
      playVernierLine("blocked", VERNIER_DIALOGUE_LINES.noAgent, {
        returnToIdle: false,
        sound: false,
      });
      return;
    }

    showVernierLineImmediately("welcome", vernierWelcomeLine);
    resetVernierIdleCycle();
    scheduleVernierIdle();
  }, [
    activeZone,
    clearVernierIdleTimer,
    hasMainCharacter,
    playVernierLine,
    resetVernierIdleCycle,
    scheduleVernierIdle,
    showVernierLineImmediately,
    stopVernierEngine,
    vernierWelcomeLine,
  ]);

  const scopedResearchTree = useMemo(
    () =>
      researchTree.filter((node) =>
        node.allowedScopes.includes(activeResearchScope),
      ),
    [activeResearchScope, researchTree],
  );

  const researchTrackLayout = useMemo(() => {
    const branches = new Map<string, ResearchNodeEntry[]>();
    for (const node of scopedResearchTree) {
      const bucket = branches.get(node.branch);
      if (bucket) bucket.push(node);
      else branches.set(node.branch, [node]);
    }

    const rows = Array.from(branches.entries())
      .sort(([branchA], [branchB]) => {
        const rankDiff =
          getResearchBranchRank(branchA) - getResearchBranchRank(branchB);
        return rankDiff !== 0 ? rankDiff : branchA.localeCompare(branchB);
      })
      .map(([branch, nodes]) => ({
        branch,
        meta: getResearchBranchMeta(branch),
        nodes,
      }));

    const tierWidths = new Map<number, number>();
    for (const row of rows) {
      const tierCounts = new Map<number, number>();
      for (const node of row.nodes) {
        tierCounts.set(node.tier, (tierCounts.get(node.tier) ?? 0) + 1);
      }
      for (const [tier, count] of tierCounts) {
        tierWidths.set(tier, Math.max(tierWidths.get(tier) ?? 0, count));
      }
    }

    const tierSegments: Array<{
      tier: number;
      startColumn: number;
      span: number;
    }> = [];
    const tierStartColumns = new Map<number, number>();
    let nextColumn = 1;
    for (const tier of Array.from(tierWidths.keys()).sort((a, b) => a - b)) {
      const span = Math.max(1, tierWidths.get(tier) ?? 1);
      tierSegments.push({ tier, startColumn: nextColumn, span });
      tierStartColumns.set(tier, nextColumn);
      nextColumn += span;
    }

    const rowsWithColumns = rows.map((row) => {
      const tierIndexes = new Map<number, number>();
      const nodes = row.nodes.map((node) => {
        const indexInTier = tierIndexes.get(node.tier) ?? 0;
        tierIndexes.set(node.tier, indexInTier + 1);
        return {
          node,
          column: (tierStartColumns.get(node.tier) ?? 1) + indexInTier,
        };
      });
      return {
        ...row,
        lastColumn: Math.max(...nodes.map(({ column }) => column), 1),
        nodes,
      };
    });

    return {
      columnCount: Math.max(1, nextColumn - 1),
      rows: rowsWithColumns,
      tiers: tierSegments,
    };
  }, [scopedResearchTree]);

  const activeResearchProjects = useMemo(
    () =>
      researchProjects.filter(
        (project) =>
          project.scope === activeResearchScope &&
          project.computedStatus !== "applied",
      ),
    [activeResearchScope, researchProjects],
  );

  const appliedResearchProjects = useMemo(
    () =>
      researchProjects.filter(
        (project) =>
          project.scope === activeResearchScope &&
          project.computedStatus === "applied",
      ),
    [activeResearchScope, researchProjects],
  );

  const personalResearchStatTotals = useMemo<
    Record<EquipmentResearchStat, number>
  >(() => {
    const totals: Record<EquipmentResearchStat, number> = {
      hp: 0,
      san: 0,
      atk: 0,
      def: 0,
    };
    const targetCharacterId = mainCharacter?.id;
    if (!targetCharacterId) return totals;

    for (const project of researchProjects) {
      if (
        project.scope !== "personal" ||
        project.computedStatus !== "applied" ||
        !project.targetCharacterIds.includes(targetCharacterId) ||
        project.effect.kind !== "stat"
      ) {
        continue;
      }
      totals[project.effect.stat] += project.effect.amount;
    }
    return totals;
  }, [mainCharacter?.id, researchProjects]);

  const assignedAgent = effectiveHasMainCharacter
    ? (mainCharacter?.codename ?? "DEBUG AGENT")
    : "UNASSIGNED";
  const headerTag = isTowaskiDebug
    ? `DEBUG / ${TOWASKI_DEBUG_MODES.find((debugMode) => debugMode.value === towaskiDebugMode)?.label ?? "SANDBOX"}`
    : isSutureDebug
      ? `DEBUG / ${SUTURE_DEBUG_MODES.find((debugMode) => debugMode.value === sutureDebugMode)?.label ?? "SANDBOX"}`
    : isHub
      ? "BUREAU CONTROL"
      : activeZone === "lab"
        ? "RESEARCH CONTROL"
        : activeZone === "towaski"
          ? effectiveTowaskiGm
            ? "GM OVERRIDE"
            : effectiveHasBasicLicense
              ? "LICENSE ACTIVE"
              : effectiveHasQualificationAccess
                ? "APTITUDE ACCESS"
              : "RANGE TEST"
          : activeZone === "acheron"
            ? "FORGE CATALOG"
            : activeZone === "strategic"
              ? "REQUISITION"
              : "WORKSHOP INTAKE";
  const headerStats = isHub
    ? [
        { label: "담당 요원", value: assignedAgent },
        { label: "운영 구역", value: `${ZONE_DEFS.length}개` },
        { label: "접근 권한", value: isGM ? "GM" : "AGENT" },
      ]
    : activeZone === "lab"
      ? [
          { label: "연구 대상", value: assignedAgent },
          { label: "연구 범위", value: scopeLabel(activeResearchScope) },
          { label: "진행 과제", value: `${activeResearchProjects.length}건` },
        ]
      : activeZone === "towaski"
        ? [
            { label: "반출 요원", value: assignedAgent },
            { label: "보유 크레딧", value: formatCredits(balance) },
            {
              label: "화기 자격",
              value: effectiveTowaskiGm
                ? hasBasicFirearmLicense
                  ? "승인"
                  : "GM 면제"
                : effectiveHasBasicLicense
                  ? "승인"
                  : effectiveHasQualificationAccess
                    ? "적성 승인"
                  : "미발급",
            },
          ]
        : activeZone === "acheron"
          ? [
              { label: "제작 대상", value: assignedAgent },
              { label: "보유 크레딧", value: formatCredits(balance) },
              { label: "등록 품목", value: `${acheronItemCount}종` },
            ]
          : activeZone === "strategic"
            ? [
                { label: "보급 대상", value: assignedAgent },
                { label: "보유 크레딧", value: formatCredits(balance) },
                { label: "보급 품목", value: `${strategicItemCount}종` },
              ]
            : [
                { label: "제작 대상", value: assignedAgent },
                { label: "제작 구분", value: "전용 무기" },
                { label: "접수 상태", value: "준비 중" },
              ];

  const selectedResearchNode = useMemo(() => {
    return (
      scopedResearchTree.find((node) => node.key === selectedResearchKey) ??
      scopedResearchTree[0] ??
      null
    );
  }, [scopedResearchTree, selectedResearchKey]);

  const selectedNodeProjects = useMemo(() => {
    if (!selectedResearchNode) return [];
    return researchProjects.filter(
      (project) =>
        project.key === selectedResearchNode.key &&
        project.scope === activeResearchScope,
    );
  }, [activeResearchScope, researchProjects, selectedResearchNode]);

  function handleTowaskiDebugMode(nextMode: TowaskiDebugMode) {
    if (purchaseMutation.isPending || towaskiLicenseTestBusy) return;
    setTowaskiDebugMode(nextMode);
    setTowaskiLicenseTestOpen(false);
    setSelectedTowaskiLicenseTestSlug(null);
    setTowaskiDebugRevision((value) => value + 1);
    setErrorMessage(null);
    setNotice(
      nextMode === "live"
        ? null
        : {
            tone: "info",
            title: "토와스키 디버그 모드",
            text: "TOWASKI DEBUG SANDBOX / DB WRITE 0",
          },
    );
  }

  function handleSutureDebugMode(nextMode: SutureDebugMode) {
    setSutureDebugMode(nextMode);
    setErrorMessage(null);
    setNotice(
      nextMode === "live"
        ? null
        : {
            tone: "info",
            title: "수처 디버그 모드",
            text: "SUTURE PORTRAIT SANDBOX / DB WRITE 0",
          },
    );
  }

  function playTowaskiIfActive(mood: TowaskiMood, text: string) {
    if (activeZone !== "towaski" || towaskiDialogueContext !== "shop") return;
    playTowaskiLine(mood, text, { sound: true });
  }

  function playSutureIfActive(mood: SutureMood, text: string) {
    if (activeZone !== "lab" || isSutureDebug) return;
    playSutureLine(mood, text, { sound: true });
  }

  function nextSutureBlockedLine(reason: SutureBlockReason): string {
    return buildSutureBlockedLine(
      reason,
      sutureDialogueRevisionRef.current++,
    );
  }

  function playTemperIfActive(mood: TemperMood, text: string) {
    if (activeZone !== "acheron") return;
    playTemperLine(mood, text, { sound: true });
  }

  function playStrategicIfActive(mood: StrategicMood, text: string) {
    if (activeZone !== "strategic") return;
    playStrategicLine(mood, text, { sound: true });
  }

  function handleSalesTabChange(tab: EquipmentShopTabValue) {
    setActiveTab(tab);
    if (activeZone === "towaski") {
      playTowaskiIfActive("inspect", buildTowaskiTabLine(tab));
    } else if (activeZone === "acheron") {
      playTemperIfActive(
        "inspect",
        buildTemperTabLine(tab, temperDialogueRevisionRef.current++),
      );
    }
  }

  function handleStartTowaskiLicenseTest(item: EquipmentShopCatalogEntry) {
    if (!isTowaskiLicenseSlug(item.slug) || item.licenseOwned) return;
    const program = getTowaskiLicenseTestProgram(item.slug);
    if (
      program.requiresBasicLicense &&
      !effectiveHasBasicLicense
    ) {
      setErrorMessage("전문 자격시험은 기본 화기 라이센스 취득 후 응시할 수 있습니다.");
      playTowaskiIfActive("blocked", TOWASKI_DIALOGUE_LINES.qualification);
      return;
    }
    setSelectedKey(item.key);
    setSelectedTowaskiLicenseTestSlug(item.slug);
    setTowaskiLicenseTestOpen(true);
    setErrorMessage(null);
    setNotice({
      tone: "info",
      title: `${program.tierLabel} 자격시험`,
      text: `${item.name} 시험 안내를 불러왔습니다.`,
    });
    playTowaskiLine("range", `${item.name} 시험선 열었다. 기준부터 확인해.`, {
      returnToIdle: false,
      sound: true,
    });
  }

  function handleSelectSalesItem(item: EquipmentShopCatalogEntry) {
    setSelectedKey(item.key);
    quoteMutation.reset();
    if (activeZone === "towaski") {
      const nextLine = buildTowaskiItemLine(item, mainCharacter?.codename);
      playTowaskiIfActive(nextLine.mood, nextLine.text);
      if (
        item.category === "ARMOR" &&
        effectiveHasMainCharacter &&
        !isTowaskiDebug
      ) {
        armorReferralMutation.mutate(
          { key: item.key },
          {
            onSuccess: () => {
              playTowaskiIfActive(
                "stock",
                buildTowaskiArmorReferralLine(
                  item,
                  towaskiDialogueRevisionRef.current++,
                ),
              );
            },
            onError: (err) => {
              setErrorMessage(describeEquipmentShopError(err));
            },
          },
        );
      }
    } else if (activeZone === "acheron") {
      const nextLine = item.discount
        ? {
            mood: "balance" as const,
            text: buildTemperArmorReferralLine(
              item,
              temperDialogueRevisionRef.current++,
            ),
          }
        : buildTemperItemLine(item, temperDialogueRevisionRef.current++);
      playTemperIfActive(nextLine.mood, nextLine.text);
    } else if (activeZone === "strategic") {
      const nextLine = buildStrategicItemLine(
        item,
        strategicDialogueRevisionRef.current++,
      );
      playStrategicIfActive(nextLine.mood, nextLine.text);
    }
  }

  function handlePurchase(item: EquipmentShopCatalogEntry) {
    if (isTowaskiLicenseCatalogItem(item)) {
      handleStartTowaskiLicenseTest(item);
      return;
    }
    if (purchaseLockRef.current || purchaseMutation.isPending) return;

    const hasZonePurchaseAccess = hasEquipmentShopZonePurchaseAccess({
      isGM: effectiveTowaskiGm,
      purchaseZone: item.zone,
      sourceZone: item.sourceZone,
      category: item.category,
    });
    if (!canUseShop || !hasZonePurchaseAccess) {
      setErrorMessage(
        effectiveHasMainCharacter
          ? "GM preview 상태에서만 병기부 구매를 실행할 수 있습니다."
          : "메인 AGENT 캐릭터가 없어 구매할 수 없습니다.",
      );
      playTowaskiIfActive(
        "blocked",
        effectiveHasMainCharacter
          ? TOWASKI_DIALOGUE_LINES.gmOnly
          : TOWASKI_DIALOGUE_LINES.noAgent,
      );
      playTemperIfActive(
        "blocked",
        buildTemperBlockedLine(
          effectiveHasMainCharacter ? "gmOnly" : "noAgent",
          temperDialogueRevisionRef.current++,
        ),
      );
      playStrategicIfActive(
        "blocked",
        effectiveHasMainCharacter
          ? STRATEGIC_DIALOGUE_LINES.gmOnly
          : STRATEGIC_DIALOGUE_LINES.noAgent,
      );
      return;
    }

    if (isTowaskiDebug) {
      setErrorMessage("디버그 샌드박스에서는 실제 구매를 실행할 수 없습니다.");
      return;
    }

    if (
      requiresTowaskiBasicLicense(item.zone) &&
      !hasTowaskiBasicPurchaseAccess({
        isGM: effectiveTowaskiGm,
        hasBasicLicense: effectiveHasBasicLicense,
        licenseStatus: item.licenseStatus,
      })
    ) {
      setErrorMessage(
        "기본 화기 라이센스가 없으면 캐릭터 적성이 확인된 품목만 구매할 수 있습니다.",
      );
      playTowaskiIfActive(
        "blocked",
        "기본 자격이 없으면 네 적성 기록에 찍힌 물건만 내줄 수 있다.",
      );
      playTemperIfActive(
        "blocked",
        buildTemperBlockedLine(
          "qualification",
          temperDialogueRevisionRef.current++,
        ),
      );
      return;
    }

    if (!item.available) {
      setErrorMessage("현재 반출할 수 없는 품목입니다.");
      playTowaskiIfActive("stock", TOWASKI_DIALOGUE_LINES.unavailable);
      playTemperIfActive(
        "blocked",
        buildTemperBlockedLine(
          "unavailable",
          temperDialogueRevisionRef.current++,
        ),
      );
      playStrategicIfActive("blocked", STRATEGIC_DIALOGUE_LINES.unavailable);
      return;
    }

    if (item.licenseOwned) {
      setErrorMessage("이미 발급된 라이센스입니다.");
      playTowaskiIfActive("blocked", "이미 장부에 올라간 라이센스다. 중복 발급은 안 해.");
      return;
    }

    if (isEquipmentLicenseBlocked(item) && item.licenseRequirement) {
      setErrorMessage(
        `${item.licenseRequirement.licenseName}가 있거나 해당 화기 적성이 확인되어야 구매할 수 있습니다.`,
      );
      playTowaskiIfActive(
        "blocked",
        `${item.licenseRequirement.label} 자격이 없다. 라이센스를 발급받거나 네 적성 기록부터 확인해.`,
      );
      playTemperIfActive(
        "blocked",
        buildTemperBlockedLine(
          "qualification",
          temperDialogueRevisionRef.current++,
        ),
      );
      playStrategicIfActive("blocked", STRATEGIC_DIALOGUE_LINES.gmOnly);
      return;
    }

    if (item.price > balance) {
      setErrorMessage("잔액이 부족합니다.");
      playTowaskiIfActive("blocked", TOWASKI_DIALOGUE_LINES.checkoutError);
      playTemperIfActive(
        "blocked",
        buildTemperBlockedLine(
          "insufficient",
          temperDialogueRevisionRef.current++,
        ),
      );
      playStrategicIfActive("blocked", STRATEGIC_DIALOGUE_LINES.insufficient);
      return;
    }

    purchaseLockRef.current = true;
    const isLicenseItem = isTowaskiLicenseCatalogItem(item);
    setSelectedKey(item.key);
    setErrorMessage(null);
    setNotice(null);
    playTowaskiIfActive(
      isLicenseItem ? "license" : "cart",
      buildTowaskiCartLine(item),
    );
    playTemperIfActive(
      "cart",
      buildTemperCartLine(item, temperDialogueRevisionRef.current++),
    );
    playStrategicIfActive(
      "dispatch",
      buildStrategicDispatchLine(item),
    );
    purchaseMutation.mutate(
      { key: item.key, zone: item.zone, expectedUnitPrice: item.price },
      {
        onSuccess: (res) => {
          setNotice({
            tone: "success",
            title: isLicenseItem ? "라이센스 발급 완료" : "병기 반출 체결 완료",
            text: isLicenseItem
              ? `${res.order.items[0]?.name ?? item.name} 발급이 완료되었습니다.`
              : `${res.order.items[0]?.name ?? item.name} 1개 반출 결제가 완료되었습니다.${
                  res.order.totalDiscount > 0
                    ? ` 토와스키 열람 연계로 ${formatCredits(res.order.totalDiscount)} 할인되었습니다.`
                    : ""
                }`,
          });
          playTowaskiIfActive(
            isLicenseItem ? "license" : "checkout",
            isLicenseItem
              ? TOWASKI_DIALOGUE_LINES.licenseIssued
              : TOWASKI_DIALOGUE_LINES.checkout,
          );
          playTemperIfActive(
            "checkout",
            buildTemperCheckoutLine(
              item,
              temperDialogueRevisionRef.current++,
            ),
          );
          playStrategicIfActive(
            "checkout",
            buildStrategicCheckoutLine(
              item,
              strategicDialogueRevisionRef.current++,
            ),
          );
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
          playTowaskiIfActive("blocked", TOWASKI_DIALOGUE_LINES.checkoutError);
          playTemperIfActive(
            "blocked",
            buildTemperBlockedLine(
              "checkoutError",
              temperDialogueRevisionRef.current++,
            ),
          );
          playStrategicIfActive(
            "blocked",
            STRATEGIC_DIALOGUE_LINES.checkoutError,
          );
        },
        onSettled: () => {
          purchaseLockRef.current = false;
        },
      },
    );
  }

  const handleTowaskiLicenseGranted = useCallback(
    (license: { slug: string; name: string }) => {
      const isBasicLicense =
        license.slug === TOWASKI_BASIC_FIREARM_LICENSE_SLUG;
      towaskiQualificationPassedRef.current = true;
      setTowaskiLicenseTestOpen(false);
      setSelectedTowaskiLicenseTestSlug(null);
      setActiveTab("LICENSE");
      setSelectedKey(null);
      if (isTowaskiDebug && isBasicLicense) {
        setTowaskiDebugMode("licensed");
      } else if (isBasicLicense) {
        setHasBasicFirearmLicense(true);
      }
      setErrorMessage(null);
      setNotice({
        tone: "success",
        title: isTowaskiDebug ? "사격 시험 디버그 통과" : "사격 자격 승인",
        text: isTowaskiDebug
          ? `DEBUG PASS / ${license.name} / DB WRITE 0`
          : isBasicLicense
            ? `${license.name}가 발급되었습니다. 자격 관리 화면에서 중급·고급 시험을 선택할 수 있습니다.`
            : `${license.name}가 발급되었습니다. 해당 전문 장비 반출 조건이 해제되었습니다.`,
      });
      playTowaskiLine(
        "checkout",
        isBasicLicense
          ? TOWASKI_DIALOGUE_LINES.qualificationPassed
          : TOWASKI_DIALOGUE_LINES.licenseIssued,
        {
          returnToIdle: true,
          sound: true,
        },
      );
    },
    [isTowaskiDebug, playTowaskiLine, setErrorMessage, setNotice],
  );

  function formatDuration(hours: number): string {
    if (hours % 24 === 0) return `${hours / 24}일`;
    if (hours > 24) return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
    return `${hours}시간`;
  }

  function formatDateTime(value: string): string {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatWorkshopCountdown(readyAt: string): string {
    if (!workshopClock) return "남은 시간 계산 중";
    const remainingSeconds = Math.max(
      0,
      Math.ceil((new Date(readyAt).getTime() - workshopClock) / 1000),
    );
    if (remainingSeconds === 0) return "제작 완료 · 수령 가능";
    const days = Math.floor(remainingSeconds / 86_400);
    const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
    const minutes = Math.floor((remainingSeconds % 3_600) / 60);
    const seconds = remainingSeconds % 60;
    return [days ? `${days}일` : "", hours ? `${hours}시간` : "", `${minutes}분`, `${seconds}초`]
      .filter(Boolean)
      .join(" ");
  }

  function projectStatusLabel(
    status: EquipmentResearchProjectEntry["computedStatus"],
  ): string {
    if (status === "completed") return "완료 대기";
    if (status === "applied") return "적용됨";
    if (status === "applying") return "적용 중";
    return "진행 중";
  }

  function canStartResearch(scope: EquipmentResearchScope, cost: number): boolean {
    return (
      scope === "personal" &&
      hasMainCharacter &&
      !researchDataUnavailable &&
      balance >= cost &&
      !startResearchMutation.isPending
    );
  }

  function handleResearchScopeChange(scope: EquipmentResearchScope) {
    setActiveResearchScope(scope);
    setSelectedResearchKeys((prev) => ({
      ...prev,
      [scope]:
        prev[scope] ||
        getFirstResearchKeyForScope(research.tree, scope),
    }));
    playSutureIfActive("protocol", buildSutureScopeLine(scope));
  }

  function handleSelectResearchNode(key: string) {
    setSelectedResearchKeys((prev) => ({
      ...prev,
      [activeResearchScope]: key,
    }));
    const node = research.tree.find((item) => item.key === key);
    if (node) {
      const effect = node.effects[activeResearchScope] ?? null;
      playSutureIfActive(
        "assessment",
        buildSutureNodeLine({
          nodeName: node.name,
          scope: activeResearchScope,
          effect,
          effectText: effect
            ? describeEquipmentResearchEffect(effect)
            : "효과 미지정",
        }),
      );
    }
  }

  function handleStartResearch(key: string, scope: EquipmentResearchScope) {
    const node = research.tree.find((item) => item.key === key);
    const startQuote = node
      ? quoteEquipmentResearchStart({
          node,
          capabilities: research.capabilities,
        })
      : null;
    if (
      !node ||
      !node.allowedScopes.includes(scope) ||
      !startQuote ||
      !canStartResearch(scope, startQuote.cost)
    ) {
      playSutureIfActive("blocked", nextSutureBlockedLine("start"));
      return;
    }
    if (
      !window.confirm(
        [
          `${node.name} (${key}) 개인 연구를 시작합니다.`,
          `대상: ${mainCharacter?.codename ?? "UNASSIGNED"}`,
          `비용: ${formatCredits(startQuote.cost)}`,
          `예상 기간: ${formatDuration(startQuote.durationHours)}`,
          "시작 후 사용한 연구비는 자동 환불되지 않습니다.",
        ].join("\n"),
      )
    ) {
      return;
    }
    setErrorMessage(null);
    setNotice(null);
    startResearchMutation.mutate(
      {
        key,
        scope,
        ...(mainCharacter ? { targetCharacterId: mainCharacter.id } : {}),
      },
      {
        onSuccess: (res) => {
          setNotice({
            tone: "success",
            title: "개인 연구 접수 완료",
            text: `${res.project.key} 연구를 시작했습니다.`,
          });
          playSutureIfActive(
            "procedure",
            buildSutureResearchStartedLine(node.name),
          );
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
          playSutureIfActive("blocked", nextSutureBlockedLine("start"));
        },
      },
    );
  }

  function handleContributeTeamResearch(key: string, remainingCost: number) {
    if (contributeResearchMutation.isPending) return;
    if (researchDataUnavailable) {
      setErrorMessage("연구 정보를 갱신하지 못해 변경 기능을 잠갔습니다.");
      playSutureIfActive("blocked", nextSutureBlockedLine("contribution"));
      return;
    }
    const requestedAmount = Math.floor(Number(teamContributionAmount));
    const chargePreview = Math.min(requestedAmount, remainingCost);
    if (
      !Number.isInteger(requestedAmount) ||
      requestedAmount <= 0 ||
      chargePreview <= 0
    ) {
      setErrorMessage("기여 금액은 1 CR 이상이어야 합니다.");
      playSutureIfActive("blocked", nextSutureBlockedLine("contribution"));
      return;
    }
    if (!hasMainCharacter) {
      setErrorMessage("메인 AGENT 캐릭터가 없어 팀 연구에 기여할 수 없습니다.");
      playSutureIfActive("blocked", nextSutureBlockedLine("noAgent"));
      return;
    }
    if (balance < chargePreview) {
      setErrorMessage("잔액이 부족합니다.");
      playSutureIfActive("blocked", nextSutureBlockedLine("contribution"));
      return;
    }
    if (
      !window.confirm(
        [
          `${key} 팀 연구에 기여합니다.`,
          `기여액: ${formatCredits(chargePreview)}`,
          `기여 후 예상 잔액: ${formatCredits(balance - chargePreview)}`,
          "기여금은 접수 후 자동 환불되지 않습니다.",
        ].join("\n"),
      )
    ) {
      return;
    }

    setErrorMessage(null);
    setNotice(null);
    contributeResearchMutation.mutate(
      {
        key,
        amount: requestedAmount,
      },
      {
        onSuccess: (res) => {
          setNotice({
            tone: "success",
            title: res.project ? "팀 연구 개시" : "연구 기여금 접수",
            text: res.project
              ? `${res.project.key} 팀 연구 목표액이 충족되어 연구를 시작했습니다.`
              : `${res.pool.key} 팀 연구에 ${formatCredits(res.chargedAmount)} 기여했습니다.`,
          });
          playSutureIfActive(
            res.project ? "procedure" : "funding",
            buildSutureContributionLine({
              projectKey: res.project?.key ?? res.pool.key,
              chargedAmount: formatCredits(res.chargedAmount),
              started: Boolean(res.project),
            }),
          );
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
          playSutureIfActive(
            "blocked",
            nextSutureBlockedLine("contribution"),
          );
        },
      },
    );
  }

  function handleRushResearch(
    project: EquipmentResearchProjectEntry,
    cost: number,
    hours: number,
  ) {
    if (rushResearchMutation.isPending) return;
    if (researchDataUnavailable) {
      setErrorMessage("연구 정보를 갱신하지 못해 변경 기능을 잠갔습니다.");
      playSutureIfActive("blocked", nextSutureBlockedLine("rush"));
      return;
    }
    if (
      !window.confirm(
        [
          `${project.key} 연구 시간을 단축합니다.`,
          `비용: ${formatCredits(cost)}`,
          `단축 시간: ${formatDuration(hours)}`,
          "단축 비용은 접수 후 자동 환불되지 않습니다.",
        ].join("\n"),
      )
    ) {
      return;
    }
    setErrorMessage(null);
    setNotice(null);
    rushResearchMutation.mutate(
      { projectId: project.id },
      {
        onSuccess: (res) => {
          setNotice({
            tone: "success",
            title: "연구 일정 단축 완료",
            text:
              `연구 시간을 ${formatDuration(res.rush.hours)} 단축했습니다.` +
              `${res.rush.discountApplied ? " (할인 적용)" : ""}`,
          });
          playSutureIfActive(
            "procedure",
            buildSutureRushLine(formatDuration(res.rush.hours)),
          );
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
          playSutureIfActive("blocked", nextSutureBlockedLine("rush"));
        },
      },
    );
  }

  function handleCompleteResearch(project: EquipmentResearchProjectEntry) {
    if (completeResearchMutation.isPending) return;
    if (researchDataUnavailable) {
      setErrorMessage("연구 정보를 갱신하지 못해 변경 기능을 잠갔습니다.");
      playSutureIfActive("blocked", nextSutureBlockedLine("complete"));
      return;
    }
    const isLeaseRecovery =
      project.computedStatus === "applying" &&
      isEquipmentResearchApplyLeaseStale(project.updatedAt);
    if (
      !window.confirm(
        [
          `${project.key} ${scopeLabel(project.scope)} 연구 효과를 적용합니다.`,
          `효과: ${describeEquipmentResearchEffect(project.effect)}`,
          project.scope === "team"
            ? `대상: 연구 시작 시 확정된 ${project.targetCharacterIds.length}명`
            : `대상: ${project.targetCharacterIds.length}명`,
          isLeaseRecovery
            ? "중단된 적용 예약을 회수한 뒤 다시 적용합니다."
            : "적용 후 대상 캐릭터의 실제 수치가 변경됩니다.",
        ].join("\n"),
      )
    ) {
      return;
    }
    setErrorMessage(null);
    setNotice(null);
    completeResearchMutation.mutate(
      { projectId: project.id },
      {
        onSuccess: (res) => {
          if (mainCharacter && res.effect.kind === "stat") {
            const appliedStat = res.effect.stat;
            const ownResult = res.targets.find(
              (target) => target.id === mainCharacter.id,
            );
            if (ownResult) {
              setLocalStats((prev) =>
                prev ? { ...prev, [appliedStat]: ownResult.after } : prev,
              );
            }
          }
          setNotice({
            tone: "success",
            title: "연구 효과 적용 완료",
            text:
              `${res.key} 연구 효과를 적용했습니다.` +
              `${res.skipped.length > 0 ? ` (${res.skipped.length}명 제외)` : ""}`,
          });
          playSutureIfActive(
            "recovery",
            buildSutureRecoveryLine(res.key),
          );
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
          playSutureIfActive("blocked", nextSutureBlockedLine("complete"));
        },
      },
    );
  }

  function handleZoneLinkClick(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (
      event.button !== 0 ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    router.push(href);
  }

  function handleHubDestinationChange(destination: ArmoryDestination) {
    setActiveHubDestination(destination);
    const nextLine = buildAmeriDestinationLine(
      destination,
      mainCharacter?.codename ?? null,
      ameriDialogueRevisionRef.current++,
    );
    playAmeriLine(nextLine.mood, nextLine.text, { sound: true });
  }

  function renderHubPanel() {
    const totalCatalogItemCount =
      towaskiItemCount + acheronItemCount + strategicItemCount;
    const availableCatalogItemCount = catalog.items.filter(
      (item) => item.available,
    ).length;
    const activeProjectCount = researchProjects.filter(
      (project) => project.computedStatus !== "applied",
    ).length;
    const readyProjectCount = researchProjects.filter(
      (project) => project.computedStatus === "completed",
    ).length;
    const appliedProjectCount = researchProjects.filter(
      (project) => project.computedStatus === "applied",
    ).length;
    const personalResearchCount = research.tree.filter((node) =>
      node.allowedScopes.includes("personal"),
    ).length;
    const teamResearchCount = research.tree.filter((node) =>
      node.allowedScopes.includes("team"),
    ).length;

    const commandStats = [
      {
        key: "issue",
        label: "반출 준비",
        value: `${availableCatalogItemCount}종`,
        detail: `전체 ${totalCatalogItemCount}종 · 가용성 기준`,
        warning: false,
      },
      {
        key: "research",
        label: "연구 관제",
        value: activeProjectCount > 0 ? `${activeProjectCount}건 진행` : "대기 없음",
        detail: `완료 ${readyProjectCount} · 적용 ${appliedProjectCount}`,
        warning: false,
      },
      {
        key: "attention",
        label: "즉시 확인",
        value: !hasMainCharacter
          ? "요원 미지정"
          : readyProjectCount > 0
            ? `완료 연구 ${readyProjectCount}건`
            : "이상 없음",
        detail: !hasMainCharacter
          ? "개인 연구·반출 제한"
          : `${personalResearchCount + teamResearchCount}개 연구 노드 감시 중`,
        warning: !hasMainCharacter || readyProjectCount > 0,
      },
    ];

    const operationCards = [
      {
        key: "lab" as const,
        iconKey: "lab" as const,
        eyebrow: "RESEARCH CONTROL",
        title: "강화 연구",
        href: "/erp/equipment-shop/lab",
        status:
          activeProjectCount > 0
            ? `진행 ${activeProjectCount} · 완료 대기 ${readyProjectCount}`
            : "대기 큐 없음",
        detail: "개인/팀 강화 연구와 완료 적용 대기열을 관리합니다.",
        warning: false,
      },
      {
        key: "towaski" as const,
        iconKey: "towaski" as const,
        eyebrow: "ISSUE COUNTER",
        title: "토와스키 건샵",
        href: "/erp/equipment-shop/towaski",
        status:
          towaskiItemCount > 0
            ? `${towaskiItemCount}종 반출 가능`
            : "등록 품목 없음",
        detail: "화기, 방어구, 전투 소모품을 크레딧 결제 후 반출합니다.",
        warning: towaskiItemCount === 0,
      },
      {
        key: "acheron" as const,
        iconKey: "acheron" as const,
        eyebrow: "ACHERON FORGE",
        title: "아케론 대장간",
        href: "/erp/equipment-shop/acheron",
        status:
          acheronItemCount > 0
            ? `${acheronItemCount}종 반출 가능`
            : "등록 품목 없음",
        detail: "근접무기와 냉병기류를 별도 대장간 카탈로그에서 반출합니다.",
        warning: acheronItemCount === 0,
      },
      {
        key: "simulator" as const,
        iconKey: "simulator" as const,
        eyebrow: "TEST RANGE",
        title: "훈련장",
        href: "/erp/equipment-shop/simulator",
        status: "시험장 모듈 활성",
        detail: "보급형 장비의 사거리, 탄환 운용, 공격 흐름을 시험합니다.",
        warning: false,
      },
      {
        key: "strategic" as const,
        iconKey: "strategic" as const,
        eyebrow: "SPECIAL ASSETS",
        title: "전략 장비 보급소",
        href: "/erp/equipment-shop/strategic",
        status:
          strategicItemCount > 0
            ? `${strategicItemCount}종 승인 목록`
            : "승인 목록 없음",
        detail: "차량, 작전 보조품, 특수 장비처럼 SPECIAL 태그가 붙은 품목을 분리합니다.",
        warning: strategicItemCount === 0,
      },
      {
        key: "custom" as const,
        iconKey: "custom" as const,
        eyebrow: "FABRICATION",
        title: "공방",
        href: "/erp/equipment-shop/custom",
        status: "공방 상담 · 훈련장 연결",
        detail: "전용무기 상담과 보급형 장비 성능 시험을 병기부 하위 모듈로 분리합니다.",
        warning: false,
      },
    ];
    const selectedOperation =
      operationCards.find((card) => card.key === activeHubDestination) ??
      operationCards[0];

    return (
      <div className={styles.hubScene} aria-label="병기부 안내데스크">
        <div className={styles.hubStatusRail} aria-label="병기부 운영 현황">
          {commandStats.map((stat) => (
            <div
              key={stat.key}
              className={[
                styles.hubStatus,
                stat.warning ? styles["hubStatus--warning"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <em>{stat.detail}</em>
            </div>
          ))}
        </div>

        <nav className={styles.hubHotspots} aria-label="병기부 구역 이동">
          {operationCards.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className={[
                styles.hubHotspot,
                card.key === selectedOperation.key
                  ? styles["hubHotspot--active"]
                  : "",
                card.warning ? styles["hubHotspot--warning"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={(event) => handleZoneLinkClick(event, card.href)}
              onMouseEnter={() => handleHubDestinationChange(card.key)}
              onFocus={() => handleHubDestinationChange(card.key)}
              aria-describedby="hub-destination-description"
            >
              <span className={styles.hubHotspot__pin} aria-hidden>
                <ArmoryZoneIcon zone={card.iconKey} />
              </span>
              <span className={styles.hubHotspot__label}>
                <span>{card.eyebrow}</span>
                <strong>{card.title}</strong>
                <em>{card.status}</em>
              </span>
            </Link>
          ))}
        </nav>

        <aside
          className={styles.hubDeskConsole}
          aria-label="선택 구역 안내"
        >
          <div className={styles.hubDeskConsole__summary}>
            <span className={styles.hubDeskConsole__icon} aria-hidden>
              <ArmoryZoneIcon zone={selectedOperation.iconKey} />
            </span>
            <div>
              <Eyebrow>{selectedOperation.eyebrow}</Eyebrow>
              <strong>{selectedOperation.title}</strong>
              <p id="hub-destination-description">{selectedOperation.detail}</p>
            </div>
          </div>
          <div className={styles.hubDeskConsole__action}>
            <span>현재 상태</span>
            <strong
              className={
                selectedOperation.warning
                  ? styles["hubDeskConsole__status--warning"]
                  : ""
              }
            >
              {selectedOperation.status}
            </strong>
            <Link
              href={selectedOperation.href}
              className={styles.hubDeskConsole__link}
              onClick={(event) =>
                handleZoneLinkClick(event, selectedOperation.href)
              }
            >
              구역 열기
              <span aria-hidden>→</span>
            </Link>
          </div>
        </aside>
      </div>
    );
  }

  function renderSalesPanel() {
    const isTowaski = activeZone === "towaski";
    const isAcheron = activeZone === "acheron";
    const isStandardCatalog = isTowaski || isAcheron;
    const activeCatalogZone = isAcheron ? "acheron" : "towaski";
    const candidateTabs = isTowaski
      ? TAB_DEFS
      : TAB_DEFS.filter((tab) => tab.value !== "LICENSE");
    const visibleTabs = candidateTabs
      .map((tab) => ({
        ...tab,
        count: catalog.items.filter(
          (item) =>
            item.zone === activeCatalogZone &&
            matchesEquipmentShopTab(item, tab.value),
        ).length,
      }))
      .filter((tab) => tab.value === "ALL" || tab.count > 0);

    return (
      <div className={styles.salesLayout}>
        <section className={styles.shelfPanel} aria-label={zoneMeta.label}>
          {isTowaski &&
          requiresTowaskiLicenseTest &&
          effectiveHasQualificationAccess ? (
            <div className={styles.panelIntro}>
              <Eyebrow>BASIC FIREARM LICENSE</Eyebrow>
              <strong>적성 외 품목 반출 자격</strong>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => {
                  setTowaskiLicenseTestOpen(true);
                  playTowaskiLine(
                    "range",
                    TOWASKI_DIALOGUE_LINES.qualification,
                    { returnToIdle: false, sound: true },
                  );
                }}
              >
                기본 화기 라이센스 발급
              </button>
            </div>
          ) : null}
          {isStandardCatalog ? (
            <div
              role="tablist"
              aria-label={`${activeZoneDef.label} 카테고리`}
              className={styles.filters}
            >
              {visibleTabs.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={[
                      styles.filterTab,
                      isActive ? styles["filterTab--active"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleSalesTabChange(tab.value)}
                  >
                    {tab.label}
                    <span>{tab.count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className={[
                styles.panelIntro,
                styles["panelIntro--strategic"],
              ].join(" ")}
            >
              <div>
                <Eyebrow>STRATEGIC CATALOG</Eyebrow>
                <strong>전략 자산 반출대</strong>
              </div>
              <div
                className={styles.strategicSceneStatus}
                data-scene={strategicScene}
              >
                <span className={styles.strategicSceneStatus__signal} aria-hidden />
                <div>
                  <small>{strategicSceneInfo.tag}</small>
                  <strong>{strategicSceneInfo.label}</strong>
                </div>
                <p>{strategicSceneInfo.detail}</p>
              </div>
            </div>
          )}

          {isTowaski && activeTab === "LICENSE" ? (
            <div className={styles.panelIntro}>
              <Eyebrow>QUALIFICATION CENTER</Eyebrow>
              <strong>토와스키 자격 관리</strong>
              <span>
                기초 화기 취득 후 중급 정밀 사격과 고급 전문 장비 시험에
                응시할 수 있습니다. 합격한 자격은 즉시 인벤토리에 등록됩니다.
              </span>
            </div>
          ) : null}

          {salesItems.length === 0 ? (
            <div className={styles.empty}>
              {isTowaski
                ? "등록된 토와스키 장비 품목이 없습니다."
                : isAcheron
                  ? "등록된 아케론 대장간 품목이 없습니다."
                  : "전략 장비 보급소 대상 품목이 없습니다. SPECIAL 카테고리에 병기부/전략자산/차량/전투보조 태그가 붙으면 이곳에 표시됩니다."}
            </div>
          ) : (
            <div className={styles.productGrid}>
              {salesItems.map((item) => {
                const isSelected = selectedItem?.key === item.key;
                const isSoldOut = !item.available;
                const isLicenseItem = isTowaskiLicenseCatalogItem(item);
                const licenseProgram =
                  isLicenseItem && isTowaskiLicenseSlug(item.slug)
                    ? getTowaskiLicenseTestProgram(item.slug)
                    : null;
                const licenseBlocked = isEquipmentLicenseBlocked(item);
                const licenseAccess = describeEquipmentLicenseAccess(item);
                const hasZonePurchaseAccess =
                  hasEquipmentShopZonePurchaseAccess({
                    isGM: effectiveTowaskiGm,
                    purchaseZone: item.zone,
                    sourceZone: item.sourceZone,
                    category: item.category,
                  });
                const hasBasicPurchaseAccess =
                  !requiresTowaskiBasicLicense(item.zone) ||
                  hasTowaskiBasicPurchaseAccess({
                    isGM: effectiveTowaskiGm,
                    hasBasicLicense: effectiveHasBasicLicense,
                    licenseStatus: item.licenseStatus,
                  });
                const canStartLicenseTest = Boolean(
                  licenseProgram &&
                    canUseShop &&
                    !isSoldOut &&
                    !item.licenseOwned &&
                    (!licenseProgram.requiresBasicLicense ||
                      effectiveHasBasicLicense) &&
                    !towaskiLicenseTestBusy,
                );
                const canPurchase = isLicenseItem
                  ? canStartLicenseTest
                  : canUseShop &&
                    !isTowaskiDebug &&
                    !isSoldOut &&
                    hasZonePurchaseAccess &&
                    hasBasicPurchaseAccess &&
                    !item.licenseOwned &&
                    !licenseBlocked &&
                    item.price <= balance &&
                    !purchaseMutation.isPending;

                return (
                  <article
                    key={item.key}
                    className={[
                      styles.productCard,
                      isSelected ? styles["productCard--selected"] : "",
                      isSoldOut ||
                      !hasZonePurchaseAccess ||
                      !hasBasicPurchaseAccess ||
                      licenseBlocked ||
                      item.licenseOwned
                        ? styles["productCard--locked"]
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <button
                      type="button"
                      className={styles.productSelect}
                      onClick={() => handleSelectSalesItem(item)}
                      aria-pressed={isSelected}
                    >
                      <span className={styles.productTop}>
                        <span>{getCatalogCategoryLabel(item)}</span>
                        <span>
                          {isSoldOut
                            ? "LOCKED"
                            : licenseProgram
                              ? licenseProgram.testCode
                            : item.discount
                              ? `TOWASKI -${item.discount.percent}%`
                              : "AVAILABLE"}
                        </span>
                      </span>
                      <span className={styles.productIcon} aria-hidden>
                        {renderCatalogIcon(item, 48)}
                      </span>
                      <span className={styles.productName}>{item.name}</span>
                      <span className={styles.productEffect}>
                        {licenseAccess
                          ? `${item.effect} · ${licenseAccess}`
                          : item.effect}
                      </span>
                      <span className={styles.productPrice}>
                        {!licenseProgram && item.listPrice ? (
                          <del>{formatCredits(item.listPrice)}</del>
                        ) : null}
                        <strong>
                          {licenseProgram
                            ? `${licenseProgram.tierLabel} · 시험 발급`
                            : formatCredits(item.price)}
                        </strong>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.productAction}
                      onClick={() => handlePurchase(item)}
                      disabled={!canPurchase}
                      aria-busy={
                        isLicenseItem
                          ? towaskiLicenseTestBusy
                          : purchasingKey === item.key
                      }
                    >
                      {isSoldOut
                        ? "반출 불가"
                        : !effectiveHasMainCharacter
                          ? "AGENT 필요"
                        : isLicenseItem
                          ? item.licenseOwned
                            ? "발급 완료"
                            : licenseProgram?.requiresBasicLicense &&
                                !effectiveHasBasicLicense
                              ? "기초 화기 필요"
                              : towaskiLicenseTestBusy
                                ? "시험 진행 중"
                                : "자격시험 시작"
                        : purchasingKey === item.key
                          ? "처리 중"
                          : isTowaskiDebug
                            ? "샌드박스 차단"
                            : !hasZonePurchaseAccess
                              ? "GM 반출 전용"
                              : item.licenseOwned
                              ? "발급 완료"
                              : !hasBasicPurchaseAccess
                                ? "기본 화기 필요"
                              : licenseBlocked
                                ? `${item.licenseRequirement?.label ?? "라이센스"} 필요`
                            : item.price > balance
                              ? "잔액 부족"
                              : "즉시 반출"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className={styles.counterPanel} aria-label="선택 품목 반출">
          <section className={styles.detailPanel}>
            {selectedItem ? (
              <>
                <div className={styles.detailHead}>
                  <span className={styles.detailIcon} aria-hidden>
                    {renderCatalogIcon(selectedItem, 58)}
                  </span>
                  <div>
                    <span>{getCatalogCategoryLabel(selectedItem)}</span>
                    <h2>{selectedItem.name}</h2>
                  </div>
                </div>
                <p>{selectedItem.description}</p>
                {selectedItem.licenseRequirement ? (
                  <p>
                    필요 자격: {selectedItem.licenseRequirement.licenseName} ·{" "}
                    {selectedItem.licenseRequirement.reason}
                  </p>
                ) : null}
                {selectedLicenseDetail ? (
                  <p
                    className={styles.licenseAccessNotice}
                    data-satisfied={
                      selectedItem.licenseOwned === true ||
                      selectedItem.licenseStatus?.satisfied === true
                    }
                  >
                    {selectedLicenseDetail}
                  </p>
                ) : null}
                {selectedItem.discount ? (
                  <div className={styles.discountNotice}>
                    <span>토와스키 열람 연계</span>
                    <strong>
                      {formatCredits(
                        selectedItem.listPrice ?? selectedItem.price,
                      )} →{" "}
                      {formatCredits(selectedItem.price)}
                    </strong>
                    <em>
                      조율비 {selectedItem.discount.percent}% 절감 · 안전 검수 유지
                    </em>
                  </div>
                ) : null}
                {activeZone === "towaski" ? (
                  <div className={styles.qualificationPanel}>
                    <span>
                      <small>기본 화기</small>
                      <strong>
                        {effectiveTowaskiGm
                          ? "GM 면제"
                          : effectiveHasBasicLicense
                            ? "라이센스 보유"
                            : selectedItem.licenseStatus?.source ===
                                "character_qualification"
                              ? "품목 한정 적성 승인"
                              : "미발급"}
                      </strong>
                    </span>
                    <span>
                      <small>품목 판정</small>
                      <strong>
                        {selectedIsLicenseItem
                          ? selectedItem.licenseOwned
                            ? "자격 발급 완료"
                            : selectedLicenseProgram
                              ? `${selectedLicenseProgram.tierLabel} 시험 응시`
                              : "자격시험 확인"
                          : selectedItem.licenseStatus?.source === "owned_license"
                          ? "보유 라이센스"
                          : selectedItem.licenseStatus?.source ===
                              "character_qualification"
                            ? (selectedItem.licenseStatus.matchedKeyword ??
                              "명시 적성 예외")
                            : selectedItem.licenseRequirement
                              ? "추가 라이센스 필요"
                              : "기본 자격 적용"}
                      </strong>
                    </span>
                  </div>
                ) : null}
                <div className={styles.detailStats}>
                  <span>{selectedItem.effect}</span>
                  <strong>
                    {selectedLicenseProgram
                      ? `${selectedLicenseProgram.tierLabel} · ${selectedLicenseProgram.testCode}`
                      : formatCredits(selectedItem.price)}
                  </strong>
                  <span>
                    {selectedLicenseProgram
                      ? "시험 합격 시 발급"
                      : selectedItem.available
                        ? "상시 반출"
                        : "LOCKED"}
                  </span>
                </div>
                <div className={styles.purchaseBox}>
                  <div className={styles.purchaseSummary}>
                    <span>
                      {selectedIsLicenseItem
                        ? "자격시험 · 합격 시 1회 발급"
                        : selectedItem.discount
                          ? "토와스키 연계 반출 · 1개"
                          : "단건 반출 · 1개"}
                    </span>
                    <strong>
                      {selectedIsLicenseItem
                        ? "응시료 없음 · 크레딧 차감 없음"
                        : `결제 후 ${formatCredits(balance - selectedItem.price)}`}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    onClick={() => handlePurchase(selectedItem)}
                    disabled={!selectedCanPurchase}
                    aria-busy={
                      selectedIsLicenseItem
                        ? towaskiLicenseTestBusy
                        : purchasingKey === selectedItem.key
                    }
                  >
                    {selectedIsLicenseItem
                      ? selectedItem.licenseOwned
                        ? "발급 완료"
                        : !effectiveHasMainCharacter
                          ? "AGENT 필요"
                        : selectedLicenseProgram?.requiresBasicLicense &&
                            !effectiveHasBasicLicense
                          ? "기본 화기 필요"
                          : towaskiLicenseTestBusy
                            ? "시험 진행 중"
                            : "자격시험 시작"
                      : purchasingKey === selectedItem.key
                        ? "반출 처리 중"
                      : !effectiveHasMainCharacter
                        ? "AGENT 필요"
                      : isTowaskiDebug
                        ? "샌드박스 구매 차단"
                        : !selectedHasZonePurchaseAccess
                          ? "GM 반출 전용"
                          : selectedItem.licenseOwned
                          ? "발급 완료"
                          : !selectedHasBasicPurchaseAccess
                            ? "기본 화기 필요"
                          : selectedLicenseBlocked
                            ? `${selectedItem.licenseRequirement?.label ?? "라이센스"} 필요`
                        : selectedItem.price > balance
                          ? "잔액 부족"
                          : "1개 즉시 반출"}
                  </button>
                  {isGM && activeZone === "towaski" && !selectedIsLicenseItem ? (
                    <button
                      type="button"
                      className={styles.quoteAction}
                      onClick={() =>
                        quoteMutation.mutate({
                          key: selectedItem.key,
                          simulatePlayerRules: true,
                          basicLicenseOverride: effectiveHasBasicLicense,
                          balanceOverride: balance,
                        })
                      }
                      disabled={quoteMutation.isPending}
                    >
                      {quoteMutation.isPending ? "판정 중" : "GM 구매 드라이런"}
                    </button>
                  ) : null}
                  {isGM && quoteMutation.data?.key === selectedItem.key ? (
                    <div
                      className={styles.quoteResult}
                      data-eligible={quoteMutation.data.eligibility.eligible}
                    >
                      <strong>
                        {quoteMutation.data.eligibility.eligible
                          ? "PLAYER RULES / PASS"
                          : `PLAYER RULES / ${quoteMutation.data.eligibility.code ?? "BLOCKED"}`}
                      </strong>
                      <span>{quoteMutation.data.eligibility.reason}</span>
                      <span>
                        {formatCredits(quoteMutation.data.balance)} →{" "}
                        {formatCredits(quoteMutation.data.balanceAfter)}
                      </span>
                    </div>
                  ) : null}
                  {isGM && quoteMutation.isError ? (
                    <p className={styles.quoteError}>
                      {describeEquipmentShopError(quoteMutation.error)}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className={styles.empty}>선택 가능한 품목이 없습니다.</div>
            )}
          </section>
          {activeZone === "towaski" ? (
            <section className={styles.activityPanel} aria-label="최근 반출 기록">
              <div className={styles.activityHead}>
                <Eyebrow>RECENT LEDGER</Eyebrow>
                <strong>최근 반출·자격 등록</strong>
              </div>
              {catalog.recentActivity.length > 0 ? (
                <ol className={styles.activityList}>
                  {catalog.recentActivity.map((entry) => (
                    <li key={entry.id}>
                      <span data-kind={entry.kind}>
                        {entry.kind === "license" ? "LICENSE" : "ISSUE"}
                      </span>
                      <div>
                        <strong>{entry.title}</strong>
                        <small>{entry.detail}</small>
                      </div>
                      <time dateTime={entry.createdAt}>
                        {formatDateTime(entry.createdAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.activityEmpty}>최근 반출 기록이 없습니다.</p>
              )}
            </section>
          ) : null}
        </aside>
      </div>
    );
  }

  function renderLabPanel() {
    const selectedResearchUnlocked = selectedResearchNode
      ? isResearchNodeUnlocked({
          node: selectedResearchNode,
          projects: researchProjects,
          scope: activeResearchScope,
          targetCharacterId: mainCharacter?.id ?? null,
        })
      : false;
    const selectedNodeState = selectedResearchNode
      ? getResearchNodeMapStatus(
          researchProjects,
          selectedResearchNode.key,
          activeResearchScope,
        )
      : "available";
    const selectedResearchEffect = selectedResearchNode
      ? selectedResearchNode.effects[activeResearchScope] ?? null
      : null;
    const selectedResearchOperational = selectedResearchEffect
      ? isEquipmentResearchEffectOperational(selectedResearchEffect)
      : false;
    const selectedRushRule = selectedResearchNode
      ? research.rushRules.find((rule) => rule.tier === selectedResearchNode.tier)
      : null;
    const selectedPrerequisiteLabel = selectedResearchNode
      ? researchNodeLockLabel(selectedResearchNode)
      : null;
    const selectedResearchStatusTone = selectedResearchUnlocked
      ? researchNodeMapStatusTone(selectedNodeState)
      : "locked";
    const selectedResearchStatusLabel = selectedResearchUnlocked
      ? researchNodeMapStatusLabel(selectedNodeState)
      : (selectedPrerequisiteLabel ?? "잠김");
    const selectedStartQuote = selectedResearchNode
      ? quoteEquipmentResearchStart({
          node: selectedResearchNode,
          capabilities:
            activeResearchScope === "team"
              ? DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES
              : research.capabilities,
        })
      : null;
    const selectedFundingPool = selectedResearchNode
      ? research.fundingPools.find((pool) => pool.key === selectedResearchNode.key)
      : null;
    const selectedTeamFundedAmount =
      activeResearchScope === "team" ? (selectedFundingPool?.fundedAmount ?? 0) : 0;
    const selectedTeamTargetCost =
      activeResearchScope === "team" && selectedResearchNode
        ? (selectedFundingPool?.targetCost ?? selectedResearchNode.cost)
        : 0;
    const selectedTeamRemainingCost = Math.max(
      0,
      selectedTeamTargetCost - selectedTeamFundedAmount,
    );
    const parsedContributionAmount = Math.floor(Number(teamContributionAmount));
    const selectedTeamChargePreview =
      Number.isInteger(parsedContributionAmount) && parsedContributionAmount > 0
        ? Math.min(parsedContributionAmount, selectedTeamRemainingCost)
        : 0;
    const canContributeTeamResearch =
      activeResearchScope === "team" &&
      Boolean(selectedResearchNode) &&
      Boolean(selectedResearchEffect) &&
      selectedResearchOperational &&
      selectedResearchUnlocked &&
      selectedTeamRemainingCost > 0 &&
      selectedTeamChargePreview > 0 &&
      balance >= selectedTeamChargePreview &&
      hasMainCharacter &&
      !researchDataUnavailable &&
      !contributeResearchMutation.isPending;
    const selectedResearchCost =
      selectedStartQuote?.cost ?? selectedResearchNode?.cost ?? 0;
    const researchBonuses = [
      {
        key: "refund",
        label: "환급",
        active: research.capabilities.refundPercent > 0,
        value:
          research.capabilities.refundPercent > 0
            ? `${research.capabilities.refundPercent}% / cap ${research.capabilities.refundCap} CR`
            : "미해금",
      },
      {
        key: "rush",
        label: "RUSH 할인",
        active: research.capabilities.rushDiscountPercent > 0,
        value:
          research.capabilities.rushDiscountPercent > 0
            ? `${research.capabilities.rushDiscountPercent}%`
            : "미해금",
      },
      {
        key: "cost",
        label: "연구비",
        active: research.capabilities.researchCostDiscountPercent > 0,
        value:
          research.capabilities.researchCostDiscountPercent > 0
            ? `${research.capabilities.researchCostDiscountPercent}% / cap ${research.capabilities.researchCostDiscountCap} CR`
            : "미해금",
      },
      {
        key: "time",
        label: "연구 시간",
        active: research.capabilities.researchTimeDiscountPercent > 0,
        value:
          research.capabilities.researchTimeDiscountPercent > 0
            ? `${research.capabilities.researchTimeDiscountPercent}% / max ${research.capabilities.researchTimeDiscountMaxHours}h`
            : "미해금",
      },
      {
        key: "credit",
        label: "크레딧 보너스",
        active: research.capabilities.creditBonusPercent > 0,
        value:
          research.capabilities.creditBonusPercent > 0
            ? `${research.capabilities.creditBonusPercent}% / cap ${research.capabilities.creditBonusCap} CR`
            : "미해금",
      },
    ];
    const activeResearchBonuses = researchBonuses.filter((bonus) => bonus.active);
    const personalResearchDisabledReason = researchDataUnavailable
      ? "연구 정보를 갱신할 수 없어 변경 기능을 잠갔습니다."
      : !selectedResearchEffect
      ? "개인 연구 효과가 없는 항목입니다."
      : !selectedResearchOperational
        ? "연결될 후속 기능이 준비되지 않아 연구를 시작할 수 없습니다."
      : !selectedResearchUnlocked
        ? `${selectedPrerequisiteLabel ?? "선행 연구"}가 필요합니다.`
        : !hasMainCharacter
          ? "메인 AGENT 지정이 필요합니다."
          : startResearchMutation.isPending
            ? "연구 시작 요청을 처리하고 있습니다."
            : balance < selectedResearchCost
              ? `${formatCredits(selectedResearchCost - balance)}이 부족합니다.`
              : null;
    const teamContributionDisabledReason = researchDataUnavailable
      ? "연구 정보를 갱신할 수 없어 변경 기능을 잠갔습니다."
      : !selectedResearchEffect
      ? "팀 연구 효과가 없는 항목입니다."
      : !selectedResearchOperational
        ? "연결될 후속 기능이 준비되지 않아 연구에 기여할 수 없습니다."
      : !selectedResearchUnlocked
        ? `${selectedPrerequisiteLabel ?? "선행 연구"}가 필요합니다.`
        : selectedTeamRemainingCost <= 0
          ? "모금 목표가 이미 충족되었습니다."
          : !Number.isInteger(parsedContributionAmount) || parsedContributionAmount <= 0
            ? "기여 금액을 1 CR 이상 입력하세요."
            : !hasMainCharacter
              ? "메인 AGENT 지정이 필요합니다."
              : contributeResearchMutation.isPending
                ? "기여 요청을 처리하고 있습니다."
                : balance < selectedTeamChargePreview
                  ? `${formatCredits(selectedTeamChargePreview - balance)}이 부족합니다.`
                  : null;
    const techTreeMapStyle = {
      gridTemplateColumns: `132px repeat(${researchTrackLayout.columnCount}, minmax(152px, 176px))`,
      gridTemplateRows: `70px repeat(${Math.max(1, researchTrackLayout.rows.length)}, minmax(118px, auto))`,
      minWidth: `${164 + researchTrackLayout.columnCount * 184}px`,
    };

    return (
      <div className={styles.labWorkspace}>
        <section className={styles.labScene} aria-label="신체증강 연구소 현황">
          <div className={styles.labScene__summary}>
            <div>
              <Eyebrow>AUGMENTATION LAB</Eyebrow>
              <strong>{scopeLabel(activeResearchScope)} 관제</strong>
              <p>{mainCharacter?.codename ?? "UNASSIGNED"} 대상 연구 현황</p>
            </div>
            <div className={styles.labScene__metrics}>
              <div>
                <span>연구 노드</span>
                <strong>{research.tree.length}</strong>
              </div>
              <div>
                <span>진행 큐</span>
                <strong>{activeResearchProjects.length}</strong>
              </div>
              <div>
                <span>적용 완료</span>
                <strong>{appliedResearchProjects.length}</strong>
              </div>
              <div>
                <span>운용 잔액</span>
                <strong>{formatCredits(balance)}</strong>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.labLayout}>
        <section className={styles.techTreeConsole}>
          <div className={styles.techTreeHeader}>
            <div>
              <Eyebrow>HORIZONTAL TECH TREE</Eyebrow>
              <strong>신체증강 연구소</strong>
            </div>
            <div className={styles.techTreeControls}>
              <div
                className={styles.techScopeSwitch}
                role="group"
                aria-label="연구 범위"
              >
                {(["personal", "team"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    aria-pressed={activeResearchScope === scope}
                    className={
                      activeResearchScope === scope
                        ? styles["techScopeSwitch--active"]
                        : ""
                    }
                    onClick={() => handleResearchScopeChange(scope)}
                  >
                    {scope === "personal" ? "개인 연구" : "팀 연구"}
                  </button>
                ))}
              </div>
              <div className={styles.techTreeLegend} aria-label="테크트리 안내">
                <span>
                  <small>진행 단계</small>
                  <b>T1 기초 → T5 최종</b>
                </span>
                <span>
                  <small>적용 범위</small>
                  <b>
                    {activeResearchScope === "personal"
                      ? "개인 능력 강화"
                      : "팀 공용 강화"}
                  </b>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.techCapRail}>
            <div className={styles.techCapPrimary}>
              <span>개인 연구 누적</span>
              <strong>
                HP +{personalResearchStatTotals.hp} · SAN +
                {personalResearchStatTotals.san} · ATK +
                {personalResearchStatTotals.atk} · DEF +
                {personalResearchStatTotals.def}
              </strong>
            </div>
            <div
              ref={researchBonusMenuRef}
              className={styles.techCapDisclosure}
              data-open={isResearchBonusMenuOpen}
            >
              <button
                type="button"
                className={styles.techCapSummary}
                aria-expanded={isResearchBonusMenuOpen}
                aria-controls="research-bonus-menu"
                onClick={() =>
                  setIsResearchBonusMenuOpen((isOpen) => !isOpen)
                }
              >
                <span>활성 보너스</span>
                <strong>
                  {activeResearchBonuses.length > 0
                    ? activeResearchBonuses
                        .map((bonus) => `${bonus.label} ${bonus.value}`)
                        .join(" · ")
                    : "없음"}
                </strong>
                <span className={styles.techCapToggle}>
                  {isResearchBonusMenuOpen ? "접기" : "펼쳐보기"}
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="m4 6 4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
              {isResearchBonusMenuOpen ? (
                <div
                  id="research-bonus-menu"
                  className={styles.techCapDetails}
                  role="region"
                  aria-label="전체 연구 보너스"
                >
                  {researchBonuses.map((bonus) => (
                    <div key={bonus.key} data-active={bonus.active}>
                      <span>{bonus.label}</span>
                      <strong>{bonus.value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className={styles.techTreeScroll}>
            <div
              className={styles.techTreeMap}
              role="region"
              style={techTreeMapStyle}
              aria-label="병기 연구 테크트리"
            >
              <div
                className={styles.techCornerHeader}
                style={{ gridColumn: 1, gridRow: 1 }}
              >
                <span>분류</span>
              </div>

              {researchTrackLayout.tiers.map(({ tier, startColumn, span }) => (
                <div
                  key={tier}
                  className={styles.techTierHeader}
                  style={{ gridColumn: `${startColumn + 1} / span ${span}`, gridRow: 1 }}
                >
                  <span>T{tier}</span>
                  <strong>{RESEARCH_TIER_LABELS[tier]}</strong>
                  <em>{RESEARCH_TIER_FEEL[tier]}</em>
                </div>
              ))}

              {researchTrackLayout.rows.map((row, rowIndex) => (
                <Fragment key={row.branch}>
                  <div
                    className={styles.techBranchRail}
                    style={{
                      gridColumn: `1 / ${row.lastColumn + 2}`,
                      gridRow: rowIndex + 2,
                    }}
                    aria-hidden
                  />
                  <div
                    className={styles.techBranchLabel}
                    style={{ gridColumn: 1, gridRow: rowIndex + 2 }}
                  >
                    <span>{row.meta.code}</span>
                    <strong>{row.meta.label}</strong>
                  </div>

                  {row.nodes.map(({ node, column }) => {
                    const isUnlocked = isResearchNodeUnlocked({
                      node,
                      projects: researchProjects,
                      scope: activeResearchScope,
                      targetCharacterId: mainCharacter?.id ?? null,
                    });
                    const nodeStatus = getResearchNodeMapStatus(
                      researchProjects,
                      node.key,
                      activeResearchScope,
                    );
                    const isSelected = selectedResearchNode?.key === node.key;
                    const effectSummary = node.effects[activeResearchScope]
                      ? describeEquipmentResearchEffect(
                          node.effects[activeResearchScope],
                        )
                      : "-";

                    return (
                      <button
                        key={node.key}
                        type="button"
                        className={researchNodeClassName(
                          nodeStatus,
                          isSelected,
                          !isUnlocked,
                        )}
                        data-status={
                          isUnlocked
                            ? researchNodeMapStatusTone(nodeStatus)
                            : "locked"
                        }
                        style={{
                          gridColumn: column + 1,
                          gridRow: rowIndex + 2,
                        }}
                        onClick={() => handleSelectResearchNode(node.key)}
                        aria-pressed={isSelected}
                      >
                        <span className={styles.techNodeKey}>{node.key}</span>
                        <ResearchPixelIcon node={node} active={isSelected} />
                        <strong>{node.name}</strong>
                        <span className={styles.techNodeEffect}>
                          {effectSummary}
                        </span>
                        <span className={styles.techNodeBadge}>
                          {isUnlocked
                            ? researchNodeMapStatusLabel(nodeStatus)
                            : researchNodeLockLabel(node)}
                        </span>
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        {selectedResearchNode ? (
          <div className={styles.mobileResearchBar}>
            <div>
              <span>선택 연구 · {selectedResearchStatusLabel}</span>
              <strong>{selectedResearchNode.name}</strong>
            </div>
            <a href="#selected-research-detail">상세·실행</a>
          </div>
        ) : null}

        <aside
          id="selected-research-detail"
          className={styles.techDetailPanel}
        >
          {selectedResearchNode ? (
            <div className={styles.techDetailHero}>
              <ResearchPixelIcon node={selectedResearchNode} active />
              <div>
                <Eyebrow>SELECTED RESEARCH</Eyebrow>
                <strong>{selectedResearchNode.name}</strong>
                <span>{selectedResearchNode.key}</span>
              </div>
              <span
                className={styles.techDetailStatus}
                data-status={selectedResearchStatusTone}
              >
                {selectedResearchStatusLabel}
              </span>
            </div>
          ) : null}

          {selectedResearchNode ? (
            <>
              <p className={styles.techDetailSummary}>
                {selectedResearchNode.summary}
              </p>

              <div className={styles.techDetailStats}>
                <div>
                  <span>비용</span>
                  <strong>
                    {selectedStartQuote
                      ? formatCredits(selectedStartQuote.cost)
                      : formatCredits(selectedResearchNode.cost)}
                  </strong>
                  {selectedStartQuote?.costDiscount ? (
                    <em>
                      정가 {formatCredits(selectedResearchNode.cost)} · 할인{" "}
                      {formatCredits(selectedStartQuote.costDiscount)}
                    </em>
                  ) : null}
                </div>
                <div>
                  <span>실제 시간</span>
                  <strong>
                    {selectedStartQuote
                      ? formatDuration(selectedStartQuote.durationHours)
                      : formatDuration(selectedResearchNode.durationHours)}
                  </strong>
                  {selectedStartQuote?.durationReductionHours ? (
                    <em>
                      기본 {formatDuration(selectedResearchNode.durationHours)} ·
                      단축{" "}
                      {formatDuration(selectedStartQuote.durationReductionHours)}
                    </em>
                  ) : null}
                </div>
                <div>
                  <span>RUSH</span>
                  <strong>
                    {selectedRushRule
                      ? `${formatCredits(selectedRushRule.cost)} / ${formatDuration(selectedRushRule.hours)}`
                      : "없음"}
                  </strong>
                </div>
                <div>
                  <span>하한</span>
                  <strong>
                    {selectedResearchNode.minDurationHours
                      ? formatDuration(selectedResearchNode.minDurationHours)
                      : "없음"}
                  </strong>
                </div>
                <div>
                  <span>선행</span>
                  <strong>
                    {selectedPrerequisiteLabel
                      ? selectedResearchUnlocked
                        ? `${selectedPrerequisiteLabel} 충족`
                        : selectedPrerequisiteLabel
                      : "없음"}
                  </strong>
                </div>
              </div>

              {activeResearchScope === "team" ? (
                <div className={styles.teamFundingPanel}>
                  <div className={styles.teamFundingMeter}>
                    <div>
                      <span>팀 연구 모금</span>
                      <strong>
                        {formatCredits(selectedTeamFundedAmount)} /{" "}
                        {formatCredits(selectedTeamTargetCost)}
                      </strong>
                    </div>
                    <progress
                      max={Math.max(1, selectedTeamTargetCost)}
                      value={selectedTeamFundedAmount}
                    />
                    <em>
                      남은 목표액 {formatCredits(selectedTeamRemainingCost)}
                    </em>
                  </div>

                  <div className={styles.teamFundingInput}>
                    <label htmlFor="team-research-contribution">
                      기여 금액
                    </label>
                    <input
                      id="team-research-contribution"
                      type="number"
                      min={1}
                      max={Math.max(1, selectedTeamRemainingCost)}
                      step={1}
                      value={teamContributionAmount}
                      onChange={(event) =>
                        setTeamContributionAmount(event.target.value)
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleContributeTeamResearch(
                          selectedResearchNode.key,
                          selectedTeamRemainingCost,
                        )
                      }
                      disabled={!canContributeTeamResearch}
                      aria-busy={contributeResearchMutation.isPending}
                    >
                      {selectedTeamChargePreview > 0
                        ? `${formatCredits(selectedTeamChargePreview)} 기여`
                        : "기여 불가"}
                    </button>
                  </div>
                  {teamContributionDisabledReason ? (
                    <p className={styles.actionHint} role="status">
                      {teamContributionDisabledReason}
                    </p>
                  ) : null}

                  <div className={styles.teamFundingQuick}>
                    {[50, 100, 200, selectedTeamRemainingCost]
                      .filter((amount, index, list) => amount > 0 && list.indexOf(amount) === index)
                      .slice(0, 4)
                      .map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() =>
                            setTeamContributionAmount(String(amount))
                          }
                        >
                          {amount === selectedTeamRemainingCost
                            ? "목표 채우기"
                            : formatCredits(amount)}
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <div className={styles.techDetailActions}>
                  <button
                    type="button"
                    onClick={() =>
                      handleStartResearch(
                        selectedResearchNode.key,
                        activeResearchScope,
                      )
                    }
                    disabled={
                      Boolean(personalResearchDisabledReason) ||
                      !canStartResearch(activeResearchScope, selectedResearchCost)
                    }
                    aria-busy={startResearchMutation.isPending}
                  >
                    <span>{scopeLabel(activeResearchScope)} 연구 시작</span>
                    <strong>
                      {selectedResearchEffect
                        ? describeEquipmentResearchEffect(selectedResearchEffect)
                        : "-"}
                    </strong>
                  </button>
                  {personalResearchDisabledReason ? (
                    <p className={styles.actionHint} role="status">
                      {personalResearchDisabledReason}
                    </p>
                  ) : null}
                </div>
              )}

              {selectedNodeProjects.length > 0 ? (
                <div className={styles.selectedHistory}>
                  {selectedNodeProjects.slice(0, 3).map((project) => (
                    <span key={project.id}>
                      {scopeLabel(project.scope)} ·{" "}
                      {projectStatusLabel(project.computedStatus)}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.empty}>선택 가능한 연구가 없습니다.</div>
          )}

          <div className={styles.agentSnapshot}>
            <div className={styles.panelIntro}>
              <Eyebrow>MAIN AGENT</Eyebrow>
              <strong>{mainCharacter?.codename ?? "UNASSIGNED"}</strong>
            </div>
            {localStats ? (
              <div className={styles.statsGrid}>
                {STAT_DEFS.map((stat) => (
                  <div key={stat.value} className={styles.statReadout}>
                    <span>{stat.label}</span>
                    <strong>{localStats[stat.value]}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                메인 AGENT 캐릭터가 없어 연구 비용 차감, 개인 연구, 팀 연구 기여를 실행할 수 없습니다.
              </div>
            )}
          </div>

          <div className={styles.projectPanel}>
            <div className={styles.panelIntro}>
              <Eyebrow>PROJECTS</Eyebrow>
              <strong>진행 큐</strong>
            </div>
            {activeResearchProjects.length === 0 ? (
              <div className={styles.empty}>진행 중인 연구가 없습니다.</div>
            ) : (
              <div className={styles.projectList}>
                {activeResearchProjects.map((project) => {
                  const rushRule = research.rushRules.find(
                    (rule) => rule.tier === project.tier,
                  );
                  const projectNode = research.tree.find(
                    (node) => node.key === project.key,
                  );
                  const rushQuote =
                    projectNode && rushRule
                      ? quoteEquipmentResearchRush({
                          node: projectNode,
                          project: {
                            tier: project.tier,
                            startedAt: new Date(project.startedAt),
                            completedAt: new Date(project.completedAt),
                            rushUsed: project.rushUsed,
                            rushDiscountUsed: project.rushDiscountUsed,
                          },
                          capabilities:
                            project.scope === "team"
                              ? DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES
                              : research.capabilities,
                        })
                      : null;
                  const canRecoverApply =
                    project.computedStatus === "applying" &&
                    isEquipmentResearchApplyLeaseStale(project.updatedAt);
                  return (
                    <article key={project.id} className={styles.projectCard}>
                      <div className={styles.projectCardTop}>
                        <span>{project.key}</span>
                        <strong>{projectStatusLabel(project.computedStatus)}</strong>
                      </div>
                      <p>{describeEquipmentResearchEffect(project.effect)}</p>
                      <div className={styles.projectMeta}>
                        <span>{scopeLabel(project.scope)}</span>
                        <span>완료 {formatDateTime(project.completedAt)}</span>
                        <span>
                          RUSH {project.rushUsed}
                          {rushRule ? `/${rushRule.maxUses}` : ""}
                        </span>
                      </div>
                      <div className={styles.projectActions}>
                        <button
                          type="button"
                          onClick={() =>
                            rushQuote
                              ? handleRushResearch(
                                  project,
                                  rushQuote.cost,
                                  rushQuote.hours,
                                )
                              : undefined
                          }
                          disabled={
                            project.computedStatus !== "in_progress" ||
                            !rushQuote ||
                            researchDataUnavailable ||
                            rushResearchMutation.isPending
                          }
                          aria-busy={rushResearchMutation.isPending}
                        >
                          {rushQuote
                            ? `${formatCredits(rushQuote.cost)} / ${formatDuration(rushQuote.hours)}`
                            : rushRule
                              ? `${formatCredits(rushRule.cost)} / ${formatDuration(rushRule.hours)}`
                            : "단축 불가"}
                        </button>
                        {isGM ? (
                          <button
                            type="button"
                            onClick={() => handleCompleteResearch(project)}
                            disabled={
                              (project.computedStatus !== "completed" &&
                                !canRecoverApply) ||
                              researchDataUnavailable ||
                              completeResearchMutation.isPending
                            }
                            aria-busy={completeResearchMutation.isPending}
                          >
                            {canRecoverApply ? "적용 복구" : "완료 적용"}
                          </button>
                        ) : (
                          <span className={styles.projectAutoApply}>
                            자동 반영
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {activeResearchScope === "team" ? (
            <div className={styles.teamLedgerGrid}>
              <section className={styles.projectPanel}>
                <div className={styles.panelIntro}>
                  <Eyebrow>CONTRIBUTION LOG</Eyebrow>
                  <strong>최근 기여</strong>
                </div>
                {research.recentContributions.length === 0 ? (
                  <div className={styles.empty}>팀 연구 기여 기록이 없습니다.</div>
                ) : (
                  <div className={styles.contributionList}>
                    {research.recentContributions.slice(0, 6).map((entry) => (
                      <div key={entry.id}>
                        <span>{entry.projectKey}</span>
                        <strong>{entry.contributorCodename}</strong>
                        <em>
                          {entry.amount > 0
                            ? formatCredits(entry.amount)
                            : entry.action === "start"
                              ? "연구 시작"
                              : "자동 적용"}
                        </em>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.projectPanel}>
                <div className={styles.panelIntro}>
                  <Eyebrow>RANKING</Eyebrow>
                  <strong>누적 기여</strong>
                </div>
                {research.contributionRankings.length === 0 ? (
                  <div className={styles.empty}>랭킹 집계가 없습니다.</div>
                ) : (
                  <div className={styles.rankingList}>
                    {research.contributionRankings.slice(0, 5).map((row, index) => (
                      <div key={row.contributorCharacterId}>
                        <span>{index + 1}</span>
                        <strong>{row.contributorCodename}</strong>
                        <em>{formatCredits(row.totalAmount)}</em>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          <div className={styles.projectPanel}>
            <div className={styles.panelIntro}>
              <Eyebrow>ARCHIVE</Eyebrow>
              <strong>적용 완료</strong>
            </div>
            {appliedResearchProjects.length === 0 ? (
              <div className={styles.empty}>적용 완료된 연구가 없습니다.</div>
            ) : (
              <div className={styles.appliedList}>
                {appliedResearchProjects.slice(0, 6).map((project) => (
                  <div key={project.id}>
                    <span>{project.key}</span>
                    <strong>{describeEquipmentResearchEffect(project.effect)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
        </div>
      </div>
    );
  }

  function renderCustomPanel() {
    const workshopRequests = workshopRequestsQuery.data?.requests ?? [];
    const submitWorkshopRequest = (
      event: FormEvent<HTMLFormElement>,
      kind: "upgrade" | "custom",
    ) => {
      event.preventDefault();
      const details =
        kind === "upgrade" ? upgradeRequestDetails : customRequestDetails;
      workshopRequestMutation.mutate(
        {
          kind,
          details,
          ...(kind === "upgrade" ? { inventoryEntryId: upgradeEntryId } : {}),
        },
        {
          onSuccess: (response) => {
            showFeedback("success", "공방 요청 접수", response.message);
            playVernierLine("accepted", VERNIER_DIALOGUE_LINES.accepted, {
              sound: true,
            });
            if (kind === "upgrade") {
              setUpgradeEntryId("");
              setUpgradeRequestDetails("");
            } else {
              setCustomRequestDetails("");
            }
          },
          onError: (error) => {
            playVernierLine("blocked", VERNIER_DIALOGUE_LINES.rejected, {
              sound: true,
            });
            showFeedback(
              "error",
              "공방 요청 접수 실패",
              describeEquipmentShopError(error),
            );
          },
        },
      );
    };

    const upgradeReady =
      Boolean(upgradeEntryId) &&
      upgradeRequestDetails.trim().length >=
        WORKSHOP_REQUEST_DETAIL_MIN_LENGTH;
    const customReady =
      customRequestDetails.trim().length >= WORKSHOP_REQUEST_DETAIL_MIN_LENGTH &&
      (isGM || research.capabilities.customWeaponSlot);

    return (
      <div className={styles.customPanel}>
        <div className={styles.panelIntro}>
          <div>
            <Eyebrow>WORKSHOP INTAKE</Eyebrow>
            <strong>공방 제작·강화 문의</strong>
            <p>
              장착 장비 강화는 운영자 견적을 수락해 재료를 납품한 뒤 제작됩니다.
              완료된 장비를 수령하면 기존 슬롯이 정리되고 결과 장비가 자동 장착됩니다.
            </p>
          </div>
        </div>
        <div className={styles.workshopGrid}>
          <section className={styles.workshopMaintenanceCard}>
            <span>EXCLUSIVE EQUIPMENT</span>
            <strong>전용 장비 제작</strong>
            <p>
              개인 전용 장비의 설계·제작 절차를 준비하고 있습니다. 현재는 정비
              중으로 신규 제작을 접수하지 않습니다.
            </p>
            <Tag tone="gold">정비 중</Tag>
          </section>

          <form
            className={styles.workshopRequestCard}
            onSubmit={(event) => submitWorkshopRequest(event, "upgrade")}
          >
            <span>EQUIPPED GEAR</span>
            <strong>장착 장비 강화 문의</strong>
            <p>현재 메인 AGENT가 장착 중인 장비만 선택할 수 있습니다.</p>
            <label>
              <span>강화 대상</span>
              <select
                value={upgradeEntryId}
                onChange={(event) => {
                  const nextEntryId = event.target.value;
                  setUpgradeEntryId(nextEntryId);
                  const nextEntry = equippedEntries.find(
                    (entry) => entry._id === nextEntryId,
                  );
                  if (nextEntry) {
                    playVernierLine(
                      "measure",
                      buildVernierEquipmentLine({
                        equipmentName: nextEntry.itemName,
                        codename: mainCharacter?.codename ?? null,
                      }),
                      { sound: true },
                    );
                  }
                }}
                disabled={
                  !hasMainCharacter ||
                  characterInventoryQuery.isPending ||
                  equippedEntries.length === 0 ||
                  workshopRequestMutation.isPending
                }
              >
                <option value="">장착 장비 선택</option>
                {equippedEntries.map((entry) => (
                  <option key={entry._id} value={entry._id}>
                    {entry.itemName} · {entry.equippedSlot}
                  </option>
                ))}
              </select>
            </label>
            {characterInventoryQuery.isError ? (
              <small role="alert">장착 장비를 불러오지 못했습니다.</small>
            ) : equippedEntries.length === 0 &&
              !characterInventoryQuery.isPending ? (
              <small>현재 장착 중인 장비가 없습니다.</small>
            ) : null}
            <label>
              <span>강화 요청</span>
              <textarea
                value={upgradeRequestDetails}
                onFocus={() =>
                  playVernierLine(
                    "clarify",
                    VERNIER_DIALOGUE_LINES.upgradePrompt,
                    { sound: true },
                  )
                }
                onChange={(event) =>
                  setUpgradeRequestDetails(event.target.value)
                }
                minLength={WORKSHOP_REQUEST_DETAIL_MIN_LENGTH}
                maxLength={1000}
                rows={4}
                placeholder="어떤 성능을 어떤 방향으로 강화하고 싶은지 적어주세요."
                disabled={!hasMainCharacter || workshopRequestMutation.isPending}
              />
            </label>
            <button
              type="submit"
              className={styles.primaryAction}
              disabled={!upgradeReady || workshopRequestMutation.isPending}
            >
              {workshopRequestMutation.isPending ? "접수 중" : "강화 문의 보내기"}
            </button>
          </form>

          <form
            className={styles.workshopRequestCard}
            onSubmit={(event) => submitWorkshopRequest(event, "custom")}
          >
            <span>CUSTOM ORDER</span>
            <strong>커스텀 장비 제작 의뢰</strong>
            <p>원하는 장비의 형태, 용도, 작동 방식과 핵심 요구사항을 적어주세요.</p>
            {!isGM && !research.capabilities.customWeaponSlot ? (
              <small>전용무기 설계 슬롯 연구를 완료해야 제작 의뢰를 보낼 수 있습니다.</small>
            ) : null}
            <label>
              <span>제작 요청서</span>
              <textarea
                value={customRequestDetails}
                onFocus={() =>
                  playVernierLine(
                    "intake",
                    VERNIER_DIALOGUE_LINES.customPrompt,
                    { sound: true },
                  )
                }
                onChange={(event) => setCustomRequestDetails(event.target.value)}
                minLength={WORKSHOP_REQUEST_DETAIL_MIN_LENGTH}
                maxLength={1000}
                rows={8}
                placeholder="예: 접이식 창과 와이어 회수 장치를 결합한 중거리 제압 무기. 휴대 시에는 단축 형태를 원합니다."
                disabled={!hasMainCharacter || workshopRequestMutation.isPending}
              />
            </label>
            <small>{customRequestDetails.length} / 1000</small>
            <button
              type="submit"
              className={styles.primaryAction}
              disabled={!customReady || workshopRequestMutation.isPending}
            >
              {workshopRequestMutation.isPending ? "접수 중" : "제작 의뢰 보내기"}
            </button>
          </form>

          <section className={styles.workshopRequestCard}>
            <span>REQUEST LEDGER</span>
            <strong>{isGM ? "공방 요청 처리 현황" : "내 공방 요청"}</strong>
            {isGM ? (
              <Link className={styles.primaryAction} href="/erp/admin/equipment-workshop">
                GM 공방 관리 페이지 열기
              </Link>
            ) : null}
            {workshopRequestsQuery.isPending ? (
              <p>접수 기록을 불러오는 중입니다.</p>
            ) : workshopRequestsQuery.isError ? (
              <p role="alert">접수 기록을 불러오지 못했습니다.</p>
            ) : workshopRequests.length === 0 ? (
              <p>아직 접수된 공방 요청이 없습니다.</p>
            ) : (
              workshopRequests.map((request) => (
                <article key={request._id}>
                  <span>
                    {request.characterCodename} · {request.kind === "upgrade" ? "강화" : "제작"}
                  </span>
                  <strong>{request.equipmentName ?? request.details}</strong>
                  <small>
                    {request.computedStatus === "READY"
                      ? "수령 가능"
                      : WORKSHOP_STATUS_LABELS[request.status]} ·{" "}
                    {formatDateTime(request.createdAt)}
                  </small>
                  {request.operatorNote ? <p>{request.operatorNote}</p> : null}
                  {request.quote ? (() => {
                    const quote = request.quote;
                    const specialist = WORKSHOP_SPECIALISTS[quote.specialistCodename];
                    const availableByItemId = new Map<string, number>();
                    for (const entry of characterInventoryQuery.data?.entries ?? []) {
                      if (entry.equippedSlot) continue;
                      availableByItemId.set(
                        entry.itemId,
                        (availableByItemId.get(entry.itemId) ?? 0) + entry.quantity,
                      );
                    }
                    const materialsReady = quote.materials.every(
                      (material) =>
                        (availableByItemId.get(material.itemId) ?? 0) >= material.quantity,
                    );
                    const creditReady = balance >= quote.creditCost;
                    return (
                      <section className={styles.workshopQuote}>
                        <div className={styles.workshopNpcReply}>
                          <span className={styles.workshopNpcReply__portrait}>
                            <Image src={workshopPortrait(quote.specialistCodename, request.computedStatus)} alt="" fill sizes="64px" />
                          </span>
                          <div>
                            <strong>{specialist.label}</strong>
                            <p>{workshopDialogue(quote.specialistCodename, request.computedStatus)}</p>
                          </div>
                        </div>
                        <div className={styles.workshopComparison}>
                          <div>
                            <span>원본 장비</span>
                            <strong>{request.equipmentName}</strong>
                            <small>{request.sourceDamage ?? "피해 정보 없음"}</small>
                          </div>
                          <b aria-hidden>→</b>
                          <div>
                            <span>결과 장비</span>
                            {quote.result.previewImage ? (
                              <span className={styles.workshopResultPreview}>
                                <Image src={quote.result.previewImage} alt="" fill sizes="96px" unoptimized />
                              </span>
                            ) : null}
                            <strong>{quote.result.name}</strong>
                            <small>{quote.result.damage ?? "피해 정보 없음"}</small>
                            <p>{quote.result.description}</p>
                          </div>
                        </div>
                        <dl className={styles.workshopQuoteSummary}>
                          <div>
                            <dt>비용</dt>
                            <dd data-ready={creditReady}>{formatCredits(quote.creditCost)}</dd>
                          </div>
                          <div>
                            <dt>제작 시간</dt>
                            <dd>{quote.durationMinutes.toLocaleString()}분</dd>
                          </div>
                        </dl>
                        {quote.materials.length > 0 ? (
                          <ul className={styles.workshopMaterials}>
                            {quote.materials.map((material) => {
                              const available = availableByItemId.get(material.itemId) ?? 0;
                              return (
                                <li key={material.itemId} data-ready={available >= material.quantity}>
                                  <span>{material.itemName}</span>
                                  <strong>{available} / {material.quantity}</strong>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {request.readyAt && ["IN_PROGRESS", "READY"].includes(request.computedStatus) ? (
                          <p className={styles.workshopCountdown}>
                            {formatWorkshopCountdown(request.readyAt)} · 완료 예정 {formatDateTime(request.readyAt)}
                          </p>
                        ) : null}
                        {!isGM && request.status === "QUOTED" ? (
                          <div className={styles.workshopQuoteActions}>
                            <button
                              type="button"
                              className={styles.primaryAction}
                              disabled={!materialsReady || !creditReady || acceptWorkshopQuoteMutation.isPending}
                              onClick={() => acceptWorkshopQuoteMutation.mutate(
                                { requestId: request._id, expectedQuoteVersion: quote.version },
                                {
                                  onSuccess: () => showFeedback("success", "견적 수락 완료", "비용과 재료를 납품하고 제작을 시작했습니다."),
                                  onError: (error) => showFeedback("error", "견적 수락 실패", describeEquipmentShopError(error)),
                                },
                              )}
                            >
                              {acceptWorkshopQuoteMutation.isPending ? "납품 처리 중" : "견적 수락·납품"}
                            </button>
                            <button
                              type="button"
                              disabled={declineWorkshopQuoteMutation.isPending}
                              onClick={() => declineWorkshopQuoteMutation.mutate(
                                { requestId: request._id, expectedQuoteVersion: quote.version },
                                {
                                  onSuccess: () => showFeedback("info", "견적 거절 완료", "장비와 재화는 변경되지 않았습니다."),
                                  onError: (error) => showFeedback("error", "견적 거절 실패", describeEquipmentShopError(error)),
                                },
                              )}
                            >
                              견적 거절
                            </button>
                          </div>
                        ) : null}
                        {!isGM && request.computedStatus === "READY" ? (
                          <button
                            type="button"
                            className={styles.primaryAction}
                            disabled={claimWorkshopResultMutation.isPending}
                            onClick={() => claimWorkshopResultMutation.mutate(
                              { requestId: request._id },
                              {
                                onSuccess: () => showFeedback("success", "개조 장비 수령 완료", "결과 장비를 지급하고 해당 슬롯에 장착했습니다."),
                                onError: (error) => showFeedback("error", "장비 수령 실패", describeEquipmentShopError(error)),
                              },
                            )}
                          >
                            {claimWorkshopResultMutation.isPending ? "장착 처리 중" : "개조 장비 수령·장착"}
                          </button>
                        ) : null}
                      </section>
                    );
                  })() : null}
                  {request.history && request.history.length > 1 ? (
                    <ol>
                      {request.history.map((entry) => (
                        <li key={`${entry.status}:${entry.at}`}>
                          {WORKSHOP_STATUS_LABELS[entry.status]} ·{" "}
                          {formatDateTime(entry.at)}
                          {entry.actorName ? ` · ${entry.actorName}` : ""}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {isGM && request.kind === "custom" ? (
                    <div>
                      <label>
                        <span>운영자 메모</span>
                        <input
                          type="text"
                          maxLength={1000}
                          value={workshopOperatorNotes[request._id] ?? ""}
                          onChange={(event) =>
                            setWorkshopOperatorNotes((current) => ({
                              ...current,
                              [request._id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      {WORKSHOP_NEXT_STATUSES[request.status].map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={
                            updateWorkshopRequestMutation.isPending ||
                            (requiresEquipmentWorkshopOperatorNote(status) &&
                              !(workshopOperatorNotes[request._id] ?? "").trim())
                          }
                          onClick={() =>
                            updateWorkshopRequestMutation.mutate(
                              {
                                requestId: request._id,
                                status,
                                ...((workshopOperatorNotes[request._id] ?? "").trim()
                                  ? {
                                      operatorNote: (
                                        workshopOperatorNotes[request._id] ?? ""
                                      ).trim(),
                                    }
                                  : {}),
                              },
                              {
                                onSuccess: () =>
                                  setWorkshopOperatorNotes((current) => ({
                                    ...current,
                                    [request._id]: "",
                                  })),
                                onError: (error) =>
                                  setErrorMessage(
                                    describeEquipmentShopError(error),
                                  ),
                              },
                            )
                          }
                        >
                          {WORKSHOP_STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        styles.armoryRoot,
        isHub ? styles["armoryRoot--hub"] : "",
        !isHub && activeZone === "lab" ? styles["armoryRoot--lab"] : "",
        !isHub && activeZone === "strategic"
          ? styles["armoryRoot--strategic"]
          : "",
        !isHub && activeZone === "acheron"
          ? styles["armoryRoot--acheron"]
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-pixel-font="full"
    >
      <PageHead
        hasVisibleHeading
        breadcrumb={
          isHub
            ? [
                { label: "ERP", href: "/erp" },
                { label: "ARMORY BUREAU" },
              ]
            : [
                { label: "ERP", href: "/erp" },
                { label: "병기부", href: "/erp/equipment-shop" },
                { label: zoneMeta.label },
              ]
        }
        title={isHub ? "병기부 안내데스크" : zoneMeta.label}
      />

      {!hasMainCharacter &&
      !(
        mode === "zone" &&
        (activeZone === "towaski" ||
          activeZone === "lab" ||
          activeZone === "acheron")
      ) ? (
        <Box className={styles.notice}>
          {mainCharacterError ? (
            <>
              <strong>정합성 위반</strong>
              {": "}
              {mainCharacterError}
            </>
          ) : (
            "메인 AGENT 캐릭터가 없어 구매, 개인 연구, 팀 연구 기여가 제한됩니다. 연구 현황은 조회할 수 있습니다."
          )}
        </Box>
      ) : null}

      {catalogQuery.isError || catalogQuery.isRefetchError ? (
        <Box className={styles.errorBanner} role="alert">
          라이센스 자격 정보를 갱신할 수 없어 구매 기능을 잠갔습니다. 잠시 후 다시
          시도해 주세요.
        </Box>
      ) : null}

      {researchDataUnavailable && activeZone === "lab" ? (
        <Box className={styles.errorBanner} role="alert">
          연구 정보를 갱신할 수 없어 시작·기여·단축·적용 기능을 잠갔습니다. 기존
          화면은 마지막 정상 데이터입니다.
          <button
            type="button"
            className={styles.errorRetry}
            onClick={() => void researchQuery.refetch()}
            disabled={researchQuery.isFetching}
          >
            {researchQuery.isFetching ? "재시도 중" : "다시 시도"}
          </button>
        </Box>
      ) : null}

      {feedback ? (
        <div
          key={feedback.id}
          className={[
            styles.feedbackToast,
            styles[`feedbackToast--${feedback.tone}`],
          ]
            .filter(Boolean)
            .join(" ")}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live={feedback.tone === "error" ? "assertive" : "polite"}
        >
          <span className={styles.feedbackToast__icon} aria-hidden>
            {feedback.tone === "success"
              ? "✓"
              : feedback.tone === "error"
                ? "!"
                : "i"}
          </span>
          <div className={styles.feedbackToast__body}>
            <span>{FEEDBACK_LABELS[feedback.tone]}</span>
            <strong>{feedback.title}</strong>
            <p>{feedback.detail}</p>
          </div>
          <button
            type="button"
            className={styles.feedbackToast__dismiss}
            onClick={dismissFeedback}
            aria-label="병기부 알림 닫기"
          >
            ×
          </button>
        </div>
      ) : null}

      <section
        className={[
          styles.armoryStage,
          isHub ? styles["armoryStage--hub"] : "",
          !isHub && activeZone === "lab" ? styles["armoryStage--lab"] : "",
          !isHub && activeZone === "acheron"
            ? styles["armoryStage--acheron"]
            : "",
          !isHub && activeZone === "strategic"
            ? styles["armoryStage--strategic"]
            : "",
          !isHub && activeZone === "custom"
            ? styles["armoryStage--custom"]
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="병기부"
        data-strategic-scene={
          activeZone === "strategic" ? strategicScene : undefined
        }
      >
        <header className={styles.armoryHeader}>
          <div className={styles.armoryHeader__title}>
            <span className={styles.armoryHeader__icon} aria-hidden>
              <ArmoryZoneIcon zone={headerZoneKey} />
            </span>
            <div>
              <Eyebrow>{zoneMeta.eyebrow}</Eyebrow>
              <div className={styles.armoryHeader__headingRow}>
                <h1>{zoneMeta.label}</h1>
                {!isHub ? (
                  <Link href="/erp/equipment-shop" className={styles.backLink}>
                    안내데스크로 돌아가기
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
          <Tag tone="gold">{headerTag}</Tag>
          <div className={styles.headerStats}>
            {headerStats.map((stat) => (
              <div key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </header>

        {isHub ? (
          renderHubPanel()
        ) : (
          <>
            {isGM && activeZone === "towaski" ? (
              <div
                className={styles.debugBar}
                aria-label="토와스키 건샵 디버그 모드"
              >
                <div className={styles.debugBar__label}>
                  <strong>GM DEBUG</strong>
                  <span>
                    {isTowaskiDebug ? "SANDBOX / DB WRITE 0" : "LIVE DATA"}
                  </span>
                </div>
                <div
                  className={styles.debugModes}
                  role="group"
                  aria-label="테스트할 사용자 상태"
                >
                  {TOWASKI_DEBUG_MODES.map((debugMode) => (
                    <button
                      key={debugMode.value}
                      type="button"
                      data-active={towaskiDebugMode === debugMode.value}
                      aria-pressed={towaskiDebugMode === debugMode.value}
                      disabled={
                        purchaseMutation.isPending || towaskiLicenseTestBusy
                      }
                      onClick={() => handleTowaskiDebugMode(debugMode.value)}
                    >
                      {debugMode.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {isGM && activeZone === "lab" ? (
              <div
                className={styles.debugBar}
                aria-label="수처 연구소 초상 상태 샌드박스"
              >
                <div className={styles.debugBar__label}>
                  <strong>GM PORTRAIT TEST</strong>
                  <span>
                    {isSutureDebug ? "SANDBOX / DB WRITE 0" : "LIVE DATA"}
                  </span>
                </div>
                <div
                  className={[
                    styles.debugModes,
                    styles["debugModes--suture"],
                  ].join(" ")}
                  role="group"
                  aria-label="테스트할 연구소 NPC 상태"
                >
                  {SUTURE_DEBUG_MODES.map((debugMode) => (
                    <button
                      key={debugMode.value}
                      type="button"
                      data-active={sutureDebugMode === debugMode.value}
                      aria-pressed={sutureDebugMode === debugMode.value}
                      onClick={() => handleSutureDebugMode(debugMode.value)}
                    >
                      {debugMode.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={styles.routeBar}>
              <span>{activeZoneDef.description}</span>
            </div>

            <div className={styles.zoneBody}>
              {showTowaskiLicenseTest ? (
                <TowaskiLicenseTest
                  key={`towaski-license-${activeTowaskiLicenseTestSlug}-${towaskiDebugRevision}`}
                  characterCodename={mainCharacter?.codename ?? "DEBUG AGENT"}
                  licenseSlug={activeTowaskiLicenseTestSlug}
                  debugSandbox={isTowaskiDebug}
                  onBusyChange={setTowaskiLicenseTestBusy}
                  onDialogueEvent={handleTowaskiQualificationDialogue}
                  onCancel={
                    selectedTowaskiLicenseTestSlug !== null ||
                    effectiveHasQualificationAccess
                      ? () => {
                          setTowaskiLicenseTestOpen(false);
                          setSelectedTowaskiLicenseTestSlug(null);
                        }
                      : undefined
                  }
                  onGranted={handleTowaskiLicenseGranted}
                />
              ) : activeZone === "lab"
                ? renderLabPanel()
                : activeZone === "custom"
                  ? renderCustomPanel()
                  : renderSalesPanel()}
            </div>
          </>
        )}

        {isHub || mode === "zone" ? (
          <section
            className={styles.npcHud}
            aria-label="병기부 응대 HUD"
            data-ameri-mood={isHub ? ameriMood : undefined}
            data-temper-mood={
              activeZone === "acheron" ? temperMood : undefined
            }
            data-strategic-mood={
              activeZone === "strategic" ? strategicMood : undefined
            }
            data-vernier-mood={
              activeZone === "custom" ? vernierMood : undefined
            }
          >
            <div
              className={[
                styles.npcPortrait,
                isHub ? styles["npcPortrait--ameri"] : "",
                !isHub && activeZone === "towaski"
                  ? styles["npcPortrait--towaski"]
                  : "",
                !isHub && activeZone === "lab"
                  ? styles["npcPortrait--suture"]
                  : "",
                !isHub && activeZone === "acheron"
                  ? styles["npcPortrait--temper"]
                  : "",
                !isHub && activeZone === "strategic"
                  ? styles["npcPortrait--strategic"]
                  : "",
                !isHub && activeZone === "custom"
                  ? styles["npcPortrait--vernier"]
                  : "",
                !isHub &&
                activeZone !== "towaski" &&
                activeZone !== "lab" &&
                activeZone !== "acheron" &&
                activeZone !== "strategic" &&
                activeZone !== "custom"
                  ? styles["npcPortrait--mark"]
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isHub ? (
                <Image
                  src={ameriPortraitSrc}
                  alt=""
                  fill
                  sizes="148px"
                  priority
                />
              ) : activeZone === "towaski" ? (
                <Image
                  src={towaskiPortraitSrc}
                  alt=""
                  fill
                  sizes="148px"
                  priority
                />
              ) : activeZone === "lab" ? (
                <Image
                  src={suturePortraitSrc}
                  alt=""
                  fill
                  sizes="148px"
                  priority
                />
              ) : activeZone === "acheron" ? (
                <Fragment>
                  <Image
                    src={temperPortraitSrc}
                    alt=""
                    fill
                    sizes="148px"
                    priority
                  />
                  <span className={styles.temperForgeFx} aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                </Fragment>
              ) : activeZone === "strategic" ? (
                <Image
                  src={ratchetPortraitSrc}
                  alt=""
                  fill
                  sizes="148px"
                  priority
                />
              ) : activeZone === "custom" ? (
                <Image
                  src={VERNIER_PROFILE_SRC}
                  alt=""
                  fill
                  sizes="148px"
                  priority
                />
              ) : (
                <span className={styles.npcPortraitMark} aria-hidden />
              )}
            </div>
            <div className={styles.npcDialogue}>
              <div className={styles.npcHead}>
                <span
                  className={[
                    styles.npcProfile,
                    isHub
                      ? styles["npcProfile--ameri"]
                      : activeZone === "acheron"
                      ? styles["npcProfile--temper"]
                      : activeZone === "strategic"
                        ? styles["npcProfile--strategic"]
                        : activeZone === "custom"
                          ? styles["npcProfile--vernier"]
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {isHub ? (
                    <Image src={AMERI_PROFILE_SRC} alt="" fill sizes="38px" />
                  ) : activeZone === "towaski" ? (
                    <Image src={TOWASKI_PROFILE_SRC} alt="" fill sizes="38px" />
                  ) : activeZone === "lab" ? (
                    <Image src={SUTURE_PROFILE_SRC} alt="" fill sizes="38px" />
                  ) : activeZone === "acheron" ? (
                    <Image src={TEMPER_PROFILE_SRC} alt="" fill sizes="38px" />
                  ) : activeZone === "strategic" ? (
                    <Image src={ratchetPortraitSrc} alt="" fill sizes="38px" />
                  ) : activeZone === "custom" ? (
                    <Image src={VERNIER_PROFILE_SRC} alt="" fill sizes="38px" />
                  ) : (
                    <span className={styles.npcProfileMark} aria-hidden />
                  )}
                </span>
                <div>
                  <span>{zoneMeta.eyebrow}</span>
                  <strong>{zoneMeta.npc}</strong>
                </div>
                <span className={styles.npcMood}>
                  {isHub
                    ? AMERI_MOOD_LABELS[ameriMood]
                    : activeZone === "towaski"
                    ? TOWASKI_MOOD_LABELS[towaskiMood]
                    : activeZone === "lab"
                      ? SUTURE_MOOD_LABELS[sutureMood]
                      : activeZone === "acheron"
                        ? TEMPER_MOOD_LABELS[temperMood]
                        : activeZone === "strategic"
                          ? STRATEGIC_MOOD_LABELS[strategicMood]
                          : activeZone === "custom"
                            ? VERNIER_MOOD_LABELS[vernierMood]
                            : "응대 중"}
                </span>
              </div>
              <p>
                {isHub
                  ? (
                      <>
                        {ameriVisibleLine}
                        {ameriTyping ? (
                          <span className={styles.npcCaret} aria-hidden>
                            |
                          </span>
                        ) : null}
                      </>
                    )
                  : activeZone === "lab"
                  ? (
                      <>
                        {sutureVisibleLine}
                        {sutureTyping ? (
                          <span className={styles.npcCaret} aria-hidden>
                            |
                          </span>
                        ) : null}
                      </>
                    )
                  : activeZone === "acheron"
                    ? (
                        <>
                          {temperVisibleLine}
                          {temperTyping ? (
                            <span className={styles.npcCaret} aria-hidden>
                              |
                            </span>
                          ) : null}
                        </>
                      )
                    : activeZone === "towaski"
                      ? (
                          <>
                            {towaskiVisibleLine}
                            {towaskiTyping ? (
                              <span className={styles.npcCaret} aria-hidden>
                                |
                              </span>
                          ) : null}
                        </>
                      )
                      : activeZone === "strategic"
                        ? (
                            <>
                              {strategicVisibleLine}
                              {strategicTyping ? (
                                <span className={styles.npcCaret} aria-hidden>
                                  |
                                </span>
                              ) : null}
                            </>
                          )
                        : activeZone === "custom"
                          ? (
                              <>
                                {vernierVisibleLine}
                                {vernierTyping ? (
                                  <span className={styles.npcCaret} aria-hidden>
                                    |
                                  </span>
                                ) : null}
                              </>
                            )
                          : "응대 담당자가 배정되지 않았습니다."}
              </p>
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}
