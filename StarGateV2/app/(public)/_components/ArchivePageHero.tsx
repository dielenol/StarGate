import Image from "next/image";
import type { ReactNode } from "react";
import { resolvePublicAssetPath } from "@/lib/asset-path";
import styles from "./ArchivePageHero.module.css";

type ArchivePageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  meta?: readonly string[];
  children?: ReactNode;
  icon?: ReactNode;
};

export default function ArchivePageHero({
  eyebrow, title, description, imageSrc, imageAlt, meta = [], children, icon,
}: ArchivePageHeroProps) {
  return (
    <header className={styles.hero}>
      <div className={styles.hero__copy}>
        <p className={styles.hero__eyebrow}>{icon}<span>{eyebrow}</span></p>
        <h1 className={styles.hero__title}>{title}</h1>
        <p className={styles.hero__description}>{description}</p>
        {children && <div className={styles.hero__actions}>{children}</div>}
        {meta.length > 0 && <ul className={styles.hero__meta}>{meta.map(item => <li key={item}>{item}</li>)}</ul>}
      </div>
      <div className={styles.hero__visual}>
        <Image src={resolvePublicAssetPath(imageSrc)} alt={imageAlt} fill priority sizes="(max-width: 700px) 90vw, 45vw" className={styles.hero__image} />
        <span className={styles.hero__caption} aria-hidden="true">NOVUS ORDO / OFFICIAL ARCHIVE</span>
      </div>
    </header>
  );
}
