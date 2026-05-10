import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { CREDIT_TYPE_META } from "@/lib/credit-meta";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import {
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import { formatDate } from "@/lib/format/date";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export default async function CreditsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id: userId, role } = session.user;

  // 본인 메인 캐릭 + ledger + balance — user → character 라우팅 단계.
  // null = 정상 미등록(가이드 안내), throw = 1인 1 MAIN 정합성 위반(GM 개입 필요).
  // 두 케이스를 분리해 사용자에게 적절한 메시지 노출.
  let mainCharacter: Awaited<ReturnType<typeof findMainCharacterByOwner>> | null = null;
  let mainIntegrityError: string | null = null;
  try {
    mainCharacter = await findMainCharacterByOwner(userId);
  } catch (err) {
    mainIntegrityError =
      err instanceof Error ? err.message : "메인 캐릭터 조회 실패 (정합성 위반)";
  }
  const myCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  const [transactions, balance] = await Promise.all([
    myCharacterId
      ? listCreditTransactions(myCharacterId).catch(
          (): Awaited<ReturnType<typeof listCreditTransactions>> => [],
        )
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof listCreditTransactions>>,
        ),
    myCharacterId
      ? getCharacterBalance(myCharacterId).catch(() => 0)
      : Promise.resolve(0),
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

      {hasRole(role, "GM") ? (
        <Box>
          <Eyebrow>관리자 안내</Eyebrow>
          <div className={styles.adminHint}>
            GM 발급 / 일괄 / 작전풀 운영은{" "}
            <Link href="/erp/admin/credits" className={styles.adminHintLink}>
              관리 · 크레딧 운영
            </Link>
            에서 처리합니다.
          </div>
        </Box>
      ) : null}

      <Box variant="gold" className={styles.balance}>
        <PanelTitle right={<span className={styles.mono}>WALLET</span>}>
          <span className={styles.gold}>CURRENT BALANCE</span>
        </PanelTitle>
        <div className={styles.bigNum}>¤ {balance.toLocaleString()}</div>
        <Eyebrow>
          {mainCharacter
            ? `내 캐릭터 · ${mainCharacter.codename}`
            : mainIntegrityError
              ? "메인 캐릭터 정합성 위반"
              : "메인 캐릭터 미등록"}
        </Eyebrow>
        {mainIntegrityError ? (
          <div className={styles.empty}>
            <strong>⚠ 정합성 위반</strong>: {mainIntegrityError}
            <br />
            운영자에게 문의하세요.
          </div>
        ) : !mainCharacter ? (
          <div className={styles.empty}>
            메인 AGENT 캐릭터가 없어 크레딧이 0 으로 표시됩니다. 캐릭터 등록 후 다시 확인하세요.
          </div>
        ) : null}
      </Box>

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
                  <th>캐릭터</th>
                  <th className={styles.numCol}>금액</th>
                  <th className={styles.numCol}>잔액</th>
                  <th>설명</th>
                  <th className={styles.dateCol}>일시</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const meta = CREDIT_TYPE_META[tx.type];
                  const positive = tx.amount >= 0;
                  return (
                    <tr key={String(tx._id)}>
                      <td>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                      </td>
                      <td className={styles.mono}>{tx.characterCodename}</td>
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
