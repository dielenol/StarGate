import frameStyles from "../page.module.css";
import styles from "./rules.module.css";

export default function RulesPage() {
  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <div className={frameStyles.stargate__classification}>
            CLASSIFICATION: GAME PROTOCOL // RULES
          </div>

          <div className={styles.hero}>
            <span className={frameStyles.stargate__est}>RULE DOSSIER</span>
            <h1 className={styles.hero__title}>운영 규정 브리핑</h1>
            <div className={frameStyles.stargate__ornament}>✥</div>
            <p className={styles.hero__description}>
              노부스 오르도 작전 수행을 위한 핵심 규칙을 정리한 문서입니다.
            </p>
          </div>

          <div className={frameStyles.stargate__divider}></div>

          <div className={styles.sections}>
            <section className={styles.section}>
              <h2 className={styles.section__title}>Zulu란?</h2>
              <p className={styles.section__text}>
                세계 곳곳에서 일어나는 미스테리 이상 현상 혹은 괴현상으로 인한 인간의
                <span className={styles.warn}> 위협을 유발하는 모든 현상 및 개체</span>를
                의미합니다.
              </p>
              <p className={styles.section__text}>
                노부스 오르도의 목표는 이 Zulu를{" "}
                <span className={styles.emph}>포획하거나 파괴</span>하여{" "}
                <span className={styles.emph}>사회 안녕</span>에 이바지하는 것입니다.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>Zulu의 공략</h2>
              <p className={styles.section__text}>
                모든 Zulu들은 세부 항목으로 나뉠 수 있지만 가장 중요한 것은 해당
                Zulu의 <span className={styles.emph}>특징이나 약점</span>을 파악하는
                것입니다.
              </p>
              <p className={styles.section__text}>
                Zulu는 고유한 &quot;특성&quot;과 &quot;약점&quot;을 지닙니다. 해당 특성과
                약점은 Zulu를 향한 직접적인 상호 작용 묘사, 과학자의 연구 및 분석,
                전투를 통한 화력 제압으로 획득합니다.
              </p>
              <p className={styles.section__text}>
                전투 이전에 Zulu와 대면 시 요원들은 &quot;스킬 항목&quot;을 사용하여 Zulu
                개체와 상호 작용할 수 있습니다. 알맞은 상호 작용을 한다면 해당 개체의
                특성이나 약점을 파악할 수 있을 겁니다.
              </p>
              <p className={styles.section__example}>
                eX) 누워있는 Zulu 개체에게 &quot;연극&quot;을 활용하여 오페라의 일부분을
                불러보는 박사
              </p>
              <p className={styles.section__text}>
                과학자는 해당 묘사를 전투 중에도 가능한 고유 능력을 지니고 있습니다.
                또한 해당 Zulu가 생명 개체나 물리 개체일 경우 체력을 0으로 낮추면
                <span className={styles.emph}>특성을 하나 알아낼 수 있습니다.</span> (이
                경우 약점은 의미가 없으므로 특성 중 하나로 알아낼 수 있습니다.)
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>크레딧</h2>
              <p className={styles.section__text}>
                크레딧은 두 관점에서 사용이 가능합니다.
              </p>
              <div className={styles.subsection}>
                <h3 className={styles.subsection__title}>개인 크레딧</h3>
                <p className={styles.section__text}>
                  개인에게 지급되는 일종의 보수입니다. 무기나 아이템 구매, 부서
                  업그레이드에 사용됩니다.
                </p>
                <p className={styles.section__text}>
                  관료의 경우 개인 크레딧을 사용하지 않으면 매 임무에{" "}
                  <span className={styles.emph}>
                    자신의 크레딧을 작전 자산으로 추가
                  </span>
                  할 수 있습니다.
                </p>
              </div>
              <div className={styles.subsection}>
                <h3 className={styles.subsection__title}>작전 크레딧</h3>
                <p className={styles.section__text}>
                  작전을 위해 현장에서 획득하는 크레딧으로 관료가 총 관리합니다. 해당
                  크레딧으로 각 클래스는 고유 능력을 사용할 수 있습니다.
                </p>
                <p className={styles.section__text}>
                  해당 크레딧은 작전이 종료되면{" "}
                  <span className={styles.warn}>소멸합니다.</span>
                </p>
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>후원자</h2>
              <p className={styles.section__text}>
                노부스 오르도를 지지하는 수많은 기관들이 존재합니다. 이들은 자신들의
                이득을 위해 샘플을 원한다던가 해당 작전이 &apos;조용하거나&apos;
                &apos;시끄럽게&apos; 끝나길 원합니다.
              </p>
              <p className={styles.section__text}>
                해당 조건을 만족하면 <span className={styles.emph}>추가 개인 크레딧</span>
                을 획득할 수 있습니다. 반대로 이들의 요구를 너무 과하게 거부할 경우
                훗날 <span className={styles.warn}>후원이 끊기거나 적대자</span>로
                돌변하기도 합니다.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>지역 패닉</h2>
              <p className={styles.section__text}>
                지역 패닉은 1에서 6단계까지 존재하며 해당 구역의 민간인 혼란을
                수치화한 개념입니다. 현상이 발생하면 해당 현상 고유의 지역 패닉 수치가
                지역 패닉에 추가되며, 향후 언론 통제에 실패하면 지역 패닉이
                추가적으로 1단계씩 올라가게 됩니다.
              </p>
              <ul className={styles.levelList}>
                <li className={styles.panicLevel1}>1단계 : 인명 피해가 없는 교통사고</li>
                <li className={styles.panicLevel2}>2단계 : 소수의 인명 피해가 있는 교통사고</li>
                <li className={styles.panicLevel3}>3단계 : 다수의 인명피해가 있는 교통사고</li>
                <li className={styles.panicLevel4}>4단계 : 국소 재난 사고</li>
                <li className={styles.panicLevel5}>5단계 : 대규모 재난 주의보</li>
                <li className={styles.panicLevel6}>6단계 : 계엄령</li>
              </ul>
              <p className={styles.section__text}>
                해당 사건을 종결하는 동안 지역 패닉을 얼마나 낮추냐에 따라서 향후 받게
                될 예산이 정해지며{" "}
                <span className={styles.warn}>
                  4단계, 5단계로 사건이 종결되면 기관 감사 및 예산 삭감
                </span>
                이 일어납니다.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>요원 레벨</h2>
              <p className={styles.section__text}>
                노부스 오르도 내부의 계급입니다. 사내 계급에 맞춰서 정보 공개량이
                달라집니다.
              </p>
              <ul className={styles.levelList}>
                <li className={styles.agentLevelV}>V : VIP</li>
                <li className={styles.agentLevelA}>A : 최종 관리자 계급</li>
                <li className={styles.agentLevelM}>M : 부서 관리자 계급</li>
                <li className={styles.agentLevelH}>H : 부서 특수요원 계급</li>
                <li className={styles.agentLevelG}>G : 부서 요원 계급</li>
                <li className={styles.agentLevelJ}>J : 부서 평사원 계급</li>
                <li className={styles.agentLevelU}>U : 소모품</li>
              </ul>
              <p className={styles.section__text}>
                해당 계급은 작전 성공 시 보상 대신 획득할 수 있습니다. 계급에 따라서
                <span className={styles.emph}>공개되는 정보가 달라지거나</span> 명령
                체계에 영향을 줄 수 있습니다.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>Zulu와 샘플의 활용</h2>
              <p className={styles.section__text}>
                모든 Zulu 개체들은 적절한 격리 절차나 상호작용, 파괴 방식에 따라 고유의
                샘플을 제공합니다. 고유 샘플들 중 몇몇은 정해진 개수가 있을 수
                있습니다.
              </p>
              <p className={styles.section__text}>
                샘플은 그 자체로 사용할 수 있거나, 장착하여 특정 클래스의 고유 능력을
                <span className={styles.emph}>증강</span>시키거나,{" "}
                <span className={styles.warn}>소모</span>할 수 있습니다.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
