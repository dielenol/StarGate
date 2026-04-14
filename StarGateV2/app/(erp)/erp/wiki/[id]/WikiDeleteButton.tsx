"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./page.module.css";

interface WikiDeleteButtonProps {
  pageId: string;
}

export default function WikiDeleteButton({ pageId }: WikiDeleteButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("정말 이 문서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      return;
    }

    setPending(true);

    try {
      const res = await fetch(`/api/erp/wiki/${pageId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/erp/wiki");
      } else {
        const data = await res.json();
        alert(data.error ?? "삭제 실패");
      }
    } catch {
      alert("삭제 요청 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className={styles.detail__deleteBtn}
      disabled={pending}
      onClick={handleDelete}
      type="button"
    >
      {pending ? "삭제 중..." : "삭제"}
    </button>
  );
}
