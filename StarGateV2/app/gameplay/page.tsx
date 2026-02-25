import frameStyles from "../page.module.css";

export default function GameplayPage() {
  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <div className={frameStyles.stargate__classification}>
            CLASSIFICATION: OPERATION BRIEF // GAMEPLAY
          </div>
          <div className={frameStyles.stargate__intro}>
            <span className={frameStyles.stargate__est}>MISSION FLOW</span>
            <h1 className={frameStyles.stargate__title}>게임 진행</h1>
            <div className={frameStyles.stargate__ornament}>✥</div>
            <p className={frameStyles["stargate__intro-text"]}>
              세션 준비, 진행 순서, 종료 후 정리 프로토콜이 배치될 페이지입니다.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
