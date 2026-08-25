import { notFound, redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { isMemberErpViewer } from "@/lib/auth/guest";
import { getHallOfFameSourceRedirect } from "@/lib/hall-of-fame/honors";

interface Props {
  params: Promise<{ key: string }>;
}

export default async function HallOfFameSourcePage({ params }: Props) {
  const session = await getActiveSession();
  if (!session?.user) redirect("/login");
  if (!isMemberErpViewer(session.user)) notFound();

  const { key } = await params;
  const destination = await getHallOfFameSourceRedirect(
    key,
    session.user.role,
  );
  if (!destination) notFound();
  redirect(destination);
}
