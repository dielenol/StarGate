import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findMainCharacterByOwnerCached as findMainCharacterByOwner } from "@/lib/db/characters";
import {
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";

import PageHead from "@/components/ui/PageHead/PageHead";

import CreditsClient, {
  type SerializedCreditTransaction,
} from "./CreditsClient";

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
  const serializedTransactions: SerializedCreditTransaction[] =
    transactions.map((tx) => {
      const createdAt =
        tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt);
      const createdAtIso = Number.isNaN(createdAt.getTime())
        ? new Date(0).toISOString()
        : createdAt.toISOString();

      return {
        id: String(tx._id ?? `${tx.characterId}-${createdAtIso}`),
        type: tx.type,
        amount: tx.amount,
        balance: tx.balance,
        characterCodename: tx.characterCodename,
        ownerName: tx.ownerName,
        description: tx.description,
        createdByName: tx.createdByName,
        createdAt: createdAtIso,
      };
    });

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "크레딧" },
        ]}
        title="크레딧"
      />

      <CreditsClient
        balance={balance}
        character={
          mainCharacter
            ? {
                id: myCharacterId!,
                codename: mainCharacter.codename,
                name: mainCharacter.lore.name,
              }
            : null
        }
        integrityError={mainIntegrityError}
        isGm={hasRole(role, "GM")}
        transactions={serializedTransactions}
      />
    </>
  );
}
