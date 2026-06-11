import { Suspense } from "react";

import { redirect } from "next/navigation";

import type { UserRole } from "@/types/user";

import { auth } from "@/lib/auth/config";

import ERPLoading from "../loading";

import FactionsClient from "./FactionsClient";
import { getFactionBoardData } from "./_data";

async function FactionsBody({ role }: { role: UserRole }) {
  const data = await getFactionBoardData(role);
  return <FactionsClient data={data} />;
}

export default async function FactionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Suspense fallback={<ERPLoading />}>
      <FactionsBody role={session.user.role} />
    </Suspense>
  );
}
