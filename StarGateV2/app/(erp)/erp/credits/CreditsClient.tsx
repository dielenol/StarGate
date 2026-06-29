"use client";

import type { FocusEvent } from "react";
import { useMemo, useState } from "react";

import Link from "next/link";

import type { CreditTransactionType } from "@/types/credit";

import { CREDIT_TRANSACTION_TYPES } from "@/types/credit";

import {
  IconArrowLeft,
  IconArrowRight,
  IconCredit,
  IconInfo,
  IconNotes,
  IconStock,
  IconTimeline,
  IconTransactions,
  type IconComponent,
} from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import { CREDIT_TYPE_META } from "@/lib/credit-meta";
import { formatCredits } from "@/lib/format/credit";
import { formatDateTime } from "@/lib/format/date";

import styles from "./page.module.css";

export interface SerializedCreditTransaction {
  id: string;
  type: CreditTransactionType;
  amount: number;
  balance: number;
  characterCodename: string;
  ownerName: string;
  description: string;
  createdByName: string;
  createdAt: string;
}

interface CreditsClientProps {
  balance: number;
  character:
    | {
        id: string;
        codename: string;
        name: string;
      }
    | null;
  integrityError: string | null;
  isGm: boolean;
  transactions: SerializedCreditTransaction[];
}

type DirectionFilter = "ALL" | "IN" | "OUT";
type PeriodFilter = "ALL" | "30D" | "90D" | "MONTH";
type SortMode = "LATEST" | "AMOUNT_DESC" | "AMOUNT_ASC";
type DropdownOption<T extends string> = {
  value: T;
  label: string;
};

const TYPE_ALL = "ALL" as const;

const PERIOD_LABEL: Record<PeriodFilter, string> = {
  ALL: "전체 기간",
  "30D": "최근 30일",
  "90D": "최근 90일",
  MONTH: "이번 달",
};

const DIRECTION_LABEL: Record<DirectionFilter, string> = {
  ALL: "전체",
  IN: "입금",
  OUT: "출금",
};

const SORT_LABEL: Record<SortMode, string> = {
  LATEST: "최신순",
  AMOUNT_DESC: "금액 큰 순",
  AMOUNT_ASC: "금액 작은 순",
};


function formatSignedCredit(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString()}`;
}

function isInPeriod(createdAt: string, period: PeriodFilter): boolean {
  if (period === "ALL") return true;

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  if (period === "MONTH") {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }

  const days = period === "30D" ? 30 : 90;
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= since;
}

function getTypeLabel(type: CreditTransactionType): string {
  return CREDIT_TYPE_META[type]?.label ?? type;
}

const TYPE_OPTIONS: DropdownOption<
  CreditTransactionType | typeof TYPE_ALL
>[] = [
  { value: TYPE_ALL, label: "전체 유형" },
  ...CREDIT_TRANSACTION_TYPES.map((type) => ({
    value: type,
    label: getTypeLabel(type),
  })),
];

const DIRECTION_OPTIONS: DropdownOption<DirectionFilter>[] = [
  { value: "ALL", label: DIRECTION_LABEL.ALL },
  { value: "IN", label: DIRECTION_LABEL.IN },
  { value: "OUT", label: DIRECTION_LABEL.OUT },
];

const PERIOD_OPTIONS: DropdownOption<PeriodFilter>[] = [
  { value: "ALL", label: PERIOD_LABEL.ALL },
  { value: "30D", label: PERIOD_LABEL["30D"] },
  { value: "90D", label: PERIOD_LABEL["90D"] },
  { value: "MONTH", label: PERIOD_LABEL.MONTH },
];

const SORT_OPTIONS: DropdownOption<SortMode>[] = [
  { value: "LATEST", label: SORT_LABEL.LATEST },
  { value: "AMOUNT_DESC", label: SORT_LABEL.AMOUNT_DESC },
  { value: "AMOUNT_ASC", label: SORT_LABEL.AMOUNT_ASC },
];

function sumAmounts(rows: SerializedCreditTransaction[]): {
  income: number;
  spend: number;
  net: number;
} {
  let income = 0;
  let spend = 0;

  for (const row of rows) {
    if (row.amount >= 0) income += row.amount;
    else spend += Math.abs(row.amount);
  }

  return { income, spend, net: income - spend };
}

function buildMonthlyBuckets(rows: SerializedCreditTransaction[]) {
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: `${date.getMonth() + 1}월`,
      income: 0,
      spend: 0,
    };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const row of rows) {
    const date = new Date(row.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const bucket = byKey.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (!bucket) continue;
    if (row.amount >= 0) bucket.income += row.amount;
    else bucket.spend += Math.abs(row.amount);
  }

  const max = Math.max(
    1,
    ...buckets.map((bucket) => bucket.income + bucket.spend),
  );

  return { buckets, max };
}

function toCsv(rows: SerializedCreditTransaction[]): string {
  const header = [
    "일시",
    "유형",
    "캐릭터",
    "금액",
    "잔액",
    "설명",
    "처리자",
  ];
  const body = rows.map((row) =>
    [
      row.createdAt,
      getTypeLabel(row.type),
      row.characterCodename,
      row.amount,
      row.balance,
      row.description,
      row.createdByName,
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}

function PanelLabel({
  icon: Icon,
  children,
}: {
  icon: IconComponent;
  children: string;
}) {
  return (
    <span className={styles.panelLabel}>
      <Icon className={styles.panelIcon} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

interface FilterDropdownProps<T extends string> {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  value: T;
}

function FilterDropdown<T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocus = event.relatedTarget;
    if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) {
      return;
    }
    setOpen(false);
  }

  return (
    <div className={styles.dropdown} onBlur={handleBlur}>
      <button
        type="button"
        className={styles.dropdownButton}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? value}</span>
        <span className={styles.dropdownCaret} aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.dropdownMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                className={[
                  styles.dropdownOption,
                  active ? styles.dropdownOptionActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function CreditsClient({
  balance,
  character,
  integrityError,
  isGm,
  transactions,
}: CreditsClientProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    CreditTransactionType | typeof TYPE_ALL
  >(TYPE_ALL);
  const [direction, setDirection] = useState<DirectionFilter>("ALL");
  const [period, setPeriod] = useState<PeriodFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("LATEST");

  const totals = useMemo(() => sumAmounts(transactions), [transactions]);
  const monthRows = useMemo(
    () => transactions.filter((row) => isInPeriod(row.createdAt, "MONTH")),
    [transactions],
  );
  const monthTotals = useMemo(() => sumAmounts(monthRows), [monthRows]);
  const { buckets, max } = useMemo(
    () => buildMonthlyBuckets(transactions),
    [transactions],
  );

  const typeBreakdown = useMemo(() => {
    const entries = new Map<
      CreditTransactionType,
      { count: number; total: number }
    >();
    for (const row of transactions) {
      const prev = entries.get(row.type) ?? { count: 0, total: 0 };
      entries.set(row.type, {
        count: prev.count + 1,
        total: prev.total + row.amount,
      });
    }
    return Array.from(entries, ([type, value]) => ({ type, ...value }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .slice(0, 4);
  }, [transactions]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = transactions.filter((row) => {
      if (typeFilter !== TYPE_ALL && row.type !== typeFilter) return false;
      if (direction === "IN" && row.amount < 0) return false;
      if (direction === "OUT" && row.amount >= 0) return false;
      if (!isInPeriod(row.createdAt, period)) return false;
      if (!normalized) return true;

      const searchable = [
        row.characterCodename,
        row.ownerName,
        row.description,
        row.createdByName,
        row.type,
        getTypeLabel(row.type),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalized);
    });

    return [...rows].sort((a, b) => {
      if (sortMode === "AMOUNT_DESC") {
        return Math.abs(b.amount) - Math.abs(a.amount);
      }
      if (sortMode === "AMOUNT_ASC") {
        return Math.abs(a.amount) - Math.abs(b.amount);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [direction, period, query, sortMode, transactions, typeFilter]);

  const largestMovement = useMemo(() => {
    return transactions.reduce<SerializedCreditTransaction | null>(
      (current, row) => {
        if (!current) return row;
        return Math.abs(row.amount) > Math.abs(current.amount) ? row : current;
      },
      null,
    );
  }, [transactions]);

  function handleExport() {
    const blob = new Blob([`\uFEFF${toCsv(filtered)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `stargate-credits-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.credits} data-pixel-font="ui">
      {isGm ? (
        <Box className={styles.adminHintBox}>
          <div className={styles.adminHeading}>
            <IconInfo className={styles.adminIcon} aria-hidden />
            <Eyebrow>관리자 안내</Eyebrow>
          </div>
          <div className={styles.adminHint}>
            GM 발급 / 일괄 / 작전풀 운영은{" "}
            <Link href="/erp/admin/credits" className={styles.adminHintLink}>
              관리 · 크레딧 운영
            </Link>
            에서 처리합니다.
          </div>
        </Box>
      ) : null}

      <div className={styles.walletGrid}>
        <Box variant="gold" className={styles.balancePanel}>
          <PanelTitle right={<span className={styles.mono}>지갑</span>}>
            <PanelLabel icon={IconCredit}>현재 잔액</PanelLabel>
          </PanelTitle>
          <div className={styles.balanceValue}>{formatCredits(balance)}</div>
          <div className={styles.identityLine}>
            <span>
              {character
                ? `${character.codename} · ${character.name || "이름 미기록"}`
                : integrityError
                  ? "메인 캐릭터 정합성 위반"
                  : "메인 캐릭터 미등록"}
            </span>
          </div>
          {integrityError ? (
            <div className={styles.notice}>
              <strong>정합성 위반</strong>
              <span>{integrityError}</span>
            </div>
          ) : !character ? (
            <div className={styles.notice}>
              <strong>크레딧 지갑 대기 중</strong>
              <span>
                메인 캐릭터가 없어 크레딧이 0으로 표시됩니다.
              </span>
            </div>
          ) : null}
        </Box>

        <Box className={styles.flowPanel}>
          <PanelTitle right={<span className={styles.mono}>최근 6개월</span>}>
            <PanelLabel icon={IconTimeline}>월별 입출금 흐름</PanelLabel>
          </PanelTitle>
          <div className={styles.flowChart}>
            {buckets.map((bucket) => {
              const incomeRatio = Math.round((bucket.income / max) * 100);
              const spendRatio = Math.round((bucket.spend / max) * 100);
              return (
                <div key={bucket.key} className={styles.flowRow}>
                  <span className={styles.flowLabel}>{bucket.label}</span>
                  <div className={styles.flowBars}>
                    <span
                      className={styles.flowBarIn}
                      style={{ width: `${incomeRatio}%` }}
                    />
                    <span
                      className={styles.flowBarOut}
                      style={{ width: `${spendRatio}%` }}
                    />
                  </div>
                  <span className={styles.flowTotal}>
                    {formatSignedCredit(bucket.income - bucket.spend)}
                  </span>
                </div>
              );
            })}
          </div>
        </Box>
      </div>

      <div className={styles.kpiGrid}>
        <Box>
          <PanelTitle>
            <PanelLabel icon={IconTimeline}>이번 달 순변동</PanelLabel>
          </PanelTitle>
          <div
            className={
              monthTotals.net >= 0 ? styles.metricValue : styles.metricValueNeg
            }
          >
            {formatSignedCredit(monthTotals.net)}
          </div>
          <Eyebrow>
            +{monthTotals.income.toLocaleString()} / -
            {monthTotals.spend.toLocaleString()}
          </Eyebrow>
        </Box>
        <Box>
          <PanelTitle>
            <PanelLabel icon={IconArrowRight}>총 입금</PanelLabel>
          </PanelTitle>
          <div className={styles.metricValue}>
            +{totals.income.toLocaleString()}
          </div>
          <Eyebrow>{transactions.filter((row) => row.amount >= 0).length}건</Eyebrow>
        </Box>
        <Box>
          <PanelTitle>
            <PanelLabel icon={IconArrowLeft}>총 출금</PanelLabel>
          </PanelTitle>
          <div className={styles.metricValueNeg}>
            -{totals.spend.toLocaleString()}
          </div>
          <Eyebrow>{transactions.filter((row) => row.amount < 0).length}건</Eyebrow>
        </Box>
        <Box>
          <PanelTitle>
            <PanelLabel icon={IconStock}>가장 큰 변동</PanelLabel>
          </PanelTitle>
          <div
            className={
              !largestMovement || largestMovement.amount >= 0
                ? styles.metricValue
                : styles.metricValueNeg
            }
          >
            {largestMovement
              ? formatSignedCredit(largestMovement.amount)
              : "0"}
          </div>
          <Eyebrow>
            {largestMovement ? getTypeLabel(largestMovement.type) : "기록 없음"}
          </Eyebrow>
        </Box>
      </div>

      <Box>
        <PanelTitle right={<span className={styles.mono}>요약</span>}>
          <PanelLabel icon={IconNotes}>거래 유형 요약</PanelLabel>
        </PanelTitle>
        {typeBreakdown.length === 0 ? (
          <div className={styles.empty}>집계할 거래 기록이 없습니다.</div>
        ) : (
          <div className={styles.breakdownGrid}>
            {typeBreakdown.map((entry) => {
              const meta = CREDIT_TYPE_META[entry.type];
              return (
                <div key={entry.type} className={styles.breakdownItem}>
                  <div className={styles.breakdownHead}>
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                    <span className={styles.mono}>{entry.count}건</span>
                  </div>
                  <strong
                    className={
                      entry.total >= 0
                        ? styles.breakdownAmount
                        : styles.breakdownAmountNeg
                    }
                  >
                    {formatSignedCredit(entry.total)}
                  </strong>
                </div>
              );
            })}
          </div>
        )}
      </Box>

      <Box>
        <PanelTitle right={<span className={styles.mono}>{filtered.length}건</span>}>
          <PanelLabel icon={IconTransactions}>거래 내역</PanelLabel>
        </PanelTitle>

        <div className={styles.controls}>
          <label className={styles.controlField}>
            <Eyebrow>검색</Eyebrow>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="설명, 유형, 담당자"
            />
          </label>
          <div className={styles.controlField}>
            <Eyebrow>유형</Eyebrow>
            <FilterDropdown
              ariaLabel="유형 필터"
              value={typeFilter}
              options={TYPE_OPTIONS}
              onChange={setTypeFilter}
            />
          </div>
          <div className={styles.controlField}>
            <Eyebrow>흐름</Eyebrow>
            <FilterDropdown
              ariaLabel="흐름 필터"
              value={direction}
              options={DIRECTION_OPTIONS}
              onChange={setDirection}
            />
          </div>
          <div className={styles.controlField}>
            <Eyebrow>기간</Eyebrow>
            <FilterDropdown
              ariaLabel="기간 필터"
              value={period}
              options={PERIOD_OPTIONS}
              onChange={setPeriod}
            />
          </div>
          <div className={styles.controlField}>
            <Eyebrow>정렬</Eyebrow>
            <FilterDropdown
              ariaLabel="정렬"
              value={sortMode}
              options={SORT_OPTIONS}
              onChange={setSortMode}
            />
          </div>
          <div className={styles.controlActions}>
            <Button size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              내역 받기
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>조건에 맞는 거래 기록이 없습니다.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>유형</th>
                  <th>캐릭터</th>
                  <th className={styles.numCol}>금액</th>
                  <th className={styles.numCol}>잔액</th>
                  <th>설명</th>
                  <th>처리자</th>
                  <th className={styles.dateCol}>일시</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const meta = CREDIT_TYPE_META[tx.type];
                  const positive = tx.amount >= 0;
                  return (
                    <tr key={tx.id}>
                      <td>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                      </td>
                      <td className={styles.strong}>{tx.characterCodename}</td>
                      <td className={styles.numCol}>
                        <span
                          className={
                            positive ? styles.amountPos : styles.amountNeg
                          }
                        >
                          {formatSignedCredit(tx.amount)}
                        </span>
                      </td>
                      <td className={`${styles.numCol} ${styles.mono}`}>
                        {tx.balance.toLocaleString()}
                      </td>
                      <td className={styles.desc}>{tx.description || "—"}</td>
                      <td>{tx.createdByName || "—"}</td>
                      <td className={`${styles.dateCol} ${styles.mono}`}>
                        {formatDateTime(tx.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </div>
  );
}
