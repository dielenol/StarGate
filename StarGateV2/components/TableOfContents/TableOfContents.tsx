import styles from "./TableOfContents.module.css";

export type TocItem = {
  id: string;
  label: string;
};

type TableOfContentsProps = {
  items: TocItem[];
};

export default function TableOfContents({ items }: TableOfContentsProps) {
  return (
    <nav className={styles.toc} aria-label="문서 목차">
      <p className={styles.toc__title}>INDEX</p>
      <ul className={styles.toc__list}>
        {items.map((item) => (
          <li className={styles.toc__item} key={item.id}>
            <a className={styles.toc__link} href={`#${item.id}`}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
