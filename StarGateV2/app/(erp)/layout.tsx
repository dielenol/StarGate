import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import SessionWrapper from "@/components/erp/SessionWrapper";
import QueryProvider from "@/components/erp/QueryProvider";
import ERPSidebar from "@/components/erp/ERPSidebar/ERPSidebar";
import CommandK from "@/components/erp/CommandK/CommandK";

import styles from "./layout.module.css";
import ERPHeader from "./ERPHeader";

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
        <div className={styles.erp}>
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
