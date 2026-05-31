"use client";

import { useMemo, useState } from "react";

import type { AgentBalanceRow } from "@/types/credit-admin";

import {
  type BalancesResponse,
  useCreditBalances,
} from "@/hooks/queries/useCreditsAdminQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import { formatDate } from "@/lib/format/date";

import styles from "./page.module.css";

/* ── 타입 ── */

interface Props {
  initialData: BalancesResponse;
  /** 행의 [발급] 버튼 클릭 시 호출 — 부모가 GrantForm picker 에 ownerId 를 prefill 한다. */
  onSelectOwner: (ownerId: string) => void;
}

type SortKey =
  | "balance-desc"
  | "balance-asc"
  | "points-desc"
  | "points-asc"
  | "codename"
  | "lastTx";

const RANK_TONES: Record<
  string,
  | "rank-gm"
  | "rank-v"
  | "rank-a"
  | "rank-m"
  | "rank-h"
  | "rank-g"
  | "rank-j"
  | "rank-u"
> = {
  GM: "rank-gm",
  V: "rank-v",
  A: "rank-a",
  M: "rank-m",
  H: "rank-h",
  G: "rank-g",
  J: "rank-j",
  U: "rank-u",
};

/* ── 정렬 비교 함수 ── */

function compareRows(a: AgentBalanceRow, b: AgentBalanceRow, key: SortKey): number {
  switch (key) {
    case "balance-desc":
      if (b.balance !== a.balance) return b.balance - a.balance;
      return a.characterCodename.localeCompare(b.characterCodename);
    case "balance-asc":
      if (a.balance !== b.balance) return a.balance - b.balance;
      return a.characterCodename.localeCompare(b.characterCodename);
    case "points-desc":
      if (b.pointBalance !== a.pointBalance) {
        return b.pointBalance - a.pointBalance;
      }
      return a.characterCodename.localeCompare(b.characterCodename);
    case "points-asc":
      if (a.pointBalance !== b.pointBalance) {
        return a.pointBalance - b.pointBalance;
      }
      return a.characterCodename.localeCompare(b.characterCodename);
    case "codename":
      return a.characterCodename.localeCompare(b.characterCodename);
    case "lastTx": {
      // null 은 가장 마지막으로 (오래된 것). tie 시 codename 알파벳.
      const at = a.lastTxAt ? new Date(a.lastTxAt).getTime() : 0;
      const bt = b.lastTxAt ? new Date(b.lastTxAt).getTime() : 0;
      if (at !== bt) return bt - at;
      return a.characterCodename.localeCompare(b.characterCodename);
    }
  }
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "balance-desc", label: "크레딧 ↓" },
  { key: "balance-asc", label: "크레딧 ↑" },
  { key: "points-desc", label: "포인트 ↓" },
  { key: "points-asc", label: "포인트 ↑" },
  { key: "codename", label: "코드네임" },
  { key: "lastTx", label: "최근 거래" },
];

/* ── 컴포넌트 ── */

export default function CreditBalanceTable({
  initialData,
  onSelectOwner,
}: Props) {
  const { data } = useCreditBalances({ initialData });

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("balance-desc");

  const rows = data?.rows ?? initialData.rows;
  const generatedAt = data?.generatedAt ?? initialData.generatedAt;

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => {
          if (r.characterCodename.toLowerCase().includes(q)) return true;
          if (r.ownerName?.toLowerCase().includes(q)) return true;
          if (r.ownerDiscordId?.toLowerCase().includes(q)) return true;
          return false;
        })
      : rows;
    return [...filtered].sort((a, b) => compareRows(a, b, sortKey));
  }, [rows, query, sortKey]);

  return (
    <Box>
      <PanelTitle
        right={
          <span className={styles.credits__mono}>{rows.length} 명</span>
        }
      >
        AGENT BALANCES
      </PanelTitle>

      <div className={styles.credits__tableHeader}>
        <Input
          className={styles.credits__searchInput}
          type="search"
          placeholder="코드네임 · 소유자 · Discord ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.credits__sortToggle}>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`${styles.credits__sortBtn} ${
                sortKey === opt.key ? styles.credits__sortBtnActive : ""
              }`}
              onClick={() => setSortKey(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {filteredSorted.length === 0 ? (
        <div className={styles.credits__empty}>
          {rows.length === 0 ? "운영 캐릭 없음" : "검색 결과가 없습니다."}
        </div>
      ) : (
        <div className={styles.credits__tableWrap}>
          <table className={styles.credits__table}>
            <thead>
              <tr>
                <th>코드네임</th>
                <th>소유자</th>
                <th>Discord</th>
                <th>등급</th>
                <th className={styles.credits__numCol}>크레딧</th>
                <th className={styles.credits__numCol}>포인트</th>
                <th className={styles.credits__dateCol}>최근 거래</th>
                <th className={styles.credits__numCol}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((row) => {
                const tone = RANK_TONES[row.agentLevel] ?? "rank-u";
                return (
                  <tr key={row.characterId}>
                    <td className={styles.credits__strong}>
                      {row.characterCodename}
                    </td>
                    <td>{row.ownerName ?? "—"}</td>
                    <td>
                      {row.ownerDiscordId ? (
                        <span
                          className={styles.credits__discordOn}
                          aria-label="Discord 연동됨"
                          title="Discord 연동됨"
                        >
                          ✓
                        </span>
                      ) : (
                        <span
                          className={styles.credits__discordOff}
                          aria-label="Discord 미연동"
                          title="Discord 미연동"
                        >
                          ⚠
                        </span>
                      )}
                    </td>
                    <td>
                      <Tag tone={tone}>{row.agentLevel}</Tag>
                    </td>
                    <td className={styles.credits__numCol}>
                      ¤ {row.balance.toLocaleString()}
                    </td>
                    <td className={styles.credits__numCol}>
                      PT {row.pointBalance.toLocaleString()}
                    </td>
                    <td className={styles.credits__dateCol}>
                      {row.lastTxAt ? formatDate(new Date(row.lastTxAt)) : "—"}
                    </td>
                    <td className={styles.credits__numCol}>
                      <Button
                        size="sm"
                        onClick={() =>
                          row.ownerId && onSelectOwner(row.ownerId)
                        }
                        disabled={!row.ownerId}
                        title={
                          row.ownerId
                            ? undefined
                            : "owner 미연결 — 발급 불가"
                        }
                      >
                        발급
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.credits__metaRow}>
        <span className={styles.credits__mono}>
          {filteredSorted.length} / {rows.length} 행
        </span>
        <span className={styles.credits__mono}>
          GENERATED · {formatDate(new Date(generatedAt))}
        </span>
      </div>
    </Box>
  );
}
