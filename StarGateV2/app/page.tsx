import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles["stargate-page"]}>
      <div className={styles.stargate}>
        <div className={styles.stargate__frame}>
          <div className={styles.stargate__classification}>
            CLASSIFICATION: TOP SECRET // REF. NO. 1945-ORDO
          </div>

          <div className={styles["stargate__logo-wrap"]}>
            <div className={styles["stargate__logo-box"]}>
              <p className={styles["stargate__logo-placeholder"]}>
                <span className={styles["stargate__logo-title"]}>NOVUS ORDO</span>
                <br />
                <Image
                  className={styles["stargate__logo-image"]}
                  src="/assets/StarGate_logo.png"
                  alt="Star Gate logo"
                  width={220}
                  height={220}
                />
              </p>
            </div>
          </div>

          <div className={styles.stargate__intro}>
            <span className={styles.stargate__est}>EST. 1945</span>
            <h1 className={styles.stargate__title}>About Us</h1>
            <div className={styles.stargate__ornament}>✥</div>
            <p className={styles["stargate__intro-text"]}>
              전 세계 국가들이 한자리에 모여
              <br />
              국제 문제와 기현상을 논의하고
              <br />
              <span className={styles["stargate__highlight-underline"]}>
                원로들의 지혜 아래에서 해결책을 모색하는 곳.
              </span>
            </p>
          </div>

          <div className={styles.stargate__divider}></div>

          <div className={styles.stargate__about}>
            <p className={styles["stargate__about-text"]}>
              노부스 오르도는 1945년에 설립된 국제기구입니다.
              <br />
              현재 <span className={styles["stargate__about-count"]}>193개 회원국</span>
              으로 구성되어 있으며, 오르도와 그 활동은
              <br />
              창설 당시 채택된 헌장에 담긴 목적과 원칙에 따라 운영되고 있습니다.
            </p>

            <div className={styles["stargate__archive-wrap"]}>
              <details className={styles["stargate__archive-details"]}>
                <summary className={styles["stargate__archive-summary"]}>
                  ▶ ARCHIVE: 조직의 발전사와 정체성 열람
                </summary>
                <div className={styles["stargate__archive-content"]}>
                  노부스 오르도는 빠르게 변화하는 세계에 발맞추기 위해
                  <br />
                  지난 수년간 끊임없이 발전해 왔습니다.
                  <br />
                  <br />
                  그러나 한 가지는 변하지 않았습니다.
                  <br />
                  <span className={styles["stargate__archive-highlight"]}>
                    노부스 오르도가 인류가 한자리에 모여 공동의 문제를 논의하고,
                  </span>
                  <br />
                  인류 전체에 이로운 공동의 해결책을 모색하는
                  <br />
                  <span className={styles["stargate__archive-emphasis"]}>
                    지구상의 유일한 조직이라는 점입니다.
                  </span>
                </div>
              </details>
            </div>
          </div>

          <div className={styles.stargate__leadership}>
            <div className={styles["stargate__leadership-label"]}>LEADERSHIP</div>

            <div className={styles["stargate__profile-wrap"]}>
              <div className={styles["stargate__profile-frame"]}>
                <div className={styles["stargate__profile-inner"]}>
                  <p className={styles["stargate__profile-placeholder"]}>
                    <Image
                      src="/assets/peoples/Amalia_Fredrika.png"
                      alt="아말리아 프레드리카 본 에센 초상화"
                      width={260}
                      height={379}
                      className={styles["stargate__logo-image"]}
                    />
                    <span className={styles["stargate__profile-caption"]}>
                      AMALIA FREDRIKA VON ESSEN
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className={styles["stargate__name-wrap"]}>
              <h2 className={styles["stargate__name-ko"]}>아말리아 프레드리카 본 에센</h2>
              <p className={styles["stargate__name-en"]}>Amalia Fredrika von Essen</p>
              <p className={styles.stargate__position}>제7대 노부스 오르도 사무총장</p>
            </div>

            <div className={styles["stargate__quote-box"]}>
              <div className={styles["stargate__quote-mark--open"]}>“</div>
              <p className={styles["stargate__quote-text"]}>
                결국 모든 것은{" "}
                <span className={styles["stargate__quote-highlight"]}>질서의 문제</span>로
                귀결됩니다. […]
                <br />
                우리는 우리 아이들이 물려받을 세상이 오르도 헌장에 담긴 가치, 즉
                질서와 평화, 발전 그리고 인류 안보로 규정되기를 바랍니다.
              </p>
              <div className={styles["stargate__quote-mark--close"]}>”</div>
            </div>

            <div className={styles.stargate__bio}>
              <p className={styles["stargate__bio-main"]}>
                스웨덴 출신의 아말리아 프레드리카 본 에센 사무총장은 2011년 취임
                이후 오르도의 이상을 상징하는 인물로 자리 잡았습니다. 그녀는 전
                세계 모든 사람들, 특히{" "}
                <span className={styles["stargate__bio-emphasis"]}>
                  불안정한 안보 전선과 이에 취약한 이들을 대변하는 옹호자
                </span>
                로서 헌신하고 있습니다.
              </p>

              <div className={styles["stargate__pandemic-box"]}>
                <p className={styles["stargate__pandemic-text"]}>
                  2021년 6월 18일, 그녀는 두 번째 임기로 재선임되었으며,
                  <br />
                  <span className={styles["stargate__pandemic-highlight"]}>
                    오로라 판데믹(AURORA PANDEMIC)
                  </span>
                  을 극복하고
                  <br />
                  세계가 새로운 방향으로 나아갈 수 있도록 돕는 것을 최우선 과제로
                  삼고 있습니다.
                </p>
              </div>

              <div className={styles["stargate__protocol-wrap"]}>
                <details className={styles["stargate__protocol-details"]}>
                  <summary className={styles["stargate__protocol-summary"]}>
                    📁 ADMINISTRATIVE PROTOCOL: VIEW DETAILS
                  </summary>
                  <div className={styles["stargate__protocol-content"]}>
                    <div className={styles["stargate__protocol-title"]}>
                      ADMINISTRATIVE SUMMARY
                    </div>
                    • <span className={styles["stargate__protocol-item"]}>최고 행정 책임자 및 상징적 인물</span>
                    <br />
                    •{" "}
                    <span className={styles["stargate__protocol-item"]}>
                      세계 질서 이사회의 권고 및 총회 임명
                    </span>
                    <br />
                    •{" "}
                    <span className={styles["stargate__protocol-item"]}>
                      임기: 10년 (연임 가능)
                    </span>
                    <br />
                    • <span className={styles["stargate__protocol-item"]}>취임일: 2011년 6월 17일</span>
                  </div>
                </details>
              </div>

              <div
                className={`${styles["stargate__cta-row"]} ${styles["stargate__cta-row--spaced"]}`}
              >
                <Link className={styles["stargate__cta-link"]} href="/apply">
                  <div className={styles["stargate__cta-outer"]}>
                    <div className={styles["stargate__cta-inner"]}>
                      <div className={styles["stargate__cta-icon"]}>⚜</div>
                      <div className={styles["stargate__cta-title"]}>가입 신청하기</div>
                      <div className={styles["stargate__cta-subtitle"]}>SUBMIT APPLICATION</div>
                    </div>
                  </div>
                </Link>
              </div>

              <div className={styles["stargate__cta-row"]}>
                <Link className={styles["stargate__cta-link"]} href="/contact">
                  <div className={styles["stargate__cta-outer"]}>
                    <div className={styles["stargate__cta-inner"]}>
                      <div className={styles["stargate__cta-icon"]}>✉</div>
                      <div className={styles["stargate__cta-title"]}>질문하기</div>
                      <div className={styles["stargate__cta-subtitle"]}>SECRET INQUIRY</div>
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          <div className={styles.stargate__footer}>
            <div className={styles["stargate__footer-property"]}>
              PROPERTY OF NOVUS ORDO CONVENTION
            </div>
            <div className={styles["stargate__footer-archive"]}>✦ OFFICIAL ARCHIVE ✦</div>
            <div className={styles["stargate__footer-mark"]}>⚜</div>
          </div>
        </div>
      </div>
    </main>
  );
}
