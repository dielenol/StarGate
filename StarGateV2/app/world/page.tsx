import Link from "next/link";
import frameStyles from "../page.module.css";

export default function WorldPage() {
  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <div className={frameStyles.stargate__classification}>
            CLASSIFICATION: LORE ARCHIVE // WORLD INDEX
          </div>

          <div className={frameStyles.stargate__intro}>
            <span className={frameStyles.stargate__est}>WORLD DOSSIER</span>
            <h1 className={frameStyles.stargate__title}>세계관 메인</h1>
            <div className={frameStyles.stargate__ornament}>✥</div>
            <p className={frameStyles["stargate__intro-text"]}>
              노부스 오르도의 핵심 세계관 문서를 열람하는 섹션입니다.
              <br />
              하위 항목(A, B, C)에서 세부 기록을 순차 확장할 수 있습니다.
            </p>
          </div>

          <div className={frameStyles.stargate__divider}></div>

          <div className={frameStyles["stargate__cta-row"]}>
            <Link className={frameStyles["stargate__cta-link"]} href="/world/a">
              <div className={frameStyles["stargate__cta-outer"]}>
                <div className={frameStyles["stargate__cta-inner"]}>
                  <div className={frameStyles["stargate__cta-icon"]}>A</div>
                  <div className={frameStyles["stargate__cta-title"]}>A 기록</div>
                  <div className={frameStyles["stargate__cta-subtitle"]}>WORLD ARCHIVE A</div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
