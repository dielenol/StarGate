"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type MouseEvent, useEffect, useMemo, useState } from "react";

import {
  type CreditsResponse,
  useCredits,
} from "@/hooks/queries/useCreditsQuery";
import { useNpcDialogue } from "@/hooks/useNpcDialogue";
import {
  type EquipmentResearchScope,
  type EquipmentResearchStat,
  useCompleteEquipmentResearch,
  useContributeEquipmentResearch,
  useCheckoutEquipmentShopCart,
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
} from "@/hooks/queries/useEquipmentShopQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import { describeApiError } from "@/lib/api/describe-error";
import { ArmoryZoneIcon } from "@/lib/equipment-shop/zone-icons";
import { formatCredits } from "@/lib/format/credit";
import {
  DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
  describeEquipmentResearchEffect,
  getEquipmentResearchPrerequisiteTier,
  quoteEquipmentResearchRush,
  quoteEquipmentResearchStart,
  scopeLabel,
} from "@/lib/equipment-shop/research";

import ShopItemIcon from "../shop/ShopItemIcon";

import styles from "./page.module.css";

type ArmoryZone = "lab" | "towaski" | "acheron" | "strategic" | "custom";
type ArmoryDestination = ArmoryZone | "simulator";
type EquipmentShopMode = "hub" | "zone";
type EquipmentShopTabValue = "ALL" | "WEAPON" | "ARMOR" | "CONSUMABLE";
type CartState = Record<string, number>;
type NoticeState = { tone: "success" | "info"; text: string } | null;
type MainCharacterStats = Record<EquipmentResearchStat, number>;
type TowaskiMood =
  | "welcome"
  | "inspect"
  | "stock"
  | "cart"
  | "checkout"
  | "blocked"
  | "idle";
type MainCharacterProfile = "assault" | "guard" | "endurance" | "focus" | "balanced";
type ArmoryZoneDef = {
  value: ArmoryDestination;
  href: string;
  label: string;
  eyebrow: string;
  description: string;
  npc: string;
};

const MAX_CART_QUANTITY_PER_ITEM = 1;
const TOWASKI_PROFILE_SRC = "/assets/npcs/Towaski-profile.webp";
const TOWASKI_PORTRAIT_SRC = "/assets/npcs/Towaski-profile.webp";
const TOWASKI_IDLE_DELAY_MS = 12000;

const TOWASKI_MOOD_LABELS: Record<TowaskiMood, string> = {
  welcome: "입점 확인",
  inspect: "품목 감정",
  stock: "재고 판정",
  cart: "반출 준비",
  checkout: "반출 승인",
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
  removed: "그 줄은 뺐다. 장부에 남기기 전이면 손해도 작지.",
  cartCleared: "반출대 비웠다. 진열장 앞에서 생각 끝내고 와.",
  checkout: "반출 처리 끝. 봉인은 뜯지 말고, 작전 전 점검표부터 확인해.",
  checkoutError:
    "반출 기록이 막혔다. 잔액, 허가, 재고 중 하나가 장부랑 안 맞아.",
  unavailable:
    "그건 오늘 못 나간다. 빈 칸 쳐다봐도 창고 문은 안 열린다.",
  gmOnly: "여긴 승인 라인이다. 구경은 해도 반출 서명은 따로 받아.",
} as const;

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
    npc: "연구 담당관",
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
    npc: "단조 담당관",
  },
  {
    value: "strategic",
    href: "/erp/equipment-shop/strategic",
    label: "전략 장비 보급소",
    eyebrow: "STRATEGIC ASSETS",
    description: "차량, 전략 자산, 전투 보조품을 구매합니다.",
    npc: "전략 자산 담당관",
  },
  {
    value: "custom",
    href: "/erp/equipment-shop/custom",
    label: "공방",
    eyebrow: "CUSTOM WORKSHOP",
    description: "공방 상담 구역입니다. 전용무기 제작 요청 저장은 후속 단계에서 연결합니다.",
    npc: "제작 담당관",
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
  INVALID_CART: "장비 장바구니 구성이 올바르지 않습니다.",
  INVALID_RESEARCH: "연구 적용값이 올바르지 않습니다.",
  ITEM_NOT_AVAILABLE: "판매 가능한 병기부 카탈로그 품목이 아닙니다.",
  PRICE_NOT_SET: "가격이 확정되지 않은 장비는 구매할 수 없습니다.",
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
};

interface Props {
  mode: EquipmentShopMode;
  initialZone?: ArmoryZone;
  initialCatalog: EquipmentShopCatalogResponse;
  initialResearch: EquipmentResearchOverviewResponse;
  mainCharacter: {
    id: string;
    codename: string;
    stats: MainCharacterStats;
  } | null;
  initialBalance: number;
  initialCredits: CreditsResponse | undefined;
  mainCharacterError: string | null;
  isGM: boolean;
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
): { mood: TowaskiMood; text: string } {
  if (item.stock <= 0 || !item.available) {
    return { mood: "stock", text: TOWASKI_DIALOGUE_LINES.unavailable };
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

function buildTowaskiRemoveLine(item: EquipmentShopCatalogEntry | null): string {
  if (!item) return TOWASKI_DIALOGUE_LINES.removed;

  const itemDialogue = getTowaskiItemDialogue(item);
  if (itemDialogue?.remove) {
    return pickStableLine(itemDialogue.remove, `${item.key}:remove`);
  }

  const variants: Record<
    EquipmentShopCatalogEntry["category"] | "ALL",
    readonly string[]
  > = {
    ALL: [TOWASKI_DIALOGUE_LINES.removed],
    WEAPON: [
      "무기는 다시 잠갔다. 빈손이 조용할 때도 있어.",
      "화기 줄은 지웠다. 장부엔 아직 흠집도 안 났다.",
    ],
    ARMOR: [
      "방호구는 내려놨다. 맞을 일이 없길 비는 쪽이 싸지.",
      "방어구 반출 줄은 뺐다. 몸이 가벼운 만큼 판단도 가벼우면 곤란해.",
    ],
    CONSUMABLE: [
      "소모품은 다시 넣었다. 필요할 때 없다고 내 탓은 하지 마.",
      "그 묶음은 뺐다. 봉인 뜯기 전이면 아직 깨끗해.",
    ],
    SPECIAL: [
      "특수 장비는 반출대에서 내렸다. 서류가 짧아졌군.",
      "전략 자산 줄은 지웠다. 승인권자도 한숨 돌리겠어.",
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
}: Props) {
  const router = useRouter();
  const catalogQuery = useEquipmentShopCatalog({ initialData: initialCatalog });
  const researchQuery = useEquipmentResearch({ initialData: initialResearch });
  const creditsQuery = useCredits({ initialData: initialCredits });
  const checkoutMutation = useCheckoutEquipmentShopCart();
  const startResearchMutation = useStartEquipmentResearch();
  const rushResearchMutation = useRushEquipmentResearch();
  const contributeResearchMutation = useContributeEquipmentResearch();
  const completeResearchMutation = useCompleteEquipmentResearch();

  const [activeTab, setActiveTab] = useState<EquipmentShopTabValue>("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState>({});
  const [localStats, setLocalStats] = useState<MainCharacterStats | null>(
    () => mainCharacter?.stats ?? null,
  );
  const [activeResearchScope, setActiveResearchScope] =
    useState<EquipmentResearchScope>("personal");
  const [selectedResearchKeys, setSelectedResearchKeys] = useState<
    Record<EquipmentResearchScope, string>
  >(() => ({
    personal: getFirstResearchKeyForScope(initialResearch.tree, "personal"),
    team: getFirstResearchKeyForScope(initialResearch.tree, "team"),
  }));
  const [teamContributionAmount, setTeamContributionAmount] = useState("100");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const catalog = catalogQuery.data ?? initialCatalog;
  const research = researchQuery.data ?? initialResearch;
  const researchTree = research.tree;
  const researchProjects = research.projects;
  const selectedResearchKey = selectedResearchKeys[activeResearchScope];
  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const isHub = mode === "hub";
  const activeZone = initialZone;
  const activeZoneDef = activeZoneMeta(activeZone);
  const zoneMeta = isHub ? ARMORY_DESK_META : activeZoneDef;
  const headerZoneKey = isHub ? "hub" : activeZone;
  const mainCharacterProfile = useMemo(
    () => getMainCharacterProfile(localStats),
    [localStats],
  );
  const towaskiWelcomeLine = useMemo(
    () =>
      buildTowaskiWelcomeLine({
        codename: mainCharacter?.codename ?? null,
        profile: mainCharacterProfile,
      }),
    [mainCharacter?.codename, mainCharacterProfile],
  );

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
    hasMainCharacter,
    idleDelayMs: TOWASKI_IDLE_DELAY_MS,
    idleLines: TOWASKI_IDLE_LINES,
    closedMood: "blocked",
    closedLine: TOWASKI_DIALOGUE_LINES.closed,
    noAgentMood: "blocked",
    noAgentLine: TOWASKI_DIALOGUE_LINES.noAgent,
    welcomeMood: "welcome",
    welcomeLine: towaskiWelcomeLine,
    beepPreset: "towaski",
    beepDefaults: { pitch: 510, speed: 50, volume: 0.58 },
    engineVolume: 0.58,
    entrySfxSrc: null,
    entrySfxVolume: 0,
  });

  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const catalogByKey = useMemo(() => {
    const map = new Map<string, EquipmentShopCatalogEntry>();
    for (const item of catalog.items) map.set(item.key, item);
    return map;
  }, [catalog.items]);

  const towaskiItems = useMemo(() => {
    if (activeTab === "ALL") {
      return catalog.items.filter((item) => item.zone === "towaski");
    }
    return catalog.items.filter(
      (item) => item.zone === "towaski" && item.category === activeTab,
    );
  }, [activeTab, catalog.items]);

  const acheronItems = useMemo(() => {
    if (activeTab === "ALL") {
      return catalog.items.filter((item) => item.zone === "acheron");
    }
    return catalog.items.filter(
      (item) => item.zone === "acheron" && item.category === activeTab,
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

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .map(([key, quantity]) => {
        const item = catalogByKey.get(key);
        if (!item || quantity <= 0) return null;
        const safeQuantity = Math.min(quantity, MAX_CART_QUANTITY_PER_ITEM);
        return {
          item,
          quantity: safeQuantity,
          total: item.price * safeQuantity,
          stockIssue: item.stock < safeQuantity || item.stock <= 0,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);
  }, [cart, catalogByKey]);

  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.total, 0);
  const cartHasStockIssue = cartLines.some((line) => line.stockIssue);
  const cartOverBalance = cartTotal > balance;
  const canUseShop = isGM && hasMainCharacter && catalog.isOpen;
  const canCheckout =
    canUseShop &&
    cartLines.length > 0 &&
    !cartHasStockIssue &&
    !cartOverBalance &&
    !checkoutMutation.isPending;

  const selectedQuantity = selectedItem ? cart[selectedItem.key] ?? 0 : 0;
  const selectedCanAdd =
    Boolean(selectedItem) &&
    canUseShop &&
    selectedItem?.available === true &&
    selectedItem.stock > 0 &&
    selectedQuantity < selectedItem.stock &&
    selectedQuantity < MAX_CART_QUANTITY_PER_ITEM;

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

    if (!hasMainCharacter) {
      playTowaskiLine("blocked", TOWASKI_DIALOGUE_LINES.noAgent, {
        returnToIdle: false,
        sound: false,
      });
      return;
    }

    showTowaskiLineImmediately("welcome", towaskiWelcomeLine);
    resetTowaskiIdleCycle();
    scheduleTowaskiIdle();
  }, [
    activeZone,
    catalog.isOpen,
    clearTowaskiIdleTimer,
    hasMainCharacter,
    playTowaskiLine,
    resetTowaskiIdleCycle,
    scheduleTowaskiIdle,
    showTowaskiLineImmediately,
    stopTowaskiEngine,
    towaskiWelcomeLine,
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

  function setCartQuantity(key: string, quantity: number) {
    const item = catalogByKey.get(key);
    const max = item ? Math.min(item.stock, MAX_CART_QUANTITY_PER_ITEM) : 0;
    setCart((prev) => {
      const next = { ...prev };
      if (!item || max <= 0 || quantity <= 0) {
        delete next[key];
        return next;
      }
      next[key] = Math.min(max, Math.floor(quantity));
      return next;
    });
  }

  function playTowaskiIfActive(mood: TowaskiMood, text: string) {
    if (activeZone !== "towaski") return;
    playTowaskiLine(mood, text, { sound: true });
  }

  function handleSalesTabChange(tab: EquipmentShopTabValue) {
    setActiveTab(tab);
    playTowaskiIfActive("inspect", buildTowaskiTabLine(tab));
  }

  function handleSelectSalesItem(item: EquipmentShopCatalogEntry) {
    setSelectedKey(item.key);
    if (activeZone === "towaski") {
      const nextLine = buildTowaskiItemLine(item);
      playTowaskiIfActive(nextLine.mood, nextLine.text);
    }
  }

  function handleAddToCart(item: EquipmentShopCatalogEntry, quantity = 1) {
    if (!canUseShop) {
      setErrorMessage(
        hasMainCharacter
          ? "GM preview 상태에서만 병기부 구매를 실행할 수 있습니다."
          : "메인 AGENT 캐릭터가 없어 구매할 수 없습니다.",
      );
      playTowaskiIfActive(
        "blocked",
        hasMainCharacter
          ? TOWASKI_DIALOGUE_LINES.gmOnly
          : TOWASKI_DIALOGUE_LINES.noAgent,
      );
      return;
    }

    if (item.stock <= 0 || !item.available) {
      setErrorMessage("현재 반출할 수 없는 품목입니다.");
      playTowaskiIfActive("stock", TOWASKI_DIALOGUE_LINES.unavailable);
      return;
    }

    setSelectedKey(item.key);
    setErrorMessage(null);
    setNotice(null);
    setCartQuantity(item.key, (cart[item.key] ?? 0) + quantity);
    playTowaskiIfActive("cart", buildTowaskiCartLine(item));
  }

  function handleRemoveFromCart(key: string) {
    const item = catalogByKey.get(key) ?? null;
    setCart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    playTowaskiIfActive("cart", buildTowaskiRemoveLine(item));
  }

  function handleClearCart() {
    setCart({});
    playTowaskiIfActive("cart", TOWASKI_DIALOGUE_LINES.cartCleared);
  }

  function handleCheckout() {
    if (!canCheckout) return;
    setErrorMessage(null);
    setNotice(null);
    checkoutMutation.mutate(
      {
        items: cartLines.map((line) => ({
          key: line.item.key,
          quantity: line.quantity,
        })),
      },
      {
        onSuccess: (res) => {
          setCart({});
          setNotice({
            tone: "success",
            text: `${res.order.items.length}종 반출 결제가 완료되었습니다.`,
          });
          playTowaskiIfActive("checkout", TOWASKI_DIALOGUE_LINES.checkout);
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
          playTowaskiIfActive("blocked", TOWASKI_DIALOGUE_LINES.checkoutError);
        },
      },
    );
  }

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
  }

  function handleSelectResearchNode(key: string) {
    setSelectedResearchKeys((prev) => ({
      ...prev,
      [activeResearchScope]: key,
    }));
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
            text: `${res.project.key} 연구를 시작했습니다.`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function handleContributeTeamResearch(key: string, remainingCost: number) {
    if (contributeResearchMutation.isPending) return;
    const requestedAmount = Math.floor(Number(teamContributionAmount));
    const chargePreview = Math.min(requestedAmount, remainingCost);
    if (
      !Number.isInteger(requestedAmount) ||
      requestedAmount <= 0 ||
      chargePreview <= 0
    ) {
      setErrorMessage("기여 금액은 1 CR 이상이어야 합니다.");
      return;
    }
    if (!hasMainCharacter) {
      setErrorMessage("메인 AGENT 캐릭터가 없어 팀 연구에 기여할 수 없습니다.");
      return;
    }
    if (balance < chargePreview) {
      setErrorMessage("잔액이 부족합니다.");
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
            text: res.project
              ? `${res.project.key} 팀 연구 목표액이 충족되어 연구를 시작했습니다.`
              : `${res.pool.key} 팀 연구에 ${formatCredits(res.chargedAmount)} 기여했습니다.`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function handleRushResearch(projectId: string) {
    if (rushResearchMutation.isPending) return;
    setErrorMessage(null);
    setNotice(null);
    rushResearchMutation.mutate(
      { projectId },
      {
        onSuccess: (res) => {
          setNotice({
            tone: "success",
            text:
              `연구 시간을 ${formatDuration(res.rush.hours)} 단축했습니다.` +
              `${res.rush.discountApplied ? " (할인 적용)" : ""}`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function handleCompleteResearch(project: EquipmentResearchProjectEntry) {
    if (completeResearchMutation.isPending) return;
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
            text:
              `${res.key} 연구 효과를 적용했습니다.` +
              `${res.skipped.length > 0 ? ` (${res.skipped.length}명 제외)` : ""}`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
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

  function renderHubPanel() {
    const totalCatalogItemCount =
      towaskiItemCount + acheronItemCount + strategicItemCount;
    const availableCatalogItemCount = catalog.items.filter(
      (item) => item.available && item.stock > 0,
    ).length;
    const availableStockCount = catalog.items.reduce(
      (sum, item) => sum + (item.available ? item.stock : 0),
      0,
    );
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
        key: "catalog",
        label: "반출 카탈로그",
        value: `${totalCatalogItemCount}종`,
        detail: `가용 ${availableCatalogItemCount}종 · 재고 ${availableStockCount}EA`,
        warning: false,
      },
      {
        key: "research",
        label: "연구 트리",
        value: `${personalResearchCount + teamResearchCount}노드`,
        detail: `개인 ${personalResearchCount} · 팀 ${teamResearchCount}`,
        warning: false,
      },
      {
        key: "projects",
        label: "진행 큐",
        value: `${activeProjectCount}건`,
        detail: `완료 대기 ${readyProjectCount} · 적용 ${appliedProjectCount}`,
        warning: false,
      },
      {
        key: "agent",
        label: "운영 대상",
        value: mainCharacter?.codename ?? "UNASSIGNED",
        detail: hasMainCharacter
          ? `${formatCredits(balance)} 운용 가능`
          : "개인 연구/구매 제한",
        warning: !hasMainCharacter,
      },
    ];

    const operationCards = [
      {
        key: "research",
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
        key: "catalog",
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
        key: "acheron",
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
        key: "simulator",
        iconKey: "simulator" as const,
        eyebrow: "TEST RANGE",
        title: "훈련장",
        href: "/erp/equipment-shop/simulator",
        status: "시험장 모듈 활성",
        detail: "보급형 장비의 사거리, 탄환 운용, 공격 흐름을 시험합니다.",
        warning: false,
      },
      {
        key: "strategic",
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
        key: "fabrication",
        iconKey: "custom" as const,
        eyebrow: "FABRICATION",
        title: "공방",
        href: "/erp/equipment-shop/custom",
        status: "공방 상담 · 훈련장 연결",
        detail: "전용무기 상담과 보급형 장비 성능 시험을 병기부 하위 모듈로 분리합니다.",
        warning: false,
      },
    ];

    const systemAlerts = [
      {
        key: "research",
        label: "완료 연구",
        value:
          readyProjectCount > 0
            ? `${readyProjectCount}건 적용 대기`
            : "대기 없음",
        warning: readyProjectCount > 0,
      },
      {
        key: "strategic",
        label: "전략 장비 보급소",
        value:
          strategicItemCount > 0
            ? `${strategicItemCount}종 반출 목록`
            : "목록 비어 있음",
        warning: strategicItemCount === 0,
      },
      {
        key: "custom",
        label: "공방",
        value: "상담 패널 활성",
        warning: false,
      },
      {
        key: "simulator",
        label: "훈련장",
        value: "훈련 모듈 활성",
        warning: false,
      },
    ];

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
                styles[`hubHotspot--${card.key}`],
                card.warning ? styles["hubHotspot--warning"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={(event) => handleZoneLinkClick(event, card.href)}
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

        <aside className={styles.hubDeskConsole} aria-label="아메리 안내 패널">
          <div>
            <Eyebrow>AMERY / INFORMATION</Eyebrow>
            <strong>병기부 접수 상태</strong>
            <p>
              연구, 반출, 제작, 시험 구역의 대기열을 확인했습니다.
            </p>
          </div>
          <div className={styles.hubAlertList}>
            {systemAlerts.map((alert) => (
              <div
                key={alert.key}
                className={[
                  styles.hubAlert,
                  alert.warning ? styles["hubAlert--warning"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span>{alert.label}</span>
                <strong>{alert.value}</strong>
              </div>
            ))}
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

    return (
      <div className={styles.salesLayout}>
        <section className={styles.shelfPanel} aria-label={zoneMeta.label}>
          {isStandardCatalog ? (
            <div
              role="tablist"
              aria-label={`${activeZoneDef.label} 카테고리`}
              className={styles.filters}
            >
              {TAB_DEFS.map((tab) => {
                const isActive = activeTab === tab.value;
                const count =
                  tab.value === "ALL"
                    ? catalog.items.filter(
                        (item) => item.zone === activeCatalogZone,
                      )
                        .length
                    : catalog.items.filter(
                        (item) =>
                          item.zone === activeCatalogZone &&
                          item.category === tab.value,
                      ).length;
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
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.panelIntro}>
              <Eyebrow>STRATEGIC CATALOG</Eyebrow>
              <strong>전략 자산 반출대</strong>
            </div>
          )}

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
                const inCart = cart[item.key] ?? 0;
                const isSelected = selectedItem?.key === item.key;
                const isSoldOut = item.stock <= 0 || !item.available;
                const canAdd =
                  canUseShop &&
                  !isSoldOut &&
                  inCart < item.stock &&
                  inCart < MAX_CART_QUANTITY_PER_ITEM;

                return (
                  <article
                    key={item.key}
                    className={[
                      styles.productCard,
                      isSelected ? styles["productCard--selected"] : "",
                      isSoldOut ? styles["productCard--locked"] : "",
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
                        <span>{CATEGORY_LABELS[item.category]}</span>
                        <span>{isSoldOut ? "LOCKED" : `${item.stock} EA`}</span>
                      </span>
                      <span className={styles.productIcon} aria-hidden>
                        {renderCatalogIcon(item, 48)}
                      </span>
                      <span className={styles.productName}>{item.name}</span>
                      <span className={styles.productEffect}>{item.effect}</span>
                      <strong>{formatCredits(item.price)}</strong>
                    </button>
                    <button
                      type="button"
                      className={styles.productAction}
                      onClick={() => handleAddToCart(item)}
                      disabled={!canAdd}
                    >
                      {isSoldOut ? "반출 불가" : inCart > 0 ? "카트 등록" : "담기"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className={styles.counterPanel} aria-label="반출 계산대">
          <section className={styles.detailPanel}>
            {selectedItem ? (
              <>
                <div className={styles.detailHead}>
                  <span className={styles.detailIcon} aria-hidden>
                    {renderCatalogIcon(selectedItem, 58)}
                  </span>
                  <div>
                    <span>{CATEGORY_LABELS[selectedItem.category]}</span>
                    <h2>{selectedItem.name}</h2>
                  </div>
                </div>
                <p>{selectedItem.description}</p>
                <div className={styles.detailStats}>
                  <span>{selectedItem.effect}</span>
                  <strong>{formatCredits(selectedItem.price)}</strong>
                  <span>
                    {selectedItem.stock <= 0 || !selectedItem.available
                      ? "LOCKED"
                      : `STOCK ${selectedItem.stock}`}
                  </span>
                </div>
                <div className={styles.buyBox}>
                  <div className={styles.qtyStepper}>
                    <button
                      type="button"
                      onClick={() =>
                        setCartQuantity(selectedItem.key, selectedQuantity - 1)
                      }
                      disabled={selectedQuantity <= 0}
                      aria-label={`${selectedItem.name} 장바구니 수량 감소`}
                    >
                      -
                    </button>
                    <span>{selectedQuantity}</span>
                    <button
                      type="button"
                      onClick={() => handleAddToCart(selectedItem)}
                      disabled={!selectedCanAdd}
                      aria-label={`${selectedItem.name} 장바구니 수량 증가`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    onClick={() => handleAddToCart(selectedItem)}
                    disabled={!selectedCanAdd}
                  >
                    장바구니 담기
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.empty}>선택 가능한 품목이 없습니다.</div>
            )}
          </section>

          <section className={styles.receiptPanel}>
            <div className={styles.receiptHead}>
              <div>
                <Eyebrow>CART RECEIPT</Eyebrow>
                <h2>반출 장바구니</h2>
              </div>
              {cartLines.length > 0 ? (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={handleClearCart}
                  disabled={checkoutMutation.isPending}
                >
                  비우기
                </button>
              ) : null}
            </div>

            {cartLines.length === 0 ? (
              <div className={styles.receiptEmpty}>담긴 장비가 없습니다.</div>
            ) : (
              <div className={styles.receiptLines}>
                {cartLines.map((line) => (
                  <div
                    key={line.item.key}
                    className={[
                      styles.receiptLine,
                      line.stockIssue ? styles["receiptLine--warning"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div>
                      <span>{line.item.name}</span>
                      <small>
                        {formatCredits(line.item.price)} x {line.quantity}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCart(line.item.key)}
                      disabled={checkoutMutation.isPending}
                      aria-label={`${line.item.name} 제거`}
                    >
                      X
                    </button>
                    <strong>{formatCredits(line.total)}</strong>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.receiptSummary}>
              <div>
                <span>합계</span>
                <strong>{formatCredits(cartTotal)}</strong>
              </div>
              <div>
                <span>결제 후 잔액</span>
                <strong className={cartOverBalance ? styles.dangerText : ""}>
                  {formatCredits(balance - cartTotal)}
                </strong>
              </div>
            </div>

            {cartHasStockIssue ? (
              <div className={styles.cartWarning}>
                반출할 수 없는 장비가 있습니다.
              </div>
            ) : cartOverBalance ? (
              <div className={styles.cartWarning}>잔액이 부족합니다.</div>
            ) : null}

            <button
              type="button"
              className={styles.checkoutButton}
              onClick={handleCheckout}
              disabled={!canCheckout}
              aria-busy={checkoutMutation.isPending}
            >
              {checkoutMutation.isPending ? "결제 중" : "한번에 결제"}
            </button>
          </section>
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
    const selectedRushRule = selectedResearchNode
      ? research.rushRules.find((rule) => rule.tier === selectedResearchNode.tier)
      : null;
    const selectedPrerequisiteLabel = selectedResearchNode
      ? researchNodeLockLabel(selectedResearchNode)
      : null;
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
      selectedResearchUnlocked &&
      selectedTeamRemainingCost > 0 &&
      selectedTeamChargePreview > 0 &&
      balance >= selectedTeamChargePreview &&
      hasMainCharacter &&
      !contributeResearchMutation.isPending;
    const techTreeMapStyle = {
      gridTemplateColumns: `132px repeat(${researchTrackLayout.columnCount}, minmax(152px, 176px))`,
      gridTemplateRows: `70px repeat(${Math.max(1, researchTrackLayout.rows.length)}, minmax(118px, auto))`,
      minWidth: `${164 + researchTrackLayout.columnCount * 184}px`,
    };

    return (
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
                role="tablist"
                aria-label="연구 범위"
              >
                {(["personal", "team"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    role="tab"
                    aria-selected={activeResearchScope === scope}
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
              <div className={styles.techTreeLegend}>
                <span>좌측 T1</span>
                <span>우측 T5</span>
                <span>{scopeLabel(activeResearchScope)} 트리</span>
              </div>
            </div>
          </div>

          <div className={styles.techCapRail}>
            <div>
              <span>누적 상한</span>
              <strong>
                HP {research.caps.hp} · SAN {research.caps.san} · ATK{" "}
                {research.caps.atk} · DEF {research.caps.def}
              </strong>
            </div>
            <div>
              <span>환급</span>
              <strong>
                {research.capabilities.refundPercent > 0
                  ? `${research.capabilities.refundPercent}% / cap ${research.capabilities.refundCap} CR`
                  : "미해금"}
              </strong>
            </div>
            <div>
              <span>RUSH 할인</span>
              <strong>
                {research.capabilities.rushDiscountPercent > 0
                  ? `${research.capabilities.rushDiscountPercent}%`
                  : "미해금"}
              </strong>
            </div>
            <div>
              <span>연구비</span>
              <strong>
                {research.capabilities.researchCostDiscountPercent > 0
                  ? `${research.capabilities.researchCostDiscountPercent}% / cap ${research.capabilities.researchCostDiscountCap} CR`
                  : "미해금"}
              </strong>
            </div>
            <div>
              <span>연구 시간</span>
              <strong>
                {research.capabilities.researchTimeDiscountPercent > 0
                  ? `${research.capabilities.researchTimeDiscountPercent}% / max ${research.capabilities.researchTimeDiscountMaxHours}h`
                  : "미해금"}
              </strong>
            </div>
            <div>
              <span>크레딧 보너스</span>
              <strong>
                {research.capabilities.creditBonusPercent > 0
                  ? `${research.capabilities.creditBonusPercent}% / cap ${research.capabilities.creditBonusCap} CR`
                  : "미해금"}
              </strong>
            </div>
          </div>

          <div className={styles.techTreeScroll}>
            <div
              className={styles.techTreeMap}
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

        <aside className={styles.techDetailPanel}>
          {selectedResearchNode ? (
            <div className={styles.techDetailHero}>
              <ResearchPixelIcon node={selectedResearchNode} active />
              <div>
                <Eyebrow>SELECTED RESEARCH</Eyebrow>
                <strong>{selectedResearchNode.name}</strong>
                <span>{selectedResearchNode.key}</span>
              </div>
              <span className={styles.techDetailStatus}>
                {researchNodeMapStatusLabel(selectedNodeState)}
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
                      !selectedResearchEffect ||
                      !selectedResearchUnlocked ||
                      !canStartResearch(
                        activeResearchScope,
                        selectedStartQuote?.cost ?? selectedResearchNode.cost,
                      )
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
                메인 AGENT 캐릭터가 없어 연구 비용 차감과 개인 연구를 실행할 수 없습니다.
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
                {activeResearchProjects.slice(0, 4).map((project) => {
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
                          onClick={() => handleRushResearch(project.id)}
                          disabled={
                            project.computedStatus !== "in_progress" ||
                            !rushQuote ||
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
                              project.computedStatus !== "completed" ||
                              completeResearchMutation.isPending
                            }
                            aria-busy={completeResearchMutation.isPending}
                          >
                            완료 적용
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
    );
  }

  function renderCustomPanel() {
    return (
      <div className={styles.customPanel}>
        <div className={styles.panelIntro}>
          <Eyebrow>CUSTOM WEAPON</Eyebrow>
          <strong>공방 상담</strong>
        </div>
        <div className={styles.workshopGrid}>
          <div>
            <span>REQUEST</span>
            <strong>제작 요청서</strong>
            <p>전용무기 제작 요청 저장과 GM 승인 흐름은 후속 단계에서 연결합니다.</p>
          </div>
          <div>
            <span>MATERIAL</span>
            <strong>재료/비용 산정</strong>
            <p>실제 제작 데이터가 들어오면 요구 재료, 가격, 승인 조건을 표시합니다.</p>
          </div>
          <div>
            <span>OUTPUT</span>
            <strong>인벤토리 지급</strong>
            <p>완성품 지급은 기존 `master_items`와 인벤토리 적재 흐름을 재사용합니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        styles.armoryRoot,
        isHub ? styles["armoryRoot--hub"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-pixel-font="full"
    >
      <PageHead
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

      {!hasMainCharacter ? (
        <Box className={styles.notice}>
          {mainCharacterError ? (
            <>
              <strong>정합성 위반</strong>
              {": "}
              {mainCharacterError}
            </>
          ) : (
            "메인 AGENT 캐릭터가 없어 구매와 개인 강화가 제한됩니다. 팀 강화는 GM 권한으로 실행할 수 있습니다."
          )}
        </Box>
      ) : null}

      {errorMessage ? (
        <Box className={styles.errorBanner} role="alert">
          <strong>!</strong> {errorMessage}
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            aria-label="에러 메시지 닫기"
          >
            X
          </button>
        </Box>
      ) : null}

      {notice ? (
        <Box
          className={[
            styles.noticeBanner,
            notice.tone === "success" ? styles["noticeBanner--success"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="status"
        >
          {notice.text}
        </Box>
      ) : null}

      <section
        className={[
          styles.armoryStage,
          isHub ? styles["armoryStage--hub"] : "",
          !isHub && activeZone === "lab" ? styles["armoryStage--lab"] : "",
          !isHub && activeZone === "acheron"
            ? styles["armoryStage--acheron"]
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="병기부"
      >
        <header className={styles.armoryHeader}>
          <div className={styles.armoryHeader__title}>
            <span className={styles.armoryHeader__icon} aria-hidden>
              <ArmoryZoneIcon zone={headerZoneKey} />
            </span>
            <div>
              <Eyebrow>{zoneMeta.eyebrow}</Eyebrow>
              <h1>{zoneMeta.label}</h1>
            </div>
          </div>
          <Tag tone="gold">{isGM ? "GM PREVIEW" : "RESEARCH ACCESS"}</Tag>
          <div className={styles.headerStats}>
            <div>
              <span>요원</span>
              <strong>{mainCharacter?.codename ?? "UNASSIGNED"}</strong>
            </div>
            <div>
              <span>잔액</span>
              <strong>{formatCredits(balance)}</strong>
            </div>
            <div>
              <span>{isHub ? "기능" : "카트"}</span>
              <strong>{isHub ? `${ZONE_DEFS.length}모듈` : `${cartCount}개`}</strong>
            </div>
          </div>
        </header>

        {isHub ? (
          renderHubPanel()
        ) : (
          <>
            <div className={styles.routeBar}>
              <Link href="/erp/equipment-shop" className={styles.backLink}>
                안내데스크로 돌아가기
              </Link>
              <span>{activeZoneDef.description}</span>
            </div>

            <div className={styles.zoneBody}>
              {activeZone === "lab"
                ? renderLabPanel()
                : activeZone === "custom"
                  ? renderCustomPanel()
                  : renderSalesPanel()}
            </div>
          </>
        )}

        {!isHub ? (
          <section className={styles.npcHud} aria-label="병기부 응대 HUD">
            <div
              className={[
                styles.npcPortrait,
                activeZone === "towaski" ? styles["npcPortrait--towaski"] : "",
                activeZone !== "towaski" ? styles["npcPortrait--mark"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {activeZone === "towaski" ? (
                <Image
                  src={TOWASKI_PORTRAIT_SRC}
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
                <span className={styles.npcProfile}>
                  {activeZone === "towaski" ? (
                    <Image src={TOWASKI_PROFILE_SRC} alt="" fill sizes="38px" />
                  ) : (
                    <span className={styles.npcProfileMark} aria-hidden />
                  )}
                </span>
                <div>
                  <span>{zoneMeta.eyebrow}</span>
                  <strong>{zoneMeta.npc}</strong>
                </div>
                <span className={styles.npcMood}>
                  {activeZone === "towaski"
                    ? TOWASKI_MOOD_LABELS[towaskiMood]
                    : "응대 중"}
                </span>
              </div>
              <p>
                {activeZone === "lab"
                  ? "연구 적용은 즉시 기록된다. 개인인지, 팀 전체인지 먼저 확인해."
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
                    : activeZone === "acheron"
                      ? "아케론 대장간이다. 날붙이와 타격 장비는 여기서 보고 골라."
                      : activeZone === "strategic"
                        ? "차량과 전략 자산은 태그가 붙은 품목만 반출대에 올라온다."
                        : "전용무기는 상담부터다. 제작 요청 저장은 다음 단계에서 연결한다."}
              </p>
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}
