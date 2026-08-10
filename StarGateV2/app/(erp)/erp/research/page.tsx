import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { getResearchLabOverview } from "@/lib/db/research-lab-overview";
import { toGuestResearchLabOverview } from "@/lib/research/guest-overview";

import PageHead from "@/components/ui/PageHead/PageHead";

import ResearchClient from "./ResearchClient";

export default async function ResearchPage() {
  const session = await getActiveSession();
  if (!session?.user) redirect("/login");
  const viewerId = getOwnedDataViewerId(session.user);
  const overview = await getResearchLabOverview({
    userId: viewerId,
  });
  const initialData =
    viewerId === null ? toGuestResearchLabOverview(overview) : overview;

  return (
    <>
      <PageHead
        breadcrumb={[{ label: "ERP", href: "/erp" }, { label: "연구소" }]}
        title="연구소"
      />
      <ResearchClient initialData={initialData} />
    </>
  );
}
