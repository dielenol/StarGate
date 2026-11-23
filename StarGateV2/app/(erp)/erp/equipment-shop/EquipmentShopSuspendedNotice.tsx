import styles from "./EquipmentShopSuspendedNotice.module.css";

/** 병기부 운영 중지 중 GM 열람 화면 상단에 붙는 안내 띠. */
export default function EquipmentShopSuspendedNotice() {
  return (
    <div className={styles.notice} role="status">
      <strong className={styles.notice__label}>운영 중지</strong>
      <span>
        병기부는 운영 중지 상태입니다. GM 열람만 가능하며 구매·연구·의뢰·견적 등
        변경과 알림 발송은 모두 차단됩니다.
      </span>
    </div>
  );
}
