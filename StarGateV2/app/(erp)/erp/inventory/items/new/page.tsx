import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";

import ItemCreateForm from "./ItemCreateForm";
import styles from "./page.module.css";

export default async function NewItemPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    redirect("/erp/inventory");
  }

  return (
    <section className={styles.newItem}>
      <Link href="/erp/inventory" className={styles.newItem__backLink}>
        &larr; 아이템 마스터로 돌아가기
      </Link>

      <div className={styles.newItem__classification}>
        EQUIPMENT REGISTRY
      </div>
      <h1 className={styles.newItem__title}>아이템 추가</h1>

      <ItemCreateForm />
    </section>
  );
}
