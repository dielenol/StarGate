import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { IconArrowLeft, IconSecurity } from "@/components/icons";
import { resolvePublicAssetPath } from "@/lib/asset-path";

import LoginForm from "./LoginForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "요원 인증 · NOVUS ORDO",
};

export default function LoginPage() {
  return (
    <div className={styles.login}>
      <header className={styles.login__header}>
        <Link className={styles.login__brand} href="/" aria-label="NOVUS ORDO 홈">
          <Image
            src={resolvePublicAssetPath("/assets/StarGate_logo.png")}
            alt=""
            width={44}
            height={44}
            sizes="44px"
            priority
          />
          <span>NOVUS ORDO<small>OPERATIONS PORTAL</small></span>
        </Link>
        <Link className={styles.login__back} href="/">
          <IconArrowLeft />
          <span>메인으로</span>
        </Link>
      </header>

      <main className={styles.login__main}>
        <section className={styles.login__story} aria-label="노부스 오르도 운영 시스템">
          <Image
            className={styles["login__story-image"]}
            src={resolvePublicAssetPath("/assets/world-view/novus-agent-credentials.webp")}
            alt="노부스 오르도 문장이 새겨진 요원 신분증과 금속 명찰"
            fill
            sizes="(max-width: 760px) 100vw, 54vw"
            priority
          />
          <div className={styles["login__story-top"]} aria-hidden="true">
            <span>PERSONNEL / AUTHORIZATION</span>
            <IconSecurity />
          </div>
          <div className={styles["login__story-copy"]}>
            <p className={styles.login__eyebrow}>THE NEXT CHAPTER IS YOURS</p>
            <h2>당신의 임무는<br />여기서 이어집니다.</h2>
            <p>기록을 이어가고, 동료와 연결되고,<br />다음 작전을 준비하세요.</p>
          </div>
          <div className={styles["login__story-footer"]} aria-hidden="true">
            <span>NOVUS ORDO CONVENTION</span><span>EST. 1945</span>
          </div>
        </section>

        <section className={styles.login__access} aria-labelledby="login-title">
          <div className={styles["login__access-heading"]}>
            <p className={styles.login__eyebrow}>IDENTITY VERIFICATION</p>
            <h1 id="login-title">요원 인증</h1>
            <p>다시 오신 것을 환영합니다.<br />계정을 확인하고 운영 시스템으로 이동합니다.</p>
          </div>
          <Suspense fallback={<div className={styles.login__loading} role="status">인증 화면을 준비하고 있습니다.</div>}>
            <LoginForm />
          </Suspense>
        </section>
      </main>

      <footer className={styles.login__footer}>
        <span><IconSecurity /> 인가된 계정으로 접속하는 운영 시스템입니다.</span>
        <span>PROPERTY OF NOVUS ORDO</span>
      </footer>
    </div>
  );
}
