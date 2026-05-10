"use client";

import { useMemo, useState } from "react";

import type { ShopPageGroup } from "@stargate/shared-db/types";

import {
  type CreditsResponse,
  useCredits,
} from "@/hooks/queries/useCreditsQuery";
import {
  useBuyShopItem,
  useConsumeShopItem,
} from "@/hooks/mutations/useShopMutation";
import {
  ShopApiError,
  type ShopCatalogEntry,
  type ShopCatalogResponse,
  type ShopErrorCode,
  type ShopInventoryItem,
  type ShopInventoryResponse,
  useShopCatalog,
  useShopInventory,
} from "@/hooks/queries/useShopQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import BuyModal from "./BuyModal";
import ConsumeModal from "./ConsumeModal";
import ShopAdminStockModal from "./ShopAdminStockModal";
import ShopItemIcon from "./ShopItemIcon";

import styles from "./page.module.css";

/* ── 상수 ── */

/** 카테고리 4개 + 전체. ShopPageGroup 은 shared-db enum 이라 그대로 두고 local 에서 "ALL" 합집합. */
type ShopTabValue = ShopPageGroup | "ALL";

const TAB_DEFS: { value: ShopTabValue; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "BASIC", label: "기본" },
  { value: "RECOVERY", label: "회복" },
  { value: "LUXURY", label: "기호" },
  { value: "RARE", label: "희귀" },
];

/** 서버 에러 코드 → 한국어 사용자 메시지. */
const ERROR_MESSAGE: Record<ShopErrorCode, string> = {
  SHOP_CLOSED: "영업 시간이 아닙니다 (토 18시 이후·일요일 마감).",
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
};

function describeShopError(err: unknown): string {
  if (err instanceof ShopApiError) {
    if (err.code) return ERROR_MESSAGE[err.code] ?? err.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류가 발생했습니다.";
}

/* ── 모달 상태 타입 ── */

type ModalState =
  | { kind: "buy"; slug: string }
  | { kind: "consume"; slug: string }
  | null;

/* ── Props ── */

interface Props {
  initialCatalog: ShopCatalogResponse;
  initialInventory: ShopInventoryResponse;
  mainCharacter: { id: string; codename: string } | null;
  initialBalance: number;
  initialCredits: CreditsResponse | undefined;
  mainCharacterError: string | null;
  /** GM 전용 재고 관리 모달 노출 여부. */
  isGM: boolean;
}

/* ── 컴포넌트 ── */

export default function ShopClient({
  initialCatalog,
  initialInventory,
  mainCharacter,
  initialBalance,
  initialCredits,
  mainCharacterError,
  isGM,
}: Props) {
  /* 6. 쿼리 */
  const catalogQuery = useShopCatalog({ initialData: initialCatalog });
  const inventoryQuery = useShopInventory({ initialData: initialInventory });
  const creditsQuery = useCredits({ initialData: initialCredits });

  const buyMutation = useBuyShopItem();
  const consumeMutation = useConsumeShopItem();

  /* 10. 로컬 상태 */
  const [activeTab, setActiveTab] = useState<ShopTabValue>("ALL");
  const [modal, setModal] = useState<ModalState>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* 11. 파생 */
  const catalog = catalogQuery.data ?? initialCatalog;
  const inventory = inventoryQuery.data ?? initialInventory;

  // 잔액: useCredits 응답이 도착하면 그것을, 아니면 초기 props.
  // 정합성 위반(409) / 미등록(404) 시 useCredits 가 throw → fallback 으로 0 표시.
  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const itemsByTab = useMemo(() => {
    if (activeTab === "ALL") return catalog.items;
    return catalog.items.filter((item) => item.pageGroup === activeTab);
  }, [catalog.items, activeTab]);

  const inventoryBySlug = useMemo(() => {
    const map = new Map<string, ShopInventoryItem>();
    for (const item of inventory.items) {
      map.set(item.slug, item);
    }
    return map;
  }, [inventory.items]);

  // 모달이 가리킬 카탈로그 / 인벤 항목.
  const buyItem: ShopCatalogEntry | undefined =
    modal?.kind === "buy"
      ? catalog.items.find((it) => it.slug === modal.slug)
      : undefined;
  const consumeItem: ShopInventoryItem | undefined =
    modal?.kind === "consume" ? inventoryBySlug.get(modal.slug) : undefined;

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const canBuy = hasMainCharacter && catalog.isOpen;

  /* 14. 핸들러 */
  function handleCardClick(item: ShopCatalogEntry) {
    if (!canBuy) return;
    if (!item.available || item.stock <= 0) return;
    setErrorMessage(null);
    setModal({ kind: "buy", slug: item.slug });
  }

  function handleConsumeClick(slug: string) {
    if (!hasMainCharacter) return;
    setErrorMessage(null);
    setModal({ kind: "consume", slug });
  }

  function closeModal() {
    setModal(null);
  }

  function handleBuyConfirm(quantity: number) {
    if (!buyItem) return;
    buyMutation.mutate(
      { slug: buyItem.slug, quantity },
      {
        onSuccess: () => {
          setModal(null);
          setErrorMessage(null);
        },
        onError: (err) => {
          setErrorMessage(describeShopError(err));
        },
      },
    );
  }

  function handleConsumeConfirm(quantity: number) {
    if (!consumeItem) return;
    consumeMutation.mutate(
      { slug: consumeItem.slug, quantity },
      {
        onSuccess: () => {
          setModal(null);
          setErrorMessage(null);
        },
        onError: (err) => {
          setErrorMessage(describeShopError(err));
        },
      },
    );
  }

  /* ── 렌더 ── */

  return (
    <div className={styles.shopRoot}>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "SHOP" },
        ]}
        title="편의점"
        right={
          <div className={styles.headRight}>
            <Tag tone={catalog.isOpen ? "gold" : "danger"}>
              {catalog.isOpen ? "영업 중" : "영업 종료"}
            </Tag>
            {isGM ? (
              <button
                type="button"
                onClick={() => setAdminOpen(true)}
                className={styles.adminBtn}
              >
                재고 관리 · GM
              </button>
            ) : null}
          </div>
        }
      />

      {/* ── 헤더 패널: 캐릭터 + 잔액 + 안내 ── */}
      <Box variant="gold" className={styles.header}>
        <div className={styles.header__main}>
          <Eyebrow>{hasMainCharacter ? "메인 AGENT" : "캐릭터"}</Eyebrow>
          <div className={styles.header__codename}>
            {mainCharacter?.codename ?? "메인 AGENT 미등록"}
          </div>
        </div>
        <div className={styles.header__balance}>
          <Eyebrow>WALLET</Eyebrow>
          <div className={styles.header__balanceNum}>
            ¤ {balance.toLocaleString()}
          </div>
        </div>
        <div className={styles.header__status}>
          <Eyebrow>STATUS</Eyebrow>
          <div className={styles.header__statusText}>
            {catalog.isOpen
              ? "주중·토 18시 이전 영업"
              : "토 18시 이후·일요일 마감"}
          </div>
        </div>
      </Box>

      {/* 메인 캐릭터 미등록 / 정합성 위반 안내 */}
      {!hasMainCharacter ? (
        <Box className={styles.notice}>
          {mainCharacterError ? (
            <>
              <strong className={styles.notice__strong}>⚠ 정합성 위반</strong>
              {": "}
              {mainCharacterError}
              <br />
              운영자(GM)에게 문의하세요. 카탈로그는 열람만 가능합니다.
            </>
          ) : (
            <>
              메인 AGENT 캐릭터가 없어 구매·소비할 수 없습니다. 캐릭터 등록 후
              다시 확인하세요. 카탈로그는 열람만 가능합니다.
            </>
          )}
        </Box>
      ) : null}

      {/* 에러 배너 (mutation 실패) */}
      {errorMessage ? (
        <Box className={styles.errorBanner} role="alert">
          <strong className={styles.notice__strong}>⚠</strong> {errorMessage}
          <button
            type="button"
            className={styles.errorBanner__dismiss}
            onClick={() => setErrorMessage(null)}
            aria-label="에러 메시지 닫기"
          >
            ✕
          </button>
        </Box>
      ) : null}

      {/* ── 카테고리 탭 ── */}
      <div
        role="tablist"
        aria-label="편의점 카테고리"
        className={styles.filters}
      >
        {TAB_DEFS.map((tab) => {
          const isActive = activeTab === tab.value;
          const count =
            tab.value === "ALL"
              ? catalog.items.length
              : catalog.items.filter((it) => it.pageGroup === tab.value).length;
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
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label} · {count}
            </button>
          );
        })}
      </div>

      {/* ── 카드 그리드 ── */}
      {itemsByTab.length === 0 ? (
        <Box>
          <div className={styles.empty}>이 카테고리에 품목이 없습니다.</div>
        </Box>
      ) : (
        <div className={styles.grid}>
          {itemsByTab.map((item) => {
            const owned = inventoryBySlug.get(item.slug);
            const disabled = !canBuy || !item.available || item.stock <= 0;
            return (
              <Box
                key={item.slug}
                className={[
                  styles.card,
                  disabled ? styles["card--disabled"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {owned ? (
                  <span
                    className={styles.card__badge}
                    aria-label={`보유 ${owned.quantity}개`}
                  >
                    보유 {owned.quantity}
                  </span>
                ) : null}
                <div className={styles.card__icon} aria-hidden>
                  <ShopItemIcon slug={item.slug} size={48} />
                </div>
                <div className={styles.card__name}>{item.name}</div>
                <div className={styles.card__slug}>{item.slug}</div>
                <div className={styles.card__effect}>{item.effect}</div>
                <div className={styles.card__meta}>
                  <span className={styles.card__price}>
                    ¤ {item.price.toLocaleString()}
                  </span>
                  <span
                    className={[
                      styles.card__stock,
                      item.stock <= 0 ? styles["card__stock--out"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {item.stock <= 0 ? "품절" : `재고 ${item.stock}`}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.card__action}
                  onClick={() => handleCardClick(item)}
                  disabled={disabled}
                >
                  {!catalog.isOpen
                    ? "영업 종료"
                    : !hasMainCharacter
                      ? "구매 불가"
                      : item.stock <= 0
                        ? "품절"
                        : "구매"}
                </button>
              </Box>
            );
          })}
        </div>
      )}

      {/* ── 보유 인벤토리 패널 ── */}
      {hasMainCharacter ? (
        <Box className={styles.inventoryPanel}>
          <PanelTitle
            right={
              <span className={styles.inventoryPanel__count}>
                {inventory.items.length} 종
              </span>
            }
          >
            MY INVENTORY · 편의점
          </PanelTitle>
          {inventory.items.length === 0 ? (
            <div className={styles.empty}>보유한 편의점 아이템이 없습니다.</div>
          ) : (
            <div className={styles.inventoryPanel__grid}>
              {inventory.items.map((item) => (
                <div key={item.slug} className={styles.inventoryItem}>
                  <div className={styles.inventoryItem__icon} aria-hidden>
                    <ShopItemIcon slug={item.slug} size={32} />
                  </div>
                  <div className={styles.inventoryItem__body}>
                    <div className={styles.inventoryItem__name}>
                      {item.name}
                    </div>
                    <div className={styles.inventoryItem__effect}>
                      {item.effect}
                    </div>
                  </div>
                  <div className={styles.inventoryItem__qty}>
                    × {item.quantity}
                  </div>
                  <button
                    type="button"
                    className={styles.inventoryItem__use}
                    onClick={() => handleConsumeClick(item.slug)}
                  >
                    사용 / 폐기
                  </button>
                </div>
              ))}
            </div>
          )}
        </Box>
      ) : null}

      {/* ── 모달 ── */}
      {buyItem ? (
        <BuyModal
          item={buyItem}
          balance={balance}
          isOpen={catalog.isOpen}
          onClose={closeModal}
          onConfirm={handleBuyConfirm}
          isPending={buyMutation.isPending}
        />
      ) : null}

      {consumeItem ? (
        <ConsumeModal
          item={{
            slug: consumeItem.slug,
            name: consumeItem.name,
            icon: consumeItem.icon,
            effect: consumeItem.effect,
          }}
          inventoryQuantity={consumeItem.quantity}
          onClose={closeModal}
          onConfirm={handleConsumeConfirm}
          isPending={consumeMutation.isPending}
        />
      ) : null}

      {adminOpen ? (
        <ShopAdminStockModal
          onClose={() => setAdminOpen(false)}
          onSaved={() => {
            // 저장 후 catalog 재조회 → 카드 stock/available 즉시 반영.
            void catalogQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
