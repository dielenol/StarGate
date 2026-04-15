"use client";

import { useRouter } from "next/navigation";

import { useDeleteReport } from "@/hooks/mutations/useReportMutation";

import styles from "./page.module.css";

interface Props {
  reportId: string;
  canEdit: boolean;
  canDelete: boolean;
}

export default function ReportActions({ reportId, canEdit, canDelete }: Props) {
  const router = useRouter();
  const deleteReport = useDeleteReport();

  const handleDelete = () => {
    if (!confirm("정말로 이 리포트를 삭제하시겠습니까?")) return;

    deleteReport.mutate(reportId, {
      onSuccess: () => {
        router.push("/erp/sessions/report");
      },
      onError: (err) => {
        alert(err.message);
      },
    });
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
          disabled={deleteReport.isPending}
        >
          {deleteReport.isPending ? "삭제 중..." : "삭제"}
        </button>
      )}
    </div>
  );
}
