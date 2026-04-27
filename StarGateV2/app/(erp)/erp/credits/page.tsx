import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  getUserBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import { listUsers } from "@/lib/db/users";
import { formatDate } from "@/lib/format/date";

import type { CreditTransactionType } from "@/types/credit";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import CreditGrantForm from "./CreditGrantForm";

import styles from "./page.module.css";

const TYPE_META: Record<
  CreditTransactionType,
  { label: string; tone: "gold" | "info" | "success" | "danger" | "default" }
> = {
  SESSION_REWARD: { label: "세션 보상", tone: "success" },
  PURCHASE: { label: "구매", tone: "info" },
  ADMIN_GRANT: { label: "관리자 지급", tone: "gold" },
  ADMIN_DEDUCT: { label: "관리자 차감", tone: "danger" },
  TRANSFER: { label: "이체", tone: "default" },
};

export default async function CreditsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id: userId, role } = session.user;
  const isGm = hasRole(role, "V");

  const [transactions, balance, users] = await Promise.all([
    (isGm
      ? listCreditTransactions()
      : listCreditTransactions(userId)
    ).catch((): Awaited<ReturnType<typeof listCreditTransactions>> => []),
    getUserBalance(userId).catch(() => 0),
    isGm
      ? listUsers().catch((): Awaited<ReturnType<typeof listUsers>> => [])
      : Promise.resolve([] as Awaited<ReturnType<typeof listUsers>>),
  ]);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "CREDITS" },
        ]}
        title="크레딧"
      />

      <div className={styles.topRow}>
        <Box variant="gold" className={styles.balance}>
          <PanelTitle right={<span className={styles.mono}>WALLET</span>}>
            <span className={styles.gold}>CURRENT BALANCE</span>
          </PanelTitle>
          <div className={styles.bigNum}>¤ {balance.toLocaleString()}</div>
          <Eyebrow>{isGm ? "전체 시스템 내역 조회 가능" : "내 계정 내역"}</Eyebrow>
        </Box>

        {isGm ? (
          <Box>
            <PanelTitle>CREDIT GRANT · GM</PanelTitle>
            <CreditGrantForm users={users} />
          </Box>
        ) : null}
      </div>

      <Box>
        <PanelTitle
          right={<span className={styles.mono}>{transactions.length} 건</span>}
        >
          TRANSACTION LOG
        </PanelTitle>

        {transactions.length === 0 ? (
          <div className={styles.empty}>트랜잭션 기록이 없습니다.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>유형</th>
                  {isGm ? <th>유저</th> : null}
                  <th className={styles.numCol}>금액</th>
                  <th className={styles.numCol}>잔액</th>
                  <th>설명</th>
                  <th className={styles.dateCol}>일시</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const meta = TYPE_META[tx.type];
                  const positive = tx.amount >= 0;
                  return (
                    <tr key={String(tx._id)}>
                      <td>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                      </td>
                      {isGm ? <td>{tx.userName}</td> : null}
                      <td className={styles.numCol}>
                        <span
                          className={
                            positive ? styles.amountPos : styles.amountNeg
                          }
                        >
                          {positive ? "+" : ""}
                          {tx.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className={`${styles.numCol} ${styles.mono}`}>
                        {tx.balance.toLocaleString()}
                      </td>
                      <td className={styles.desc}>{tx.description}</td>
                      <td className={`${styles.dateCol} ${styles.mono}`}>
                        {formatDate(tx.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </>
  );
}
