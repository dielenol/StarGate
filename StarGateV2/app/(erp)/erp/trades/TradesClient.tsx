"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { ItemCategory } from "@stargate/shared-db/types";

import type {
  PlayerTradeAssets,
  PlayerTradeDto,
  PlayerTradeOffer,
  TradeAction,
} from "@/types/trade";

import {
  useCreateTradeMutation,
  useUpdateTradeMutation,
} from "@/hooks/mutations/useTradesMutation";
import { useTradesQuery } from "@/hooks/queries/useTradesQuery";

import {
  IconConsumable,
  IconInventoryEquipment,
  IconMisc,
  IconSuccess,
} from "@/components/icons";

import { getConsumableItemImageSrc } from "@/lib/shop/item-images";

import styles from "./page.module.css";

const EMPTY_OFFER: PlayerTradeOffer = { credits: 0, items: [], stocks: [] };
const EMPTY_TRADE_SLOTS = [0, 1, 2, 3] as const;
const ASSET_TABS = [
  { value: "CREDITS", label: "크레딧" },
  { value: "ITEMS", label: "아이템·장비" },
  { value: "STOCKS", label: "주식" },
] as const;
const CATEGORY_LABEL: Record<ItemCategory, string> = {
  WEAPON: "무기",
  ARMOR: "방어구",
  CONSUMABLE: "소모품",
  MATERIAL: "샘플",
  SPECIAL: "특수",
};
type AssetTab = (typeof ASSET_TABS)[number]["value"];

interface OfferEditorProps {
  assets: PlayerTradeAssets;
  busy: boolean;
  kind?: "GIFT" | "EXCHANGE";
  initialOffer?: PlayerTradeOffer;
  onSubmit: (offer: PlayerTradeOffer) => void;
  requireAssets?: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
}

interface TradeCardProps {
  assets: PlayerTradeAssets;
  busy: boolean;
  errorMessage?: string;
  meUserId: string;
  onUpdate: (tradeId: string, action: TradeAction) => void;
  trade: PlayerTradeDto;
}

function categoryLabel(category: ItemCategory | null): string {
  return category === null ? "분류 없음" : CATEGORY_LABEL[category];
}

function categoryTone(category: ItemCategory | null): string {
  if (category === "WEAPON" || category === "ARMOR") return "equipment";
  if (category === "CONSUMABLE") return "consumable";
  return "other";
}

function stepCreditInput(
  value: string,
  direction: -1 | 1,
  maximum: number,
): string {
  const parsed = Number(value);
  const current = Number.isFinite(parsed) ? parsed : 0;
  const next = Math.min(maximum, Math.max(0, current + direction));
  return String(Math.round(next * 100) / 100);
}

function normalizeCreditInput(value: string): string {
  if (!/^0\d/.test(value)) return value;
  return value.replace(/^0+(?=\d)/, "");
}

function summarizeOffer(offer: PlayerTradeOffer): string {
  const parts: string[] = [];
  if (offer.credits > 0) parts.push(`${offer.credits.toLocaleString()} CR`);
  parts.push(
    ...offer.items.map((item) => `${item.itemName} x${item.quantity}`),
    ...offer.stocks.map((stock) => `${stock.ticker} ${stock.shares}주`),
  );
  return parts.length > 0 ? parts.join(" · ") : "등록된 자산 없음";
}

function TradeItemVisual({
  category,
  previewImage,
  slug,
}: {
  category: ItemCategory | null;
  previewImage?: string;
  slug?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const canonicalImage =
    category === "CONSUMABLE" && slug
      ? getConsumableItemImageSrc(slug)
      : undefined;
  const previewImageSrc = previewImage?.trim();
  const imageSrc =
    canonicalImage ??
    (previewImageSrc?.startsWith("/assets/") ? previewImageSrc : undefined);

  if (imageSrc && !imageFailed) {
    return (
      <Image
        src={imageSrc}
        width={54}
        height={54}
        alt=""
        aria-hidden
        draggable={false}
        className={styles.assetCard__image}
        unoptimized
        onError={() => setImageFailed(true)}
      />
    );
  }
  if (category === "CONSUMABLE") {
    return <IconConsumable className={styles.assetCard__icon} aria-hidden />;
  }
  if (category === "WEAPON" || category === "ARMOR") {
    return (
      <IconInventoryEquipment
        className={styles.assetCard__icon}
        aria-hidden
      />
    );
  }
  return <IconMisc className={styles.assetCard__icon} aria-hidden />;
}

function OfferManifest({
  assets,
  confirmed,
  label,
  offer,
}: {
  assets: PlayerTradeAssets;
  confirmed: boolean;
  label: string;
  offer: PlayerTradeOffer;
}) {
  const lineCount =
    (offer.credits > 0 ? 1 : 0) +
    offer.items.length +
    offer.stocks.length;

  return (
    <section className={styles.tradeOfferPane}>
      <div className={styles.tradeOfferPane__head}>
        <strong>{label}</strong>
        <span
          className={
            confirmed
              ? styles.tradeOfferPane__confirmed
              : styles.tradeOfferPane__pending
          }
        >
          {confirmed ? "확정" : "미확정"}
        </span>
      </div>
      {lineCount === 0 ? (
        <div className={styles.tradeOfferPane__empty}>
          <div className={styles.emptyOfferSlots} aria-hidden>
            {EMPTY_TRADE_SLOTS.map((slot) => (
              <span key={slot} />
            ))}
          </div>
          <p>등록된 자산이 없습니다.</p>
        </div>
      ) : (
        <div className={styles.tradeOfferTokens}>
          {offer.credits > 0 ? (
            <div className={styles.tradeOfferToken}>
              <span className={styles.tradeOfferToken__mark}>CR</span>
              <span>크레딧</span>
              <strong>{offer.credits.toLocaleString()}</strong>
            </div>
          ) : null}
          {offer.items.map((item) => {
            const asset = assets.items.find(
              (candidate) => candidate.itemId === item.itemId,
            );
            return (
              <div
                key={item.itemId}
                className={styles.tradeOfferToken}
                title={item.itemName}
              >
                <span className={styles.tradeOfferToken__art}>
                  <TradeItemVisual
                    category={asset?.category ?? null}
                    previewImage={asset?.previewImage}
                    slug={asset?.slug}
                  />
                </span>
                <span>{item.itemName}</span>
                <strong>× {item.quantity}</strong>
              </div>
            );
          })}
          {offer.stocks.map((stock) => (
            <div key={stock.ticker} className={styles.tradeOfferToken}>
              <span className={styles.tradeOfferToken__mark}>
                {stock.ticker.slice(0, 2)}
              </span>
              <span>{stock.ticker}</span>
              <strong>{stock.shares}주</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OfferEditor({
  assets,
  busy,
  kind = "EXCHANGE",
  initialOffer = EMPTY_OFFER,
  onSubmit,
  requireAssets = false,
  submitDisabled = false,
  submitLabel,
}: OfferEditorProps) {
  const tabGroupId = useId();
  const [activeAssetTab, setActiveAssetTab] =
    useState<AssetTab>("CREDITS");
  const [credits, setCredits] = useState(
    initialOffer.credits > 0 ? String(initialOffer.credits) : "",
  );
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>(
    Object.fromEntries(
      initialOffer.items.map((item) => [item.itemId, item.quantity]),
    ),
  );
  const [stockShares, setStockShares] = useState<Record<string, number>>(
    Object.fromEntries(
      initialOffer.stocks.map((stock) => [stock.ticker, stock.shares]),
    ),
  );

  const selectedItems = assets.items.filter(
    (item) => (itemQuantities[item.itemId] ?? 0) > 0,
  );
  const selectedStocks = assets.stocks.filter(
    (stock) => (stockShares[stock.ticker] ?? 0) > 0,
  );
  const selectedCreditAmount = Math.max(0, Number(credits) || 0);
  const assetLineCount =
    (selectedCreditAmount > 0 ? 1 : 0) +
    selectedItems.length +
    selectedStocks.length;

  function setItemQuantity(itemId: string, quantity: number, maximum: number) {
    setItemQuantities((current) => ({
      ...current,
      [itemId]: Math.min(maximum, Math.max(0, Math.floor(quantity) || 0)),
    }));
  }

  function setStockQuantity(ticker: string, shares: number, maximum: number) {
    setStockShares((current) => ({
      ...current,
      [ticker]: Math.min(maximum, Math.max(0, Math.floor(shares) || 0)),
    }));
  }

  function selectAssetTab(
    event: React.KeyboardEvent<HTMLButtonElement>,
    tab: AssetTab,
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = ASSET_TABS.findIndex(
      (candidate) => candidate.value === tab,
    );
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex =
      (currentIndex + offset + ASSET_TABS.length) % ASSET_TABS.length;
    const nextTab = ASSET_TABS[nextIndex].value;
    setActiveAssetTab(nextTab);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-asset-tab="${nextTab}"]`)
      ?.focus();
  }

  function submit() {
    onSubmit({
      credits: Math.max(0, Number(credits) || 0),
      items: assets.items
        .map((item) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          quantity: Math.max(
            0,
            Math.floor(itemQuantities[item.itemId] ?? 0),
          ),
        }))
        .filter((item) => item.quantity > 0),
      stocks: assets.stocks
        .map((stock) => ({
          ticker: stock.ticker,
          shares: Math.max(
            0,
            Math.floor(stockShares[stock.ticker] ?? 0),
          ),
        }))
        .filter((stock) => stock.shares > 0),
    });
  }

  return (
    <div className={styles.offerEditor}>
      <div className={styles.offerEditor__main}>
        <div
          className={styles.assetTabs}
          role="tablist"
          aria-label="전달 자산 종류"
        >
          {ASSET_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`${tabGroupId}-${tab.value}`}
              aria-controls={`${tabGroupId}-panel`}
              aria-selected={activeAssetTab === tab.value}
              tabIndex={activeAssetTab === tab.value ? 0 : -1}
              data-asset-tab={tab.value}
              className={
                activeAssetTab === tab.value
                  ? styles.assetTabActive
                  : styles.assetTab
              }
              onClick={() => setActiveAssetTab(tab.value)}
              onKeyDown={(event) => selectAssetTab(event, tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          id={`${tabGroupId}-panel`}
          className={styles.assetSelection}
          role="tabpanel"
          aria-labelledby={`${tabGroupId}-${activeAssetTab}`}
        >
          {activeAssetTab === "CREDITS" ? (
            <div className={styles.creditCard}>
              <div>
                <span className={styles.eyebrow}>CREDIT BALANCE</span>
                <strong>{assets.credits.toLocaleString()} CR</strong>
                <p>직접 소수 입력하거나 위·아래 화살표로 1 CR씩 조정할 수 있습니다.</p>
              </div>
              <label className={styles.creditInput}>
                <span>전달 크레딧</span>
                <input
                  type="number"
                  min={0}
                  max={assets.credits}
                  step="any"
                  inputMode="decimal"
                  placeholder="0"
                  value={credits}
                  onChange={(event) => setCredits(normalizeCreditInput(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    setCredits((current) =>
                      stepCreditInput(current, event.key === "ArrowUp" ? 1 : -1, assets.credits),
                    );
                  }}
                />
              </label>
            </div>
          ) : null}

          {activeAssetTab === "ITEMS" ? (
            assets.items.length === 0 ? (
              <p className={styles.empty}>거래 가능한 미장착 개인 아이템이 없습니다.</p>
            ) : (
              <div className={styles.itemInventory}>
                <div className={styles.itemInventory__head}>
                  <div>
                    <strong>내 보관함</strong>
                    <span>품목을 눌러 거래 슬롯에 등록·해제</span>
                  </div>
                  <span>{assets.items.length}칸 사용</span>
                </div>
                <div className={styles.itemSlotGrid}>
                  {assets.items.map((item) => {
                    const tone = categoryTone(item.category);
                    const detail = item.effect ?? item.description;
                    const quantity = itemQuantities[item.itemId] ?? 0;
                    const selected = quantity > 0;
                    return (
                      <button
                        key={item.itemId}
                        type="button"
                        className={[
                          styles.itemSlot,
                          styles[`itemSlot--${tone}`],
                          selected ? styles.itemSlotSelected : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={selected}
                        aria-label={`${item.itemName}, ${categoryLabel(item.category)}, 보유 ${item.quantity}${selected ? `, 거래 ${quantity}개 등록됨. 클릭해 해제` : ", 클릭해 1개 등록"}`}
                        title={detail || item.itemName}
                        onClick={() =>
                          setItemQuantity(
                            item.itemId,
                            selected ? 0 : 1,
                            item.quantity,
                          )
                        }
                      >
                        <span className={styles.itemSlot__art} aria-hidden>
                          <TradeItemVisual
                            key={`${item.itemId}:${item.slug ?? ""}:${item.previewImage ?? ""}`}
                            category={item.category}
                            slug={item.slug}
                            previewImage={item.previewImage}
                          />
                        </span>
                        <span className={styles.itemSlot__name}>
                          {item.itemName}
                        </span>
                        <span className={styles.itemSlot__meta}>
                          {categoryLabel(item.category)}
                        </span>
                        <span className={styles.itemSlot__owned}>
                          × {item.quantity.toLocaleString()}
                        </span>
                        {selected ? (
                          <span className={styles.itemSlot__selectedCount}>
                            등록 {quantity}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <p className={styles.itemInventory__hint}>
                  수량은 오른쪽 거래 슬롯에서 조정할 수 있습니다. 장착 중이거나
                  공방 처리 중인 장비는 표시되지 않습니다.
                </p>
              </div>
            )
          ) : null}

          {activeAssetTab === "STOCKS" ? (
            assets.stocks.length === 0 ? (
              <p className={styles.empty}>보유 주식이 없습니다.</p>
            ) : (
              <div className={styles.stockGrid}>
                {assets.stocks.map((stock) => {
                  const shares = stockShares[stock.ticker] ?? 0;
                  return (
                    <article key={stock.ticker} className={[styles.stockCard, shares > 0 ? styles.stockCardSelected : ""].filter(Boolean).join(" ")}>
                      <div className={styles.stockCard__mark} aria-hidden>{stock.ticker.slice(0, 2)}</div>
                      <div className={styles.stockCard__body}>
                        <strong>{stock.name}</strong>
                        <span>{stock.ticker} · 보유 {stock.shares.toLocaleString()}주</span>
                        <div className={styles.quantityControl} aria-label={`${stock.ticker} 전달 주식 수`}>
                          <button type="button" aria-label={`${stock.ticker} 수량 감소`} disabled={shares <= 0} onClick={() => setStockQuantity(stock.ticker, shares - 1, stock.shares)}>−</button>
                          <input aria-label={`${stock.ticker} 주식 수량`} type="number" min={0} max={stock.shares} step={1} value={shares} onChange={(event) => setStockQuantity(stock.ticker, Number(event.target.value), stock.shares)} />
                          <button type="button" aria-label={`${stock.ticker} 수량 증가`} disabled={shares >= stock.shares} onClick={() => setStockQuantity(stock.ticker, shares + 1, stock.shares)}>+</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      </div>

      <aside className={styles.offerSummaryPanel} aria-label="전송 구성 요약">
        <div className={styles.offerSummaryPanel__head}>
          <div>
            <span className={styles.eyebrow}>TRANSMISSION MANIFEST</span>
            <strong>전송 구성</strong>
          </div>
          <span className={styles.lineCount}>{assetLineCount}개 자산</span>
        </div>
        {assetLineCount === 0 ? (
          <div className={styles.summaryEmpty}>
            <div className={styles.emptyOfferSlots} aria-hidden>
              {EMPTY_TRADE_SLOTS.map((slot) => (
                <span key={slot} />
              ))}
            </div>
            <p>왼쪽 보관함에서 전달할 자산을 거래 슬롯에 등록하세요.</p>
          </div>
        ) : (
          <ul className={styles.offerSlotList}>
            {selectedCreditAmount > 0 ? (
              <li className={styles.offerLedgerSlot}>
                <span className={styles.offerLedgerSlot__mark}>CR</span>
                <span className={styles.offerLedgerSlot__body}>
                  <span>크레딧</span>
                  <strong>
                    {selectedCreditAmount.toLocaleString()} CR
                  </strong>
                </span>
                <button
                  type="button"
                  className={styles.offerSlotRemove}
                  onClick={() => setCredits("")}
                  aria-label="크레딧 제거"
                >
                  ×
                </button>
              </li>
            ) : null}
            {selectedItems.map((item) => {
              const quantity = itemQuantities[item.itemId] ?? 0;
              return (
                <li key={item.itemId} className={styles.offerItemSlot}>
                  <span className={styles.offerItemSlot__art} aria-hidden>
                    <TradeItemVisual
                      category={item.category}
                      slug={item.slug}
                      previewImage={item.previewImage}
                    />
                  </span>
                  <span className={styles.offerItemSlot__body}>
                    <span className={styles.offerItemSlot__name}>
                      {item.itemName}
                    </span>
                    <span className={styles.offerItemSlot__meta}>
                      {categoryLabel(item.category)} · 보유{" "}
                      {item.quantity.toLocaleString()}
                    </span>
                    <span
                      className={styles.quantityControlCompact}
                      aria-label={`${item.itemName} 전달 수량`}
                    >
                      <button
                        type="button"
                        aria-label={`${item.itemName} 수량 감소`}
                        disabled={quantity <= 1}
                        onClick={() =>
                          setItemQuantity(
                            item.itemId,
                            quantity - 1,
                            item.quantity,
                          )
                        }
                      >
                        −
                      </button>
                      <input
                        aria-label={`${item.itemName} 수량`}
                        type="number"
                        min={1}
                        max={item.quantity}
                        step={1}
                        value={quantity}
                        onChange={(event) => {
                          const nextQuantity =
                            event.currentTarget.valueAsNumber;
                          setItemQuantity(
                            item.itemId,
                            Number.isFinite(nextQuantity)
                              ? nextQuantity
                              : 1,
                            item.quantity,
                          );
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`${item.itemName} 수량 증가`}
                        disabled={quantity >= item.quantity}
                        onClick={() =>
                          setItemQuantity(
                            item.itemId,
                            quantity + 1,
                            item.quantity,
                          )
                        }
                      >
                        +
                      </button>
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.offerSlotRemove}
                    onClick={() =>
                      setItemQuantity(item.itemId, 0, item.quantity)
                    }
                    aria-label={`${item.itemName} 제거`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
            {selectedStocks.map((stock) => (
              <li key={stock.ticker} className={styles.offerLedgerSlot}>
                <span className={styles.offerLedgerSlot__mark}>
                  {stock.ticker.slice(0, 2)}
                </span>
                <span className={styles.offerLedgerSlot__body}>
                  <span>{stock.name}</span>
                  <strong>
                    {stock.ticker} · {stockShares[stock.ticker]}주
                  </strong>
                </span>
                <button
                  type="button"
                  className={styles.offerSlotRemove}
                  onClick={() =>
                    setStockQuantity(stock.ticker, 0, stock.shares)
                  }
                  aria-label={`${stock.ticker} 제거`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {kind === "GIFT" ? <p className={styles.caution}>주의: 즉시 전달은 상대 승인 없이 완료되며 취소할 수 없습니다.</p> : <p className={styles.summaryHint}>교환방은 양측이 현재 구성을 확정하면 체결됩니다.</p>}
        <button
          type="button"
          className={
            kind === "GIFT" ? styles.dangerButton : styles.primaryButton
          }
          disabled={
            busy ||
            submitDisabled ||
            (requireAssets && assetLineCount === 0)
          }
          onClick={submit}
        >
          {busy ? "처리 중…" : submitLabel}
        </button>
      </aside>
    </div>
  );
}

function TradeCard({
  assets,
  busy,
  errorMessage,
  meUserId,
  onUpdate,
  trade,
}: TradeCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const isInitiator = trade.initiator.userId === meUserId;
  const other = isInitiator ? trade.counterparty : trade.initiator;
  const myOffer = isInitiator
    ? trade.initiatorOffer
    : trade.counterpartyOffer;
  const otherOffer = isInitiator
    ? trade.counterpartyOffer
    : trade.initiatorOffer;
  const myConfirmed =
    (isInitiator
      ? trade.initiatorConfirmedRevision
      : trade.counterpartyConfirmedRevision) === trade.revision;
  const otherConfirmed =
    (isInitiator
      ? trade.counterpartyConfirmedRevision
      : trade.initiatorConfirmedRevision) === trade.revision;

  return (
    <article className={styles.tradeCard}>
      <div className={styles.tradeCard__head}>
        <div>
          <span className={styles.eyebrow}>OPEN EXCHANGE · REV {trade.revision}</span>
          <strong>{other.characterCodename}</strong>
        </div>
        <span className={otherConfirmed ? styles.statusConfirmed : styles.status}>
          {otherConfirmed ? "상대 확정" : "상대 구성 중"}
        </span>
      </div>
      <div className={styles.exchangeBoard} aria-label="현재 양측 제안">
        <OfferManifest
          assets={assets}
          confirmed={myConfirmed}
          label="내 제안"
          offer={myOffer}
        />
        <span className={styles.exchangeBoard__mark} aria-hidden>
          ⇄
        </span>
        <OfferManifest
          assets={assets}
          confirmed={otherConfirmed}
          label={`${other.characterCodename} 제안`}
          offer={otherOffer}
        />
      </div>
      {isEditing ? (
        <div id={`trade-editor-${trade.id}`} className={styles.tradeEditor}>
          <p className={styles.tradeCard__guide}>
            제안을 저장하면 revision이 갱신되어 양측의 확정이 다시
            필요합니다.
          </p>
          <OfferEditor
            key={`${trade.id}:${trade.revision}`}
            assets={assets}
            busy={busy}
            initialOffer={myOffer}
            submitLabel="내 제안 저장"
            onSubmit={(offer) =>
              onUpdate(trade.id, {
                action: "SET_OFFER",
                expectedRevision: trade.revision,
                offer,
              })
            }
          />
        </div>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          aria-controls={`trade-editor-${trade.id}`}
          aria-expanded={isEditing}
          disabled={busy}
          onClick={() => setIsEditing((current) => !current)}
        >
          {isEditing ? "편집 닫기" : "내 제안 편집"}
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy || myConfirmed}
          onClick={() =>
            onUpdate(trade.id, {
              action: "CONFIRM",
              expectedRevision: trade.revision,
            })
          }
        >
          {myConfirmed ? "확정 완료" : "이 구성으로 확정"}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy}
          onClick={() =>
            onUpdate(trade.id, {
              action: "CANCEL",
              expectedRevision: trade.revision,
            })
          }
        >
          거래 취소
        </button>
      </div>
      {errorMessage ? (
        <p className={styles.error}>{errorMessage}</p>
      ) : null}
    </article>
  );
}

export default function TradesClient() {
  const query = useTradesQuery();
  const createMutation = useCreateTradeMutation();
  const updateMutation = useUpdateTradeMutation();
  const createLockedRef = useRef(false);
  const createIntentRef = useRef<{
    fingerprint: string;
    variables: {
      kind: "GIFT" | "EXCHANGE";
      targetUserId: string;
      offer: PlayerTradeOffer;
    };
  } | null>(null);
  const [kind, setKind] = useState<"GIFT" | "EXCHANGE">("EXCHANGE");
  const [targetUserId, setTargetUserId] = useState("");
  const [editorVersion, setEditorVersion] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const openTrades = useMemo(
    () =>
      query.data?.trades.filter((trade) => trade.status === "OPEN") ?? [],
    [query.data?.trades],
  );
  const history = useMemo(
    () =>
      query.data?.trades.filter((trade) => trade.status !== "OPEN") ?? [],
    [query.data?.trades],
  );

  useEffect(() => {
    if (!feedback) return;
    const timeoutId = window.setTimeout(() => setFeedback(null), 3_000);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  function updateTrade(tradeId: string, action: TradeAction) {
    updateMutation.mutate(
      { tradeId, action },
      {
        onSuccess: (response) => {
          if (action.action === "SET_OFFER") {
            setFeedback("내 교환 제안을 저장했습니다.");
            return;
          }
          if (action.action === "CANCEL") {
            setFeedback("교환을 취소했습니다.");
            return;
          }
          setFeedback(
            response.completed
              ? "자산 교환이 완료되었습니다."
              : "교환을 확정했습니다. 상대 확정을 기다립니다.",
          );
        },
      },
    );
  }

  if (query.isPending) {
    return <div className={styles.state}>거래 정보를 불러오는 중입니다…</div>;
  }
  if (query.isError) {
    return <div className={styles.stateError}>{query.error.message}</div>;
  }
  const data = query.data;
  if (!data.me) {
    return (
      <div className={styles.state}>
        ACTIVE 계정에 연결된 MAIN AGENT 캐릭터가 있어야 거래할 수 있습니다.
      </div>
    );
  }
  const me = data.me;

  return (
    <div className={styles.layout}>
      {feedback ? (
        <div
          className={styles.toastOverlay}
          role="status"
          aria-live="polite"
        >
          <div className={styles.toast}>
            <IconSuccess className={styles.toast__icon} aria-hidden />
            <div className={styles.toast__body}>{feedback}</div>
            <button
              type="button"
              className={styles.toast__dismiss}
              onClick={() => setFeedback(null)}
              aria-label="알림 닫기"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panel__head}>
          <div>
            <span className={styles.eyebrow}>PLAYER ASSET TRANSFER</span>
            <h2>새 거래 작성</h2>
          </div>
          <p className={styles.muted}>거래 방식, 상대, 전송 구성을 순서대로 지정합니다.</p>
        </div>
        <div className={styles.createSteps}>
          <section className={styles.createStep} aria-labelledby="trade-kind-label">
            <div className={styles.createStep__head}>
              <span>01</span><strong id="trade-kind-label">거래 방식</strong>
            </div>
            <div
              className={styles.modeTabs}
              role="group"
              aria-labelledby="trade-kind-label"
            >
          <button
            type="button"
            className={kind === "EXCHANGE" ? styles.modeActive : styles.mode}
            onClick={() => setKind("EXCHANGE")}
            aria-pressed={kind === "EXCHANGE"}
          >
            <span>교환</span><small>양측 확정 후 체결</small>
          </button>
          <button
            type="button"
            className={kind === "GIFT" ? styles.modeActive : styles.mode}
            onClick={() => setKind("GIFT")}
            aria-pressed={kind === "GIFT"}
          >
            <span>즉시 전달</span><small>상대 승인 없이 완료</small>
          </button>
            </div>
          </section>
          <section className={styles.createStep} aria-labelledby="counterparty-label">
            <div className={styles.createStep__head}>
              <span>02</span><strong id="counterparty-label">거래 상대</strong>
            </div>
        <label className={styles.field}>
          <span className={styles.srOnly}>거래 상대 선택</span>
          <select
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
          >
            <option value="">상대를 선택하세요</option>
            {data.counterparties.map((candidate) => (
              <option key={candidate.userId} value={candidate.userId}>
                {candidate.characterCodename} · {candidate.displayName}
              </option>
            ))}
          </select>
        </label>
          </section>
          <section className={styles.createStep} aria-labelledby="asset-compose-label">
            <div className={styles.createStep__head}>
              <span>03</span><strong id="asset-compose-label">자산 구성</strong>
            </div>
        <OfferEditor
          key={`new-trade:${editorVersion}`}
          assets={data.assets}
          busy={createMutation.isPending}
          kind={kind}
          requireAssets
          submitDisabled={!targetUserId}
          submitLabel={kind === "GIFT" ? "즉시 전달" : "교환방 만들기"}
          onSubmit={(offer) => {
            if (!targetUserId || createLockedRef.current) return;
            if (
              kind === "GIFT" &&
              !window.confirm(
                "즉시 전달은 상대의 수락 없이 바로 완료되며 취소할 수 없습니다. 전달하시겠습니까?",
              )
            ) {
              return;
            }
            createLockedRef.current = true;
            const candidate = { kind, targetUserId, offer };
            const fingerprint = JSON.stringify(candidate);
            const variables =
              createIntentRef.current?.fingerprint === fingerprint
                ? createIntentRef.current.variables
                : candidate;
            createIntentRef.current = { fingerprint, variables };
            createMutation.mutate(
              variables,
              {
                onSuccess: (response) => {
                  createIntentRef.current = null;
                  setTargetUserId("");
                  setEditorVersion((current) => current + 1);
                  setFeedback(
                    response.trade.kind === "GIFT"
                      ? "자산 전달이 완료되었습니다."
                      : "교환방을 만들었습니다.",
                  );
                },
                onSettled: () => {
                  createLockedRef.current = false;
                },
              },
            );
          }}
        />
          </section>
        </div>
        {!targetUserId ? (
          <p className={styles.hint}>전송을 시작하려면 거래 상대를 먼저 선택해주세요.</p>
        ) : null}
        {createMutation.error ? (
          <p className={styles.error}>{createMutation.error.message}</p>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panel__head}>
          <div>
            <span className={styles.eyebrow}>PENDING NEGOTIATIONS</span>
            <h2>진행 중인 교환</h2>
          </div>
          <span className={styles.countBadge}>{openTrades.length}건</span>
        </div>
        {openTrades.length === 0 ? (
          <p className={styles.empty}>진행 중인 교환이 없습니다.</p>
        ) : (
          <div className={styles.tradeList}>
            {openTrades.map((trade) => (
              <TradeCard
                key={trade.id}
                assets={data.assets}
                busy={updateMutation.isPending}
                errorMessage={
                  updateMutation.variables?.tradeId === trade.id
                    ? updateMutation.error?.message
                    : undefined
                }
                meUserId={me.userId}
                onUpdate={updateTrade}
                trade={trade}
              />
            ))}
          </div>
        )}
      </section>

      <section className={`${styles.panel} ${styles.history}`}>
        <div className={styles.panel__head}>
          <div>
            <span className={styles.eyebrow}>TRANSFER ARCHIVE</span>
            <h2>거래 이력</h2>
          </div>
          <span className={styles.countBadge}>{history.length}건</span>
        </div>
        {history.length === 0 ? (
          <p className={styles.empty}>완료되거나 취소된 거래가 없습니다.</p>
        ) : (
          <div className={styles.historyList}>
            {history.map((trade) => {
              const isInitiator =
                trade.initiator.userId === me.userId;
              const other = isInitiator
                ? trade.counterparty
                : trade.initiator;
              return (
                <article key={trade.id} className={styles.historyRow}>
                  <div>
                    <span className={styles.eyebrow}>
                      {trade.kind === "GIFT" ? "INSTANT TRANSFER" : "EXCHANGE"}
                    </span>
                    <strong>{other.characterCodename}</strong>
                  </div>
                  <div className={styles.historyRow__offer}>
                    {summarizeOffer(
                      isInitiator
                        ? trade.initiatorOffer
                        : trade.counterpartyOffer,
                    )}
                  </div>
                  <span className={trade.status === "COMPLETED" ? styles.statusConfirmed : styles.status}>
                    {trade.status === "COMPLETED" ? "완료" : "취소"}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
