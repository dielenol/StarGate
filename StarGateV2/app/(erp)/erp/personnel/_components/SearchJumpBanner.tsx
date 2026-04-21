import Button from "@/components/ui/Button/Button";

import styles from "./SearchJumpBanner.module.css";

interface Props {
  query: string;
  totalMatches: number;
  currentGroupMatches: number;
  otherGroupCode?: string;
  otherGroupCount?: number;
  onJump?: () => void;
}

export default function SearchJumpBanner({
  query,
  totalMatches,
  currentGroupMatches,
  otherGroupCount,
  onJump,
}: Props) {
  const showJump = !!otherGroupCount && otherGroupCount > 0 && !!onJump;

  return (
    <div className={styles.notice}>
      <span className={styles.label}>SEARCH</span>
      <span>
        <span className={styles.query}>&quot;{query}&quot;</span> 매칭{" "}
        <span className={styles.count}>{totalMatches}건</span> · 현재 그룹{" "}
        <span className={styles.count}>{currentGroupMatches}건</span>
      </span>
      {showJump ? (
        <span className={styles.actions}>
          <Button size="sm" onClick={onJump}>
            다른 그룹 {otherGroupCount}건 보기 →
          </Button>
        </span>
      ) : null}
    </div>
  );
}
