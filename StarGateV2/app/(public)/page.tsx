import Image from "next/image";
import Link from "next/link";
import { IconArrowRight, IconChevronDown } from "@/components/icons";
import { resolvePublicAssetPath } from "@/lib/asset-path";
import LandingExperience from "./_components/LandingExperience";
import ArchiveViewer from "./_components/ArchiveViewer";
import styles from "./landing.module.css";

export default function HomePage() {
  return (
    <LandingExperience className={styles.landing}>
      <section
        id="overview"
        className={styles.hero}
        aria-labelledby="home-title"
      >
        <div className={styles.hero__meta}>
          <span>OFFICIAL ARCHIVE / 001</span>
          <span>EST. 1945</span>
        </div>
        <div className={styles.hero__body}>
          <div className={styles.hero__copy}>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrow__line} /> NOVUS ORDO CONVENTION
            </p>
            <h1 id="home-title" className={styles.hero__title}>
              세계의 이면에서,
              <br />
              <span>질서를 수호하다.</span>
            </h1>
            <p className={styles.hero__description}>
              우리는 인류와 인류 문명의 질서를 수호합니다.
              <br />
              노부스 오르도의 기록, 그리고 당신의 이야기.
            </p>
            <div className={styles.hero__actions}>
              <Link href="/world" className={styles.button}>
                세계관 탐색 <IconArrowRight aria-hidden />
              </Link>
              <Link href="/erp" prefetch={false} className={styles.textLink}>
                운영 시스템 진입 <IconArrowRight aria-hidden />
              </Link>
            </div>
          </div>
          <ArchiveViewer />
        </div>
        <div className={styles.hero__wordmark} aria-hidden="true">
          NOVUS <span>ORDO</span>
        </div>
        <div className={styles.hero__bottom}>
          <span>CLASSIFICATION: TOP SECRET</span>
          <a href="#archive">
            기록 탐색하기 <IconChevronDown aria-hidden />
          </a>
          <span>REF. NO. 1945-ORDO</span>
        </div>
      </section>
      <section
        id="archive"
        className={styles.archive}
        aria-labelledby="archive-title"
      >
        <div className={styles.sectionHead} data-reveal>
          <div>
            <p className={styles.eyebrow}>01 / EXPLORE THE ARCHIVE</p>
            <h2 id="archive-title">
              모든 이야기에는
              <br />
              시작점이 있습니다.
            </h2>
          </div>
          <p>
            세계를 이해하고, 규칙을 익히고,
            <br />
            당신의 이야기를 이어가세요.
          </p>
        </div>
        <div className={styles.archive__grid}>
          <Link
            href="/world"
            className={styles.card}
            data-reveal
          >
            <div className={styles.card__top}>
              <span>FILE 01 / WORLD</span>
            </div>
            <div className={styles.card__image} aria-hidden="true">
              <Image
                src={resolvePublicAssetPath(
                  "/assets/world-view/novus-ordo-world-map.webp",
                )}
                alt=""
                fill
                sizes="(max-width: 700px) 90vw, (max-width: 1440px) 30vw, 427px"
              />
            </div>
            <div className={styles.card__body}>
              <h3>세계관 기록</h3>
              <p>
                1945년의 시작부터 오늘의 기로까지.
                <br />
                노부스 오르도가 마주한 세계를 읽습니다.
              </p>
              <span className={styles.card__link}>
                세계관 열람 <IconArrowRight aria-hidden />
              </span>
            </div>
          </Link>
          <Link
            href="/rules"
            className={styles.card}
            data-reveal
          >
            <div className={styles.card__top}>
              <span>FILE 02 / PROTOCOL</span>
            </div>
            <div className={styles.card__image} aria-hidden="true">
              <Image
                src={resolvePublicAssetPath(
                  "/assets/world-view/novus-protocol-reading-room.webp",
                )}
                alt=""
                fill
                sizes="(max-width: 700px) 90vw, (max-width: 1440px) 30vw, 427px"
              />
            </div>
            <div className={styles.card__body}>
              <h3>노부스 오르도 룰</h3>
              <p>
                선택을 행동으로 만드는 기준.
                <br />
                캐릭터와 전투 규칙을 확인합니다.
              </p>
              <span className={styles.card__link}>
                규칙 열람 <IconArrowRight aria-hidden />
              </span>
            </div>
          </Link>
          <Link
            href="/world/player"
            className={styles.card}
            data-reveal
          >
            <div className={styles.card__top}>
              <span>FILE 03 / PERSONNEL</span>
            </div>
            <div className={styles.card__image} aria-hidden="true">
              <Image
                src={resolvePublicAssetPath(
                  "/assets/world-view/novus-personnel-registry.webp",
                )}
                alt=""
                fill
                sizes="(max-width: 700px) 90vw, (max-width: 1440px) 30vw, 427px"
              />
            </div>
            <div className={styles.card__body}>
              <h3>플레이어</h3>
              <p>
                이 세계를 함께 만드는 인물들.
                <br />
                각자의 기록과 이야기를 만납니다.
              </p>
              <span className={styles.card__link}>
                인물 열람 <IconArrowRight aria-hidden />
              </span>
            </div>
          </Link>
        </div>
        <Link href="/gameplay" className={styles.archive__guide}>
          <span>
            처음 작전에 참여하시나요?{" "}
            <strong>작전 내규를 먼저 확인하세요.</strong>
          </span>
          <IconArrowRight aria-hidden />
        </Link>
      </section>
      <section
        id="convention"
        className={styles.about}
        aria-labelledby="about-title"
      >
        <div className={styles.about__intro} data-reveal>
          <p className={styles.eyebrow}>02 / ABOUT THE CONVENTION</p>
          <h2 id="about-title">
            하나의 세계.
            <br />
            <span>공동의 질서.</span>
          </h2>
          <p className={styles.about__lead}>
            전 세계 국가들이 한자리에 모여 국제 문제와 기현상을 논의하고,
            원로들의 지혜 아래에서 해결책을 모색하는 곳.
          </p>
        </div>
        <div className={styles.about__detail} data-reveal>
          <dl className={styles.about__figures}>
            <div>
              <dt>ESTABLISHED</dt>
              <dd>
                1945<span>설립</span>
              </dd>
            </div>
            <div>
              <dt>MEMBER STATES</dt>
              <dd>
                193<span>개 회원국</span>
              </dd>
            </div>
          </dl>
          <p>
            노부스 오르도는 1945년에 설립된 국제기구입니다. 오르도와 그 활동은
            창설 당시 채택된 헌장에 담긴 목적과 원칙에 따라 운영되고 있습니다.
          </p>
          <details className={styles.disclosure}>
            <summary>
              조직의 발전사와 정체성 <IconChevronDown aria-hidden />
            </summary>
            <div>
              <p>
                노부스 오르도는 빠르게 변화하는 세계에 발맞추기 위해 지난 수년간
                끊임없이 발전해 왔습니다.
              </p>
              <p>
                그러나 한 가지는 변하지 않았습니다. 노부스 오르도가 인류가
                한자리에 모여 공동의 문제를 논의하고, 인류 전체에 이로운 공동의
                해결책을 모색하는 지구상의 유일한 조직이라는 점입니다.
              </p>
            </div>
          </details>
        </div>
      </section>
      <section
        id="leadership"
        className={styles.leadership}
        aria-labelledby="leadership-title"
      >
        <div className={styles.leadership__portrait} data-reveal>
          <span className={styles.leadership__file}>
            PERSONNEL FILE / SECRETARY-GENERAL
          </span>
          <Image
            src={resolvePublicAssetPath(
              "/assets/npcs/Amalia-Fredrika-profile.webp",
            )}
            alt="아말리아 프레드리카 본 에센 초상화"
            width={520}
            height={760}
            sizes="(max-width: 700px) 85vw, 40vw"
            className={styles.leadership__image}
          />
          <span className={styles.leadership__caption}>
            AMALIA FREDRIKA VON ESSEN
          </span>
        </div>
        <div className={styles.leadership__copy} data-reveal>
          <p className={styles.eyebrow}>03 / LEADERSHIP</p>
          <h2 id="leadership-title">
            “결국 모든 것은
            <br />
            <span>질서의 문제</span>로 귀결됩니다.”
          </h2>
          <blockquote>
            우리는 우리 아이들이 물려받을 세상이 오르도 헌장에 담긴 가치, 즉
            질서와 평화, 발전 그리고 인류 안보로 규정되기를 바랍니다.
          </blockquote>
          <div className={styles.leadership__name}>
            <strong>아말리아 프레드리카 본 에센</strong>
            <span>제7대 노부스 오르도 사무총장</span>
          </div>
          <p className={styles.leadership__bio}>
            스웨덴 출신의 아말리아 프레드리카 본 에센 사무총장은 2011년 취임
            이후 오르도의 이상을 상징하는 인물로 자리 잡았습니다. 그녀는 전 세계
            모든 사람들, 특히 불안정한 안보 전선과 이에 취약한 이들을 대변하는
            옹호자로서 헌신하고 있습니다.
          </p>
          <details className={styles.disclosure}>
            <summary>
              사무총장 기록 및 행정 프로토콜 <IconChevronDown aria-hidden />
            </summary>
            <div>
              <p>
                2021년 6월 18일, 그녀는 두 번째 임기로 재선임되었으며, 오로라
                판데믹(AURORA PANDEMIC)을 극복하고 세계가 새로운 방향으로 나아갈
                수 있도록 돕는 것을 최우선 과제로 삼고 있습니다.
              </p>
              <ul>
                <li>최고 행정 책임자 및 상징적 인물</li>
                <li>세계 질서 이사회의 권고 및 총회 임명</li>
                <li>임기: 10년 (연임 가능)</li>
                <li>취임일: 2011년 6월 17일</li>
              </ul>
            </div>
          </details>
        </div>
      </section>
      <section
        id="operations"
        className={styles.entry}
        aria-labelledby="entry-title"
        data-reveal
      >
        <div>
          <p className={styles.eyebrow}>FROM ARCHIVE TO OPERATIONS</p>
          <h2 id="entry-title">
            이제, 당신의 기록을
            <br />
            이어갈 시간입니다.
          </h2>
          <p>요원의 업무는 운영 시스템에서 계속됩니다.</p>
        </div>
        <Link href="/erp" prefetch={false} className={styles.entry__link}>
          <span>
            운영 시스템 진입<span>NOVUS ORDO ERP</span>
          </span>
          <IconArrowRight aria-hidden />
        </Link>
      </section>
      <footer className={styles.footer}>
        <div className={styles.footer__top}>
          <Link href="/" className={styles.footer__brand}>
            NOVUS ORDO
          </Link>
          <nav aria-label="안내 창구">
            <Link href="/apply">
              입회 심사 신청 <span>마감</span>
            </Link>
            <Link href="/contact">
              기밀 문의 접수 <span>마감</span>
            </Link>
            <Link href="/gameplay">
              작전 내규 <IconArrowRight aria-hidden />
            </Link>
          </nav>
        </div>
        <div className={styles.footer__bottom}>
          <span>PROPERTY OF NOVUS ORDO CONVENTION</span>
          <span>STARGATE TRPG · OFFICIAL ARCHIVE</span>
        </div>
      </footer>
    </LandingExperience>
  );
}
