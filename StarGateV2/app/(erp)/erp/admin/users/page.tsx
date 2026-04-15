"use client";

import { useState } from "react";

import type { UserRole } from "@/types/user";
import { USER_ROLES } from "@/types/user";

import { useUsers } from "@/hooks/queries/useUsersQuery";
import { useCreateUser } from "@/hooks/mutations/useUserMutation";

import styles from "./page.module.css";

export default function UsersAdminPage() {
  const { data: users = [], isLoading: loading } = useUsers();
  const createUser = useCreateUser();

  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("PLAYER");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className={styles.page}>
      <div className={styles.page__header}>
        <h1 className={styles.page__title}>사용자 관리</h1>
        <button
          className={styles.page__add}
          type="button"
          onClick={() => {
            setShowForm(!showForm);
            setGeneratedPassword(null);
            setError(null);
          }}
        >
          {showForm ? "취소" : "+ 사용자 추가"}
        </button>
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.form__row}>
            <label className={styles.form__label}>
              USERNAME
              <input
                className={styles.form__input}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="영문 소문자, 숫자, 언더스코어"
                required
              />
            </label>
            <label className={styles.form__label}>
              표시 이름
              <input
                className={styles.form__input}
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="표시될 이름"
                required
              />
            </label>
            <label className={styles.form__label}>
              역할
              <select
                className={styles.form__select}
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className={styles.form__submit}
            type="submit"
            disabled={createUser.isPending}
          >
            {createUser.isPending ? "생성 중..." : "사용자 생성"}
          </button>

          {error && (
            <div className={styles.form__error} role="alert">
              {error}
            </div>
          )}

          {generatedPassword && (
            <div className={styles.form__password} role="status">
              <strong>초기 비밀번호 (한 번만 표시됨):</strong>
              <code className={styles["form__password-code"]}>
                {generatedPassword}
              </code>
              <p>이 비밀번호를 사용자에게 전달하세요. 이 페이지를 벗어나면 다시 확인할 수 없습니다.</p>
            </div>
          )}
        </form>
      )}

      {loading ? (
        <p className={styles.page__loading}>불러오는 중...</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>USERNAME</th>
              <th>표시 이름</th>
              <th>역할</th>
              <th>상태</th>
              <th>Discord</th>
              <th>마지막 로그인</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id}>
                <td>{user.username}</td>
                <td>{user.displayName}</td>
                <td>
                  <span className={`${styles.badge} ${styles[`badge--${user.role.toLowerCase()}`]}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <span className={`${styles.status} ${styles[`status--${user.status.toLowerCase()}`]}`}>
                    {user.status}
                  </span>
                </td>
                <td>{user.discordUsername ?? "—"}</td>
                <td>
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString("ko-KR")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
