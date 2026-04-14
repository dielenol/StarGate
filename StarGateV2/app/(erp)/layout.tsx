import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import SessionWrapper from "@/components/erp/SessionWrapper";
import ERPSidebar from "@/components/erp/ERPSidebar/ERPSidebar";

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
    <SessionWrapper>
      <div className={styles.erp}>
        <ERPSidebar />
        <div className={styles.erp__content}>
          <ERPHeader user={session.user} />
          <main className={styles.erp__main}>{children}</main>
        </div>
      </div>
    </SessionWrapper>
  );
}
