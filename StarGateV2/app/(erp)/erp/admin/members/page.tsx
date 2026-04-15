import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listUsers } from "@/lib/db/users";
import { countSessionParticipation } from "@/lib/db/registrar-read";

import styles from "./page.module.css";

export default async function MembersAdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.role, "ADMIN")) {
    redirect("/erp");
  }

  const [users, participation] = await Promise.all([
    listUsers().catch((): Awaited<ReturnType<typeof listUsers>> => []),
    countSessionParticipation().catch((): Record<string, number> => ({})),
  ]);

  // discordId → userId 매핑으로 참여 횟수 연결
  function getParticipationCount(user: (typeof users)[number]): number {
    // session_responses의 userId는 Discord userId
    if (user.discordId) {
      return participation[user.discordId] ?? 0;
    }
    return participation[user._id] ?? 0;
  }

  return (
    <section className={styles.members}>
      <div className={styles.members__classification}>
        ADMIN / PERSONNEL MANAGEMENT
      </div>
      <h1 className={styles.members__title}>멤버 관리</h1>

      <div className={styles.members__stats}>
        <div className={styles.members__statCard}>
          <span className={styles.members__statNumber}>{users.length}</span>
          <span className={styles.members__statLabel}>전체 인원</span>
        </div>
        <div className={styles.members__statCard}>
          <span className={styles.members__statNumber}>
            {users.filter((u) => u.status === "ACTIVE").length}
          </span>
          <span className={styles.members__statLabel}>활성 인원</span>
        </div>
        <div className={styles.members__statCard}>
          <span className={styles.members__statNumber}>
            {Object.values(participation).reduce((a, b) => a + b, 0)}
          </span>
          <span className={styles.members__statLabel}>총 세션 참여</span>
        </div>
      </div>

      {users.length === 0 ? (
        <p className={styles.members__empty}>등록된 멤버가 없습니다.</p>
      ) : (
        <div className={styles.members__tableWrap}>
          <table className={styles.members__table}>
            <thead>
              <tr>
                <th>표시 이름</th>
                <th>역할</th>
                <th>상태</th>
                <th>마지막 로그인</th>
                <th>참여 세션</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td className={styles.members__name}>{user.displayName}</td>
                  <td>
                    <span
                      className={`${styles.members__badge} ${styles[`members__badge--${user.role.toLowerCase()}`]}`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.members__status} ${styles[`members__status--${user.status.toLowerCase()}`]}`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className={styles.members__date}>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString("ko-KR")
                      : "\u2014"}
                  </td>
                  <td className={styles.members__count}>
                    {getParticipationCount(user)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
