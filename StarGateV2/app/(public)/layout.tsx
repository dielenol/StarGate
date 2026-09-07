import ScrollToTop from "@/components/ScrollToTop/ScrollToTop";
import PublicHeader from "./_components/PublicHeader";

import styles from "./layout.module.css";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <PublicHeader />
      <div
        id="public-content"
        tabIndex={-1}
        className={styles["layout__content"]}
      >
        {children}
      </div>
      <ScrollToTop />
    </div>
  );
}
