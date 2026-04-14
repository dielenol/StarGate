import { redirect } from "next/navigation";

import type { CreditTransactionType } from "@/types/credit";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  listCreditTransactions,
  getUserBalance,
} from "@/lib/db/credits";
import { listUsers } from "@/lib/db/users";

import CreditGrantForm from "./CreditGrantForm";
import styles from "./page.module.css";

const TYPE_BADGE_CLASS: Record<CreditTransactionType, string> = {
  SESSION_REWARD: styles["credits__badge--sessionReward"],
  PURCHASE: styles["credits__badge--purchase"],
  ADMIN_GRANT: styles["credits__badge--adminGrant"],
  ADMIN_DEDUCT: styles["credits__badge--adminDeduct"],
  TRANSFER: styles["credits__badge--transfer"],
};

const TYPE_LABEL: Record<CreditTransactionType, string> = {
  SESSION_REWARD: "세션 보상",
  PURCHASE: "구매",
  ADMIN_GRANT: "관리자 지급",
  ADMIN_DEDUCT: "관리자 차감",
  TRANSFER: "이체",
};

export default async function CreditsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id: userId, role } = session.user;
  const isGm = hasRole(role, "GM");

  let transactions: Awaited<ReturnType<typeof listCreditTransactions>> = [];
  let balance: number = 0;

  try {
    transactions = isGm
      ? await listCreditTransactions()
      : await listCreditTransactions(userId);
    balance = await getUserBalance(userId);
  } catch {
    // DB 연결 실패 시 빈 상태 유지
  }

  let users: Awaited<ReturnType<typeof listUsers>> = [];
  if (isGm) {
    try {
      users = await listUsers();
    } catch {
      // 유저 목록 조회 실패 시 빈 배열 유지
    }
  }

  return (
    <section className={styles.credits}>
      <div className={styles.credits__classification}>
        FINANCIAL RECORDS
      </div>
      <h1 className={styles.credits__title}>크레딧 관리</h1>

      {/* 잔액 카드 */}
      <div className={styles.credits__balanceCard}>
        <span className={styles.credits__balanceLabel}>CURRENT BALANCE</span>
        <span className={styles.credits__balanceValue}>{balance.toLocaleString()}</span>
        <span className={styles.credits__balanceUnit}>CR</span>
      </div>

      {/* GM/ADMIN: 크레딧 지급 폼 */}
      {isGm && <CreditGrantForm users={users} />}

      {/* 트랜잭션 테이블 */}
      {transactions.length === 0 ? (
        <p className={styles.credits__empty}>
          트랜잭션 기록이 없습니다.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className={styles.credits__table}>
            <thead>
              <tr>
                <th>유형</th>
                {isGm && <th>유저</th>}
                <th>금액</th>
                <th>잔액</th>
                <th>설명</th>
                <th>일시</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={String(tx._id)}>
                  <td>
                    <span
                      className={`${styles.credits__badge} ${TYPE_BADGE_CLASS[tx.type]}`}
                    >
                      {TYPE_LABEL[tx.type]}
                    </span>
                  </td>
                  {isGm && <td>{tx.userName}</td>}
                  <td>
                    <span
                      className={
                        tx.amount >= 0
                          ? styles.credits__amountPositive
                          : styles.credits__amountNegative
                      }
                    >
                      {tx.amount >= 0 ? "+" : ""}
                      {tx.amount.toLocaleString()}
                    </span>
                  </td>
                  <td>{tx.balance.toLocaleString()}</td>
                  <td>{tx.description}</td>
                  <td>
                    {new Date(tx.createdAt).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
