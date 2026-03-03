import frameStyles from "../page.module.css";
import styles from "./rules.module.css";

export default function RulesPage() {
  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <div className={frameStyles.stargate__classification}>
            CLASSIFICATION: COMBAT SYSTEM // RULES
          </div>

          <div className={styles.hero}>
            <span className={frameStyles.stargate__est}>RULE DOSSIER</span>
            <h1 className={styles.hero__title}>노부스 오르도 룰</h1>
            <div className={frameStyles.stargate__ornament}>✥</div>
            <p className={styles.hero__description}>
              실시간 턴제 전투, 능력치, 클래스 등 핵심 노부스 오르도 규칙을 정리한 문서입니다.
            </p>
          </div>

          <div className={frameStyles.stargate__divider}></div>

          <div className={styles.sections}>
            <section className={styles.section}>
              <h2 className={styles.section__title}>
                노부스 오르도 룰에 오신 것을 환영합니다.
              </h2>
              <p className={styles.section__text}>
                본 시스템은 <span className={styles.emph}>실시간 타이머 기반 턴제 전투</span>{" "}
                규칙을 채택합니다.
              </p>
              <p className={styles.section__text}>
                플레이어, 즉 요원은{" "}
                <span className={styles.warn}>30초 이내(또는 이에 준하는 제한 시간)</span>{" "}
                안에 행동을 서술해야 합니다. 제한 시간 내 입력이 완료되지 않을 경우,
                해당 턴은 지연 또는 실패로 간주될 수 있습니다.
              </p>
              <p className={styles.section__text}>
                요원들은 Zulu 및 기타 적대적 단체와 교전하여 대상 개체를 파괴하거나
                포획하고, 유의미한 샘플을 확보해야 합니다.
              </p>
              <p className={styles.section__text}>
                그 목적은 단 하나.
                <br />
                <span className={styles.emph}>
                  이상현상의 위협으로부터 인류의 질서와 종속을 수호하는 것입니다.
                </span>
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>클래스</h2>
              <p className={styles.section__text}>
                노부스 오르도에는 다양한 직무를 수행하는 직업군, 즉 &apos;클래스&apos;가
                존재합니다. 각 클래스는 조직 내 역할과 작전 수행 방식이 명확히
                구분됩니다.
              </p>
              <ol className={styles.numberList}>
                <li>
                  <span className={styles.termTitle}>관료</span>
                  <p className={styles.section__text}>
                    관료는 노부스 오르도의 행정 간부로, 현장에서 발생하는 모든
                    행정·관리 업무를 총괄합니다.
                  </p>
                  <p className={styles.section__text}>
                    타 직군의 목적이 &apos;이상 개체&apos;의 제압이라면, 관료의 목적은
                    &apos;이상 상황&apos;의 통제입니다. 작전 승인, 자원 배분, 정보 통제,
                    격리 구역 설정 등 전투 외적 요소를 관리하며 작전의 흐름을 조율합니다.
                  </p>
                </li>
                <li>
                  <span className={styles.termTitle}>군인</span>
                  <p className={styles.section__text}>
                    군인은 노부스 오르도의 현장 요원으로, 직접적인 위협 제거를 담당합니다.
                    주 임무는 &apos;이상 개체&apos;의 제압·격리·파괴이며 전투 수행 능력과
                    생존력이 핵심 요소입니다.
                  </p>
                </li>
                <li>
                  <span className={styles.termTitle}>과학자</span>
                  <p className={styles.section__text}>
                    과학자는 &apos;이상 개체&apos;를 분석하고 연구하는 전문 인력입니다.
                    개체의 특성과 현상을 규명하여 효율적인 제압 방법을 제시하거나,
                    확보한 샘플을 활용해 새로운 기술과 장비를 개발합니다.
                  </p>
                  <p className={styles.section__text}>
                    직접 교전에 참여하지 않더라도 작전 난이도와 성공률에 중대한 영향을
                    미칩니다.
                  </p>
                </li>
                <li>
                  <span className={styles.termTitle}>실험체</span>
                  <p className={styles.section__text}>
                    실험체는 그 자체가 &apos;이상 현상&apos;의 일부인 존재입니다.
                    선천적·후천적 심령 능력, 특수한 기질, 혹은 비인류 지성 개체와의
                    연관성을 지닙니다.
                  </p>
                  <p className={styles.section__text}>
                    설정상 군인이나 과학자 등의 역할을 수행할 수 있으나, 본질적으로는
                    기관의 감시 및 연구 대상이라는 점에서 타 클래스와 구별됩니다.
                    전략 자산이자 잠재적 위험 요소로 간주됩니다.
                  </p>
                </li>
              </ol>
              <p className={styles.note}>
                ※ 모든 클래스는 고유 패시브 능력을 지니며, 추가로 다양한 수행 스킬을
                습득할 수 있습니다.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>캐릭터 능력치와 포인트</h2>
              <p className={styles.section__text}>요원의 기본 능력치는 다음과 같습니다.</p>
              <div className={styles.statBox}>
                <p className={styles.termTitle}>기본 능력치</p>
                <ul className={styles.statList}>
                  <li>HP (체력): 50 (상한 300)</li>
                  <li>SAN (정신력): 30 (상한 100)</li>
                  <li>DEF (방어력): 0 (상한 5)</li>
                  <li>ATK (공격력): 5 (맨손 기준, 상한 20)</li>
                  <li>능력: 비능력자</li>
                  <li>무기 훈련: 없음</li>
                  <li>스킬 훈련: 없음</li>
                  <li>크레딧: 200</li>
                </ul>
              </div>
              <p className={styles.section__text}>
                요원에게는 추가로 <span className={styles.emph}>120 포인트</span>가
                지급됩니다. 포인트를 소모하여 기본 능력치 상승, 능력 획득, 훈련 습득 및
                자금 확보가 가능합니다.
              </p>
              <div className={styles.statBox}>
                <p className={styles.termTitle}>포인트 소모 비율</p>
                <ul className={styles.statList}>
                  <li>HP / SAN: 포인트 10당 +5 상승</li>
                  <li>DEF / ATK: 포인트 10당 +1 상승</li>
                  <li>능력 획득: 30 포인트</li>
                  <li>능력 조형(세부 설계 및 강화): 30 ~ 100 포인트</li>
                  <li>무기 훈련 / 스킬 훈련: 각 30 포인트</li>
                  <li>크레딧 획득: 포인트 1당 2 크레딧 추가 획득</li>
                </ul>
              </div>
              <p className={styles.note}>
                ※ 모든 능력치는 상한을 초과할 수 없습니다.
                <br />※ 능력 조형 비용은 설정 및 위력에 따라 조정될 수 있습니다.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>체력 (HP)</h2>
              <p className={styles.section__text}>
                체력은 스태미너, 건강, 근력 등 신체적 역량 전반을 아우르는 수치입니다.
              </p>
              <p className={styles.section__text}>
                HP가 0이 되면 요원은 즉시 전투 불능 상태에 빠집니다. 이후 회수 없이
                장면이 종료될 경우, 해당 요원은 사망 처리됩니다.
              </p>
              <p className={styles.section__text}>
                체력을 기반으로 하는 스킬은 HP를 소모하여 해당 스킬 판정에 보정치를
                추가할 수 있습니다.
              </p>
              <div className={styles.statBox}>
                <p className={styles.termTitle}>HP 기반 스킬</p>
                <ul className={styles.statList}>
                  <li>투척</li>
                  <li>달리기</li>
                  <li>숨참기</li>
                  <li>수영</li>
                  <li>등반</li>
                  <li>운반</li>
                </ul>
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>정신력 (SAN)</h2>
              <p className={styles.section__text}>
                정신력은 의지, 끈기, 이성 등 정신적 안정성과 사고 능력을 포괄하는
                수치입니다.
              </p>
              <p className={styles.section__text}>
                노부스 오르도의 적대 존재들은 종종 정신적·심령적 공격을 가합니다.
                SAN이 0에 도달할 경우, 요원은 전투 불능 상태에 빠지며
                &apos;정신 질환&apos; 상태에 돌입합니다. 이후 회수 없이 장면이 종료될 경우,
                사망 처리됩니다.
              </p>
              <p className={styles.section__text}>
                정신력을 기반으로 하는 스킬은 SAN을 소모하여 해당 스킬 판정에 보정치를
                추가할 수 있습니다.
              </p>
              <div className={styles.statBox}>
                <p className={styles.termTitle}>SAN 기반 스킬</p>
                <ul className={styles.statList}>
                  <li>집중</li>
                  <li>관찰</li>
                  <li>필사(筆寫)</li>
                  <li>통찰</li>
                  <li>직감</li>
                  <li>심신 안정</li>
                  <li>종교 의식</li>
                </ul>
              </div>
              <p className={styles.section__text}>
                또한 SAN을 소모하여 요원이 지닌 심령 능력 또는 특수 재능을 강화할 수
                있습니다.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>방어력 (DEF)</h2>
              <p className={styles.section__text}>
                방어력은 살성(타격 저항력), 순간 회피 능력, 선천적 피부 내성, 방어구
                효율의 총합으로 산정됩니다.
              </p>
              <p className={styles.section__text}>
                피격 시 DEF 수치만큼 피해를 경감합니다.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>공격력 (ATK)</h2>
              <p className={styles.section__text}>
                공격력은 맨손 공격의 위력과 근접 무기 사용 시 적용되는 보정치를
                의미합니다.
              </p>
              <div className={styles.statBox}>
                <p className={styles.termTitle}>공격 유형</p>
                <ul className={styles.statList}>
                  <li>근접 공격 (맨손 포함)</li>
                  <li>원거리 공격</li>
                  <li>정신 공격</li>
                </ul>
              </div>
              <p className={styles.section__text}>
                이 중 ATK의 보정을 직접적으로 받는 유형은 &apos;근접 공격&apos;입니다.
                원거리 공격은 특수 효과가 별도로 명시되어 있지 않다면 무기 자체의 고유
                피해 수치를 사용합니다. 정신 공격은 일반적으로 SAN을 기반으로
                판정됩니다.
              </p>
              <p className={styles.section__text}>
                따라서 ATK에 포인트를 투자할 경우, 요원이 주력으로 사용할 무기 유형을
                사전에 명확히 설정하는 것을 권장합니다.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.section__title}>능력 메이킹</h2>
              <p className={styles.section__text}>
                노부스 오르도의 요원은 자신이 원하는 &quot;능력 설정&quot;을 자유롭게
                창작할 수 있습니다.
              </p>
              <p className={styles.section__text}>
                능력은 초자연적 현상, 심령 재능, 특수 체질, 개념적 간섭 등 세계관
                내부에서 설명 가능한 범위라면 제한 없이 설계 가능합니다.
              </p>
              <p className={styles.section__text}>
                단, 해당 능력을 실제 전투에 활용하기 위해서는 고도의 훈련과 숙련이
                요구됩니다. 능력의 위력, 범용성, 발동 조건의 난이도, 지속 시간, 리스크
                유무 등에 따라 &apos;능력 조형&apos;에 소모되는 포인트는 달라질 수 있습니다.
              </p>
            </section>

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
                <span className={styles.emph}>특성을 하나 </span>알아낼 수 있습니다. (이
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
                <span className={styles.emph}>공개되는 정보</span>가 달라지거나 명령
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
