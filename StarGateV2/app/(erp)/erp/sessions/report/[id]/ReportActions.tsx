"use client";

import { useRouter } from "next/navigation";

import { useDeleteReport } from "@/hooks/mutations/useReportMutation";

import Button from "@/components/ui/Button/Button";

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
    <>
      <Button as="a" href="/erp/sessions/report">
        ← 목록
      </Button>
      {canEdit ? (
        <Button onClick={() => alert("수정 기능은 추후 구현됩니다.")}>
          편집
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          onClick={handleDelete}
          disabled={deleteReport.isPending}
          aria-label="리포트 삭제"
        >
          {deleteReport.isPending ? "삭제 중..." : "삭제"}
        </Button>
      ) : null}
    </>
  );
}
