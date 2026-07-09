"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";

import ShopItemIcon from "./ShopItemIcon";

import styles from "./ShopAdminStock.module.css";

/**
 * GM 전용 편의점 재고 직접 조정 모달.
 *
 * - GET /api/erp/shop/admin/stock 으로 전체 품목 현재 재고 조회.
 * - 각 row 에 stock 입력 → "저장" 클릭 시 변경된 row 만 PATCH.
 * - lastRefresh stale 표시 (오늘이 아니면 "stale" 뱃지).
 *
 * 호출자: ShopClient (PageHead right 의 GM 전용 버튼).
 */

interface AdminStockItem {
  slug: string;
  name: string;
  icon: string;
  stockMin: number;
  stockMax: number;
  appearRate: number;
  currentStock: number;
  lastRefresh: string | null;
  isStaleToday: boolean;
  pendingReorders: AdminReorderRequest[];
}

interface AdminReorderRequest {
  id: string;
  date: string;
  userName: string;
  characterCodename: string | null;
  createdAt: string;
  defaultQuantity: number;
}

interface FulfillReorderResponse {
  stock: number;
  lastRefresh: string;
  message: string;
}

interface Props {
  onClose: () => void;
  /** 저장 완료 후 부모(ShopClient) 가 catalog query 를 invalidate 하도록 트리거. */
  onSaved?: () => void;
  onPendingCountChange?: (count: number) => void;
}

function countPendingReorders(items: AdminStockItem[]): number {
  return items.reduce((sum, item) => sum + item.pendingReorders.length, 0);
}

export default function ShopAdminStockModal({
  onClose,
  onSaved,
  onPendingCountChange,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<AdminStockItem[]>([]);
  const [editing, setEditing] = useState<Record<string, number>>({});
  const [fulfillQuantityById, setFulfillQuantityById] = useState<
    Record<string, number>
  >({});
  const [today, setToday] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fulfillingRequestId, setFulfillingRequestId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const busy = saving || fulfillingRequestId !== null;

  /* ESC 닫기. saving 중이면 무시. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (!loading) {
      onPendingCountChange?.(countPendingReorders(items));
    }
  }, [items, loading, onPendingCountChange]);

  /* 초기 데이터 fetch. */
  useEffect(() => {
    let canceled = false;
    setLoading(true);
    fetch("/api/erp/shop/admin/stock")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "재고 조회 실패");
        return data;
      })
      .then((data: { items: AdminStockItem[]; today: string }) => {
        if (canceled) return;
        setItems(data.items);
        setToday(data.today);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "재고 조회 실패");
        setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, []);

  function setStock(slug: string, raw: string): void {
    const n = Number.parseInt(raw, 10);
    setEditing((prev) => ({
      ...prev,
      [slug]: Number.isFinite(n) && n >= 0 ? n : 0,
    }));
  }

  function valueOf(item: AdminStockItem): number {
    return editing[item.slug] ?? item.currentStock;
  }

  function fulfillQuantityOf(reorder: AdminReorderRequest): number {
    return fulfillQuantityById[reorder.id] ?? reorder.defaultQuantity;
  }

  function setFulfillQuantity(requestId: string, raw: string): void {
    const n = Number.parseInt(raw, 10);
    setFulfillQuantityById((prev) => ({
      ...prev,
      [requestId]: Number.isFinite(n) && n > 0 ? n : 1,
    }));
  }

  function formatRequestedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    const dirty = items.filter((item) => valueOf(item) !== item.currentStock);
    try {
      for (const item of dirty) {
        const res = await fetch("/api/erp/shop/admin/stock", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.slug, stock: valueOf(item) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `저장 실패: ${item.slug}`);
      }
      setSaving(false);
      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "저장 실패");
      setSaving(false);
    }
  }

  function handleResetRow(slug: string): void {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  }

  async function handleFulfillReorder(
    item: AdminStockItem,
    reorder: AdminReorderRequest,
  ): Promise<void> {
    const quantity = fulfillQuantityOf(reorder);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("입고 수량은 1 이상의 정수여야 합니다.");
      return;
    }

    setFulfillingRequestId(reorder.id);
    setError(null);
    try {
      const res = await fetch("/api/erp/shop/admin/reorder-requests/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: reorder.id, quantity }),
      });
      const data = (await res.json()) as Partial<FulfillReorderResponse> & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "발주 완료 처리 실패");
      }

      setItems((prev) =>
        prev.map((stockItem) =>
          stockItem.slug === item.slug
            ? {
                ...stockItem,
                currentStock: data.stock ?? stockItem.currentStock,
                lastRefresh: data.lastRefresh ?? stockItem.lastRefresh,
                isStaleToday: false,
                pendingReorders: stockItem.pendingReorders.filter(
                  (pending) => pending.id !== reorder.id,
                ),
              }
            : stockItem,
        ),
      );
      setEditing((prev) => {
        const next = { ...prev };
        delete next[item.slug];
        return next;
      });
      setFulfillQuantityById((prev) => {
        const next = { ...prev };
        delete next[reorder.id];
        return next;
      });
      if (onSaved) onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "발주 완료 처리 실패");
    } finally {
      setFulfillingRequestId(null);
    }
  }

  const dirtyCount = items.filter(
    (item) => valueOf(item) !== item.currentStock,
  ).length;

  return (
    <div
      className={styles.overlay}
      onClick={() => {
        if (!busy) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id={titleId} className={styles.title}>
              재고 관리 · GM
            </h2>
            <div className={styles.subtitle}>
              KST 기준 오늘: <code>{today ?? "—"}</code>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}

        {loading ? (
          <div className={styles.loading}>로딩 중...</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup>
                <col className={styles.colItem} />
                <col className={styles.colCurrent} />
                <col className={styles.colInput} />
                <col className={styles.colRange} />
                <col className={styles.colRate} />
                <col className={styles.colRefresh} />
                <col className={styles.colAction} />
              </colgroup>
              <thead>
                <tr>
                  <th>아이템</th>
                  <th>현재</th>
                  <th>입력</th>
                  <th>룰 min~max</th>
                  <th>등장률</th>
                  <th>리프레시</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const v = valueOf(item);
                  const dirty = v !== item.currentStock;
                  return (
                    <Fragment key={item.slug}>
                      <tr className={dirty ? styles.rowDirty : undefined}>
                        <td className={styles.cellName}>
                          <div className={styles.itemCell}>
                            <span className={styles.icon} aria-hidden>
                              <ShopItemIcon slug={item.slug} size={20} />
                            </span>
                            <span className={styles.itemName}>{item.name}</span>
                            <code className={styles.slug}>{item.slug}</code>
                          </div>
                        </td>
                        <td className={styles.cellNum}>{item.currentStock}</td>
                        <td className={styles.cellInput}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={v}
                            onChange={(e) =>
                              setStock(item.slug, e.target.value)
                            }
                            disabled={busy}
                            className={styles.input}
                          />
                        </td>
                        <td className={styles.cellNum}>
                          {item.stockMin}~{item.stockMax}
                        </td>
                        <td className={styles.cellNum}>
                          {Math.round(item.appearRate * 100)}%
                        </td>
                        <td className={styles.cellRefresh}>
                          {item.lastRefresh ?? "—"}
                          {item.isStaleToday ? (
                            <span className={styles.staleTag}>stale</span>
                          ) : null}
                        </td>
                        <td>
                          {dirty ? (
                            <button
                              type="button"
                              onClick={() => handleResetRow(item.slug)}
                              disabled={busy}
                              className={styles.resetBtn}
                            >
                              되돌리기
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {item.pendingReorders.length > 0 ? (
                        <tr className={styles.reorderRow}>
                          <td colSpan={7}>
                            <div className={styles.reorderPanel}>
                              <div className={styles.reorderPanel__head}>
                                <strong>
                                  대기 발주 {item.pendingReorders.length}건
                                </strong>
                                <span>
                                  기본 수량은 카탈로그 최대 입고량입니다.
                                </span>
                              </div>
                              <div className={styles.reorderList}>
                                {item.pendingReorders.map((reorder) => {
                                  const quantity = fulfillQuantityOf(reorder);
                                  const fulfilling =
                                    fulfillingRequestId === reorder.id;
                                  return (
                                    <div
                                      key={reorder.id}
                                      className={styles.reorderRequest}
                                    >
                                      <div
                                        className={
                                          styles.reorderRequest__meta
                                        }
                                      >
                                        <strong>
                                          {reorder.characterCodename
                                            ? `${reorder.characterCodename} · ${reorder.userName}`
                                            : reorder.userName}
                                        </strong>
                                        <span>
                                          {reorder.date} ·{" "}
                                          {formatRequestedAt(
                                            reorder.createdAt,
                                          )}{" "}
                                          요청
                                        </span>
                                      </div>
                                      <label
                                        className={styles.reorderRequest__qty}
                                      >
                                        <span>입고 수량</span>
                                        <input
                                          type="number"
                                          min={1}
                                          max={999}
                                          step={1}
                                          value={quantity}
                                          onChange={(e) =>
                                            setFulfillQuantity(
                                              reorder.id,
                                              e.target.value,
                                            )
                                          }
                                          disabled={busy}
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        className={styles.reorderFulfillBtn}
                                        onClick={() =>
                                          handleFulfillReorder(item, reorder)
                                        }
                                        disabled={busy}
                                      >
                                        {fulfilling
                                          ? "처리 중..."
                                          : "입고 처리"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer className={styles.footer}>
          <span className={styles.dirtyCount}>
            {dirtyCount > 0 ? `${dirtyCount}건 변경` : "변경 없음"}
          </span>
          <div className={styles.footerBtns}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={styles.btnGhost}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || loading || dirtyCount === 0}
              className={styles.btnPrimary}
            >
              {saving ? "저장 중..." : `저장 ${dirtyCount > 0 ? `(${dirtyCount})` : ""}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
