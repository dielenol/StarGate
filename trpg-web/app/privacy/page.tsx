import type { Metadata } from "next";
import Link from "next/link";

import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "개인정보 처리방침 | TRPG 세션 캘린더",
  description: "다채로운 TRPG 세션 캘린더의 개인정보 처리 기준입니다.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.privacy}>
      <article className={styles.privacy__document}>
        <header className={styles.privacy__header}>
          <p>다채로운 TRPG 운영</p>
          <h1>개인정보 처리방침</h1>
          <span>시행일: 2026년 8월 13일</span>
        </header>

        <p className={styles.privacy__lead}>
          다채로운 TRPG 운영진은 세션 캘린더와 길드원 전용 룰렛을 제공하는 데
          필요한 범위에서만 Discord 계정 정보를 처리합니다.
        </p>

        <section>
          <h2>1. 처리하는 개인정보</h2>
          <ul>
            <li>Discord 사용자 ID, username, 서버 표시 이름</li>
            <li>Discord 프로필 이미지 CDN URL</li>
            <li>세션 일정의 생성자·참가자 정보와 서비스 이용 기록</li>
            <li>로그인 상태 유지를 위한 인증 쿠키</li>
          </ul>
          <p>
            프로필 이미지 파일 자체는 별도 저장하지 않습니다. Discord가 제공한
            CDN URL만 길드원 캐시에 보관하고 화면에서 직접 불러옵니다.
          </p>
        </section>

        <section>
          <h2>2. 처리 목적</h2>
          <ul>
            <li>운영 Discord 길드의 현재 멤버인지 확인하고 로그인 제한</li>
            <li>세션 생성·참여자 선택과 일정 표시</li>
            <li>룰렛 참가자 식별 및 프로필 마블 표시</li>
            <li>서비스 장애 대응과 부정 이용 방지</li>
          </ul>
        </section>

        <section>
          <h2>3. 보유 및 파기</h2>
          <ul>
            <li>
              활성 길드원 캐시의 프로필 이미지 URL은 길드에 머무는 동안 갱신하며,
              길드 이탈 확인 시 제거합니다.
            </li>
            <li>
              인증 쿠키는 로그아웃하거나 설정된 유효기간이 끝나면 더 이상
              사용되지 않습니다.
            </li>
            <li>
              세션 일정 정보는 서비스 운영과 일정 이력 유지에 필요한 동안
              보관하며, 삭제 요청 또는 서비스 종료 시 필요한 범위를 확인해
              파기합니다.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. 외부 서비스</h2>
          <p>
            로그인과 프로필 표시에는 Discord OAuth 및 Discord CDN을 사용합니다.
            프로필 이미지가 표시될 때 이용자의 브라우저가 Discord CDN에 직접
            요청을 보낼 수 있습니다. Google Calendar 연결 기능을 이용자가 직접
            활성화한 경우에는 해당 연결에 필요한 정보가 별도 처리됩니다.
          </p>
        </section>

        <section>
          <h2>5. 이용자의 권리와 문의</h2>
          <p>
            본인 정보의 열람·정정·삭제 또는 Discord 연동 정보 처리에 관한 문의는
            서비스가 운영되는 Discord 서버의 운영진에게 DM으로 요청할 수
            있습니다. 요청자의 계정을 확인한 뒤 지체 없이 처리합니다.
          </p>
        </section>

        <footer className={styles.privacy__footer}>
          <Link href="/login">로그인으로 돌아가기</Link>
          <Link href="/calendar">세션 캘린더</Link>
        </footer>
      </article>
    </main>
  );
}
