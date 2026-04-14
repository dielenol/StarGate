import Image from "next/image";
import styles from "./CharacterSheet.module.css";

export type CharacterSheetData = {
  codename: string;
  name: string;
  mainImage: string;
  quote: string;
  gender: string;
  age: string;
  height: string;
  weight: string;
  appearance: string;
  personality: string;
  background: string;
  className: string;
  hp: number;
  san: number;
  def: number;
  atk: number;
  abilityType: string;
  credit: number | string;
  weaponTraining: string;
  skillTraining: string;
  equipment: {
    name: string;
    price: number | string;
    damage: string;
    description: string;
  }[];
  abilities: {
    code: string;
    name: string;
    description: string;
    effect: string;
  }[];
};

type CharacterSheetProps = {
  record: CharacterSheetData;
};

export default function CharacterSheet({ record }: CharacterSheetProps) {
  const weaponTraining = record.weaponTraining.trim() ? record.weaponTraining : "미기재";
  const skillTraining = record.skillTraining.trim()
    ? record.skillTraining.replace(/\]\[/g, "] [")
    : "미기재";
  const credit = record.credit === "" ? "미기재" : record.credit;

  return (
    <article className={styles.sheet} aria-label={`${record.codename} 캐릭터 시트`}>
      <div className={styles.sheet__classification}>CLASSIFIED // N.O.S.B PERSONNEL RECORD</div>

      <section className={styles.hero}>
        <figure className={styles.portrait}>
          <Image
            className={styles.portrait__image}
            src={record.mainImage}
            alt={`${record.codename} 인물 이미지`}
            width={440}
            height={660}
            loading="lazy"
          />
          <figcaption className={styles.portrait__caption}>AGENT VISUAL</figcaption>
        </figure>

        <div className={styles.hero__details}>
          <blockquote className={styles.voiceLog}>
            <p className={styles.voiceLog__quote}>&ldquo;{record.quote}&rdquo;</p>
            <footer className={styles.voiceLog__meta}>RECORDED VOICE LOG</footer>
          </blockquote>

          <table className={styles.identityTable}>
            <tbody>
              <tr>
                <td className={styles.identityTable__title} colSpan={4}>
                  [{record.codename} / {record.name}]
                </td>
              </tr>
              <tr>
                <td>
                  <div className={styles.identityTable__item}>
                    <strong className={styles.identityTable__label}>성별</strong>
                    <span className={styles.identityTable__value}>{record.gender}</span>
                  </div>
                </td>
                <td>
                  <div className={styles.identityTable__item}>
                    <strong className={styles.identityTable__label}>나이</strong>
                    <span className={styles.identityTable__value}>{record.age}</span>
                  </div>
                </td>
                <td>
                  <div className={styles.identityTable__item}>
                    <strong className={styles.identityTable__label}>신장</strong>
                    <span className={styles.identityTable__value}>{record.height}</span>
                  </div>
                </td>
                <td>
                  <div className={styles.identityTable__item}>
                    <strong className={styles.identityTable__label}>체중</strong>
                    <span className={styles.identityTable__value}>{record.weight}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <section className={styles.dossierPanel} aria-label="핵심 요약 정보">
            <div className={styles.dossierGrid}>
              <div className={styles.dossierItem}>
                <span className={styles.dossierItem__label}>CLASS</span>
                <strong className={styles.dossierItem__value}>{record.className}</strong>
              </div>
              <div className={styles.dossierItem}>
                <span className={styles.dossierItem__label}>ABILITY</span>
                <strong className={styles.dossierItem__value}>{record.abilityType}</strong>
              </div>
              <div className={styles.dossierItem}>
                <span className={styles.dossierItem__label}>WEAPON</span>
                <strong className={styles.dossierItem__value}>{weaponTraining}</strong>
              </div>
              <div className={styles.dossierItem}>
                <span className={styles.dossierItem__label}>CREDIT</span>
                <strong className={styles.dossierItem__value}>{credit}</strong>
              </div>
            </div>

            <div className={styles.dossierStats}>
              <div className={styles.dossierStat}>
                <span className={styles.dossierStat__label}>HP</span>
                <strong className={styles.dossierStat__value}>{record.hp}</strong>
              </div>
              <div className={styles.dossierStat}>
                <span className={styles.dossierStat__label}>SAN</span>
                <strong className={styles.dossierStat__value}>{record.san}</strong>
              </div>
              <div className={styles.dossierStat}>
                <span className={styles.dossierStat__label}>DEF</span>
                <strong className={styles.dossierStat__value}>{record.def}</strong>
              </div>
              <div className={styles.dossierStat}>
                <span className={styles.dossierStat__label}>ATK</span>
                <strong className={styles.dossierStat__value}>{record.atk}</strong>
              </div>
            </div>
          </section>
        </div>
      </section>

      <div className={styles.bio}>
        <section className={styles.bioBlock}>
          <h3 className={styles.bioBlock__title}>01. 외형 (Appearance)</h3>
          <p className={styles.bioBlock__body}>{record.appearance}</p>
        </section>
        <section className={styles.bioBlock}>
          <h3 className={styles.bioBlock__title}>02. 성격/성향 (Personality)</h3>
          <p className={styles.bioBlock__body}>{record.personality}</p>
        </section>
        <section className={styles.bioBlock}>
          <h3 className={styles.bioBlock__title}>03. 배경 (Background)</h3>
          <p className={styles.bioBlock__body}>{record.background}</p>
        </section>
      </div>

      <section className={styles.statsSection}>
        <h3 className={styles.statsSection__title}>TACTICAL STATS</h3>
        <table className={styles.statsTable}>
          <tbody>
            <tr>
              <td className={styles.statsTable__class} colSpan={4}>
                <span>CLASS :</span> {record.className}
              </td>
            </tr>
            <tr className={styles.statsTable__statRow}>
              <td className={styles.statsTable__statCell}>
                <div className={styles.statsTable__labelHp}>HP</div>
                <div className={styles.statsTable__value}>{record.hp}</div>
              </td>
              <td className={styles.statsTable__statCell}>
                <div className={styles.statsTable__labelSan}>SAN</div>
                <div className={styles.statsTable__value}>{record.san}</div>
              </td>
              <td className={styles.statsTable__statCell}>
                <div className={styles.statsTable__labelDef}>DEF</div>
                <div className={styles.statsTable__value}>{record.def}</div>
              </td>
              <td className={styles.statsTable__statCell}>
                <div className={styles.statsTable__labelAtk}>ATK</div>
                <div className={styles.statsTable__value}>{record.atk}</div>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <div className={styles.statsTable__metaLine}>
                  <strong>능력 :</strong> {record.abilityType}
                </div>
                <div className={styles.statsTable__metaLine}>
                  <strong>무기 훈련 :</strong> {weaponTraining}
                </div>
              </td>
              <td colSpan={2}>
                <div className={styles.statsTable__metaLine}>
                  <strong>스킬 훈련 :</strong> {skillTraining}
                </div>
                <div className={styles.statsTable__metaLine}>
                  <strong>크레딧 :</strong> {credit}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {record.equipment.length > 0 ? (
        <section className={styles.equipmentSection}>
          <h3 className={styles.equipmentSection__title}>EQUIPMENT</h3>
          <table className={styles.equipmentTable}>
            <thead>
              <tr>
                <th>무기 이름</th>
                <th>가격</th>
                <th>피해량</th>
                <th>무기 설명</th>
              </tr>
            </thead>
            <tbody>
              {record.equipment.map((item) => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{item.price}</td>
                  <td>{item.damage}</td>
                  <td>{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className={styles.abilitySection}>
        <h3 className={styles.abilitySection__title}>ABILITY SHAPING</h3>
        <div className={styles.abilityList}>
          {record.abilities.map((ability) => (
            <article className={styles.abilityCard} key={ability.code}>
              <h4 className={styles.abilityCard__name}>
                <span>{ability.code}</span>
                {ability.name}
              </h4>
              <p>
                <strong>설명 -</strong> {ability.description}
              </p>
              <p>
                <strong>효과 -</strong> {ability.effect}
              </p>
            </article>
          ))}
        </div>
      </section>
    </article>
  );
}
