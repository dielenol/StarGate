"use client";

import { useEffect, useState } from "react";

import type {
  CreditTransactionFilter,
  CreditTransactionPage,
} from "@/types/credit-admin";
import type { CreditTransactionType } from "@/types/credit";

import { CREDIT_TRANSACTION_TYPES } from "@/types/credit";

import { useCreditLog } from "@/hooks/queries/useCreditsAdminQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Select from "@/components/ui/Select/Select";
import Tag from "@/components/ui/Tag/Tag";

import { CREDIT_TYPE_META } from "@/lib/credit-meta";
import { formatDateTime } from "@/lib/format/date";

import styles from "./page.module.css";

/* ── 타입 ── */

interface Props {
  initialData: CreditTransactionPage;
  filter: CreditTransactionFilter;
  onFilterChange: (next: CreditTransactionFilter) => void;
}

const LIMIT_OPTIONS = [50, 100, 200] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];

/* ── 로컬 폼 상태 ── */

interface LocalFilterState {
  types: Set<CreditTransactionType>;
  ownerId: string;
  characterId: string;
  from: string;
  to: string;
  amountMin: string;
  amountMax: string;
  limit: LimitOption;
}

function filterToLocal(filter: CreditTransactionFilter): LocalFilterState {
  return {
    types: new Set(filter.types ?? []),
    ownerId: filter.ownerId ?? "",
    characterId: filter.characterId ?? "",
    from: filter.from ? toDateInput(filter.from) : "",
    to: filter.to ? toDateInput(filter.to) : "",
    amountMin: filter.amountMin?.toString() ?? "",
    amountMax: filter.amountMax?.toString() ?? "",
    limit: ((filter.limit ?? 50) as LimitOption) ?? 50,
  };
}

/** ISO datetime 문자열 → input[type="date"] 의 yyyy-mm-dd. */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ── 컴포넌트 ── */

export default function CreditLogTable({
  initialData,
  filter,
  onFilterChange,
}: Props) {
  const { data } = useCreditLog(filter, { initialData });

  const [local, setLocal] = useState<LocalFilterState>(() =>
    filterToLocal(filter),
  );

  // 외부에서 filter 가 바뀌면(예: 초기화 버튼) local 상태도 동기화.
  useEffect(() => {
    setLocal(filterToLocal(filter));
  }, [filter]);

  const page = data ?? initialData;
  const limit = page.limit ?? 50;
  const skip = page.skip ?? 0;
  const totalPages = Math.max(1, Math.ceil(page.total / limit));
  const currentPage = Math.floor(skip / limit) + 1;

  function handleToggleType(t: CreditTransactionType) {
    setLocal((prev) => {
      const next = new Set(prev.types);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return { ...prev, types: next };
    });
  }

  function handleApply() {
    const next: CreditTransactionFilter = {
      types: local.types.size > 0 ? Array.from(local.types) : undefined,
      ownerId: local.ownerId.trim() || undefined,
      characterId: local.characterId.trim() || undefined,
      // input[type="date"] 의 "yyyy-mm-dd" 를 new Date() 로 직접 파싱하면 UTC 자정으로
      // 해석되어 KST(+9) 사용자가 "5/10 부터" 입력 시 실제로는 5/10 09:00(KST) 부터
      // 필터링 — 일자별 audit 누락. T 시각을 명시해 로컬 자정 기준으로 강제.
      from: local.from
        ? new Date(`${local.from}T00:00:00`).toISOString()
        : undefined,
      // 백엔드는 lt(to) — to 는 다음 날 자정 직전이 inclusive. 입력 day 까지 포함하려면
      // 다음 날 00:00 으로 보내거나 23:59:59.999 로 보내야 함. 후자가 직관적.
      to: local.to
        ? new Date(`${local.to}T23:59:59.999`).toISOString()
        : undefined,
      amountMin:
        local.amountMin.trim() === ""
          ? undefined
          : Number(local.amountMin),
      amountMax:
        local.amountMax.trim() === ""
          ? undefined
          : Number(local.amountMax),
      limit: local.limit,
      skip: 0,
    };
    onFilterChange(next);
  }

  function handleReset() {
    onFilterChange({ limit: 50, skip: 0 });
  }

  function handlePrev() {
    if (skip === 0) return;
    onFilterChange({ ...filter, skip: Math.max(0, skip - limit) });
  }

  function handleNext() {
    if (!page.hasMore) return;
    onFilterChange({ ...filter, skip: skip + limit });
  }

  return (
    <Box>
      <PanelTitle
        right={<span className={styles.credits__mono}>{page.total} 건</span>}
      >
        TRANSACTION LOG
      </PanelTitle>

      {/* 필터 */}
      <div className={styles.credits__filterField}>
        <Eyebrow>유형 필터 (다중 선택)</Eyebrow>
        <div className={styles.credits__typesGroup}>
          {CREDIT_TRANSACTION_TYPES.map((t) => {
            const active = local.types.has(t);
            const meta = CREDIT_TYPE_META[t];
            return (
              <label
                key={t}
                className={`${styles.credits__typeChk} ${
                  active ? styles.credits__typeChkActive : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => handleToggleType(t)}
                />
                {meta.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className={styles.credits__filtersRow}>
        <label className={styles.credits__filterField}>
          <Eyebrow>Owner ID</Eyebrow>
          <Input
            type="text"
            value={local.ownerId}
            onChange={(e) =>
              setLocal((p) => ({ ...p, ownerId: e.target.value }))
            }
            placeholder="ObjectId hex"
          />
        </label>
        <label className={styles.credits__filterField}>
          <Eyebrow>Character ID</Eyebrow>
          <Input
            type="text"
            value={local.characterId}
            onChange={(e) =>
              setLocal((p) => ({ ...p, characterId: e.target.value }))
            }
            placeholder="ObjectId hex"
          />
        </label>
        <label className={styles.credits__filterField}>
          <Eyebrow>FROM</Eyebrow>
          <Input
            type="date"
            value={local.from}
            onChange={(e) => setLocal((p) => ({ ...p, from: e.target.value }))}
          />
        </label>
        <label className={styles.credits__filterField}>
          <Eyebrow>TO (미포함)</Eyebrow>
          <Input
            type="date"
            value={local.to}
            onChange={(e) => setLocal((p) => ({ ...p, to: e.target.value }))}
          />
        </label>
        <label className={styles.credits__filterField}>
          <Eyebrow>금액 ≥</Eyebrow>
          <Input
            type="number"
            value={local.amountMin}
            onChange={(e) =>
              setLocal((p) => ({ ...p, amountMin: e.target.value }))
            }
            placeholder="예: -100"
          />
        </label>
        <label className={styles.credits__filterField}>
          <Eyebrow>금액 ≤</Eyebrow>
          <Input
            type="number"
            value={local.amountMax}
            onChange={(e) =>
              setLocal((p) => ({ ...p, amountMax: e.target.value }))
            }
            placeholder="예: 5000"
          />
        </label>
        <label className={styles.credits__filterField}>
          <Eyebrow>페이지 크기</Eyebrow>
          <Select
            value={local.limit}
            onChange={(e) =>
              setLocal((p) => ({
                ...p,
                limit: Number(e.target.value) as LimitOption,
              }))
            }
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} 건
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className={styles.credits__filterActions}>
        <Button variant="primary" size="sm" onClick={handleApply}>
          필터 적용
        </Button>
        <Button size="sm" onClick={handleReset}>
          초기화
        </Button>
      </div>

      {/* 테이블 */}
      {page.items.length === 0 ? (
        <div className={styles.credits__empty}>조건에 맞는 트랜잭션이 없습니다.</div>
      ) : (
        <div className={styles.credits__tableWrap}>
          <table className={styles.credits__table}>
            <thead>
              <tr>
                <th>유형</th>
                <th>캐릭터</th>
                <th>소유자</th>
                <th className={styles.credits__numCol}>금액</th>
                <th className={styles.credits__numCol}>잔액</th>
                <th>설명</th>
                <th>발급자</th>
                <th className={styles.credits__dateCol}>일시</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((tx) => {
                const meta = CREDIT_TYPE_META[tx.type];
                const positive = tx.amount >= 0;
                return (
                  <tr key={String(tx._id)}>
                    <td>
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                    </td>
                    <td className={styles.credits__strong}>
                      {tx.characterCodename}
                    </td>
                    <td>{tx.ownerName ?? "—"}</td>
                    <td className={styles.credits__numCol}>
                      <span
                        className={
                          positive
                            ? styles.credits__amountPos
                            : styles.credits__amountNeg
                        }
                      >
                        {positive ? "+" : ""}
                        {tx.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className={styles.credits__numCol}>
                      {tx.balance.toLocaleString()}
                    </td>
                    <td>{tx.description}</td>
                    <td>{tx.createdByName ?? "—"}</td>
                    <td className={styles.credits__dateCol}>
                      {formatDateTime(tx.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      <div className={styles.credits__paginationRow}>
        <span className={styles.credits__pageInfo}>
          {page.total === 0
            ? "0 건"
            : `${skip + 1} – ${skip + page.items.length} / ${page.total} 건`}
        </span>
        <div className={styles.credits__pageNav}>
          <button
            type="button"
            className={styles.credits__pageBtn}
            onClick={handlePrev}
            disabled={skip === 0}
          >
            ← 이전
          </button>
          <span className={styles.credits__pageInfo}>
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            className={styles.credits__pageBtn}
            onClick={handleNext}
            disabled={!page.hasMore}
          >
            다음 →
          </button>
        </div>
      </div>
    </Box>
  );
}
