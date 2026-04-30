import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

/**
 * `/erp/admin` 트리 가드. layout 단위로 GM 강제 — 새 admin 라우트 추가 시 가드 누락 방지.
 *
 * 개별 page 의 hasRole 체크는 defense-in-depth 로 유지 (제거하지 말 것).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "GM")) redirect("/erp");
  return <>{children}</>;
}
