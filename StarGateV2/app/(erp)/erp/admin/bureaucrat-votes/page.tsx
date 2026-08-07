import { BUREAUCRAT_VOTE_CHANNEL_ID } from "@stargate/shared-db";
import { redirect } from "next/navigation";

import PageHead from "@/components/ui/PageHead/PageHead";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { BUREAUCRAT_VOTE_PRESETS } from "@/lib/bureaucrat-votes/presets";
import type { BureaucratVotesResponse } from "@/lib/bureaucrat-votes/contracts";
import { getSerializedBureaucratVotes } from "@/lib/db/bureaucrat-votes";

import BureaucratVotesAdminClient from "./BureaucratVotesAdminClient";

export default async function BureaucratVotesAdminPage() {
  const session = await getActiveSession();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "GM")) redirect("/erp");

  const guildId = process.env.GUILD_ID?.trim() || null;
  const initialData: BureaucratVotesResponse = {
    configured: guildId !== null,
    discordGuildId: guildId,
    discordChannelId: BUREAUCRAT_VOTE_CHANNEL_ID,
    durationHours: 6,
    presets: [...BUREAUCRAT_VOTE_PRESETS],
    votes: await getSerializedBureaucratVotes(),
  };

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "관리 (ADMIN)", href: "/erp/admin" },
          { label: "투표 운영 (BUREAUCRAT VOTES)" },
        ]}
        title="관료 투표 운영"
      />
      <BureaucratVotesAdminClient initialData={initialData} />
    </>
  );
}
