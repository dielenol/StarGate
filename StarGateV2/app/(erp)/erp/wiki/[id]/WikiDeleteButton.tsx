"use client";

import { useRouter } from "next/navigation";

import { useDeleteWiki } from "@/hooks/mutations/useWikiMutation";

import Button from "@/components/ui/Button/Button";

interface WikiDeleteButtonProps {
  pageId: string;
}

export default function WikiDeleteButton({ pageId }: WikiDeleteButtonProps) {
  const router = useRouter();
  const deleteWiki = useDeleteWiki();

  function handleDelete() {
    if (
      !confirm(
        "정말 이 문서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
      )
    ) {
      return;
    }

    deleteWiki.mutate(pageId, {
      onSuccess: () => {
        router.push("/erp/wiki");
      },
      onError: (err) => {
        alert(err.message);
      },
    });
  }

  return (
    <Button
      type="button"
      onClick={handleDelete}
      disabled={deleteWiki.isPending}
    >
      {deleteWiki.isPending ? "삭제 중..." : "삭제"}
    </Button>
  );
}
