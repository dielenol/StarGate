import styles from "./LoginBackdrop.module.css";

function Prism() {
  return (
    <svg viewBox="0 0 480 520" fill="none">
      <path className={styles.backdrop__face} d="M240 24 444 142 444 378 240 496 36 378 36 142Z" />
      <path className={styles.backdrop__facet} d="M240 24 340 260 240 496 140 260Z" />
      <path d="M240 24 444 142 444 378 240 496 36 378 36 142Z" />
      <path d="M240 24 140 260 240 496 340 260ZM36 142 340 260 36 378M444 142 140 260 444 378M36 142 444 378M444 142 36 378" />
      <circle cx="240" cy="24" r="3" />
      <circle cx="36" cy="378" r="3" />
      <circle cx="444" cy="142" r="3" />
    </svg>
  );
}

export function LoginBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.backdrop__wash} />
      <div className={styles.backdrop__ribbon} />
      <div className={styles.backdrop__stars} />
      <svg className={styles.backdrop__constellation} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <path d="m64 450 100-172 172-58 75-140M72 700l140-80 98 70M1120 62l84 136 170 68M1080 790l122-140 176 34" />
        <path className={styles.backdrop__arc} d="M-260 760C160-160 1090-130 1700 650M-260 796C160-124 1090-94 1700 686" />
        <g>
          <circle cx="64" cy="450" r="2" />
          <circle cx="164" cy="278" r="3" />
          <circle cx="336" cy="220" r="2" />
          <circle cx="212" cy="620" r="2.5" />
          <circle cx="1204" cy="198" r="2" />
          <circle cx="1374" cy="266" r="3" />
          <circle cx="1202" cy="650" r="3" />
          <circle cx="1080" cy="790" r="2" />
        </g>
      </svg>
      <div className={`${styles.backdrop__prism} ${styles.backdrop__prism_left}`}><Prism /></div>
      <div className={`${styles.backdrop__prism} ${styles.backdrop__prism_right}`}><Prism /></div>
      <div className={styles.backdrop__vignette} />
    </div>
  );
}
