import { redirect } from "next/navigation";

import type { UserPublic, UserRole, UserStatus } from "@/types/user";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listUsers } from "@/lib/db/users";
import { countSessionParticipation } from "@/lib/db/registrar-read";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Seal from "@/components/ui/Seal/Seal";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

const ROLE_TONE: Record<UserRole, "gold" | "info" | "success" | "danger" | "default"> = {
  SUPER_ADMIN: "danger",
  ADMIN: "gold",
  GM: "info",
  PLAYER: "success",
  GUEST: "default",
};

const STATUS_TONE: Record<UserStatus, "success" | "danger" | "default"> = {
  ACTIVE: "success",
  SUSPENDED: "danger",
  INACTIVE: "default",
};

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function getInitial(m: UserPublic): string {
  const source = m.displayName || m.username || "?";
  return source.charAt(0).toUpperCase();
}

export default async function MembersAdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.role, "ADMIN")) {
    redirect("/erp");
  }

  const [users, participation] = await Promise.all([
    listUsers().catch((): UserPublic[] => []),
    countSessionParticipation().catch((): Record<string, number> => ({})),
  ]);

  function getParticipationCount(user: UserPublic): number {
    if (user.discordId) {
      return participation[user.discordId] ?? 0;
    }
    return participation[user._id] ?? 0;
  }

  const activeCount = users.filter((u) => u.status === "ACTIVE").length;
  const totalParticipation = Object.values(participation).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <>
      <PageHead breadcrumb="ERP / ADMIN / MEMBERS" title="멤버 관리" />

      <div className={styles.stats}>
        <Box>
          <Eyebrow>TOTAL</Eyebrow>
          <div className={styles.statNum}>{users.length}</div>
        </Box>
        <Box>
          <Eyebrow>ACTIVE</Eyebrow>
          <div className={`${styles.statNum} ${styles.statNumSuccess}`}>
            {activeCount}
          </div>
        </Box>
        <Box>
          <Eyebrow>SESSION PARTICIPATION</Eyebrow>
          <div className={`${styles.statNum} ${styles.statNumGold}`}>
            {totalParticipation}
          </div>
        </Box>
      </div>

      <Box>
        <PanelTitle
          right={<span className={styles.mono}>{users.length} 명</span>}
        >
          MEMBER ROSTER
        </PanelTitle>

        {users.length === 0 ? (
          <div className={styles.empty}>등록된 멤버가 없습니다.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th aria-label="이니셜" />
                  <th>이름</th>
                  <th>역할</th>
                  <th>상태</th>
                  <th>디스코드</th>
                  <th className={styles.dateCol}>마지막 로그인</th>
                  <th className={styles.numCol}>참여 세션</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td>
                      <Seal size="sm">{getInitial(user)}</Seal>
                    </td>
                    <td>
                      <div className={styles.nameCell}>
                        <span className={styles.strong}>
                          {user.displayName}
                        </span>
                        <span className={styles.sub}>{user.username}</span>
                      </div>
                    </td>
                    <td>
                      <Tag tone={ROLE_TONE[user.role]}>{user.role}</Tag>
                    </td>
                    <td>
                      <Tag tone={STATUS_TONE[user.status]}>{user.status}</Tag>
                    </td>
                    <td className={styles.mono}>
                      {user.discordUsername ?? "—"}
                    </td>
                    <td className={`${styles.dateCol} ${styles.mono}`}>
                      {fmtDate(user.lastLoginAt)}
                    </td>
                    <td className={`${styles.numCol} ${styles.mono}`}>
                      {getParticipationCount(user)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </>
  );
}
