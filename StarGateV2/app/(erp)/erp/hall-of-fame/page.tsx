import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import {
  getHallOfFameCitationPage,
  getHallOfFameMineResponse,
  getHallOfFameNovexResponse,
} from "@/lib/hall-of-fame/honors";
import { getResearchHallOfFameResponse } from "@/lib/hall-of-fame/research";

import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import HallOfFameClient from "./HallOfFameClient";
import styles from "./page.module.css";

export default async function HallOfFamePage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const [researchResult, novexResult, citationsResult, mineResult] =
    await Promise.all([
      getResearchHallOfFameResponse().catch(() => undefined),
      getHallOfFameNovexResponse().catch(() => undefined),
      session.user.isGuest
        ? Promise.resolve(undefined)
        : getHallOfFameCitationPage({ viewerRole: session.user.role }).catch(
            () => undefined,
          ),
      session.user.isGuest
        ? Promise.resolve(undefined)
        : getHallOfFameMineResponse({
            userId: session.user.id,
            viewerRole: session.user.role,
          }).catch(() => undefined),
    ]);

  const initialData = researchResult;
  const initialDataUpdatedAt = initialData
    ? new Date(initialData.generatedAt).getTime()
    : undefined;
  const initialNovexData = novexResult;
  const initialNovexDataUpdatedAt = initialNovexData
    ? new Date(initialNovexData.generatedAt).getTime()
    : undefined;
  const initialCitationsData = citationsResult;
  const initialCitationsDataUpdatedAt = initialCitationsData
    ? new Date(initialCitationsData.generatedAt).getTime()
    : undefined;
  const initialMineData = mineResult;
  const initialMineDataUpdatedAt = initialMineData
    ? initialCitationsDataUpdatedAt ??
      initialNovexDataUpdatedAt ??
      initialDataUpdatedAt
    : undefined;

  return (
    <div className={styles.page} data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "HALL OF FAME" },
        ]}
        className={styles.page__toolbar}
        title="명예의 전당"
        right={<Tag tone="gold">OFFICIAL · LIVING ARCHIVE</Tag>}
      />
      <HallOfFameClient
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
        initialNovexData={initialNovexData}
        initialNovexDataUpdatedAt={initialNovexDataUpdatedAt}
        initialCitationsData={initialCitationsData}
        initialCitationsDataUpdatedAt={initialCitationsDataUpdatedAt}
        initialMineData={initialMineData}
        initialMineDataUpdatedAt={initialMineDataUpdatedAt}
        isGuest={session.user.isGuest === true}
      />
    </div>
  );
}
