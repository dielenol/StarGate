import frameStyles from "../page.module.css";

export default function RulesPage() {
  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <div className={frameStyles.stargate__classification}>
            CLASSIFICATION: GAME PROTOCOL // RULES
          </div>
          <div className={frameStyles.stargate__intro}>
            <span className={frameStyles.stargate__est}>RULE DOSSIER</span>
            <h1 className={frameStyles.stargate__title}>룰 설명</h1>
            <div className={frameStyles.stargate__ornament}>✥</div>
            <p className={frameStyles["stargate__intro-text"]}>
              기본 진행 규칙, 판정 방식, 캐릭터 운용 항목이 배치될 페이지입니다.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
