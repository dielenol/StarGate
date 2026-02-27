import Image from "next/image";
import frameStyles from "../page.module.css";
import styles from "./world.module.css";
import { resolvePublicAssetPath } from "@/lib/asset-path";

export default function WorldPage() {
  const emblemSrc = resolvePublicAssetPath("/assets/StarGate_logo.png");
  const worldview1Src = resolvePublicAssetPath("/assets/world-view/wolrdview_1.webp");
  const worldview2Src = resolvePublicAssetPath("/assets/world-view/wolrdview_2.jpg");
  const worldview3Src = resolvePublicAssetPath("/assets/world-view/wolrdview_3.png");
  const worldview4Src = resolvePublicAssetPath("/assets/world-view/wolrdview_4.png");
  const worldview5Src = resolvePublicAssetPath("/assets/world-view/wolrdview_5.jpg");
  const worldview6Src = resolvePublicAssetPath("/assets/world-view/wolrdview_6.png");

  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <div className={frameStyles.stargate__classification}>
            CLASSIFICATION: LORE ARCHIVE // WORLD DOSSIER
          </div>

          <div className={styles.hero}>
            <Image
              src={emblemSrc}
              alt="Novus Ordo emblem"
              width={360}
              height={360}
              className={styles.hero__emblem}
            />
            <h1 className={styles.hero__title}>노부스 오르도</h1>
            <p className={styles.hero__quote}>
              &quot;우리는 인류와 인류 문명의 질서를 수호합니다.&quot;
            </p>
          </div>

          <div className={frameStyles.stargate__divider}></div>

          <div className={styles.timeline}>
            <section className={styles.entry}>
              <Image
                src={worldview1Src}
                alt="나치 오컬트 연구의 흔적을 상징하는 장면"
                width={1024}
                height={574}
                className={styles.entry__image}
              />
              <p className={styles.entry__text}>
                <strong>제2차 세계대전</strong> 당시, 나치 독일은 과학의 영역을 넘어선
                힘에 접근하려 했습니다. 전략적 우위를 확보하기 위해
                <strong> 오컬트</strong>와 <strong>이상 현상</strong>을 체계적으로
                연구하고 활용하려는 시도는, 전쟁이 끝난 뒤 연합국 지도부에 깊은
                충격을 남겼습니다.
                <br />
                <br />
                문제는 단순한 미신이나 광신이 아니었습니다. 인류가 윤리를 배제한 채,
                <span className={styles.warn}>설명되지 않는 현상을 무기화</span>할
                가능성을 실제로 검토했다는 사실 그 자체였습니다.
              </p>
            </section>

            <section className={styles.entry}>
              <Image
                src={worldview2Src}
                alt="전후 국제 질서의 불안정을 나타내는 세계 지도"
                width={1024}
                height={768}
                className={styles.entry__image}
              />
              <p className={styles.entry__text}>
                전쟁 이후 국제 사회는 하나의 냉혹한 현실을 직시하게 됩니다.
                <br />
                <strong>이상 현상</strong>은 존재하며, 그것은 언제든지 국가 권력의 도구가 될 수 있다는
                점이었습니다.
                <br />
                이 위협을 방치한다면, 다음 전쟁은 <strong>보이지 않는 영역</strong>에서 시작될지도
                모른다는 우려가 제기되었습니다.
                <br />
                그 결과, 기존의 국제 질서와는 성격이 전혀 다른 초국가적 기구의 창설이
                논의되었습니다. 목적은 단 하나. 인류 문명의 질서를 보호하고, 이상
                현상을 통제하며, 국가 간의 은밀한 초상적 경쟁을 차단하는 것이었습니다.
                <br />
                그리하여 창설된 조직이 바로 <strong> 노부스 오르도(Novus Ordo) </strong>, 우리말로는
                <strong> ‘신세계 질서’ </strong>입니다.
              </p>
            </section>

            <section className={styles.entry}>
              <Image
                src={worldview3Src}
                alt="비공개 국제 회의장"
                width={1024}
                height={576}
                className={styles.entry__image}
              />
              <p className={styles.entry__text}>
                이 조직은 하나의 전제를 바탕으로 움직입니다.
                <br />
                세계는 더 이상 인간만의 공간이 아니라는 사실입니다. 인류와 <strong>설명되지
                않는 현상</strong>이 이미 공존하고 있으며, 이를 부정하는 것은 전략적 오류라는
                판단이 내려졌습니다.
                <br /><strong>“노부스 오르도(Novus Ordo)”</strong>의 이념은 이른바 <strong>&quot;변칙적 현실주의&quot;</strong>
                혹은 <strong>“기현상 현실주의”</strong>입니다.
                <br />
                <strong>이상 현상</strong>을 숭배하지도, 배척하지도 않습니다. 그것을 하나의 전략적
                변수로 간주합니다. <span className={styles.emph}>통제 가능성</span>을
                분석하고, <span className={styles.warn}>확산을 억제</span>하며, 국제적
                균형 속에서 관리합니다.
                <br />
                <strong>냉전</strong>이 시작되면서, 강대국들은 핵무기뿐 아니라 보이지 않는 영역에서도
                경쟁을 벌이기 시작했습니다. 그러나 공식 기록에는 남지 않는 또 하나의
                전선이 존재했습니다.
                <br /><strong>“노부스 오르도(Novus Ordo)”</strong>는 그 전선을 관리하기 위해 창설된,
                지구상에서 가장 강력하면서도 가장 은밀한 국제 기구입니다. 그들의
                활동은 역사서에 기록되지 않습니다.
                <br />
                그러나 질서는, 그들의 개입 위에서 유지되고 있었습니다.
              </p>
            </section>

            <section className={styles.entry}>
              <Image
                src={worldview4Src}
                alt="질서 균열의 상징 장면"
                width={1024}
                height={576}
                className={styles.entry__image}
              />
              <p className={styles.entry__text}>
                <strong>냉전</strong>이 종식된 이후, 세계는 형식적으로는 다극 체제로 재편되었습니다.
                그러나 보이지 않는 영역에서는 <strong>다른 질서</strong>가 작동하고 있었습니다. 국제
                사회는 점차 <strong>노부스 오르도</strong>의 조정과 개입 아래 놓이게 되었습니다.
                공개되지 않은 위기들은 은밀하게 관리되었고, 통제 가능한 위험은 사전에
                제거되었습니다.
                <br />
                한동안, 질서는 유지되는 듯 보였습니다.
                <br />
                그러나 모든 변수를 통제할 수는 없었습니다.
                <br />
                <strong>노부스 오르도</strong>의 지속적인 개입에도 불구하고, 통제 범위를 벗어난 <strong>이상 현상</strong>은 점차 증가하였습니다. 여기에 각국의 이해관계가 충돌하면서 발생한
                국제 분쟁, 그리고 중앙 권위에 반발하는 분리주의 집단들의 저항은 기존
                질서에 균열을 만들기 시작했습니다.
                <br />
                균열은 서서히, 그러나 <span className={styles.warn}>확실하게 확산</span>
                되었습니다.
              </p>
            </section>

            <section className={styles.entry}>
              <Image
                src={worldview5Src}
                alt="오로라 바이러스 사태 이후의 황폐한 풍경"
                width={1024}
                height={768}
                className={styles.entry__image}
              />
              <p className={styles.entry__text}>
                결정적인 전환점은 2021년 발생한 이른바 <strong>“오로라 바이러스”</strong>
                사태였습니다. 이 변이는 감염자를 <strong>‘광원화(Light-sourcing)’</strong>라 불리는
                불가역적 현상으로 이끌었고, 사회적·정치적 구조 전반에 깊은 상흔을
                남겼습니다. 그 파급력은 단순한 감염병의 범주를 넘어섰습니다. 국가
                기능이 마비되고, 정보 통제가 붕괴되었으며, 초상적 현상에 대한 공포가
                대중화되었습니다. 이 사건을 계기로 <strong>노부스 오르도</strong>의 권위는 근본적인
                <span className={styles.warn}>도전</span>에 직면하게 됩니다.
              </p>
            </section>

            <section className={styles.entry}>
              <Image
                src={worldview6Src}
                alt="질서 붕괴와 초상적 위협 확산"
                width={718}
                height={1024}
                className={styles.entry__image}
              />
              <p className={styles.entry__text}>
                각국은 더 이상 중앙 통제에 의존하지 않겠다는 입장을 표명하며,
                독자적인 이상 현상 대응 체계를 구축하기 시작했습니다. 일부 국가는
                공식적으로 <strong>노부스 오르도</strong> 체제에서 이탈하였고, 일부는 비공식적 협력을
                중단하였습니다.
                <br />
                국제적 조율 체계는 급속히 약화되었습니다.
                <br />
                질서의 붕괴는 단순한 권력 재편을 의미하지 않습니다.
                <br />
                이상 현상이 통제되지 않는 세계는 곧 문명 자체의 불안정으로 이어질
                가능성을 내포하고 있습니다.
                <br />
                <strong>노부스 오르도</strong>는 현재 중대한 기로에 서 있습니다.
                <br />
                <span className={styles.warn}>파괴인가, 재정립인가.</span>
                <br />
                그들의 목표는 변하지 않았습니다. 인류와 이상 현상이 공존하는 이
                세계에서, 균형을 유지하는 것. 그러나 과거와 같은 방식으로는 더 이상
                충분하지 않습니다.
                <br />
                <strong>신질서</strong>를 다시 세우지 못한다면, 다음 붕괴는 통제 가능한 범위를
                <span className={styles.warn}>넘어설 것입니다.</span>
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
