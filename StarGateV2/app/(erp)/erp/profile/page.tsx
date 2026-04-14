import { redirect } from "next/navigation";
import Image from "next/image";

import { auth } from "@/lib/auth/config";
import { findUserById } from "@/lib/db/users";

import DiscordLinkButton from "./DiscordLinkButton";
import PasswordForm from "./PasswordForm";
import styles from "./page.module.css";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await findUserById(session.user.id);

  if (!user) {
    redirect("/login");
  }

  const roleLower = user.role.toLowerCase();

  return (
    <section className={styles.profile}>
      <div className={styles.profile__classification}>OPERATOR PROFILE</div>
      <h1 className={styles.profile__title}>프로필</h1>

      {/* 기본 정보 */}
      <div className={styles.section}>
        <div className={styles.section__header}>BASIC INFORMATION</div>
        <div className={styles.info}>
          <div className={styles.info__row}>
            <span className={styles.info__label}>USERNAME</span>
            <span className={styles.info__value}>{user.username}</span>
          </div>
          <div className={styles.info__row}>
            <span className={styles.info__label}>표시 이름</span>
            <span className={styles.info__value}>{user.displayName}</span>
          </div>
          <div className={styles.info__row}>
            <span className={styles.info__label}>역할</span>
            <span
              className={`${styles.badge} ${styles[`badge--${roleLower}`]}`}
            >
              {user.role}
            </span>
          </div>
          <div className={styles.info__row}>
            <span className={styles.info__label}>가입일</span>
            <span className={styles.info__value}>
              {new Date(user.createdAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <div className={styles.info__row}>
            <span className={styles.info__label}>마지막 로그인</span>
            <span className={styles.info__value}>
              {user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </div>
          {user.passwordChangedAt && (
            <div className={styles.info__row}>
              <span className={styles.info__label}>비밀번호 변경</span>
              <span className={styles.info__value}>
                {new Date(user.passwordChangedAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Discord 연동 */}
      <div className={styles.section}>
        <div className={styles.section__header}>DISCORD ACCOUNT</div>
        <div className={styles.discord}>
          {user.discordId ? (
            <div className={styles.discord__connected}>
              {user.discordAvatar ? (
                <Image
                  className={styles.discord__avatar}
                  src={user.discordAvatar}
                  alt={`${user.discordUsername} 아바타`}
                  width={48}
                  height={48}
                />
              ) : (
                <div
                  className={styles.discord__avatar}
                  aria-hidden="true"
                  style={{ background: "#5865f2" }}
                />
              )}
              <div className={styles.discord__info}>
                <span className={styles.discord__username}>
                  {user.discordUsername}
                </span>
                <span className={styles.discord__status}>연동됨</span>
              </div>
            </div>
          ) : (
            <div className={styles.discord__notConnected}>
              <span className={styles.discord__message}>
                Discord 계정이 연동되지 않았습니다.
              </span>
              <DiscordLinkButton />
            </div>
          )}
        </div>
      </div>

      {/* 비밀번호 변경 */}
      <div className={styles.section}>
        <div className={styles.section__header}>CHANGE PASSWORD</div>
        <PasswordForm />
      </div>

      {/* 참여 이력 (Phase 4 예정) */}
      <div className={styles.section}>
        <div className={styles.section__header}>PARTICIPATION HISTORY</div>
        <div className={styles.placeholder}>
          참여 이력 기능은 준비 중입니다.
        </div>
      </div>
    </section>
  );
}
