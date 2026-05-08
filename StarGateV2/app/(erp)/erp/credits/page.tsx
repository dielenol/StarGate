import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  findMainCharacterByOwner,
  listAgentCharacters,
} from "@/lib/db/characters";
import {
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import { listUsers } from "@/lib/db/users";
import { formatDate } from "@/lib/format/date";

import type { CharacterPublic } from "@/types/character";
import type { CreditTransactionType } from "@/types/credit";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import CreditGrantForm, { type GrantTargetUser } from "./CreditGrantForm";

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
  STOCK_BUY: { label: "주식 매수", tone: "info" },
  STOCK_SELL: { label: "주식 매도", tone: "info" },
  OP_GRANT: { label: "작전풀 지급", tone: "gold" },
  OP_DEDUCT: { label: "작전풀 차감", tone: "danger" },
  MIGRATION: { label: "마이그레이션 (1회성)", tone: "info" },
};

export default async function CreditsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id: userId, role } = session.user;
  const isGm = hasRole(role, "V");

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

  // GM 은 전체 ledger / 일반 user 는 본인 메인 캐릭 ledger 만.
  const [transactions, balance, users, agentCharacters] = await Promise.all([
    isGm
      ? listCreditTransactions().catch(
          (): Awaited<ReturnType<typeof listCreditTransactions>> => [],
        )
      : myCharacterId
        ? listCreditTransactions(myCharacterId).catch(
            (): Awaited<ReturnType<typeof listCreditTransactions>> => [],
          )
        : Promise.resolve(
            [] as Awaited<ReturnType<typeof listCreditTransactions>>,
          ),
    myCharacterId
      ? getCharacterBalance(myCharacterId).catch(() => 0)
      : Promise.resolve(0),
    isGm
      ? listUsers().catch((): Awaited<ReturnType<typeof listUsers>> => [])
      : Promise.resolve([] as Awaited<ReturnType<typeof listUsers>>),
    isGm
      ? listAgentCharacters(null).catch(
          (): Awaited<ReturnType<typeof listAgentCharacters>> => [],
        )
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof listAgentCharacters>>,
        ),
  ]);

  // GM 발급 폼에 넘겨줄 owner → 메인 캐릭 매핑. UI 에서 바로 주 캐릭 codename 표시.
  const mainAgentByOwner = new Map<string, CharacterPublic>();
  for (const c of agentCharacters) {
    if (c.type !== "AGENT") continue;
    if (!c.ownerId) continue;
    if (c.tier && c.tier !== "MAIN") continue;
    if (!mainAgentByOwner.has(c.ownerId)) {
      mainAgentByOwner.set(c.ownerId, c as CharacterPublic);
    }
  }

  const grantTargets: GrantTargetUser[] = users
    .map((u) => {
      const main = mainAgentByOwner.get(u._id);
      return {
        userId: u._id,
        username: u.username,
        displayName: u.displayName,
        mainCharacterId: main ? String(main._id) : null,
        mainCharacterCodename: main?.codename ?? null,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

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
          <Eyebrow>
            {isGm
              ? "전체 시스템 내역 조회 가능"
              : mainCharacter
                ? `내 캐릭터 · ${mainCharacter.codename}`
                : mainIntegrityError
                  ? "메인 캐릭터 정합성 위반"
                  : "메인 캐릭터 미등록"}
          </Eyebrow>
          {!isGm && mainIntegrityError ? (
            <div className={styles.empty}>
              <strong>⚠ 정합성 위반</strong>: {mainIntegrityError}
              <br />
              운영자에게 문의하세요.
            </div>
          ) : !isGm && !mainCharacter ? (
            <div className={styles.empty}>
              메인 AGENT 캐릭터가 없어 크레딧이 0 으로 표시됩니다. 캐릭터 등록 후 다시 확인하세요.
            </div>
          ) : null}
        </Box>

        {isGm ? (
          <Box>
            <PanelTitle>CREDIT GRANT · GM</PanelTitle>
            <CreditGrantForm targets={grantTargets} />
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
                  <th>캐릭터</th>
                  {isGm ? <th>소유자</th> : null}
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
                      <td className={styles.mono}>{tx.characterCodename}</td>
                      {isGm ? <td>{tx.ownerName}</td> : null}
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
