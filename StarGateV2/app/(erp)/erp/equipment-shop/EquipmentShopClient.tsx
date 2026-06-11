"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type CreditsResponse,
  useCredits,
} from "@/hooks/queries/useCreditsQuery";
import { useCheckoutEquipmentShopCart } from "@/hooks/mutations/useEquipmentShopMutation";
import {
  EquipmentShopApiError,
  type EquipmentShopCatalogEntry,
  type EquipmentShopCatalogResponse,
  type EquipmentShopErrorCode,
  useEquipmentShopCatalog,
} from "@/hooks/queries/useEquipmentShopQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import {
  DialogueBeepEngine,
  type DialogueBeepOptions,
} from "@/lib/audio/dialogue-beep-engine";

import ShopItemIcon from "../shop/ShopItemIcon";

import styles from "../shop/page.module.css";

type EquipmentShopTabValue = "ALL" | "WEAPON" | "ARMOR";
type CartState = Record<string, number>;
type NoticeState = { tone: "success" | "info"; text: string } | null;
type TowaskiMood =
  | "welcome"
  | "tired"
  | "soldout"
  | "bag"
  | "doodle"
  | "purchase"
  | "nap";

interface TowaskiLineOptions
  extends Pick<
    DialogueBeepOptions,
    "initialDelay" | "pitch" | "preset" | "speed" | "volume" | "wave"
  > {
  sound?: boolean;
  returnToIdle?: boolean;
}

const MAX_CART_QUANTITY_PER_ITEM = 1;
const SHOP_ENTRY_SFX_SRC = "/assets/shop/sfx/convenience-chime.mp3";
const SHOP_ENTRY_SFX_VOLUME = 0.145;
const TOWASKI_IDLE_DELAY_MS = 18000;

const TOWASKI_PROFILE_SRC = "/assets/shop/hud/tia-profile.webp";
const SHOP_CLOSED_MESSAGE =
  "장비점 문이 닫혔다.\n작업대 조명만 희미하게 남아 있다...";
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

const TOWASKI_MOOD_ASSETS: Record<TowaskiMood, string> = {
  welcome: "/assets/shop/hud/tia-welcome.png",
  tired: "/assets/shop/hud/tia-tired.png",
  soldout: "/assets/shop/hud/tia-soldout.png",
  bag: "/assets/shop/hud/tia-bag.png",
  doodle: "/assets/shop/hud/tia-doodle.png",
  purchase: "/assets/shop/hud/tia-purchase-complete.png",
  nap: "/assets/shop/hud/tia-nap.png",
};

const TOWASKI_MOOD_LABELS: Record<TowaskiMood, string> = {
  welcome: "반출 확인",
  tired: "허가 확인",
  soldout: "반출 불가",
  bag: "케이스 확인",
  doodle: "정비 중",
  purchase: "거래 완료",
  nap: "작업 종료",
};

const TOWASKI_DIALOGUE_LINES = {
  welcome: "어서 와. 토와스키다. 만질 땐 방아쇠 말고 가격표부터 봐.",
  newItems:
    "오늘 올린 건 카탈로그에 있는 장비뿐이야. 허가 안 난 물건은 이 진열대에 안 올라와.",
  idleBrowse:
    "천천히 봐. 장비는 고르는 시간보다 들고 나간 뒤가 더 길어야지.",
  idleDoodle:
    "대충 만든 물건은 장난감이지. 장난감은 애들한테나 팔아.",
  idleStockCheck:
    "반출 허가, 정비 이력, 탄종 호환... 하나라도 틀리면 문 밖 못 나간다.",
  idleBag:
    "포장은 해주지. 다만 봉투라고 부르진 마라. 장비 케이스다.",
  idleSleepy: "시가 끄는 중이었다. 계산은 살아 있어.",
  soldOut:
    "그건 지금 반출 불가다. 가격이 없거나 판매 허가가 아직 안 떨어졌다는 뜻이지.",
  bag: "카트에 올렸다. 이제 네 잔액이 버티는지 보자.",
  goodbye: "좋아. 가져가. 망가뜨리면 수리비부터 얘기한다.",
  closed: SHOP_CLOSED_MESSAGE,
  noAgent: "메인 AGENT부터 확인해. 신원 없는 손엔 쇳덩이 못 넘긴다.",
  checkoutError:
    "견적서가 어긋났다. 수량, 잔액, 반출 가능 여부 다시 봐.",
} as const;

const TOWASKI_IDLE_LINES: readonly { mood: TowaskiMood; text: string }[] = [
  { mood: "doodle", text: TOWASKI_DIALOGUE_LINES.newItems },
  { mood: "welcome", text: TOWASKI_DIALOGUE_LINES.idleBrowse },
  { mood: "doodle", text: TOWASKI_DIALOGUE_LINES.idleDoodle },
  { mood: "tired", text: TOWASKI_DIALOGUE_LINES.idleStockCheck },
  { mood: "bag", text: TOWASKI_DIALOGUE_LINES.idleBag },
  { mood: "nap", text: TOWASKI_DIALOGUE_LINES.idleSleepy },
];

const TAB_DEFS: { value: EquipmentShopTabValue; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "WEAPON", label: "무기" },
  { value: "ARMOR", label: "방어구" },
];

const GROUP_LABELS: Record<Exclude<EquipmentShopTabValue, "ALL">, string> = {
  WEAPON: "WEAPON",
  ARMOR: "ARMOR",
};

const ERROR_MESSAGE: Record<EquipmentShopErrorCode, string> = {
  INSUFFICIENT_BALANCE: "잔액이 부족합니다.",
  NO_MAIN_CHARACTER: "메인 AGENT 캐릭터가 등록되지 않았습니다.",
  MAIN_CHARACTER_INTEGRITY:
    "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의하세요.",
  INVENTORY_FAILED_REFUNDED:
    "구매에 실패했습니다. 차감된 잔액은 자동 환불되었습니다.",
  REFUND_FAILED:
    "구매 실패 + 자동 환불 실패. 운영자(GM)에게 문의해 잔액 정정을 요청하세요.",
  INVALID_CART: "장비 장바구니 구성이 올바르지 않습니다.",
  ITEM_NOT_AVAILABLE: "판매 가능한 장비 카탈로그 품목이 아닙니다.",
  PRICE_NOT_SET: "가격이 확정되지 않은 장비는 구매할 수 없습니다.",
};

interface Props {
  initialCatalog: EquipmentShopCatalogResponse;
  mainCharacter: { id: string; codename: string } | null;
  initialBalance: number;
  initialCredits: CreditsResponse | undefined;
  mainCharacterError: string | null;
}

function describeEquipmentShopError(err: unknown): string {
  if (err instanceof EquipmentShopApiError) {
    if (err.code) return ERROR_MESSAGE[err.code] ?? err.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류가 발생했습니다.";
}

function formatCredits(value: number): string {
  return `¤ ${value.toLocaleString("ko-KR")}`;
}

export default function EquipmentShopClient({
  initialCatalog,
  mainCharacter,
  initialBalance,
  initialCredits,
  mainCharacterError,
}: Props) {
  const catalogQuery = useEquipmentShopCatalog({ initialData: initialCatalog });
  const creditsQuery = useCredits({ initialData: initialCredits });
  const checkoutMutation = useCheckoutEquipmentShopCart();

  const [activeTab, setActiveTab] = useState<EquipmentShopTabValue>("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const entrySfxPlayedRef = useRef(false);
  const entrySfxPendingRef = useRef(false);
  const entrySfxAutoAttemptedRef = useRef(false);
  const dialogueEngineRef = useRef<DialogueBeepEngine | null>(null);
  const dialogueReadyRef = useRef(false);
  const lineSequenceRef = useRef(0);
  const idleLineIndexRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playLineRef = useRef<
    (mood: TowaskiMood, text: string, options?: TowaskiLineOptions) => void
  >(() => undefined);
  const [towaskiMood, setTowaskiMood] = useState<TowaskiMood>("welcome");
  const [towaskiLine, setTowaskiLine] = useState<string>(
    TOWASKI_DIALOGUE_LINES.welcome,
  );
  const [visibleLine, setVisibleLine] = useState<string>(
    TOWASKI_DIALOGUE_LINES.welcome,
  );
  const [typing, setTyping] = useState(false);

  const catalog = catalogQuery.data ?? initialCatalog;

  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const catalogByKey = useMemo(() => {
    const map = new Map<string, EquipmentShopCatalogEntry>();
    for (const item of catalog.items) map.set(item.key, item);
    return map;
  }, [catalog.items]);

  const itemsByTab = useMemo(() => {
    if (activeTab === "ALL") return catalog.items;
    return catalog.items.filter((item) => item.category === activeTab);
  }, [catalog.items, activeTab]);

  const selectedItem = useMemo(() => {
    const selectedInTab = selectedKey
      ? itemsByTab.find((item) => item.key === selectedKey)
      : undefined;
    return selectedInTab ?? itemsByTab[0] ?? catalog.items[0];
  }, [catalog.items, itemsByTab, selectedKey]);

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
  const shopStatusLabel = catalog.isOpen ? "영업 중" : "영업 종료";

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const canUseShop = hasMainCharacter && catalog.isOpen;
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
    selectedItem.available &&
    selectedItem.stock > 0 &&
    selectedQuantity < selectedItem.stock &&
    selectedQuantity < MAX_CART_QUANTITY_PER_ITEM;
  const shopStageClassName = [
    styles.shopStage,
    !catalog.isOpen ? styles["shopStage--closed"] : "",
  ]
    .filter(Boolean)
    .join(" ");

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const scheduleIdle = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      if (!catalog.isOpen) {
        setTowaskiMood("nap");
        setTowaskiLine(TOWASKI_DIALOGUE_LINES.closed);
        setVisibleLine(TOWASKI_DIALOGUE_LINES.closed);
        setTyping(false);
        return;
      }

      if (!hasMainCharacter) {
        playLineRef.current("tired", TOWASKI_DIALOGUE_LINES.noAgent, {
          returnToIdle: false,
        });
        return;
      }

      const idleLine =
        TOWASKI_IDLE_LINES[idleLineIndexRef.current % TOWASKI_IDLE_LINES.length];
      idleLineIndexRef.current += 1;
      playLineRef.current(idleLine.mood, idleLine.text);
    }, TOWASKI_IDLE_DELAY_MS);
  }, [catalog.isOpen, clearIdleTimer, hasMainCharacter]);

  const playLine = useCallback(
    (mood: TowaskiMood, text: string, options: TowaskiLineOptions = {}) => {
      const engine = dialogueEngineRef.current;
      const shouldSound = options.sound ?? dialogueReadyRef.current;

      clearIdleTimer();
      lineSequenceRef.current += 1;
      setTowaskiMood(mood);
      setTowaskiLine(text);
      setVisibleLine("");
      setTyping(true);
      engine?.stop();

      if (!engine) {
        setVisibleLine(text);
        setTyping(false);
        if (options.returnToIdle !== false) scheduleIdle();
        return;
      }

      void engine
        .typeText(
          text,
          {
            onChar: (event) => {
              setVisibleLine(event.visible);
            },
            onDone: () => {
              setVisibleLine(text);
              setTyping(false);
              if (options.returnToIdle !== false) scheduleIdle();
            },
            onCancel: () => {
              setTyping(false);
            },
          },
          {
            preset: options.preset ?? "tia",
            pitch: options.pitch ?? 760,
            speed: options.speed ?? 38,
            volume: shouldSound ? (options.volume ?? 0.62) : 0,
            wave: options.wave ?? "soft",
            initialDelay: options.initialDelay ?? 55,
          },
        )
        .catch(() => {
          setVisibleLine(text);
          setTyping(false);
          if (options.returnToIdle !== false) scheduleIdle();
        });
    },
    [clearIdleTimer, scheduleIdle],
  );

  useEffect(() => {
    playLineRef.current = playLine;
  }, [playLine]);

  useEffect(() => {
    dialogueEngineRef.current = new DialogueBeepEngine({
      preset: "tia",
      volume: 0.62,
    });

    return () => {
      clearIdleTimer();
      void dialogueEngineRef.current?.destroy();
      dialogueEngineRef.current = null;
    };
  }, [clearIdleTimer]);

  useEffect(() => {
    if (!catalog.isOpen) {
      clearIdleTimer();
      dialogueEngineRef.current?.stop();
      setCart({});
      setSelectedKey(null);
      setErrorMessage(null);
      setNotice(null);
      playLine("nap", TOWASKI_DIALOGUE_LINES.closed, {
        ...SHOP_CLOSED_BEEP_OPTIONS,
        returnToIdle: false,
        sound: true,
      });
      return;
    }

    if (!hasMainCharacter) {
      playLine("tired", TOWASKI_DIALOGUE_LINES.noAgent, { sound: false });
      return;
    }

    setTowaskiMood("welcome");
    setTowaskiLine(TOWASKI_DIALOGUE_LINES.welcome);
    setVisibleLine(TOWASKI_DIALOGUE_LINES.welcome);
    setTyping(false);
    idleLineIndexRef.current = 0;
    scheduleIdle();
  }, [
    catalog.isOpen,
    clearIdleTimer,
    hasMainCharacter,
    playLine,
    scheduleIdle,
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
      const sequenceBeforePlay = lineSequenceRef.current;
      audio ??= new Audio(SHOP_ENTRY_SFX_SRC);
      audio.volume = SHOP_ENTRY_SFX_VOLUME;
      audio.currentTime = 0;

      try {
        await audio.play();
        entrySfxPlayedRef.current = true;
        dialogueReadyRef.current = true;
        void dialogueEngineRef.current?.prime();
        if (lineSequenceRef.current === sequenceBeforePlay) {
          playLine("welcome", TOWASKI_DIALOGUE_LINES.welcome, { sound: true });
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
  }, [catalog.isOpen, playLine]);

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

  function handleTabChange(tab: EquipmentShopTabValue) {
    setActiveTab(tab);
    if (canUseShop) {
      playLine("doodle", TOWASKI_DIALOGUE_LINES.newItems);
    }
  }

  function handleSelectProduct(item: EquipmentShopCatalogEntry) {
    setSelectedKey(item.key);
    if (!canUseShop) return;
    if (item.stock <= 0 || !item.available) {
      playLine("soldout", TOWASKI_DIALOGUE_LINES.soldOut);
    }
  }

  function handleAddToCart(item: EquipmentShopCatalogEntry, quantity = 1) {
    if (!canUseShop) {
      playLine(
        catalog.isOpen ? "tired" : "nap",
        catalog.isOpen
          ? TOWASKI_DIALOGUE_LINES.noAgent
          : TOWASKI_DIALOGUE_LINES.closed,
      );
      return;
    }

    if (item.stock <= 0 || !item.available) {
      playLine("soldout", TOWASKI_DIALOGUE_LINES.soldOut);
      return;
    }

    setSelectedKey(item.key);
    setErrorMessage(null);
    setNotice(null);
    setCartQuantity(item.key, (cart[item.key] ?? 0) + quantity);
    playLine("bag", TOWASKI_DIALOGUE_LINES.bag);
  }

  function handleRemoveFromCart(key: string) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
          playLine("purchase", TOWASKI_DIALOGUE_LINES.goodbye);
          setNotice({
            tone: "success",
            text: `${res.order.items.length}종 결제가 완료되었습니다.`,
          });
        },
        onError: (err) => {
          playLine("tired", TOWASKI_DIALOGUE_LINES.checkoutError);
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  return (
    <div className={styles.shopRoot}>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "EQUIPMENT SHOP" },
        ]}
        title="장비 판매점"
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

      <section className={shopStageClassName} aria-label="장비 판매점">
        <header className={styles.storeHeader}>
          <div className={styles.storeHeader__titleBlock}>
            <Eyebrow>EQUIPMENT STORE</Eyebrow>
            <div className={styles.storeHeader__title}>TOWASKI</div>
          </div>
          <div className={styles.headRight}>
            <Tag tone={catalog.isOpen ? "gold" : "danger"}>
              {shopStatusLabel}
            </Tag>
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
              <span>WORKSHOP LOCKED · 장비 반출 중지</span>
            </div>
            <div className={styles.closedScene} aria-hidden="true">
              <div className={styles.closedScene__stamp}>SEE YOU NEXT TIME</div>
            </div>
          </>
        ) : (
          <div className={styles.storeLayout}>
            <section className={styles.shelfPanel} aria-label="판매 장비">
              <div
                role="tablist"
                aria-label="장비 카테고리"
                className={styles.filters}
              >
                {TAB_DEFS.map((tab) => {
                  const isActive = activeTab === tab.value;
                  const count =
                    tab.value === "ALL"
                      ? catalog.items.length
                      : catalog.items.filter((it) => it.category === tab.value)
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
                      {tab.label}
                      <span>{count}</span>
                    </button>
                  );
                })}
              </div>

              {itemsByTab.length === 0 ? (
                <div className={styles.empty}>
                  등록된 장비 판매 품목이 없습니다.
                </div>
              ) : (
                <div className={styles.productGrid}>
                  {itemsByTab.map((item) => {
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
                              {GROUP_LABELS[item.category]}
                            </span>
                            <span className={styles.productCard__stock}>
                              {isSoldOut ? "LOCKED" : `${item.stock} EA`}
                            </span>
                          </span>
                          <span
                            className={styles.productCard__icon}
                            aria-hidden
                          >
                            <ShopItemIcon
                              slug={item.slug ?? item.key}
                              size={46}
                            />
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
                              disabled
                            >
                              반출 불가
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
                        <ShopItemIcon
                          slug={selectedItem.slug ?? selectedItem.key}
                          size={56}
                        />
                      </span>
                      <div>
                        <span className={styles.detailPanel__group}>
                          {GROUP_LABELS[selectedItem.category]}
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
                        {selectedItem.stock <= 0 || !selectedItem.available
                          ? "LOCKED"
                          : `STOCK ${selectedItem.stock}`}
                      </span>
                    </div>
                    {selectedItem.stock <= 0 || !selectedItem.available ? (
                      <button
                        type="button"
                        className={styles.detailPanel__mainBtn}
                        disabled
                      >
                        반출 불가
                      </button>
                    ) : (
                      <div className={styles.detailPanel__buyBox}>
                        <div className={styles.qtyStepper}>
                          <button
                            type="button"
                            onClick={() =>
                              setCartQuantity(
                                selectedItem.key,
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
                  <div className={styles.empty}>
                    선택 가능한 장비가 없습니다.
                  </div>
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
                    담긴 장비가 없습니다.
                  </div>
                ) : (
                  <div className={styles.receiptLines}>
                    {cartLines.map((line) => (
                      <div
                        key={line.item.key}
                        className={[
                          styles.receiptLine,
                          line.stockIssue
                            ? styles["receiptLine--warning"]
                            : "",
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
                              setCartQuantity(line.item.key, line.quantity - 1)
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
                              setCartQuantity(line.item.key, line.quantity + 1)
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
                            onClick={() => handleRemoveFromCart(line.item.key)}
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
                    반출할 수 없는 장비가 있습니다.
                  </div>
                ) : cartOverBalance ? (
                  <div className={styles.cartWarning}>
                    잔액이 부족합니다.
                  </div>
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
          <section className={styles.tiaHud} aria-label="립 토와스키 상점 HUD">
            <div className={styles.tiaHud__portraitFrame}>
              <Image
                className={styles.tiaHud__portrait}
                src={TOWASKI_MOOD_ASSETS[towaskiMood]}
                alt={`립 토와스키 ${TOWASKI_MOOD_LABELS[towaskiMood]} 표정`}
                fill
                sizes="(max-width: 720px) 160px, 190px"
              />
            </div>
            <div className={styles.tiaHud__dialogue}>
              <div className={styles.tiaHud__header}>
                <span className={styles.tiaHud__profile}>
                  <Image src={TOWASKI_PROFILE_SRC} alt="" fill sizes="38px" />
                </span>
                <div className={styles.tiaHud__speaker} title={towaskiLine}>
                  <span>TOWASKI ARMORY</span>
                  <strong>립 토와스키</strong>
                </div>
                <span className={styles.tiaHud__mood}>
                  {TOWASKI_MOOD_LABELS[towaskiMood]}
                </span>
              </div>
              <p className={styles.tiaHud__text} aria-live="polite">
                {visibleLine || " "}
                {typing ? (
                  <span className={styles.tiaHud__cursor}>▸</span>
                ) : null}
              </p>
            </div>
          </section>
        ) : (
          <section className={styles.closedHud} aria-label="장비점 폐점 안내">
            <p aria-live="polite">
              {visibleLine || " "}
              {typing ? (
                <span className={styles.closedHud__cursor}>▸</span>
              ) : null}
            </p>
          </section>
        )}
      </section>
    </div>
  );
}
