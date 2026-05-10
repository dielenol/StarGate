/**
 * 주식 — Stargate ERP (M3-A 토스 라우트 리워크)
 *
 * 본 페이지는 **종목 list view** — 세로 list 로 9 종목 + 행마다 sparkline 노출.
 * 행 클릭 시 `/erp/stock/[ticker]` 풀페이지 상세로 이동.
 *
 * 서버 컴포넌트: 메인 캐릭터 + 시세 + sparkline + 잔액 병렬 fetch 후 client 시드.
 *
 * Subroutes:
 *  - `/erp/stock/[ticker]` — 종목 상세 (큰 차트 + 매수/매도 sticky CTA)
 *  - `/erp/stock/portfolio` — 내 자산 (보유 종목 list + summary)
 *
 * 권한 — 현재는 ERP 로그인만 통과 (별도 RBAC 게이트 없음).
 * TODO(M3-B): GM 시세 조정 / 거래 정지 / 자동 시세 변동 알고리즘.
 */

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import { STOCK_CATALOG } from "@/lib/stocks/catalog";

import type {
  StockPricesResponse,
  StockSparklinesResponse,
} from "@/hooks/queries/useStocksQuery";

import { buildPricesResponse, buildSparklinesResponse } from "./_data";
import StockListClient from "./StockListClient";

const SPARKLINE_DAYS = 7;

export const metadata = {
  title: "주식 — Stargate ERP",
};

export default async function StockPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  // 메인 캐릭터 — null=정상 미등록, throw=1인 1 MAIN 정합성 위반.
  let mainCharacter: Awaited<
    ReturnType<typeof findMainCharacterByOwner>
  > | null = null;
  let mainCharacterError: string | null = null;
  try {
    mainCharacter = await findMainCharacterByOwner(userId);
  } catch (err) {
    console.error(
      `[stock] findMainCharacterByOwner integrity violation (userId=${userId}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  // STOCK_CATALOG 시드 누락은 운영 사고 — 빌드 시 invariant.
  if (STOCK_CATALOG.length === 0) {
    throw new Error(
      "STOCK_CATALOG 가 비어 있습니다 — lib/stocks/catalog.ts 시드 누락.",
    );
  }

  const [initialPrices, initialSparklines, initialBalance] = await Promise.all([
    buildPricesResponse().catch(
      (): StockPricesResponse => ({ items: [] }),
    ),
    buildSparklinesResponse(SPARKLINE_DAYS).catch(
      (): StockSparklinesResponse => ({ items: [], days: SPARKLINE_DAYS }),
    ),
    mainCharacterId
      ? getCharacterBalance(mainCharacterId).catch(() => 0)
      : Promise.resolve(0),
  ]);

  return (
    <StockListClient
      initialPrices={initialPrices}
      initialSparklines={initialSparklines}
      initialBalance={initialBalance}
      mainCharacter={
        mainCharacter && mainCharacterId
          ? { id: mainCharacterId, codename: mainCharacter.codename }
          : null
      }
      mainCharacterError={mainCharacterError}
    />
  );
}
