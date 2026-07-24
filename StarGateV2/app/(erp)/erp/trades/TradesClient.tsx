"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

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
const CATEGORY_LABEL: Record<ItemCategory, string> = {
  WEAPON: "무기",
  ARMOR: "방어구",
  CONSUMABLE: "소모품",
  MATERIAL: "샘플",
  SPECIAL: "특수",
};

interface OfferEditorProps {
  assets: PlayerTradeAssets;
  busy: boolean;
  initialOffer?: PlayerTradeOffer;
  onSubmit: (offer: PlayerTradeOffer) => void;
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

function OfferEditor({
  assets,
  busy,
  initialOffer = EMPTY_OFFER,
  onSubmit,
  submitLabel,
}: OfferEditorProps) {
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
      <label className={styles.field}>
        <span>크레딧 · 보유 {assets.credits.toLocaleString()} CR</span>
        <input
          type="number"
          min={0}
          max={assets.credits}
          step="any"
          inputMode="decimal"
          placeholder="0"
          value={credits}
          onChange={(event) =>
            setCredits(normalizeCreditInput(event.target.value))
          }
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            setCredits((current) =>
              stepCreditInput(
                current,
                event.key === "ArrowUp" ? 1 : -1,
                assets.credits,
              ),
            );
          }}
        />
      </label>

      <div className={styles.assetGroup}>
        <strong>아이템·장비</strong>
        {assets.items.length === 0 ? (
          <p className={styles.muted}>
            거래 가능한 미장착 개인 아이템이 없습니다.
          </p>
        ) : (
          <div className={styles.assetGrid}>
            {assets.items.map((item) => {
              const tone = categoryTone(item.category);
              const detail = item.effect ?? item.description;
              return (
                <article
                  key={item.itemId}
                  className={[
                    styles.assetCard,
                    styles[`assetCard--${tone}`],
                  ].join(" ")}
                >
                  <div className={styles.assetCard__art} aria-hidden>
                    <TradeItemVisual
                      key={`${item.itemId}:${item.slug ?? ""}:${item.previewImage ?? ""}`}
                      category={item.category}
                      slug={item.slug}
                      previewImage={item.previewImage}
                    />
                  </div>
                  <div className={styles.assetCard__body}>
                    <div className={styles.assetCard__topline}>
                      <strong>{item.itemName}</strong>
                      <span>x {item.quantity.toLocaleString()}</span>
                    </div>
                    <span
                      className={[
                        styles.categoryPill,
                        styles[`categoryPill--${tone}`],
                      ].join(" ")}
                    >
                      {categoryLabel(item.category)}
                    </span>
                    {detail ? (
                      <p className={styles.assetCard__detail}>{detail}</p>
                    ) : null}
                    <label className={styles.assetQuantity}>
                      <span>전달 수량</span>
                      <input
                        aria-label={`${item.itemName} 수량`}
                        type="number"
                        min={0}
                        max={item.quantity}
                        step={1}
                        value={itemQuantities[item.itemId] ?? 0}
                        onChange={(event) =>
                          setItemQuantities((current) => ({
                            ...current,
                            [item.itemId]: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.assetGroup}>
        <strong>주식</strong>
        {assets.stocks.length === 0 ? (
          <p className={styles.muted}>보유 주식이 없습니다.</p>
        ) : (
          assets.stocks.map((stock) => (
            <label key={stock.ticker} className={styles.assetRow}>
              <span>
                {stock.name} ({stock.ticker}) · 보유 {stock.shares}주
              </span>
              <input
                aria-label={`${stock.ticker} 주식 수량`}
                type="number"
                min={0}
                max={stock.shares}
                value={stockShares[stock.ticker] ?? 0}
                onChange={(event) =>
                  setStockShares((current) => ({
                    ...current,
                    [stock.ticker]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))
        )}
      </div>

      <button
        type="button"
        className={styles.primaryButton}
        disabled={busy}
        onClick={submit}
      >
        {busy ? "처리 중…" : submitLabel}
      </button>
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
  const isInitiator = trade.initiator.userId === meUserId;
  const me = isInitiator ? trade.initiator : trade.counterparty;
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
          <strong>{other.characterCodename}</strong>
          <span> · revision {trade.revision}</span>
        </div>
        <span className={styles.status}>
          {otherConfirmed ? "상대 확정" : "상대 구성 중"}
        </span>
      </div>
      <div className={styles.offerSummary}>
        <p>
          <strong>{me.characterCodename}</strong> — {summarizeOffer(myOffer)}
        </p>
        <p>
          <strong>{other.characterCodename}</strong> —{" "}
          {summarizeOffer(otherOffer)}
        </p>
      </div>
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
      <div className={styles.actions}>
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
        <h2>새 거래</h2>
        <p className={styles.muted}>
          즉시 전달은 상대 승인 없이 바로 이동합니다. 교환방은 같은 revision을
          양쪽이 확정해야 체결됩니다.
        </p>
        <div className={styles.modeTabs}>
          <button
            type="button"
            className={kind === "EXCHANGE" ? styles.modeActive : styles.mode}
            onClick={() => setKind("EXCHANGE")}
          >
            교환방
          </button>
          <button
            type="button"
            className={kind === "GIFT" ? styles.modeActive : styles.mode}
            onClick={() => setKind("GIFT")}
          >
            즉시 전달
          </button>
        </div>
        <label className={styles.field}>
          <span>거래 상대</span>
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
        <OfferEditor
          key={`new-trade:${editorVersion}`}
          assets={data.assets}
          busy={createMutation.isPending || !targetUserId}
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
        {!targetUserId ? (
          <p className={styles.hint}>먼저 거래 상대를 선택해주세요.</p>
        ) : null}
        {createMutation.error ? (
          <p className={styles.error}>{createMutation.error.message}</p>
        ) : null}
      </section>

      <section className={styles.panel}>
        <h2>진행 중인 교환</h2>
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
        <h2>거래 이력</h2>
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
                    <strong>
                      {trade.kind === "GIFT" ? "즉시 전달" : "교환"}
                    </strong>
                    <span> · {other.characterCodename}</span>
                  </div>
                  <div>
                    {summarizeOffer(
                      isInitiator
                        ? trade.initiatorOffer
                        : trade.counterpartyOffer,
                    )}
                  </div>
                  <span className={styles.status}>
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
