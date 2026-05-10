import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import SessionWrapper from "@/components/erp/SessionWrapper";
import QueryProvider from "@/components/erp/QueryProvider";
import ERPSidebar from "@/components/erp/ERPSidebar/ERPSidebar";
import CommandK from "@/components/erp/CommandK/CommandK";

import styles from "./layout.module.css";
import ERPHeader from "./ERPHeader";

/**
 * ERP 트리는 항상 dynamic 렌더 — auth() 결과가 cache 되어 로그아웃 사용자에게
 * stale 인증 페이지가 노출되는 사고 방지. middleware + page 가드와 함께
 * defense-in-depth 의 가장 바깥 가드.
 */
export const dynamic = "force-dynamic";

export default async function ERPLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SessionWrapper session={session}>
      <QueryProvider>
        <div className={styles.erp} data-scope="erp">
          <ERPHeader user={session.user} />
          <div className={styles.erp__body}>
            <ERPSidebar />
            <main className={styles.erp__main}>{children}</main>
          </div>
          <CommandK />
        </div>
      </QueryProvider>
    </SessionWrapper>
  );
}
