"use client";

import { useMemo, useState } from "react";

import type { UserPublic, UserRole, UserStatus } from "@/types/user";
import { USER_ROLES } from "@/types/user";

import { useUsers } from "@/hooks/queries/useUsersQuery";
import { useCreateUser } from "@/hooks/mutations/useUserMutation";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Seal from "@/components/ui/Seal/Seal";
import Select from "@/components/ui/Select/Select";
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

function getInitial(u: UserPublic): string {
  const source = u.displayName || u.username || "?";
  return source.charAt(0).toUpperCase();
}

interface Props {
  initialUsers: UserPublic[];
}

export default function UsersAdminClient({ initialUsers }: Props) {
  const { data: users = [] } = useUsers({ initialData: initialUsers });
  const createUser = useCreateUser();

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

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.discordUsername?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, query, roleFilter]);

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
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user._id}>
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
