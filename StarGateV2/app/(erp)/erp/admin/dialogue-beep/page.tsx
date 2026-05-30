import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import DialogueBeepLabClient from "./DialogueBeepLabClient";

export const metadata = {
  title: "대사 비프 테스트 — Stargate ERP",
};

export default async function DialogueBeepLabPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "GM")) redirect("/erp");

  return <DialogueBeepLabClient />;
}
