import frameStyles from "../page.module.css";
import styles from "./rules.module.css";
import TableOfContents, { type TocItem } from "@/components/TableOfContents/TableOfContents";

const RULES_TOC_ITEMS: TocItem[] = [
  { id: "welcome", label: "환영" },
  { id: "class", label: "클래스" },
  { id: "stats", label: "캐릭터 능력치와 포인트" },
  { id: "hp", label: "체력 (HP)" },
  { id: "san", label: "정신력 (SAN)" },
  { id: "def", label: "방어력 (DEF)" },
  { id: "atk", label: "공격력 (ATK)" },
  { id: "ability", label: "능력 메이킹" },
  { id: "weapon", label: "무기 훈련" },
  { id: "skill", label: "스킬 훈련" },
];

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

          <TableOfContents items={RULES_TOC_ITEMS} />

          <div className={styles.sections}>
            <section className={styles.section} id="welcome">
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
                요원들은 Zulu 및 기타 적대적 단체와 교전하여 대상 개체를{" "}
                <span className={styles.emph}>파괴하거나 포획</span>하고,{" "}
                <span className={styles.emph}>유의미한 샘플</span>을 확보해야 합니다.
              </p>
              <p className={styles.section__text}>
                그 목적은 단 하나.
                <br />
                <span className={styles.emph}>
                  이상현상의 위협으로부터 인류의 질서와 종속을 수호하는 것입니다.
                </span>
              </p>
            </section>

            <section className={styles.section} id="class">
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
                    타 직군의 목적이 &apos;이상 개체&apos;의 제압이라면, 관료의 목적은{" "}
                    <span className={styles.emph}>&apos;이상 상황&apos;의 통제</span>입니다.
                    작전 승인, 자원 배분, 정보 통제, 격리 구역 설정 등 전투 외적 요소를
                    관리하며 작전의 흐름을 조율합니다.
                  </p>
                </li>
                <li>
                  <span className={styles.termTitle}>군인</span>
                  <p className={styles.section__text}>
                    군인은 노부스 오르도의 현장 요원으로, 직접적인 위협 제거를 담당합니다.
                    주 임무는 &apos;이상 개체&apos;의 제압·격리·파괴이며{" "}
                    <span className={styles.emph}>전투 수행 능력과 생존력</span>이 핵심
                    요소입니다.
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
                    직접 교전에 참여하지 않더라도{" "}
                    <span className={styles.emph}>작전 난이도와 성공률에 중대한 영향</span>을
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
                    기관의 감시 및 연구 대상이라는 점에서 타 클래스와 구별됩니다.{" "}
                    <span className={styles.warn}>전략 자산이자 잠재적 위험 요소</span>로
                    간주됩니다.
                  </p>
                </li>
              </ol>
              <p className={styles.note}>
                ※ 모든 클래스는 <span className={styles.emph}>고유 패시브 능력</span>을
                지니며, 추가로 다양한 수행 스킬을 습득할 수 있습니다.
              </p>
            </section>

            <section className={styles.section} id="stats">
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

            <section className={styles.section} id="hp">
              <h2 className={styles.section__title}>체력 (HP)</h2>
              <p className={styles.section__text}>
                체력은 스태미너, 건강, 근력 등 신체적 역량 전반을 아우르는 수치입니다.
              </p>
              <p className={styles.section__text}>
                HP가 0이 되면 요원은 즉시{" "}
                <span className={styles.warn}>전투 불능 상태</span>에 빠집니다. 이후 회수
                없이 장면이 종료될 경우, 해당 요원은{" "}
                <span className={styles.warn}>사망 처리</span>됩니다.
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

            <section className={styles.section} id="san">
              <h2 className={styles.section__title}>정신력 (SAN)</h2>
              <p className={styles.section__text}>
                정신력은 의지, 끈기, 이성 등 정신적 안정성과 사고 능력을 포괄하는
                수치입니다.
              </p>
              <p className={styles.section__text}>
                노부스 오르도의 적대 존재들은 종종 정신적·심령적 공격을 가합니다. SAN이
                0에 도달할 경우, 요원은 전투 불능 상태에 빠지며{" "}
                <span className={styles.warn}>&apos;정신 질환&apos; 상태</span>에 돌입합니다.
                이후 회수 없이 장면이 종료될 경우,{" "}
                <span className={styles.warn}>사망 처리</span>됩니다.
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

            <section className={styles.section} id="def">
              <h2 className={styles.section__title}>방어력 (DEF)</h2>
              <p className={styles.section__text}>
                방어력은 살성(타격 저항력), 순간 회피 능력, 선천적 피부 내성, 방어구
                효율의 총합으로 산정됩니다.
              </p>
              <p className={styles.section__text}>
                피격 시 <span className={styles.emph}>DEF 수치만큼 피해를 경감</span>합니다.
              </p>
            </section>

            <section className={styles.section} id="atk">
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
                이 중 ATK의 보정을 직접적으로 받는 유형은{" "}
                <span className={styles.emph}>&apos;근접 공격&apos;</span>입니다. 원거리
                공격은 특수 효과가 별도로 명시되어 있지 않다면 무기 자체의 고유 피해
                수치를 사용합니다. 정신 공격은 일반적으로 SAN을 기반으로 판정됩니다.
              </p>
              <p className={styles.section__text}>
                따라서 ATK에 포인트를 투자할 경우,{" "}
                <span className={styles.emph}>주력 무기 유형을 사전에 명확히 설정</span>하는
                것을 권장합니다.
              </p>
            </section>

            <section className={styles.section} id="ability">
              <h2 className={styles.section__title}>능력 메이킹</h2>
              <p className={styles.section__text}>
                노부스 오르도의 요원은 자신이 원하는{" "}
                <span className={styles.emph}>&quot;능력 설정&quot;</span>을 자유롭게 창작할
                수 있습니다.
              </p>
              <p className={styles.section__text}>
                능력은 초자연적 현상, 심령 재능, 특수 체질, 개념적 간섭 등 세계관
                내부에서 설명 가능한 범위라면 제한 없이 설계 가능합니다.
              </p>
              <p className={styles.section__text}>
                단, 해당 능력을 실제 전투에 활용하기 위해서는{" "}
                <span className={styles.emph}>고도의 훈련과 숙련</span>이 요구됩니다. 능력의
                위력, 범용성, 발동 조건의 난이도, 지속 시간, 리스크 유무 등에 따라
                &apos;능력 조형&apos;에 소모되는 포인트는 달라질 수 있습니다.
              </p>
            </section>

            <section className={styles.section} id="weapon">
              <h2 className={styles.section__title}>무기 훈련</h2>
              <p className={styles.section__text}>
                버려진 군 격납고를 발견했다고 해서, 그 내부의 군사 장비를 즉시 운용할
                수 있는 것은 아닙니다.
              </p>
              <p className={styles.section__text}>
                대부분의 현장 요원은 투입 이전, 전문화된 무기 운용 훈련 과정을 거쳐야
                합니다.
              </p>
              <p className={styles.section__text}>
                &apos;무기 훈련&apos;을 습득하지 않은 상태에서 고난도 군사 장비를 사용할
                경우,{" "}
                <span className={styles.warn}>
                  명중률 저하, 오작동, 역효과 등의 페널티
                </span>
                가 적용될 수 있습니다.
              </p>
              <p className={styles.section__text}>
                현장에서 사용할 무기 및 장비는{" "}
                <span className={styles.emph}>보유한 크레딧을 통해 구매</span>합니다.
              </p>
              <p className={styles.section__text}>
                무기의 위력, 특수 효과, 사용 난이도에 따라 요구되는 훈련 수준이 달라질
                수 있습니다.
              </p>
            </section>

            <section className={styles.section} id="skill">
              <h2 className={styles.section__title}>스킬 훈련</h2>
              <p className={styles.section__text}>
                현장에는 다양한 스킬 체크 상황이 존재합니다.
              </p>
              <p className={styles.section__text}>
                훈련된 요원이라면 해당 상황을 비교적 안정적으로 돌파할 수 있지만,{" "}
                <span className={styles.warn}>훈련되지 않은 경우</span>에는 성공 여부를
                운에 의존해야 합니다.
              </p>
              <p className={styles.section__text}>
                스킬 체크는 기본적으로{" "}
                <span className={styles.emph}>1d100 판정</span>을 사용합니다.
              </p>
              <p className={styles.section__text}>
                판정 결과가 100에 가까울수록 성공 확률이 높으며, 진행자가 제시한 목표
                수치 이상일 경우 성공으로 처리됩니다.
              </p>
              <p className={styles.section__text}>
                스킬 훈련을 보유한 경우, 해당 스킬 판정에{" "}
                <span className={styles.emph}>보정치가 부여</span>됩니다.
              </p>
              <p className={styles.note}>
                ※ 보정 수치는 스킬 숙련도 및 상황 난이도에 따라 조정됩니다.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
