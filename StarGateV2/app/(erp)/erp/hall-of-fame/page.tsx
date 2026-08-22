import { redirect } from "next/navigation";

import type { ResearchHallOfFameResponse } from "@stargate/core";

import { getActiveSession } from "@/lib/auth/active-session";
import { getResearchHallOfFameResponse } from "@/lib/hall-of-fame/research";

import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import HallOfFameClient from "./HallOfFameClient";

export default async function HallOfFamePage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  let initialData: ResearchHallOfFameResponse | undefined;
  let initialDataUpdatedAt: number | undefined;

  try {
    initialData = await getResearchHallOfFameResponse();
    initialDataUpdatedAt = new Date(initialData.generatedAt).getTime();
  } catch {
    initialData = undefined;
    initialDataUpdatedAt = undefined;
  }

  return (
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "HALL OF FAME" },
        ]}
        title="명예의 전당"
        right={<Tag tone="gold">RESEARCH HONORS</Tag>}
      />
      <HallOfFameClient
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
      />
    </div>
  );
}
