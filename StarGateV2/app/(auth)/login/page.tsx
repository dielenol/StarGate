"use client";

import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";

import { resolvePublicAssetPath } from "@/lib/asset-path";

import styles from "./page.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "아이디 또는 비밀번호가 올바르지 않습니다.",
  NoAccount: "등록되지 않은 Discord 계정입니다. 관리자에게 문의하세요.",
  AccountSuspended: "비활성화된 계정입니다. 관리자에게 문의하세요.",
  Default: "인증 중 오류가 발생했습니다. 다시 시도해주세요.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const logoSrc = resolvePublicAssetPath("/assets/StarGate_logo.png");

  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.Default
    : null;

  async function handleCredentialsLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    await signIn("credentials", {
      username: username.trim(),
      password,
      callbackUrl: "/erp",
    });
    setLoading(false);
  }

  function handleDiscordLogin() {
    signIn("discord", { callbackUrl: "/erp" });
  }

  return (
    <div className={styles.login}>
      <Image
        className={styles.login__logo}
        src={logoSrc}
        alt="NOVUS ORDO 로고"
        width={80}
        height={80}
        priority
      />
      <h1 className={styles.login__title}>NOVUS ORDO</h1>
      <p className={styles.login__subtitle}>CLASSIFIED ACCESS PORTAL</p>

      <form className={styles.login__form} onSubmit={handleCredentialsLogin}>
        <label className={styles.login__label}>
          IDENTIFICATION
          <input
            className={styles.login__input}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="신원 식별 코드를 입력하세요"
            autoComplete="username"
          />
        </label>

        <label className={styles.login__label}>
          PASSPHRASE
          <input
            className={styles.login__input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="인증 암호를 입력하세요"
            autoComplete="current-password"
          />
        </label>

        <button
          className={styles.login__button}
          type="submit"
          disabled={loading}
        >
          {loading ? "인증 처리 중..." : "로그인"}
        </button>
      </form>

      <div className={styles.login__divider}>
        <span className={styles["login__divider-line"]} />
        <span className={styles["login__divider-text"]}>OR</span>
        <span className={styles["login__divider-line"]} />
      </div>

      <button
        className={styles.login__discord}
        type="button"
        onClick={handleDiscordLogin}
      >
        <svg
          className={styles["login__discord-icon"]}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
        Discord로 로그인
      </button>

      {errorMessage ? (
        <div className={styles.login__error} role="alert">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
