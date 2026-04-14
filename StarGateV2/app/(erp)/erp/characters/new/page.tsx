import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import CharacterCreateForm from "./CharacterCreateForm";

import styles from "./page.module.css";

export default async function CharacterNewPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isGMOrAbove = hasRole(session.user.role, "GM");

  if (!isGMOrAbove) {
    redirect("/erp/characters");
  }

  return (
    <section className={styles.page}>
      <Link href="/erp/characters" className={styles.page__back}>
        &larr; 캐릭터 목록
      </Link>

      <div className={styles.page__classification}>NEW ENTRY</div>
      <h1 className={styles.page__title}>캐릭터 추가</h1>

      <CharacterCreateForm />
    </section>
  );
}
