import Image from "next/image";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findUserById } from "@/lib/db/users";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Seal from "@/components/ui/Seal/Seal";
import Tag from "@/components/ui/Tag/Tag";

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
        {/* ── 좌측 사이드 ── */}
        <Box className={styles.side}>
          <div className={styles.sideHeader}>
            <Seal size="lg" className={styles.sideHeader__seal}>
              {initial}
            </Seal>
            <h2 className={styles.sideHeader__name}>{user.displayName}</h2>
            <div className={styles.sideHeader__role}>{user.role}</div>
            <div className={styles.sideHeader__sub}>{user.username}</div>
          </div>

          <div className={styles.sideTags}>
            <Tag tone="gold">CLR {user.role}</Tag>
            <Tag tone={user.status === "ACTIVE" ? "success" : "default"}>
              {user.status}
            </Tag>
          </div>

          <dl className={styles.kv}>
            <div className={styles.kv__row}>
              <dt>가입일</dt>
              <dd className={styles.mono}>{fmtDate(user.createdAt)}</dd>
            </div>
            <div className={styles.kv__row}>
              <dt>마지막 접속</dt>
              <dd className={styles.mono}>
                {user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : "—"}
              </dd>
            </div>
            {user.passwordChangedAt ? (
              <div className={styles.kv__row}>
                <dt>PW 변경</dt>
                <dd className={styles.mono}>
                  {fmtDate(user.passwordChangedAt)}
                </dd>
              </div>
            ) : null}
          </dl>
        </Box>

        {/* ── 우측 메인 ── */}
        <div className={styles.main}>
          <Box>
            <PanelTitle>ACCOUNT</PanelTitle>
            <dl className={styles.kv}>
              <div className={styles.kv__row}>
                <dt>USERNAME</dt>
                <dd className={styles.mono}>{user.username}</dd>
              </div>
              <div className={styles.kv__row}>
                <dt>표시명</dt>
                <dd>{user.displayName}</dd>
              </div>
              <div className={styles.kv__row}>
                <dt>역할</dt>
                <dd>
                  <Tag tone="gold">{user.role}</Tag>
                </dd>
              </div>
              <div className={styles.kv__row}>
                <dt>상태</dt>
                <dd>{user.status}</dd>
              </div>
            </dl>
          </Box>

          <Box variant="gold">
            <PanelTitle
              right={
                user.discordId ? (
                  <Tag tone="success">CONNECTED</Tag>
                ) : (
                  <Tag>NOT LINKED</Tag>
                )
              }
            >
              <span className={styles.gold}>DISCORD LINK</span>
            </PanelTitle>

            {user.discordId ? (
              <>
                <div className={styles.discord}>
                  {user.discordAvatar ? (
                    <Image
                      className={styles.discord__avatar}
                      src={user.discordAvatar}
                      alt={`${user.discordUsername ?? "Discord"} 아바타`}
                      width={48}
                      height={48}
                    />
                  ) : (
                    <div
                      className={styles.discord__avatarFallback}
                      aria-hidden
                    />
                  )}
                  <div className={styles.discord__info}>
                    <div className={styles.discord__name}>
                      {user.discordGlobalName ?? user.discordUsername}
                    </div>
                    <div className={styles.discord__handle}>
                      {user.discordUsername ? `@${user.discordUsername}` : "—"}
                    </div>
                  </div>
                </div>
                <dl className={styles.kv}>
                  <div className={styles.kv__row}>
                    <dt>User ID</dt>
                    <dd className={styles.mono}>{user.discordId}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className={styles.discord__empty}>
                <Eyebrow>아직 Discord 계정이 연결되지 않았습니다.</Eyebrow>
                <DiscordLinkButton />
              </div>
            )}
          </Box>

          <Box>
            <PanelTitle>SECURITY · 비밀번호 변경</PanelTitle>
            <PasswordForm />
          </Box>
        </div>
      </div>
    </>
  );
}
