"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ShopPageGroup } from "@stargate/shared-db/types";

import {
  type CreditsResponse,
  useCredits,
} from "@/hooks/queries/useCreditsQuery";
import {
  type ShopOpenMode,
  useCheckoutShopCart,
  useRequestShopReorder,
  useSetShopOpenMode,
} from "@/hooks/mutations/useShopMutation";
import {
  ShopApiError,
  type ShopCatalogEntry,
  type ShopCatalogResponse,
  type ShopErrorCode,
  useShopCatalog,
} from "@/hooks/queries/useShopQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import {
  IconBasic,
  IconGridAll,
  IconPreference,
  IconRare,
  IconRecovery,
  type IconComponent,
} from "@/components/icons";
import {
  DialogueBeepEngine,
  type DialogueBeepOptions,
} from "@/lib/audio/dialogue-beep-engine";

import ShopAdminStockModal from "./ShopAdminStockModal";
import ShopItemIcon from "./ShopItemIcon";

import styles from "./page.module.css";

type ShopTabValue = ShopPageGroup | "ALL";
type CartState = Record<string, number>;
type NoticeState = { tone: "success" | "info"; text: string } | null;
type TiaMood =
  | "welcome"
  | "tired"
  | "soldout"
  | "bag"
  | "doodle"
  | "purchase"
  | "nap";

interface TiaLineOptions
  extends Pick<
    DialogueBeepOptions,
    "initialDelay" | "pitch" | "preset" | "speed" | "volume" | "wave"
  > {
  sound?: boolean;
  returnToIdle?: boolean;
}

const MAX_CART_QUANTITY_PER_ITEM = 9;
const SHOP_ENTRY_SFX_SRC = "/assets/shop/sfx/convenience-chime.mp3";
const SHOP_ENTRY_SFX_VOLUME = 0.145;
const TIA_IDLE_DELAY_MS = 18000;
const LOW_STOCK_THRESHOLD = 2;

const TIA_PROFILE_SRC = "/assets/shop/hud/tia-profile.webp";
const SHOP_CLOSED_MESSAGE =
  "편의점이 문을 닫았다.\n편의점 알바생도 퇴근한 것 같다...";
const SHOP_CLOSED_BEEP_OPTIONS = {
  preset: "system",
  pitch: 720,
  speed: 46,
  volume: 0.46,
  wave: "sine",
  initialDelay: 180,
} as const satisfies Pick<
  DialogueBeepOptions,
  "initialDelay" | "pitch" | "preset" | "speed" | "volume" | "wave"
>;

const TIA_MOOD_ASSETS: Record<TiaMood, string> = {
  welcome: "/assets/shop/hud/tia-welcome.png",
  tired: "/assets/shop/hud/tia-tired.png",
  soldout: "/assets/shop/hud/tia-soldout.png",
  bag: "/assets/shop/hud/tia-bag.png",
  doodle: "/assets/shop/hud/tia-doodle.png",
  purchase: "/assets/shop/hud/tia-purchase-complete.png",
  nap: "/assets/shop/hud/tia-nap.png",
};

const TIA_MOOD_LABELS: Record<TiaMood, string> = {
  welcome: "환영",
  tired: "재고 확인",
  soldout: "품절 안내",
  bag: "봉투 확인",
  doodle: "둘러보기",
  purchase: "결제 완료",
  nap: "휴식 중",
};

const TIA_DIALOGUE_LINES = {
  welcome: "어서 오세요~! 스타마트입니다!",
  newItems:
    "오늘 새 상품이 잔뜩 들어왔어요! 관심 가는 거 있으면, 편하게 둘러봐 주세요~",
  idleBrowse: "천천히 보셔도 괜찮아요. 저는 카운터에서 기다리고 있을게요~",
  idleDoodle:
    "음... 이 상품은 어디에 진열하는 게 제일 잘 보일까요?",
  idleStockCheck:
    "잠깐만요... 재고표랑 진열대 숫자가 맞는지 다시 확인하고 있었어요.",
  idleBag:
    "봉투는 카운터 아래에 준비해뒀어요. 필요하면 바로 챙겨드릴게요.",
  idleSleepy:
    "아... 아니에요. 안 졸았어요. 계산은 바로 해드릴 수 있어요.",
  lowStock:
    "앗... 그 상품은 오늘 너무 잘 팔려서요. 지금은 재고가 얼마 안 남았어요.",
  soldOut:
    "앗... 그 상품은 지금 품절이에요. 발주 요청 남겨두면, 입고되는 대로 알려드릴게요.",
  reorderRequested:
    "네, 발주 요청 접수했어요. 입고표에 표시해둘게요. 재고가 들어오면 꼭 확인해주세요.",
  reorderAlready:
    "그 상품은 오늘 이미 발주 요청이 들어와 있어요. 제가 장부에 표시해뒀습니다.",
  reorderError:
    "앗... 발주 요청 장부에 적는 중 문제가 생겼어요. 잠시 후 다시 부탁드릴게요.",
  bag: "봉투도, 같이 챙겨드릴까요?",
  goodbye: "감사합니다! 조심히 들어가시고, 다음에 또 들러주세요~",
  closed: SHOP_CLOSED_MESSAGE,
  noAgent: "앗... 먼저 메인 AGENT 확인이 필요해요. GM에게 문의해 주세요.",
  checkoutError:
    "잠깐만요... 결제 정보가 맞지 않는 것 같아요. 다시 한번 확인해 주세요.",
} as const;

const TIA_IDLE_LINES: readonly { mood: TiaMood; text: string }[] = [
  { mood: "doodle", text: TIA_DIALOGUE_LINES.newItems },
  { mood: "welcome", text: TIA_DIALOGUE_LINES.idleBrowse },
  { mood: "doodle", text: TIA_DIALOGUE_LINES.idleDoodle },
  { mood: "tired", text: TIA_DIALOGUE_LINES.idleStockCheck },
  { mood: "bag", text: TIA_DIALOGUE_LINES.idleBag },
  { mood: "nap", text: TIA_DIALOGUE_LINES.idleSleepy },
];

const TAB_DEFS: { value: ShopTabValue; label: string; icon: IconComponent }[] = [
  { value: "ALL", label: "전체", icon: IconGridAll },
  { value: "BASIC", label: "기본", icon: IconBasic },
  { value: "RECOVERY", label: "회복", icon: IconRecovery },
  { value: "LUXURY", label: "기호", icon: IconPreference },
  { value: "RARE", label: "희귀", icon: IconRare },
];

const GROUP_LABELS: Record<ShopPageGroup, string> = {
  BASIC: "BASIC",
  RECOVERY: "RECOVERY",
  LUXURY: "LUXURY",
  RARE: "RARE",
};

const ERROR_MESSAGE: Record<ShopErrorCode, string> = {
  SHOP_CLOSED: "영업 시간이 아닙니다 (06:00~20:00·일요일 마감).",
  OUT_OF_STOCK: "재고가 부족합니다.",
  INSUFFICIENT_BALANCE: "잔액이 부족합니다.",
  INSUFFICIENT_QUANTITY: "보유 수량이 부족합니다.",
  NO_MAIN_CHARACTER: "메인 AGENT 캐릭터가 등록되지 않았습니다.",
  MAIN_CHARACTER_INTEGRITY:
    "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의하세요.",
  INVENTORY_FAILED_REFUNDED:
    "구매에 실패했습니다. 차감된 잔액은 자동 환불되었습니다.",
  REFUND_FAILED:
    "구매 실패 + 자동 환불 실패. 운영자(GM)에게 문의해 잔액 정정을 요청하세요.",
  INVALID_CART: "장바구니 구성이 올바르지 않습니다.",
  REORDER_NOT_AVAILABLE: "아직 품절이 아닌 상품은 발주 요청할 수 없습니다.",
};

interface Props {
  initialCatalog: ShopCatalogResponse;
  mainCharacter: { id: string; codename: string } | null;
  initialBalance: number;
  initialCredits: CreditsResponse | undefined;
  mainCharacterError: string | null;
  isGM: boolean;
}

function describeShopError(err: unknown): string {
  if (err instanceof ShopApiError) {
    if (err.code) return ERROR_MESSAGE[err.code] ?? err.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류가 발생했습니다.";
}

function formatCredits(value: number): string {
  return `¤ ${value.toLocaleString("ko-KR")}`;
}

export default function ShopClient({
  initialCatalog,
  mainCharacter,
  initialBalance,
  initialCredits,
  mainCharacterError,
  isGM,
}: Props) {
  const catalogQuery = useShopCatalog({ initialData: initialCatalog });
  const creditsQuery = useCredits({ initialData: initialCredits });
  const checkoutMutation = useCheckoutShopCart();
  const reorderMutation = useRequestShopReorder();
  const openModeMutation = useSetShopOpenMode();

  const [activeTab, setActiveTab] = useState<ShopTabValue>("ALL");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState>({});
  const [requestedSlugs, setRequestedSlugs] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingReorderSlugs, setPendingReorderSlugs] = useState<Set<string>>(
    () => new Set(),
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const entrySfxPlayedRef = useRef(false);
  const entrySfxPendingRef = useRef(false);
  const entrySfxAutoAttemptedRef = useRef(false);
  const dialogueEngineRef = useRef<DialogueBeepEngine | null>(null);
  const dialogueReadyRef = useRef(false);
  const tiaLineSequenceRef = useRef(0);
  const tiaIdleLineIndexRef = useRef(0);
  const tiaIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playTiaLineRef = useRef<
    (mood: TiaMood, text: string, options?: TiaLineOptions) => void
  >(() => undefined);
  const [tiaMood, setTiaMood] = useState<TiaMood>("welcome");
  const [tiaLine, setTiaLine] = useState<string>(TIA_DIALOGUE_LINES.welcome);
  const [tiaVisibleLine, setTiaVisibleLine] = useState<string>(
    TIA_DIALOGUE_LINES.welcome,
  );
  const [tiaTyping, setTiaTyping] = useState(false);

  const catalog = catalogQuery.data ?? initialCatalog;

  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const catalogBySlug = useMemo(() => {
    const map = new Map<string, ShopCatalogEntry>();
    for (const item of catalog.items) map.set(item.slug, item);
    return map;
  }, [catalog.items]);

  const itemsByTab = useMemo(() => {
    if (activeTab === "ALL") return catalog.items;
    return catalog.items.filter((item) => item.pageGroup === activeTab);
  }, [catalog.items, activeTab]);

  const selectedItem = useMemo(() => {
    const selectedInTab = selectedSlug
      ? itemsByTab.find((item) => item.slug === selectedSlug)
      : undefined;
    return selectedInTab ?? itemsByTab[0] ?? catalog.items[0];
  }, [catalog.items, itemsByTab, selectedSlug]);

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .map(([slug, quantity]) => {
        const item = catalogBySlug.get(slug);
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
  }, [cart, catalogBySlug]);

  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.total, 0);
  const cartHasStockIssue = cartLines.some((line) => line.stockIssue);
  const cartOverBalance = cartTotal > balance;
  const shopStatusLabel = catalog.forceClosed
    ? "GM 강제 종료"
    : catalog.forceOpen
    ? "GM 강제 오픈"
    : catalog.isOpen
      ? "영업 중"
      : "영업 종료";

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const canUseShop = hasMainCharacter && catalog.isOpen;
  const canCheckout =
    canUseShop &&
    cartLines.length > 0 &&
    !cartHasStockIssue &&
    !cartOverBalance &&
    !checkoutMutation.isPending;

  const selectedQuantity = selectedItem ? cart[selectedItem.slug] ?? 0 : 0;
  const selectedCanAdd =
    Boolean(selectedItem) &&
    canUseShop &&
    selectedItem.stock > 0 &&
    selectedQuantity < selectedItem.stock &&
    selectedQuantity < MAX_CART_QUANTITY_PER_ITEM;
  const shopStageClassName = [
    styles.shopStage,
    !catalog.isOpen ? styles["shopStage--closed"] : "",
  ]
    .filter(Boolean)
    .join(" ");

  const clearTiaIdleTimer = useCallback(() => {
    if (tiaIdleTimerRef.current) {
      clearTimeout(tiaIdleTimerRef.current);
      tiaIdleTimerRef.current = null;
    }
  }, []);

  const scheduleTiaIdle = useCallback(() => {
    clearTiaIdleTimer();
    tiaIdleTimerRef.current = setTimeout(() => {
      if (!catalog.isOpen) {
        setTiaMood("nap");
        setTiaLine(TIA_DIALOGUE_LINES.closed);
        setTiaVisibleLine(TIA_DIALOGUE_LINES.closed);
        setTiaTyping(false);
        return;
      }

      if (!hasMainCharacter) {
        playTiaLineRef.current("tired", TIA_DIALOGUE_LINES.noAgent, {
          returnToIdle: false,
        });
        return;
      }

      const idleLine =
        TIA_IDLE_LINES[tiaIdleLineIndexRef.current % TIA_IDLE_LINES.length];
      tiaIdleLineIndexRef.current += 1;
      playTiaLineRef.current(idleLine.mood, idleLine.text);
    }, TIA_IDLE_DELAY_MS);
  }, [catalog.isOpen, clearTiaIdleTimer, hasMainCharacter]);

  const playTiaLine = useCallback(
    (mood: TiaMood, text: string, options: TiaLineOptions = {}) => {
      const engine = dialogueEngineRef.current;
      const shouldSound = options.sound ?? dialogueReadyRef.current;

      clearTiaIdleTimer();
      tiaLineSequenceRef.current += 1;
      setTiaMood(mood);
      setTiaLine(text);
      setTiaVisibleLine("");
      setTiaTyping(true);
      engine?.stop();

      if (!engine) {
        setTiaVisibleLine(text);
        setTiaTyping(false);
        if (options.returnToIdle !== false) scheduleTiaIdle();
        return;
      }

      void engine
        .typeText(
          text,
          {
            onChar: (event) => {
              setTiaVisibleLine(event.visible);
            },
            onDone: () => {
              setTiaVisibleLine(text);
              setTiaTyping(false);
              if (options.returnToIdle !== false) scheduleTiaIdle();
            },
            onCancel: () => {
              setTiaTyping(false);
            },
          },
          {
            preset: options.preset ?? "tia",
            pitch: options.pitch ?? 900,
            speed: options.speed ?? 42,
            volume: shouldSound ? (options.volume ?? 0.68) : 0,
            wave: options.wave ?? "soft",
            initialDelay: options.initialDelay ?? 55,
          },
        )
        .catch(() => {
          setTiaVisibleLine(text);
          setTiaTyping(false);
          if (options.returnToIdle !== false) scheduleTiaIdle();
        });
    },
    [clearTiaIdleTimer, scheduleTiaIdle],
  );

  useEffect(() => {
    playTiaLineRef.current = playTiaLine;
  }, [playTiaLine]);

  useEffect(() => {
    dialogueEngineRef.current = new DialogueBeepEngine({
      preset: "tia",
      volume: 0.68,
    });

    return () => {
      clearTiaIdleTimer();
      void dialogueEngineRef.current?.destroy();
      dialogueEngineRef.current = null;
    };
  }, [clearTiaIdleTimer]);

  useEffect(() => {
    if (!catalog.isOpen) {
      clearTiaIdleTimer();
      dialogueEngineRef.current?.stop();
      setCart({});
      setSelectedSlug(null);
      setErrorMessage(null);
      setNotice(null);
      playTiaLine("nap", TIA_DIALOGUE_LINES.closed, {
        ...SHOP_CLOSED_BEEP_OPTIONS,
        returnToIdle: false,
        sound: true,
      });
      return;
    }

    if (!hasMainCharacter) {
      playTiaLine("tired", TIA_DIALOGUE_LINES.noAgent, { sound: false });
      return;
    }

    setTiaMood("welcome");
    setTiaLine(TIA_DIALOGUE_LINES.welcome);
    setTiaVisibleLine(TIA_DIALOGUE_LINES.welcome);
    setTiaTyping(false);
    tiaIdleLineIndexRef.current = 0;
    scheduleTiaIdle();
  }, [
    catalog.isOpen,
    clearTiaIdleTimer,
    hasMainCharacter,
    playTiaLine,
    scheduleTiaIdle,
  ]);

  useEffect(() => {
    if (!catalog.isOpen || entrySfxPlayedRef.current) return;

    let canceled = false;
    let audio: HTMLAudioElement | null = null;

    const play = async () => {
      if (
        canceled ||
        entrySfxPlayedRef.current ||
        entrySfxPendingRef.current
      ) {
        return;
      }

      entrySfxPendingRef.current = true;
      const sequenceBeforePlay = tiaLineSequenceRef.current;
      audio ??= new Audio(SHOP_ENTRY_SFX_SRC);
      audio.volume = SHOP_ENTRY_SFX_VOLUME;
      audio.currentTime = 0;

      try {
        await audio.play();
        entrySfxPlayedRef.current = true;
        dialogueReadyRef.current = true;
        void dialogueEngineRef.current?.prime();
        if (tiaLineSequenceRef.current === sequenceBeforePlay) {
          playTiaLine("welcome", TIA_DIALOGUE_LINES.welcome, { sound: true });
        }
        window.removeEventListener("pointerdown", playOnGesture);
        window.removeEventListener("keydown", playOnGesture);
      } catch {
        // 브라우저가 자동재생을 막으면 사용자 제스처에서 한 번 재시도한다.
      } finally {
        entrySfxPendingRef.current = false;
      }
    };

    const playOnGesture = () => {
      dialogueReadyRef.current = true;
      void dialogueEngineRef.current?.prime();
      void play();
    };

    if (!entrySfxAutoAttemptedRef.current) {
      entrySfxAutoAttemptedRef.current = true;
      void play();
    }
    window.addEventListener("pointerdown", playOnGesture, { once: true });
    window.addEventListener("keydown", playOnGesture, { once: true });

    return () => {
      canceled = true;
      entrySfxPendingRef.current = false;
      window.removeEventListener("pointerdown", playOnGesture);
      window.removeEventListener("keydown", playOnGesture);
      if (audio) {
        audio.pause();
        audio = null;
      }
    };
  }, [catalog.isOpen, playTiaLine]);

  function setCartQuantity(slug: string, quantity: number) {
    const item = catalogBySlug.get(slug);
    const max = item ? Math.min(item.stock, MAX_CART_QUANTITY_PER_ITEM) : 0;
    setCart((prev) => {
      const next = { ...prev };
      if (!item || max <= 0 || quantity <= 0) {
        delete next[slug];
        return next;
      }
      next[slug] = Math.min(max, Math.floor(quantity));
      return next;
    });
  }

  function handleTabChange(tab: ShopTabValue) {
    setActiveTab(tab);
    if (canUseShop) {
      playTiaLine("doodle", TIA_DIALOGUE_LINES.newItems);
    }
  }

  function handleSelectProduct(item: ShopCatalogEntry) {
    setSelectedSlug(item.slug);
    if (!canUseShop) return;
    if (item.stock <= 0) {
      playTiaLine("soldout", TIA_DIALOGUE_LINES.soldOut);
    } else if (item.stock <= LOW_STOCK_THRESHOLD) {
      playTiaLine("tired", TIA_DIALOGUE_LINES.lowStock);
    }
  }

  function handleAddToCart(item: ShopCatalogEntry, quantity = 1) {
    if (!canUseShop) {
      playTiaLine(
        catalog.isOpen ? "tired" : "nap",
        catalog.isOpen ? TIA_DIALOGUE_LINES.noAgent : TIA_DIALOGUE_LINES.closed,
      );
      return;
    }

    if (item.stock <= 0) {
      playTiaLine("soldout", TIA_DIALOGUE_LINES.soldOut);
      return;
    }

    setSelectedSlug(item.slug);
    setErrorMessage(null);
    setNotice(null);
    setCartQuantity(item.slug, (cart[item.slug] ?? 0) + quantity);
    playTiaLine("bag", TIA_DIALOGUE_LINES.bag);
  }

  function handleRemoveFromCart(slug: string) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  }

  function setReorderPending(slug: string, pending: boolean) {
    setPendingReorderSlugs((prev) => {
      const next = new Set(prev);
      if (pending) {
        next.add(slug);
      } else {
        next.delete(slug);
      }
      return next;
    });
  }

  async function handleReorderRequest(item: ShopCatalogEntry): Promise<void> {
    if (item.stock > 0 || pendingReorderSlugs.has(item.slug)) return;
    if (!canUseShop) {
      playTiaLine(
        catalog.isOpen ? "tired" : "nap",
        catalog.isOpen ? TIA_DIALOGUE_LINES.noAgent : TIA_DIALOGUE_LINES.closed,
      );
      return;
    }

    setSelectedSlug(item.slug);
    setErrorMessage(null);
    setNotice(null);
    setReorderPending(item.slug, true);

    try {
      const res = await reorderMutation.mutateAsync({ slug: item.slug });
      setRequestedSlugs((prev) => {
        const next = new Set(prev);
        next.add(item.slug);
        return next;
      });
      playTiaLine(
        "soldout",
        res.status === "already-requested"
          ? TIA_DIALOGUE_LINES.reorderAlready
          : TIA_DIALOGUE_LINES.reorderRequested,
      );
    } catch (err) {
      playTiaLine("tired", TIA_DIALOGUE_LINES.reorderError);
      setErrorMessage(describeShopError(err));
    } finally {
      setReorderPending(item.slug, false);
    }
  }

  function handleCheckout() {
    if (!canCheckout) return;
    setErrorMessage(null);
    setNotice(null);
    checkoutMutation.mutate(
      {
        items: cartLines.map((line) => ({
          slug: line.item.slug,
          quantity: line.quantity,
        })),
      },
      {
        onSuccess: (res) => {
          setCart({});
          playTiaLine("purchase", TIA_DIALOGUE_LINES.goodbye);
          setNotice({
            tone: "success",
            text: `${res.order.items.length}종 결제가 완료되었습니다.`,
          });
        },
        onError: (err) => {
          if (err instanceof ShopApiError && err.code === "OUT_OF_STOCK") {
            playTiaLine("soldout", TIA_DIALOGUE_LINES.soldOut);
          } else {
            playTiaLine("tired", TIA_DIALOGUE_LINES.checkoutError);
          }
          setErrorMessage(describeShopError(err));
        },
      },
    );
  }

  function handleOpenModeChange(mode: ShopOpenMode) {
    if (!isGM || openModeMutation.isPending) return;

    setErrorMessage(null);
    setNotice(null);
    openModeMutation.mutate(
      { mode },
      {
        onSuccess: (state) => {
          void catalogQuery.refetch();
          setNotice({
            tone: "info",
            text:
              state.mode === "open"
                ? "GM 강제 오픈으로 편의점을 열었습니다."
                : state.mode === "closed"
                  ? "GM 강제 종료로 편의점을 닫았습니다."
                  : "편의점을 자동 영업시간 모드로 되돌렸습니다.",
          });
        },
        onError: (err) => {
          setErrorMessage(describeShopError(err));
        },
      },
    );
  }

  return (
    <div className={styles.shopRoot}>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "SHOP" },
        ]}
        title="편의점"
      />

      {!hasMainCharacter ? (
        <Box className={styles.notice}>
          {mainCharacterError ? (
            <>
              <strong className={styles.notice__strong}>정합성 위반</strong>
              {": "}
              {mainCharacterError}
              <br />
              운영자(GM)에게 문의하세요. 카탈로그는 열람만 가능합니다.
            </>
          ) : (
            <>
              메인 AGENT 캐릭터가 없어 구매할 수 없습니다. 캐릭터 등록 후
              다시 확인하세요. 카탈로그는 열람만 가능합니다.
            </>
          )}
        </Box>
      ) : null}

      {errorMessage ? (
        <Box className={styles.errorBanner} role="alert">
          <strong className={styles.notice__strong}>!</strong> {errorMessage}
          <button
            type="button"
            className={styles.errorBanner__dismiss}
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

      <section className={shopStageClassName} aria-label="편의점 상점">
        <header className={styles.storeHeader}>
          <div className={styles.storeHeader__titleBlock}>
            <Eyebrow>CONVENIENCE STORE</Eyebrow>
            <div className={styles.storeHeader__title}>STAR MART</div>
          </div>
          <div className={styles.headRight}>
            <Tag
              tone={
                catalog.forceOpen
                  ? "info"
                  : catalog.isOpen
                    ? "gold"
                    : "danger"
              }
            >
              {shopStatusLabel}
            </Tag>
            {isGM ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    handleOpenModeChange(
                      catalog.mode === "open" ? "auto" : "open",
                    )
                  }
                  className={[
                    styles.adminBtn,
                    catalog.mode === "open" ? styles["adminBtn--active"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={openModeMutation.isPending}
                >
                  {openModeMutation.isPending
                    ? "변경 중"
                    : catalog.mode === "open"
                      ? "자동 운영"
                      : "강제 오픈"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleOpenModeChange(
                      catalog.mode === "closed" ? "auto" : "closed",
                    )
                  }
                  className={[
                    styles.adminBtn,
                    catalog.mode === "closed"
                      ? styles["adminBtn--active"]
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={openModeMutation.isPending}
                >
                  {openModeMutation.isPending
                    ? "변경 중"
                    : catalog.mode === "closed"
                      ? "자동 운영"
                      : "강제 종료"}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminOpen(true)}
                  className={styles.adminBtn}
                >
                  재고 관리 · GM
                </button>
              </>
            ) : null}
          </div>
          <div className={styles.storeHeader__stats}>
            <div className={styles.statChip}>
              <span>요원</span>
              <strong>{mainCharacter?.codename ?? "UNASSIGNED"}</strong>
            </div>
            <div className={styles.statChip}>
              <span>잔액</span>
              <strong>{formatCredits(balance)}</strong>
            </div>
            <div className={styles.statChip}>
              <span>카트</span>
              <strong>{cartCount}개</strong>
            </div>
          </div>
        </header>

        {!catalog.isOpen ? (
          <>
            <div className={styles.closedBanner} role="status">
              <strong>CLOSED</strong>
              <span>
                {catalog.forceClosed
                  ? "GM 운영 제어로 임시 마감 중"
                  : "STAFF OFF DUTY · 영업 06:00~20:00"}
              </span>
            </div>
            <div className={styles.closedScene} aria-hidden="true">
              <div className={styles.closedScene__stamp}>SEE YOU NEXT TIME</div>
            </div>
          </>
        ) : (
          <div className={styles.storeLayout}>
            <section className={styles.shelfPanel} aria-label="판매 상품">
              <div
                role="tablist"
                aria-label="편의점 카테고리"
                className={styles.filters}
              >
                {TAB_DEFS.map((tab) => {
                  const isActive = activeTab === tab.value;
                  const TabIcon = tab.icon;
                  const count =
                    tab.value === "ALL"
                      ? catalog.items.length
                      : catalog.items.filter((it) => it.pageGroup === tab.value)
                          .length;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      className={[
                        styles.filters__tab,
                        isActive ? styles["filters__tab--active"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleTabChange(tab.value)}
                    >
                      <TabIcon className={styles.filters__tabIcon} aria-hidden />
                      {tab.label}
                      <span>{count}</span>
                    </button>
                  );
                })}
              </div>

            {itemsByTab.length === 0 ? (
              <div className={styles.empty}>이 카테고리에 품목이 없습니다.</div>
            ) : (
              <div className={styles.productGrid}>
                {itemsByTab.map((item) => {
                  const inCart = cart[item.slug] ?? 0;
                  const isSelected = selectedItem?.slug === item.slug;
                  const isSoldOut = item.stock <= 0;
                  const requested = requestedSlugs.has(item.slug);
                  const reorderPending = pendingReorderSlugs.has(item.slug);
                  const canAdd =
                    canUseShop &&
                    !isSoldOut &&
                    inCart < item.stock &&
                    inCart < MAX_CART_QUANTITY_PER_ITEM;

                  return (
                    <article
                      key={item.slug}
                      className={[
                        styles.productCard,
                        isSelected ? styles["productCard--selected"] : "",
                        isSoldOut ? styles["productCard--soldOut"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <button
                        type="button"
                        className={styles.productCard__select}
                        onClick={() => handleSelectProduct(item)}
                        aria-pressed={isSelected}
                      >
                        <span className={styles.productCard__topLine}>
                          <span className={styles.productCard__group}>
                            {GROUP_LABELS[item.pageGroup]}
                          </span>
                          <span className={styles.productCard__stock}>
                            {isSoldOut ? "SOLD OUT" : `${item.stock} EA`}
                          </span>
                        </span>
                        <span className={styles.productCard__icon} aria-hidden>
                          <ShopItemIcon slug={item.slug} size={46} />
                        </span>
                        <span className={styles.productCard__name}>
                          {item.name}
                        </span>
                        <span className={styles.productCard__effect}>
                          {item.effect}
                        </span>
                        <span className={styles.productCard__meta}>
                          <strong>{formatCredits(item.price)}</strong>
                        </span>
                      </button>
                      <div className={styles.productCard__actions}>
                        {isSoldOut ? (
                          <button
                            type="button"
                            className={styles.reorderBtn}
                            onClick={() => void handleReorderRequest(item)}
                            disabled={
                              !catalog.isOpen ||
                              requested ||
                              reorderPending
                            }
                          >
                            {!catalog.isOpen
                              ? "영업 종료"
                              : reorderPending
                                ? "요청 중"
                              : requested
                                ? "요청 완료"
                                : "발주 요청"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.addBtn}
                            onClick={() => handleAddToCart(item)}
                            disabled={!canAdd}
                          >
                            {catalog.isOpen
                              ? `담기${inCart > 0 ? ` ${inCart}` : ""}`
                              : "영업 종료"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className={styles.counterPanel} aria-label="계산대">
            <section className={styles.detailPanel}>
              {selectedItem ? (
                <>
                  <div className={styles.detailPanel__top}>
                    <span className={styles.detailPanel__icon} aria-hidden>
                      <ShopItemIcon slug={selectedItem.slug} size={56} />
                    </span>
                    <div>
                      <span className={styles.detailPanel__group}>
                        {GROUP_LABELS[selectedItem.pageGroup]}
                      </span>
                      <h2 className={styles.detailPanel__name}>
                        {selectedItem.name}
                      </h2>
                    </div>
                  </div>
                  <p className={styles.detailPanel__description}>
                    {selectedItem.description}
                  </p>
                  <div className={styles.detailPanel__stats}>
                    <span>{selectedItem.effect}</span>
                    <strong>{formatCredits(selectedItem.price)}</strong>
                    <span>
                      {selectedItem.stock <= 0
                        ? "SOLD OUT"
                        : `STOCK ${selectedItem.stock}`}
                    </span>
                  </div>
                  {selectedItem.stock <= 0 ? (
                    <button
                      type="button"
                      className={styles.detailPanel__mainBtn}
                      onClick={() => void handleReorderRequest(selectedItem)}
                      disabled={
                        !catalog.isOpen ||
                        requestedSlugs.has(selectedItem.slug) ||
                        pendingReorderSlugs.has(selectedItem.slug)
                      }
                    >
                      {!catalog.isOpen
                        ? "영업 종료"
                        : pendingReorderSlugs.has(selectedItem.slug)
                        ? "발주 요청 중"
                        : requestedSlugs.has(selectedItem.slug)
                        ? "발주 요청 완료"
                        : "추가 발주 요청"}
                    </button>
                  ) : (
                    <div className={styles.detailPanel__buyBox}>
                      <div className={styles.qtyStepper}>
                        <button
                          type="button"
                          onClick={() =>
                            setCartQuantity(
                              selectedItem.slug,
                              selectedQuantity - 1,
                            )
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
                        className={styles.detailPanel__mainBtn}
                        onClick={() => handleAddToCart(selectedItem)}
                        disabled={!selectedCanAdd}
                      >
                        {catalog.isOpen ? "장바구니 담기" : "영업 종료"}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.empty}>선택 가능한 상품이 없습니다.</div>
              )}
            </section>

            <section className={styles.receiptPanel}>
              <div className={styles.receiptPanel__header}>
                <div>
                  <Eyebrow>CART RECEIPT</Eyebrow>
                  <h2>장바구니</h2>
                </div>
                {cartLines.length > 0 ? (
                  <button
                    type="button"
                    className={styles.clearCartBtn}
                    onClick={() => setCart({})}
                    disabled={checkoutMutation.isPending}
                  >
                    비우기
                  </button>
                ) : null}
              </div>

              {cartLines.length === 0 ? (
                <div className={styles.receiptPanel__empty}>
                  담긴 상품이 없습니다.
                </div>
              ) : (
                <div className={styles.receiptLines}>
                  {cartLines.map((line) => (
                    <div
                      key={line.item.slug}
                      className={[
                        styles.receiptLine,
                        line.stockIssue ? styles["receiptLine--warning"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className={styles.receiptLine__name}>
                        <span>{line.item.name}</span>
                        <small>
                          {formatCredits(line.item.price)} x {line.quantity}
                        </small>
                      </div>
                      <div className={styles.receiptLine__controls}>
                        <button
                          type="button"
                          onClick={() =>
                            setCartQuantity(line.item.slug, line.quantity - 1)
                          }
                          disabled={checkoutMutation.isPending}
                          aria-label={`${line.item.name} 수량 감소`}
                        >
                          -
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCartQuantity(line.item.slug, line.quantity + 1)
                          }
                          disabled={
                            checkoutMutation.isPending ||
                            line.quantity >= line.item.stock ||
                            line.quantity >= MAX_CART_QUANTITY_PER_ITEM
                          }
                          aria-label={`${line.item.name} 수량 증가`}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className={styles.receiptLine__remove}
                          onClick={() => handleRemoveFromCart(line.item.slug)}
                          disabled={checkoutMutation.isPending}
                          aria-label={`${line.item.name} 제거`}
                        >
                          X
                        </button>
                      </div>
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
                  <strong
                    className={cartOverBalance ? styles.dangerText : undefined}
                  >
                    {formatCredits(balance - cartTotal)}
                  </strong>
                </div>
              </div>

              {cartHasStockIssue ? (
                <div className={styles.cartWarning}>
                  재고가 부족한 상품이 있습니다.
                </div>
              ) : cartOverBalance ? (
                <div className={styles.cartWarning}>잔액이 부족합니다.</div>
              ) : null}

              <button
                type="button"
                className={styles.checkoutBtn}
                onClick={handleCheckout}
                disabled={!canCheckout}
                aria-busy={checkoutMutation.isPending}
              >
                {!catalog.isOpen
                  ? "영업 종료"
                  : checkoutMutation.isPending
                    ? "결제 중"
                    : "한번에 결제"}
              </button>
            </section>
          </aside>
          </div>
        )}

        {catalog.isOpen ? (
          <section className={styles.tiaHud} aria-label="띠아 상점 HUD">
            <div className={styles.tiaHud__portraitFrame}>
              <Image
                className={styles.tiaHud__portrait}
                src={TIA_MOOD_ASSETS[tiaMood]}
                alt={`띠아 ${TIA_MOOD_LABELS[tiaMood]} 표정`}
                fill
                sizes="(max-width: 720px) 160px, 190px"
              />
            </div>
            <div className={styles.tiaHud__dialogue}>
              <div className={styles.tiaHud__header}>
                <span className={styles.tiaHud__profile}>
                  <Image src={TIA_PROFILE_SRC} alt="" fill sizes="38px" />
                </span>
                <div className={styles.tiaHud__speaker} title={tiaLine}>
                  <span>STAR MART CREW</span>
                  <strong>띠아</strong>
                </div>
                <span className={styles.tiaHud__mood}>
                  {TIA_MOOD_LABELS[tiaMood]}
                </span>
              </div>
              <p className={styles.tiaHud__text} aria-live="polite">
                {tiaVisibleLine || " "}
                {tiaTyping ? (
                  <span className={styles.tiaHud__cursor}>▸</span>
                ) : null}
              </p>
            </div>
          </section>
        ) : (
          <section className={styles.closedHud} aria-label="편의점 폐점 안내">
            <p aria-live="polite">
              {tiaVisibleLine || " "}
              {tiaTyping ? (
                <span className={styles.closedHud__cursor}>▸</span>
              ) : null}
            </p>
          </section>
        )}
      </section>

      {adminOpen ? (
        <ShopAdminStockModal
          onClose={() => setAdminOpen(false)}
          onSaved={() => {
            void catalogQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
