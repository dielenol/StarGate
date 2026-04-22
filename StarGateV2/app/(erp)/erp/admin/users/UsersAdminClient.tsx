"use client";

import { useMemo, useState } from "react";

import type { UserPublic, UserRole, UserStatus } from "@/types/user";
import { USER_ROLES, USER_STATUSES } from "@/types/user";

import { useUsers } from "@/hooks/queries/useUsersQuery";
import {
  useCreateUser,
  useDeleteUser,
  useResetUserPassword,
  useUnlinkDiscord,
  useUpdateUserRole,
  useUpdateUserStatus,
} from "@/hooks/mutations/useUserMutation";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Seal from "@/components/ui/Seal/Seal";
import Select from "@/components/ui/Select/Select";
import Tag from "@/components/ui/Tag/Tag";

import { hasRole } from "@/lib/auth/rbac";

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

function getInitial(u: UserPublic): string {
  const source = u.displayName || u.username || "?";
  return source.charAt(0).toUpperCase();
}

interface Props {
  initialUsers: UserPublic[];
  currentUserId: string;
  currentUserRole: UserRole;
}

interface ResetResult {
  username: string;
  plainPassword: string;
}

export default function UsersAdminClient({
  initialUsers,
  currentUserId,
  currentUserRole,
}: Props) {
  const { data: users = [] } = useUsers({ initialData: initialUsers });

  const createUser = useCreateUser();
  const updateRole = useUpdateUserRole();
  const updateStatus = useUpdateUserStatus();
  const resetPassword = useResetUserPassword();
  const unlinkDiscord = useUnlinkDiscord();
  const deleteUser = useDeleteUser();

  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("PLAYER");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | UserStatus>("ALL");
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.status === "ACTIVE").length,
      suspended: users.filter((u) => u.status === "SUSPENDED").length,
    }),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (statusFilter !== "ALL" && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.discordUsername?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, query, roleFilter, statusFilter]);

  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";

  function handleToggleForm() {
    setShowForm((prev) => !prev);
    setGeneratedPassword(null);
    setError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGeneratedPassword(null);

    createUser.mutate(
      { username, displayName, role },
      {
        onSuccess: (data) => {
          setGeneratedPassword(data.plainPassword);
          setUsername("");
          setDisplayName("");
          setRole("PLAYER");
        },
        onError: (err) => {
          setError(err.message);
        },
      },
    );
  }

  function handleRoleChange(user: UserPublic, nextRole: UserRole) {
    if (nextRole === user.role) return;
    const ok = window.confirm(
      `${user.displayName}(${user.username})의 역할을 ${user.role} → ${nextRole} 로 변경합니다. 계속하시겠습니까?`,
    );
    if (!ok) return;

    const userId = user._id;
    setPendingUserIds((prev) => new Set(prev).add(userId));
    updateRole.mutate(
      { userId, role: nextRole },
      {
        onError: (err) => {
          window.alert(err.message);
        },
        onSettled: () => {
          setPendingUserIds((prev) => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        },
      },
    );
  }

  function handleStatusToggle(user: UserPublic) {
    const nextStatus: UserStatus =
      user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const label = nextStatus === "ACTIVE" ? "복구" : "정지";
    const ok = window.confirm(
      `${user.displayName}(${user.username}) 계정을 ${label}합니다. 계속하시겠습니까?`,
    );
    if (!ok) return;

    const userId = user._id;
    setPendingUserIds((prev) => new Set(prev).add(userId));
    updateStatus.mutate(
      { userId, status: nextStatus },
      {
        onError: (err) => {
          window.alert(err.message);
        },
        onSettled: () => {
          setPendingUserIds((prev) => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        },
      },
    );
  }

  async function handleResetPassword(user: UserPublic) {
    const ok = window.confirm(
      `${user.displayName}(${user.username})의 비밀번호를 초기화합니다. 계속하시겠습니까?`,
    );
    if (!ok) return;

    const userId = user._id;
    setPendingUserIds((prev) => new Set(prev).add(userId));
    try {
      const data = await resetPassword.mutateAsync({ userId });
      setResetResult({
        username: user.username,
        plainPassword: data.plainPassword,
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "비밀번호 초기화에 실패했습니다.");
    } finally {
      setPendingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  function handleUnlinkDiscord(user: UserPublic) {
    const ok = window.confirm(
      `${user.displayName}(${user.username})의 디스코드 연동을 해제합니다. 계속하시겠습니까?`,
    );
    if (!ok) return;

    const userId = user._id;
    setPendingUserIds((prev) => new Set(prev).add(userId));
    unlinkDiscord.mutate(
      { userId },
      {
        onError: (err) => {
          window.alert(err.message);
        },
        onSettled: () => {
          setPendingUserIds((prev) => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        },
      },
    );
  }

  function handleDelete(user: UserPublic) {
    const confirmed = window.prompt(
      `삭제를 확인하려면 사용자명 "${user.username}"을 정확히 입력하세요 (대소문자 구분).\n\n` +
        `삭제 후 이 사용자의 캐릭터들은 소유자가 해제(ownerId=null)됩니다.`,
    );
    if (confirmed === null) return;
    if (confirmed !== user.username) {
      window.alert("입력한 사용자명이 일치하지 않아 취소됩니다.");
      return;
    }

    const userId = user._id;
    setPendingUserIds((prev) => new Set(prev).add(userId));
    deleteUser.mutate(
      { userId },
      {
        onError: (err) => {
          window.alert(err.message);
        },
        onSettled: () => {
          setPendingUserIds((prev) => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        },
      },
    );
  }

  return (
    <>
      <PageHead
        breadcrumb="ERP / ADMIN / USERS"
        title="사용자 관리"
        right={
          <Button
            variant={showForm ? "default" : "primary"}
            onClick={handleToggleForm}
          >
            {showForm ? "취소" : "＋ 사용자 추가"}
          </Button>
        }
      />

      <div className={styles.stats}>
        <Box>
          <Eyebrow>TOTAL</Eyebrow>
          <div className={styles.statNum}>{stats.total}</div>
        </Box>
        <Box>
          <Eyebrow>ACTIVE</Eyebrow>
          <div className={`${styles.statNum} ${styles["statNum--success"]}`}>
            {stats.active}
          </div>
        </Box>
        <Box>
          <Eyebrow>SUSPENDED</Eyebrow>
          <div className={`${styles.statNum} ${styles["statNum--danger"]}`}>
            {stats.suspended}
          </div>
        </Box>
      </div>

      {resetResult ? (
        <div className={styles.resetBanner} role="status">
          <div className={styles.resetBanner__header}>
            <div>
              <div className={styles.resetBanner__title}>
                비밀번호 초기화 완료 · 1회 표시
              </div>
              <div className={styles.resetBanner__target}>
                대상: {resetResult.username}
              </div>
            </div>
            <button
              type="button"
              className={styles.resetBanner__dismiss}
              onClick={() => setResetResult(null)}
            >
              닫기
            </button>
          </div>
          <code className={styles.resetBanner__code}>
            {resetResult.plainPassword}
          </code>
          <p className={styles.resetBanner__note}>
            이 비밀번호를 사용자에게 전달하세요. 닫거나 페이지를 벗어나면 다시
            확인할 수 없습니다.
          </p>
        </div>
      ) : null}

      {showForm ? (
        <Box className={styles.formBox}>
          <PanelTitle>NEW USER · ADMIN</PanelTitle>
          <form className={styles.form} onSubmit={handleCreate}>
            <div className={styles.formRow}>
              <label className={styles.field}>
                <Eyebrow>USERNAME</Eyebrow>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="영문 소문자, 숫자, 언더스코어"
                  required
                />
              </label>
              <label className={styles.field}>
                <Eyebrow>표시 이름</Eyebrow>
                <Input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="표시될 이름"
                  required
                />
              </label>
              <label className={styles.field}>
                <Eyebrow>역할</Eyebrow>
                <Select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className={styles.formActions}>
              <Button
                type="submit"
                variant="primary"
                disabled={createUser.isPending}
              >
                {createUser.isPending ? "생성 중..." : "사용자 생성"}
              </Button>
            </div>

            {error ? (
              <div className={styles.error} role="alert">
                {error}
              </div>
            ) : null}

            {generatedPassword ? (
              <div className={styles.password} role="status">
                <Eyebrow tone="gold">초기 비밀번호 · 1회 표시</Eyebrow>
                <code className={styles.passwordCode}>{generatedPassword}</code>
                <p className={styles.passwordNote}>
                  이 비밀번호를 사용자에게 전달하세요. 이 페이지를 벗어나면 다시
                  확인할 수 없습니다.
                </p>
              </div>
            ) : null}
          </form>
        </Box>
      ) : null}

      <Box>
        <PanelTitle
          right={<span className={styles.mono}>{users.length} 명</span>}
        >
          USER DIRECTORY
        </PanelTitle>

        <div className={styles.filters}>
          <Input
            className={styles.search}
            type="search"
            placeholder="이름 · USERNAME · 디스코드"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            className={styles.roleFilter}
            value={roleFilter}
            onChange={(e) =>
              setRoleFilter(e.target.value as "ALL" | UserRole)
            }
          >
            <option value="ALL">ROLE: ALL</option>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                ROLE: {r}
              </option>
            ))}
          </Select>
          <Select
            className={styles.statusFilter}
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "ALL" | UserStatus)
            }
          >
            <option value="ALL">STATUS: ALL</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                STATUS: {s}
              </option>
            ))}
          </Select>
        </div>

        {filteredUsers.length === 0 ? (
          <div className={styles.empty}>조건에 맞는 사용자가 없습니다.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th aria-label="이니셜" />
                  <th>이름</th>
                  <th>USERNAME</th>
                  <th>역할</th>
                  <th>상태</th>
                  <th>디스코드</th>
                  <th className={styles.dateCol}>마지막 로그인</th>
                  <th className={styles.actionCol}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const isSelf = user._id === currentUserId;
                  const targetIsSuperAdmin = user.role === "SUPER_ADMIN";
                  const isRowPending = pendingUserIds.has(user._id);

                  // 액션 권한 매트릭스 (행 단위):
                  //  - 역할 변경 / 삭제 (SUPER_ADMIN+): 본인 제외, 대상이 SUPER_ADMIN이어도 본인이 SUPER_ADMIN이면 허용
                  //  - 상태 / 비번 리셋 / 디코 해제 (ADMIN+): 본인 제외, 대상이 SUPER_ADMIN인 경우 본인도 SUPER_ADMIN이어야 허용
                  //  - UI disabled는 보조 방어선 — 최종 권한 검증은 서버 API에서 수행
                  const canActOnTarget =
                    !isSelf && (isSuperAdmin || !targetIsSuperAdmin);
                  const canSuperOnlyAction = isSuperAdmin && canActOnTarget;

                  const adminDisabledTitle = isSelf
                    ? "자신의 계정에는 액션을 수행할 수 없습니다"
                    : targetIsSuperAdmin && !isSuperAdmin
                      ? "SUPER_ADMIN 대상 액션은 SUPER_ADMIN 권한이 필요합니다"
                      : undefined;
                  const superDisabledTitle = isSelf
                    ? "자신의 계정에는 액션을 수행할 수 없습니다"
                    : !isSuperAdmin
                      ? "SUPER_ADMIN 권한이 필요합니다"
                      : undefined;

                  return (
                    <tr
                      key={user._id}
                      className={isSelf ? styles.selfRow : undefined}
                    >
                      <td>
                        <Seal size="sm">{getInitial(user)}</Seal>
                      </td>
                      <td className={styles.strong}>{user.displayName}</td>
                      <td className={styles.mono}>{user.username}</td>
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
                      <td className={styles.actionCol}>
                        <div className={styles.actionGroup}>
                          <Select
                            className={styles.roleSelect}
                            value={user.role}
                            disabled={!canSuperOnlyAction || isRowPending}
                            title={superDisabledTitle}
                            onChange={(e) =>
                              handleRoleChange(
                                user,
                                e.target.value as UserRole,
                              )
                            }
                          >
                            {USER_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </Select>

                          <button
                            type="button"
                            className={
                              user.status === "ACTIVE"
                                ? `${styles.actionBtn} ${styles["actionBtn--danger"]}`
                                : `${styles.actionBtn} ${styles["actionBtn--success"]}`
                            }
                            disabled={
                              !canActOnTarget ||
                              isRowPending ||
                              !hasRole(currentUserRole, "ADMIN")
                            }
                            title={adminDisabledTitle}
                            onClick={() => handleStatusToggle(user)}
                          >
                            {user.status === "ACTIVE" ? "정지" : "복구"}
                          </button>

                          <button
                            type="button"
                            className={styles.actionBtn}
                            disabled={!canActOnTarget || isRowPending}
                            title={adminDisabledTitle}
                            onClick={() => handleResetPassword(user)}
                          >
                            비번 리셋
                          </button>

                          {user.discordId ? (
                            <button
                              type="button"
                              className={styles.actionBtn}
                              disabled={!canActOnTarget || isRowPending}
                              title={adminDisabledTitle}
                              onClick={() => handleUnlinkDiscord(user)}
                            >
                              디코 해제
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles["actionBtn--danger"]}`}
                            disabled={!canSuperOnlyAction || isRowPending}
                            title={superDisabledTitle}
                            onClick={() => handleDelete(user)}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </>
  );
}
