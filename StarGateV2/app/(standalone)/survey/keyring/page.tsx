import type { Metadata } from "next";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "아크릴 키링 수요조사 | Novus Ordo",
  description:
    "노부스 오르도 PC 아크릴 키링 무상 제작 프로젝트. 약 5~7cm 사이즈, 배송비 무료. 구매 의사가 있으신 분은 수요조사에 참여해주세요.",
  openGraph: {
    title: "아크릴 키링 수요조사 | Novus Ordo",
    description:
      "노부스 오르도 PC 아크릴 키링 무상 제작 프로젝트. 수요조사 참여 페이지입니다.",
    type: "website",
  },
  robots: { index: false, follow: false },
};

const SURVEY_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScGLmciFqOuIE1zyB_wM7v8wFTQav1qh11sy7HFR3qp1bu7_g/viewform?usp=publish-editor";

export default function KeyringSurveyPage() {
  return (
    <section className={styles.survey}>
      <div className={styles.survey__outer}>
        <div className={styles.survey__inner}>
          <div className={styles.survey__classification}>
            INTERNAL BULLETIN // OPERATIVE MERCHANDISE PROJECT
          </div>

          {/* Hero */}
          <div className={styles.survey__hero}>
            <div className={styles.survey__emblem}>♚♚</div>
            <h1 className={styles.survey__title}>아크릴 키링 수요조사</h1>
            <div className={styles.survey__subtitle}>NOVUS ORDO GOODS</div>
            <div className={styles.survey__divider} />
          </div>

          {/* Intro */}
          <div className={styles.survey__intro}>
            <p>
              노부스 오르도를 함께 즐기는 기념으로
              <br />
              작은 굿즈를 남겨보고자 시작한 프로젝트입니다.
            </p>
          </div>

          {/* Request note */}
          <p className={styles.survey__requestNote}>
            휴지님의 요청으로 작성된 굿즈 응모 페이지입니다
          </p>

          {/* Warning */}
          <div className={styles.survey__warning}>
            <p>※ 해당 글은 마스터분들과 충분한 상의 후 작성되었습니다 ※</p>
          </div>

          {/* Section 01 */}
          <div className={styles.survey__section}>
            <div className={styles["survey__sectionTitle--gold"]}>
              01. 프로젝트 개요 (PROJECT OVERVIEW)
            </div>
            <div className={styles["survey__sectionBody--gold"]}>
              <p>
                아크릴 키링 제작 프로젝트를 가볍게 열어보게 되었습니다!
                <br />
                <br />
                제작은 <b className={styles.gold}>저(휴지)의 그림</b>으로 아크릴
                키링까지 제작하여 하자 검수 후, 댁까지 배송보내드릴 예정입니다.
                실물 굿즈여서 어쩔 수 없이 <b>배송정보를 수집</b>해야 하는 점
                양해 부탁드립니다.
                <br />
                <br />
                4월달은 중간고사 기간으로 시간이 여유롭지 않아서{" "}
                <b className={styles.gold}>5월달부터 본격적인 제작</b>에 들어갈 것
                같습니다. 그림이 완성된 후, 수요조사에 참여해주셔도 되니 많은 관심
                부탁드립니다.
              </p>
            </div>
          </div>

          {/* Purchase notice */}
          <div className={styles.survey__notice}>
            <p>⚠ 구매의사가 확실하실 때, 폼 제출해주시면 감사하겠습니다 ⚠</p>
          </div>

          {/* Section 02 */}
          <div className={styles.survey__section}>
            <div className={styles["survey__sectionTitle--cyan"]}>
              02. 굿즈 정보 (GOODS SPECIFICATION)
            </div>
            <div className={styles["survey__sectionBody--cyan"]}>
              <table className={styles.survey__table}>
                <tbody>
                  <tr>
                    <td className={styles.survey__tableLabel}>GOODS</td>
                    <td className={styles.survey__tableValue}>아크릴 키링</td>
                  </tr>
                  <tr>
                    <td className={styles.survey__tableLabel}>CHARACTER</td>
                    <td className={styles.survey__tableValue}>
                      노부스 오르도 <b className={styles.cyan}>모든 PC들</b>
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.survey__tableLabel}>SIZE</td>
                    <td className={styles.survey__tableValue}>
                      약 <b className={styles.cyan}>5~7cm</b> 예상
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.survey__tableLabel}>PRICE</td>
                    <td className={styles.survey__tableValue}>
                      <b className={styles.survey__priceValue}>무상</b>
                      <span className={styles.survey__badge}>배송비도 무료</span>
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.survey__tableLabel}>QUANTITY</td>
                    <td className={styles.survey__tableValue}>
                      인당 최대 <b className={styles.cyan}>14개</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 03 */}
          <div className={styles.survey__section}>
            <div className={styles["survey__sectionTitle--green"]}>
              03. 참고 사항 (ADDITIONAL NOTES)
            </div>
            <div className={styles["survey__sectionBody--green"]}>
              <ul className={styles.survey__notes}>
                <li>해당 조사는 구매 의사를 확인하기 위한 조사입니다.</li>
                <li>실제 제작 시 가격 및 디자인이 일부 변경될 수 있습니다.</li>
                <li>
                  최소 수요 개수 따위 없습니다. 수요조사 내용대로 제작 예정입니다.
                </li>
                <li>
                  디자인 및 세부 사항은 추후에 공지방을 통해 확정드릴 예정입니다.
                </li>
              </ul>
            </div>
          </div>

          {/* CTA */}
          <div className={styles.survey__cta}>
            <p className={styles.survey__ctaText}>
              노부스 오르도를 함께 즐기는 기념으로
              <br />
              작은 굿즈를 남겨보고자 시작한 프로젝트입니다 (=ↀωↀ=)✧
              <br />
              관심 있으신 분들의 많은 참여 부탁드립니다!
            </p>
            <a
              className={styles.survey__ctaBtn}
              href={SURVEY_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              ✦ 수요조사 참여하기 ✦
            </a>
            <p className={styles.survey__ctaHint}>CLICK TO OPEN SURVEY FORM</p>
          </div>

          {/* Footer */}
          <div className={styles.survey__footer}>
            [ END OF BULLETIN // NOVUS ORDO INTERNAL ]
          </div>
        </div>
      </div>
    </section>
  );
}
