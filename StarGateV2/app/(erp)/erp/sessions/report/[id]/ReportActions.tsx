"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

interface Props {
  reportId: string;
  canEdit: boolean;
  canDelete: boolean;
}

export default function ReportActions({ reportId, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("정말로 이 리포트를 삭제하시겠습니까?")) return;

    setDeleting(true);

    try {
      const res = await fetch(`/api/erp/session-reports/${reportId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/erp/sessions/report");
      } else {
        const data = await res.json();
        alert(data.error ?? "삭제에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={styles.detail__actions}>
      {canEdit && (
        <button
          type="button"
          className={styles.detail__editBtn}
          onClick={() => alert("수정 기능은 추후 구현됩니다.")}
        >
          수정
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className={styles.detail__deleteBtn}
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "삭제 중..." : "삭제"}
        </button>
      )}
    </div>
  );
}
