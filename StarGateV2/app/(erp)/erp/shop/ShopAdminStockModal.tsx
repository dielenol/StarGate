"use client";

import { useEffect, useId, useRef, useState } from "react";

import ShopItemIcon from "./ShopItemIcon";

import styles from "./ShopAdminStock.module.css";

/**
 * GM 전용 편의점 재고 직접 조정 모달.
 *
 * - GET /api/erp/shop/admin/stock 으로 12종 현재 재고 조회.
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
}

interface Props {
  onClose: () => void;
  /** 저장 완료 후 부모(ShopClient) 가 catalog query 를 invalidate 하도록 트리거. */
  onSaved?: () => void;
}

export default function ShopAdminStockModal({ onClose, onSaved }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<AdminStockItem[]>([]);
  const [editing, setEditing] = useState<Record<string, number>>({});
  const [today, setToday] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ESC 닫기. saving 중이면 무시. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

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

  const dirtyCount = items.filter(
    (item) => valueOf(item) !== item.currentStock,
  ).length;

  return (
    <div
      className={styles.overlay}
      onClick={() => {
        if (!saving) onClose();
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
            disabled={saving}
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
                    <tr
                      key={item.slug}
                      className={dirty ? styles.rowDirty : undefined}
                    >
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
                          onChange={(e) => setStock(item.slug, e.target.value)}
                          disabled={saving}
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
                            disabled={saving}
                            className={styles.resetBtn}
                          >
                            되돌리기
                          </button>
                        ) : null}
                      </td>
                    </tr>
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
              disabled={saving}
              className={styles.btnGhost}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || dirtyCount === 0}
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
