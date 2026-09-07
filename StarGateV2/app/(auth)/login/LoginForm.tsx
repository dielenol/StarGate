"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

import {
  IconAccount,
  IconArrowRight,
  IconCaution,
  IconPasskey,
  IconSuccess,
} from "@/components/icons";
import { safeCallbackUrl } from "@/lib/auth/callback-url";

import styles from "./page.module.css";

type Provider = "credentials" | "discord" | "guest";
type LoginError = { message: string; credentials?: boolean };

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "아이디 또는 비밀번호를 확인해주세요.",
  NoAccount: "등록되지 않은 Discord 계정입니다. 관리자에게 문의해주세요.",
  AccountSuspended: "비활성화된 계정입니다. 관리자에게 문의해주세요.",
  OAuthSignin: "Discord 연결을 시작하지 못했습니다. 다시 시도해주세요.",
  OAuthCallbackError: "Discord 인증을 완료하지 못했습니다. 다시 시도해주세요.",
  AccessDenied: "접근이 허용되지 않았습니다. 관리자에게 문의해주세요.",
  Default: "인증을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
};

function describeError(code: string): LoginError {
  return {
    message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES.Default,
    credentials: code === "CredentialsSignin",
  };
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const queryError = searchParams.get("error");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<LoginError | null | undefined>();
  const [missingField, setMissingField] = useState<"username" | "password" | null>(null);
  const requestPending = useRef(false);
  const requestVersion = useRef(0);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const busy = provider !== null;
  const displayedError = error === undefined && queryError ? describeError(queryError) : error;
  const errorMessage = displayedError?.message;

  useEffect(() => {
    if (errorMessage) errorRef.current?.focus();
  }, [errorMessage]);

  useEffect(() => {
    // OAuth에서 브라우저의 뒤로 가기로 복귀하면 bfcache의 처리 중 상태를 해제한다.
    function restorePage(event: PageTransitionEvent) {
      if (!event.persisted) return;
      requestVersion.current += 1;
      requestPending.current = false;
      setProvider(null);
      setRedirecting(false);
      setPassword("");
      setShowPassword(false);
      setCapsLock(false);
    }
    window.addEventListener("pageshow", restorePage);
    return () => {
      requestVersion.current += 1;
      window.removeEventListener("pageshow", restorePage);
    };
  }, []);

  async function login(nextProvider: Provider) {
    if (requestPending.current) return;
    requestPending.current = true;
    const currentRequest = ++requestVersion.current;
    setProvider(nextProvider);
    setRedirecting(false);
    setError(null);
    setMissingField(null);
    setShowPassword(false);
    setCapsLock(false);

    try {
      const result = await signIn(nextProvider, {
        redirect: false,
        redirectTo: callbackUrl,
        ...(nextProvider === "credentials" ? { username: username.trim(), password } : {}),
      });
      if (currentRequest !== requestVersion.current) return;
      if (!result?.ok || result.error || !result.url) {
        setError(describeError(result?.error ?? "Default"));
        setProvider(null);
        requestPending.current = false;
        return;
      }

      setRedirecting(true);
      setPassword("");
      // 세션 쿠키가 반영된 새 문서로 진입한다. 내부 목적지는 기존 허용 목록을 따른다.
      window.location.assign(nextProvider === "discord" ? result.url : callbackUrl);
    } catch {
      if (currentRequest !== requestVersion.current) return;
      setError({ message: "연결이 원활하지 않습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요." });
      setRedirecting(false);
      setProvider(null);
      requestPending.current = false;
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current) return;
    if (!username.trim()) {
      setMissingField("username");
      setError(null);
      usernameRef.current?.focus();
      return;
    }
    if (!password) {
      setMissingField("password");
      setError(null);
      passwordRef.current?.focus();
      return;
    }
    void login("credentials");
  }

  function progressIcon(activeProvider: Provider) {
    if (provider !== activeProvider) return <IconArrowRight />;
    return redirecting ? <IconSuccess /> : <span className={styles.login__spinner} aria-hidden="true" />;
  }

  const status = redirecting
    ? provider === "discord" ? "Discord 인증 페이지로 이동합니다." : "인증되었습니다. 운영 시스템으로 이동합니다."
    : provider === "credentials" ? "계정을 확인하고 있습니다."
      : provider === "discord" ? "Discord에 연결하고 있습니다."
        : provider === "guest" ? "게스트 미리보기를 준비하고 있습니다." : "";

  return (
    <>
      <form className={styles.login__form} onSubmit={handleSubmit} noValidate aria-busy={busy}>
        <div className={styles.login__field}>
          <label className={styles.login__label} htmlFor="login-username">아이디 <span>IDENTIFICATION</span></label>
          <div className={styles["login__input-wrap"]}>
            <IconAccount />
            <input
              ref={usernameRef}
              id="login-username"
              name="username"
              className={styles.login__input}
              value={username}
              onChange={(event) => { setUsername(event.target.value); setError(null); if (missingField === "username") setMissingField(null); }}
              placeholder="발급받은 아이디"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              readOnly={busy}
              aria-invalid={missingField === "username" || displayedError?.credentials || undefined}
              aria-describedby={missingField === "username" ? "username-error" : displayedError?.credentials ? "login-error" : undefined}
            />
          </div>
          {missingField === "username" && <p className={styles["login__field-error"]} id="username-error">아이디를 입력해주세요.</p>}
        </div>

        <div className={styles.login__field}>
          <label className={styles.login__label} htmlFor="login-password">비밀번호 <span>PASSPHRASE</span></label>
          <div className={styles["login__input-wrap"]}>
            <IconPasskey />
            <input
              ref={passwordRef}
              id="login-password"
              name="password"
              className={styles.login__input}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(null); if (missingField === "password") setMissingField(null); }}
              onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))}
              onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
              onBlur={() => setCapsLock(false)}
              placeholder="비밀번호 입력"
              autoComplete="current-password"
              required
              readOnly={busy}
              aria-invalid={missingField === "password" || displayedError?.credentials || undefined}
              aria-describedby={[
                missingField === "password" ? "password-error" : displayedError?.credentials ? "login-error" : "",
                capsLock ? "caps-lock-note" : "",
              ].filter(Boolean).join(" ") || undefined}
            />
            <button className={styles.login__reveal} type="button" onClick={() => setShowPassword(!showPassword)} aria-label="비밀번호 표시" aria-pressed={showPassword} disabled={busy}>
              {showPassword ? "숨김" : "표시"}
            </button>
          </div>
          {missingField === "password" && <p className={styles["login__field-error"]} id="password-error">비밀번호를 입력해주세요.</p>}
          {capsLock && <p className={styles["login__caps-note"]} id="caps-lock-note" role="status">Caps Lock이 켜져 있습니다.</p>}
        </div>

        {displayedError && (
          <div ref={errorRef} className={styles.login__error} id="login-error" role="alert" tabIndex={-1}>
            <IconCaution /><span>{displayedError.message}</span>
          </div>
        )}

        <button className={styles.login__submit} type="submit" disabled={busy}>
          <span>{provider === "credentials" ? redirecting ? "인증 완료" : "인증 중" : "로그인"}</span>
          {progressIcon("credentials")}
        </button>
      </form>

      <p className={styles.login__status} role="status" aria-live="polite" aria-atomic="true">{status}</p>
      <div className={styles.login__divider}><span>다른 방법으로 접속</span></div>

      <button className={styles.login__discord} type="button" onClick={() => void login("discord")} disabled={busy}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
        <span>{provider === "discord" ? "Discord 연결 중" : "Discord로 로그인"}</span>
        {progressIcon("discord")}
      </button>
      <p className={styles["login__discord-note"]}>Discord 계정으로도 접속할 수 있습니다.</p>

      <div className={styles.login__guest}>
        <div><span>먼저 살펴보고 싶으신가요?</span><p>계정 없이 공개된 기록을 열람하세요.</p></div>
        <button type="button" onClick={() => void login("guest")} disabled={busy}>
          <span>{provider === "guest" ? "준비 중" : "게스트 입장"}</span>{progressIcon("guest")}
        </button>
      </div>
    </>
  );
}
