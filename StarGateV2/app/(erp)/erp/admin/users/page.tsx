import { redirect } from "next/navigation";

import type { UserPublic } from "@/types/user";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listUsers } from "@/lib/db/users";

import UsersAdminClient from "./UsersAdminClient";

export default async function UsersAdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.role, "ADMIN")) {
    redirect("/erp");
  }

  const users = await listUsers().catch((err): UserPublic[] => {
    console.error("[admin/users] listUsers failed:", err);
    return [];
  });

  return (
    <UsersAdminClient
      initialUsers={users}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    />
  );
}
