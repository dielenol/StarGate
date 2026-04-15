import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findUpcomingSessions } from "@/lib/db/registrar-read";
import { countUsers } from "@/lib/db/users";
import { hasRole } from "@/lib/auth/rbac";

import styles from "./page.module.css";

export default async function ERPDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { displayName, role } = session.user;
  const isAdmin = hasRole(role, "ADMIN");

  const guildId = process.env.GUILD_ID ?? "";

  const [upcomingSessions, memberCount] = await Promise.all([
    guildId
      ? findUpcomingSessions(guildId, 5).catch(() => [])
      : Promise.resolve([]),
    isAdmin
      ? countUsers().catch(() => 0)
      : Promise.resolve(0),
  ]);

  return (
    <section className={styles.dashboard}>
      <div className={styles.dashboard__classification}>
        SYSTEM STATUS: OPERATIONAL
      </div>
      <h1 className={styles.dashboard__title}>대시보드</h1>

      <div className={styles.dashboard__grid}>
        {/* 현재 요원 정보 */}
        <div className={styles.dashboard__card}>
          <div className={styles.dashboard__cardHeader}>CURRENT OPERATOR</div>
          <div className={styles.dashboard__row}>
            <span className={styles.dashboard__label}>이름</span>
            <span className={styles.dashboard__value}>{displayName}</span>
          </div>
          <div className={styles.dashboard__row}>
            <span className={styles.dashboard__label}>역할</span>
            <span className={styles.dashboard__value}>{role}</span>
          </div>
        </div>

        {/* 멤버 현황 (ADMIN+) */}
        {isAdmin && (
          <div className={styles.dashboard__card}>
            <div className={styles.dashboard__cardHeader}>PERSONNEL STATUS</div>
            <div className={styles.dashboard__stat}>
              <span className={styles.dashboard__statNumber}>{memberCount}</span>
              <span className={styles.dashboard__statLabel}>등록 인원</span>
            </div>
          </div>
        )}

        {/* 퀵 액션 */}
        <div className={styles.dashboard__card}>
          <div className={styles.dashboard__cardHeader}>QUICK ACTIONS</div>
          <div className={styles.dashboard__actions}>
            <Link href="/erp/sessions" className={styles.dashboard__action}>
              ◉ 세션 일정
            </Link>
            <Link href="/erp/sessions/report" className={styles.dashboard__action}>
              ◎ 세션 리포트
            </Link>
            <Link href="/erp/characters" className={styles.dashboard__action}>
              ⚔ 캐릭터
            </Link>
            <Link href="/erp/credits" className={styles.dashboard__action}>
              ◇ 크레딧
            </Link>
            <Link href="/erp/inventory" className={styles.dashboard__action}>
              ▣ 장비
            </Link>
            <Link href="/erp/notifications" className={styles.dashboard__action}>
              ⚡ 알림
            </Link>
            <Link href="/erp/profile" className={styles.dashboard__action}>
              ◎ 프로필
            </Link>
            {isAdmin && (
              <>
                <Link href="/erp/admin/users" className={styles.dashboard__action}>
                  ⚙ 사용자 관리
                </Link>
                <Link href="/erp/admin/members" className={styles.dashboard__action}>
                  ⚙ 멤버 관리
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 다가오는 세션 */}
      <div className={styles.dashboard__section}>
        <div className={styles.dashboard__sectionHeader}>UPCOMING SESSIONS</div>
        {upcomingSessions.length === 0 ? (
          <p className={styles.dashboard__empty}>
            예정된 세션이 없습니다.
          </p>
        ) : (
          <div className={styles.dashboard__sessions}>
            {upcomingSessions.map((s) => (
              <div key={String(s._id)} className={styles.dashboard__sessionCard}>
                <div className={styles.dashboard__sessionTitle}>{s.title}</div>
                <div className={styles.dashboard__sessionDate}>
                  {new Date(s.targetDateTime).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}
                  {" "}
                  {new Date(s.targetDateTime).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className={styles.dashboard__sessionStatus}>
                  {s.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
