import Image from "next/image";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findUserById } from "@/lib/db/users";

import PageHead from "@/components/ui/PageHead/PageHead";

import DiscordLinkButton from "./DiscordLinkButton";
import PasswordForm from "./PasswordForm";

import styles from "./page.module.css";

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${fmtDate(date)} · ${hh}:${mm}`;
}

function daysSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return null;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await findUserById(session.user.id);

  if (!user) {
    redirect("/login");
  }

  const initial = (user.displayName || user.username).charAt(0).toUpperCase();
  const isGm = user.role === "GM";
  const statusActive = user.status === "ACTIVE";
  const discordConnected = Boolean(user.discordId);
  const pwChangedDays = daysSince(user.passwordChangedAt);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ACCOUNT" },
        ]}
        title="계정 설정"
      />

      <div className={styles.layout}>
        {/* ── 좌측 사이드 (신원 dossier) ── */}
        <aside className={`${styles.box} ${styles.side}`}>
          <div className={styles.sideHeader}>
            <div className={styles.sideHeader__seal} aria-hidden>
              {initial}
            </div>
            <h2 className={styles.sideHeader__name}>{user.displayName}</h2>
            <div className={styles.sideHeader__role}>{user.role}</div>
            <div className={styles.sideHeader__sub}>{user.username}</div>
          </div>

          <div className={styles.sideTags}>
            <span
              className={`${styles.roleBadge} ${
                isGm ? styles["roleBadge--gm"] : ""
              }`}
            >
              CLR · {user.role}
            </span>
            <span
              className={`${styles.statusBadge} ${
                statusActive
                  ? styles["statusBadge--active"]
                  : styles["statusBadge--suspended"]
              }`}
            >
              {user.status}
            </span>
          </div>

          <dl className={styles.kv}>
            <div className={styles.kv__row}>
              <dt>가입일</dt>
              <dd>
                <span className={styles.mono}>{fmtDate(user.createdAt)}</span>
              </dd>
            </div>
            <div className={styles.kv__row}>
              <dt>마지막 접속</dt>
              <dd>
                {user.lastLoginAt ? (
                  <>
                    <span className={styles.mono}>
                      {fmtDateTime(user.lastLoginAt)}
                    </span>
                    <span className={styles.kvKst}>KST</span>
                  </>
                ) : (
                  <span className={styles.kvEmpty}>NEVER</span>
                )}
              </dd>
            </div>
            {user.passwordChangedAt ? (
              <div className={styles.kv__row}>
                <dt>PW 변경</dt>
                <dd>
                  <span className={styles.mono}>
                    {fmtDate(user.passwordChangedAt)}
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
        </aside>

        {/* ── 우측 메인 ── */}
        <div className={styles.main}>
          {/* ACCOUNT */}
          <section className={styles.box}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitle__label}>
                ACCOUNT
                <span className={styles.panelTitle__sub}>시스템 메타데이터</span>
              </span>
              <div className={styles.panelTitle__right}>
                <span
                  className={`${styles.connectedBadge} ${styles["connectedBadge--on"]}`}
                >
                  VERIFIED
                </span>
              </div>
            </div>
            <dl className={styles.kv}>
              <div className={styles.kv__row}>
                <dt>USERNAME</dt>
                <dd>
                  <span className={styles.mono}>{user.username}</span>
                </dd>
              </div>
              <div className={styles.kv__row}>
                <dt>표시명</dt>
                <dd>{user.displayName}</dd>
              </div>
              <div className={styles.kv__row}>
                <dt>역할</dt>
                <dd>
                  <span
                    className={`${styles.roleBadge} ${
                      isGm ? styles["roleBadge--gm"] : ""
                    }`}
                  >
                    {user.role}
                  </span>
                </dd>
              </div>
              <div className={styles.kv__row}>
                <dt>상태</dt>
                <dd>
                  <span
                    className={`${styles.statusBadge} ${
                      statusActive
                        ? styles["statusBadge--active"]
                        : styles["statusBadge--suspended"]
                    }`}
                  >
                    {user.status}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          {/* DISCORD */}
          <section className={styles.box}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitle__label}>DISCORD LINK</span>
              <div className={styles.panelTitle__right}>
                <span
                  className={`${styles.connectedBadge} ${
                    discordConnected
                      ? styles["connectedBadge--on"]
                      : styles["connectedBadge--off"]
                  }`}
                >
                  {discordConnected ? "CONNECTED" : "NOT LINKED"}
                </span>
              </div>
            </div>

            {discordConnected ? (
              <>
                <div className={styles.discord}>
                  <div className={styles.discord__avatar}>
                    {user.discordAvatar ? (
                      <Image
                        src={user.discordAvatar}
                        alt={`${user.discordUsername ?? "Discord"} 아바타`}
                        width={64}
                        height={64}
                      />
                    ) : (
                      <div
                        className={styles.discord__avatarFallback}
                        aria-hidden
                      >
                        {(
                          user.discordGlobalName?.charAt(0) ??
                          user.discordUsername?.charAt(0) ??
                          "D"
                        ).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className={styles.discord__info}>
                    <div className={styles.discord__name}>
                      {user.discordGlobalName ??
                        user.discordUsername ??
                        "(unknown)"}
                    </div>
                    <div className={styles.discord__handle}>
                      {user.discordUsername
                        ? `@${user.discordUsername}`
                        : "—"}
                    </div>
                  </div>
                  <div className={styles.discord__action}>
                    <DiscordLinkButton variant="ghost">
                      다시 연동
                    </DiscordLinkButton>
                  </div>
                </div>
                <dl className={styles.kv}>
                  <div className={styles.kv__row}>
                    <dt>USER ID</dt>
                    <dd>
                      <span
                        className={`${styles.mono} ${styles["mono--break"]}`}
                      >
                        {user.discordId}
                      </span>
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className={styles.discord__empty}>
                <div className={styles.discord__emptyText}>
                  아직 Discord 계정이 연결되지 않았습니다
                </div>
                <DiscordLinkButton variant="primary" />
              </div>
            )}
          </section>

          {/* SECURITY */}
          <section className={styles.box}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitle__label}>
                SECURITY
                <span className={styles.panelTitle__sub}>· 비밀번호 변경</span>
              </span>
              <div className={styles.panelTitle__right}>
                <span className={styles.kvKst} style={{ fontSize: "10px" }}>
                  {pwChangedDays !== null
                    ? `최근 변경 ${pwChangedDays}일 전`
                    : "변경 이력 없음"}
                </span>
              </div>
            </div>
            <PasswordForm />
          </section>
        </div>
      </div>
    </>
  );
}
