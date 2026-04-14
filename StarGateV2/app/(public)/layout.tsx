import Sidebar from "@/components/sidebar/Sidebar";
import ScrollToTop from "@/components/ScrollToTop/ScrollToTop";

import styles from "./layout.module.css";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles["layout__content"]}>{children}</div>
      <ScrollToTop />
    </div>
  );
}
