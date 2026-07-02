"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  type CreditsResponse,
  useCredits,
} from "@/hooks/queries/useCreditsQuery";
import {
  type EquipmentResearchScope,
  type EquipmentResearchStat,
  useApplyEquipmentResearch,
  useCheckoutEquipmentShopCart,
} from "@/hooks/mutations/useEquipmentShopMutation";
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

import { describeApiError } from "@/lib/api/describe-error";
import { formatCredits } from "@/lib/format/credit";

import ShopItemIcon from "../shop/ShopItemIcon";

import styles from "./page.module.css";

type ArmoryZone = "lab" | "towaski" | "strategic" | "custom";
type EquipmentShopMode = "hub" | "zone";
type EquipmentShopTabValue = "ALL" | "WEAPON" | "ARMOR";
type CartState = Record<string, number>;
type NoticeState = { tone: "success" | "info"; text: string } | null;
type MainCharacterStats = Record<EquipmentResearchStat, number>;
type ArmoryZoneDef = {
  value: ArmoryZone;
  href: string;
  label: string;
  eyebrow: string;
  description: string;
  npc: string;
};

const MAX_CART_QUANTITY_PER_ITEM = 1;
const TOWASKI_PROFILE_SRC = "/assets/shop/hud/tia-profile.webp";
const TOWASKI_PORTRAIT_SRC = "/assets/shop/hud/tia-welcome.png";

const ARMORY_DESK_META: Pick<
  ArmoryZoneDef,
  "label" | "eyebrow" | "npc"
> = {
  label: "병기부 안내데스크",
  eyebrow: "ARMORY BUREAU",
  npc: "병기부 담당관",
};

const ZONE_DEFS: ArmoryZoneDef[] = [
  {
    value: "lab",
    href: "/erp/equipment-shop/lab",
    label: "병기 연구소",
    eyebrow: "RESEARCH LAB",
    description: "개인 강화와 전체 AGENT 팀 강화를 실제 스탯에 반영합니다.",
    npc: "연구 담당관",
  },
  {
    value: "towaski",
    href: "/erp/equipment-shop/towaski",
    label: "토와스키 장비 판매점",
    eyebrow: "TOWASKI",
    description: "무기와 방어구를 구매해 인벤토리에 반출합니다.",
    npc: "립 토와스키",
  },
  {
    value: "strategic",
    href: "/erp/equipment-shop/strategic",
    label: "전략 장비 판매점",
    eyebrow: "STRATEGIC ASSETS",
    description: "차량, 전략 자산, 전투 보조품을 구매합니다.",
    npc: "전략 자산 담당관",
  },
  {
    value: "custom",
    href: "/erp/equipment-shop/custom",
    label: "전용무기 제작소",
    eyebrow: "CUSTOM WORKSHOP",
    description: "전용무기 제작 상담 구역입니다. 요청 저장은 후속 단계에서 연결합니다.",
    npc: "제작 담당관",
  },
];

const TAB_DEFS: { value: EquipmentShopTabValue; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "WEAPON", label: "무기" },
  { value: "ARMOR", label: "방어구" },
];

const CATEGORY_LABELS: Record<EquipmentShopCatalogEntry["category"], string> = {
  WEAPON: "WEAPON",
  ARMOR: "ARMOR",
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
};

interface Props {
  mode: EquipmentShopMode;
  initialZone?: ArmoryZone;
  initialCatalog: EquipmentShopCatalogResponse;
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

function describeEquipmentShopError(err: unknown): string {
  return describeApiError(err, EquipmentShopApiError, ERROR_MESSAGE);
}

function activeZoneMeta(zone: ArmoryZone) {
  return ZONE_DEFS.find((item) => item.value === zone) ?? ZONE_DEFS[0];
}

function statLabel(stat: EquipmentResearchStat): string {
  return stat.toUpperCase();
}

export default function EquipmentShopClient({
  mode,
  initialZone = "lab",
  initialCatalog,
  mainCharacter,
  initialBalance,
  initialCredits,
  mainCharacterError,
  isGM,
}: Props) {
  const catalogQuery = useEquipmentShopCatalog({ initialData: initialCatalog });
  const creditsQuery = useCredits({ initialData: initialCredits });
  const checkoutMutation = useCheckoutEquipmentShopCart();
  const researchMutation = useApplyEquipmentResearch();

  const [activeTab, setActiveTab] = useState<EquipmentShopTabValue>("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState>({});
  const [researchScope, setResearchScope] =
    useState<EquipmentResearchScope>("personal");
  const [researchStat, setResearchStat] =
    useState<EquipmentResearchStat>("hp");
  const [researchAmount, setResearchAmount] = useState(1);
  const [localStats, setLocalStats] = useState<MainCharacterStats | null>(
    () => mainCharacter?.stats ?? null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const catalog = catalogQuery.data ?? initialCatalog;
  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const isHub = mode === "hub";
  const activeZone = initialZone;
  const activeZoneDef = activeZoneMeta(activeZone);
  const zoneMeta = isHub ? ARMORY_DESK_META : activeZoneDef;

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

  const strategicItems = useMemo(
    () => catalog.items.filter((item) => item.zone === "strategic"),
    [catalog.items],
  );

  const towaskiItemCount = useMemo(
    () => catalog.items.filter((item) => item.zone === "towaski").length,
    [catalog.items],
  );
  const strategicItemCount = strategicItems.length;
  const salesItems = activeZone === "strategic" ? strategicItems : towaskiItems;

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

  const canApplyResearch =
    isGM &&
    !researchMutation.isPending &&
    researchAmount >= 1 &&
    researchAmount <= 999 &&
    (researchScope === "team" || hasMainCharacter);

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

  function handleAddToCart(item: EquipmentShopCatalogEntry, quantity = 1) {
    if (!canUseShop) {
      setErrorMessage(
        hasMainCharacter
          ? "GM preview 상태에서만 병기부 구매를 실행할 수 있습니다."
          : "메인 AGENT 캐릭터가 없어 구매할 수 없습니다.",
      );
      return;
    }

    if (item.stock <= 0 || !item.available) {
      setErrorMessage("현재 반출할 수 없는 품목입니다.");
      return;
    }

    setSelectedKey(item.key);
    setErrorMessage(null);
    setNotice(null);
    setCartQuantity(item.key, (cart[item.key] ?? 0) + quantity);
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
          setNotice({
            tone: "success",
            text: `${res.order.items.length}종 반출 결제가 완료되었습니다.`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function handleResearchAmountChange(value: number) {
    if (!Number.isFinite(value)) {
      setResearchAmount(1);
      return;
    }
    setResearchAmount(Math.min(999, Math.max(1, Math.floor(value))));
  }

  function handleApplyResearch() {
    if (!canApplyResearch) return;
    setErrorMessage(null);
    setNotice(null);
    researchMutation.mutate(
      {
        scope: researchScope,
        stat: researchStat,
        amount: researchAmount,
      },
      {
        onSuccess: (res) => {
          if (mainCharacter) {
            const ownResult = res.targets.find(
              (target) => target.id === mainCharacter.id,
            );
            if (ownResult) {
              setLocalStats((prev) =>
                prev ? { ...prev, [res.stat]: ownResult.after } : prev,
              );
            }
          }
          setNotice({
            tone: "success",
            text:
              `${res.affected}명에게 ${statLabel(res.stat)} +${res.amount} ` +
              `강화를 적용했습니다.` +
              `${res.skipped > 0 ? ` (${res.skipped}명 제외)` : ""}` +
              `${res.auditFailed > 0 ? ` 감사 로그 실패 ${res.auditFailed}건` : ""}`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function getZoneStatus(zone: ArmoryZone): string {
    if (zone === "lab") {
      return hasMainCharacter
        ? "개인 강화 / 팀 전체 강화 가능"
        : "팀 전체 강화 가능 · 개인 강화 제한";
    }
    if (zone === "towaski") {
      return towaskiItemCount > 0
        ? `${towaskiItemCount}종 반출 가능`
        : "등록 품목 없음";
    }
    if (zone === "strategic") {
      return strategicItemCount > 0
        ? `${strategicItemCount}종 반출 가능`
        : "대상 품목 없음";
    }
    return "상담 패널 활성 · 요청 저장 후속";
  }

  function renderHubPanel() {
    const alerts = [
      {
        key: "lab",
        label: "연구소",
        value: hasMainCharacter
          ? "개인/팀 강화 터미널 대기"
          : "메인 AGENT 미등록 · 개인 강화 제한",
        warning: !hasMainCharacter,
      },
      {
        key: "towaski",
        label: "토와스키",
        value:
          towaskiItemCount > 0
            ? `표준 장비 ${towaskiItemCount}종 표시`
            : "표준 장비 등록 없음",
        warning: false,
      },
      {
        key: "strategic",
        label: "전략 장비",
        value:
          strategicItemCount > 0
            ? `전략 장비 ${strategicItemCount}종 표시`
            : "대상 태그 품목 없음",
        warning: strategicItemCount === 0,
      },
      {
        key: "custom",
        label: "제작소",
        value: "전용무기 상담만 활성",
        warning: false,
      },
    ];

    return (
      <div className={styles.deskLayout}>
        <section className={styles.deskConsole} aria-label="병기부 입장 선택">
          <div className={styles.panelIntro}>
            <Eyebrow>DESTINATION SELECT</Eyebrow>
            <strong>구역 선택</strong>
          </div>

          <div className={styles.choiceGrid}>
            {ZONE_DEFS.map((zone) => (
              <Link
                key={zone.value}
                href={zone.href}
                className={styles.choiceCard}
              >
                <span>{zone.eyebrow}</span>
                <strong>{zone.label}</strong>
                <small>{zone.description}</small>
                <em>{getZoneStatus(zone.value)}</em>
                <span className={styles.choiceAction}>입장</span>
              </Link>
            ))}
          </div>
        </section>

        <aside className={styles.alertPanel} aria-label="병기부 기능 알림">
          <div className={styles.panelIntro}>
            <Eyebrow>OPERATIONS BOARD</Eyebrow>
            <strong>기능 알림</strong>
          </div>
          <div className={styles.alertList}>
            {alerts.map((alert) => (
              <div
                key={alert.key}
                className={[
                  styles.alertItem,
                  alert.warning ? styles["alertItem--warning"] : "",
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

    return (
      <div className={styles.salesLayout}>
        <section className={styles.shelfPanel} aria-label={zoneMeta.label}>
          {isTowaski ? (
            <div
              role="tablist"
              aria-label="토와스키 카테고리"
              className={styles.filters}
            >
              {TAB_DEFS.map((tab) => {
                const isActive = activeTab === tab.value;
                const count =
                  tab.value === "ALL"
                    ? catalog.items.filter((item) => item.zone === "towaski")
                        .length
                    : catalog.items.filter(
                        (item) =>
                          item.zone === "towaski" &&
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
                    onClick={() => setActiveTab(tab.value)}
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
                : "전략 장비 판매점 대상 품목이 없습니다. SPECIAL 카테고리에 병기부/전략자산/차량/전투보조 태그가 붙으면 이곳에 표시됩니다."}
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
                      onClick={() => setSelectedKey(item.key)}
                      aria-pressed={isSelected}
                    >
                      <span className={styles.productTop}>
                        <span>{CATEGORY_LABELS[item.category]}</span>
                        <span>{isSoldOut ? "LOCKED" : `${item.stock} EA`}</span>
                      </span>
                      <span className={styles.productIcon} aria-hidden>
                        <ShopItemIcon slug={item.slug ?? item.key} size={48} />
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
                    <ShopItemIcon
                      slug={selectedItem.slug ?? selectedItem.key}
                      size={58}
                    />
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
                  onClick={() => setCart({})}
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
    return (
      <div className={styles.labLayout}>
        <section className={styles.labConsole}>
          <div className={styles.panelIntro}>
            <Eyebrow>ENHANCEMENT TERMINAL</Eyebrow>
            <strong>신체 강화 적용</strong>
          </div>

          <div className={styles.scopeSwitch} role="tablist" aria-label="강화 대상">
            <button
              type="button"
              role="tab"
              aria-selected={researchScope === "personal"}
              className={researchScope === "personal" ? styles.activeSwitch : ""}
              onClick={() => setResearchScope("personal")}
            >
              개인 적용
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={researchScope === "team"}
              className={researchScope === "team" ? styles.activeSwitch : ""}
              onClick={() => setResearchScope("team")}
            >
              팀 전체 적용
            </button>
          </div>

          <div className={styles.statPicker} aria-label="강화 스탯">
            {STAT_DEFS.map((stat) => (
              <button
                key={stat.value}
                type="button"
                className={[
                  styles.statButton,
                  researchStat === stat.value ? styles["statButton--active"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setResearchStat(stat.value)}
              >
                <strong>{stat.label}</strong>
                <span>{stat.hint}</span>
              </button>
            ))}
          </div>

          <label className={styles.amountInput}>
            <span>증가량</span>
            <input
              type="number"
              min={1}
              max={999}
              value={researchAmount}
              onChange={(event) =>
                handleResearchAmountChange(Number(event.target.value))
              }
            />
          </label>

          <div className={styles.researchPreview}>
            <span>적용 대상</span>
            <strong>
              {researchScope === "team"
                ? "모든 AGENT"
                : mainCharacter?.codename ?? "UNASSIGNED"}
            </strong>
            <span>변경</span>
            <strong>
              {statLabel(researchStat)} +{researchAmount}
            </strong>
          </div>

          {researchScope === "team" ? (
            <Box className={styles.warningBox}>
              모든 AGENT 캐릭터의 실제 스탯이 즉시 영구 변경됩니다.
            </Box>
          ) : null}

          <button
            type="button"
            className={styles.applyButton}
            onClick={handleApplyResearch}
            disabled={!canApplyResearch}
            aria-busy={researchMutation.isPending}
          >
            {researchMutation.isPending ? "적용 중" : "강화 적용"}
          </button>
        </section>

        <aside className={styles.statsPanel}>
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
              메인 AGENT 캐릭터가 없어 개인 강화는 실행할 수 없습니다.
            </div>
          )}
        </aside>
      </div>
    );
  }

  function renderCustomPanel() {
    return (
      <div className={styles.customPanel}>
        <div className={styles.panelIntro}>
          <Eyebrow>CUSTOM WEAPON</Eyebrow>
          <strong>전용무기 제작 상담</strong>
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
    <div className={styles.armoryRoot} data-pixel-font="full">
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

      <section className={styles.armoryStage} aria-label="병기부">
        <header className={styles.armoryHeader}>
          <div>
            <Eyebrow>{zoneMeta.eyebrow}</Eyebrow>
            <h1>{zoneMeta.label}</h1>
          </div>
          <Tag tone="gold">GM PREVIEW</Tag>
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
              <span>{isHub ? "구역" : "카트"}</span>
              <strong>{isHub ? "4구역" : `${cartCount}개`}</strong>
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

        <section className={styles.npcHud} aria-label="병기부 응대 HUD">
          <div className={styles.npcPortrait}>
            <Image
              src={TOWASKI_PORTRAIT_SRC}
              alt=""
              fill
              sizes="148px"
              priority
            />
          </div>
          <div className={styles.npcDialogue}>
            <div className={styles.npcHead}>
              <span className={styles.npcProfile}>
                <Image src={TOWASKI_PROFILE_SRC} alt="" fill sizes="38px" />
              </span>
              <div>
                <span>{zoneMeta.eyebrow}</span>
                <strong>{zoneMeta.npc}</strong>
              </div>
              <span className={styles.npcMood}>응대 중</span>
            </div>
            <p>
              {isHub
                ? "병기부 안내데스크다. 목적지를 고르면 해당 구역으로 연결해주겠다."
                : activeZone === "lab"
                  ? "연구 적용은 즉시 기록된다. 개인인지, 팀 전체인지 먼저 확인해."
                  : activeZone === "towaski"
                    ? "토와스키다. 표준 장비는 여기서 보고, 장난감은 들고 오지 마."
                    : activeZone === "strategic"
                      ? "차량과 전략 자산은 태그가 붙은 품목만 반출대에 올라온다."
                      : "전용무기는 상담부터다. 제작 요청 저장은 다음 단계에서 연결한다."}
            </p>
          </div>
        </section>
      </section>
    </div>
  );
}
