"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { Character } from "@/types/character";

import { characterKeys } from "@/hooks/queries/useCharactersQuery";

import CharacterEditForm from "./CharacterEditForm";

import styles from "./page.module.css";

interface Props {
  character: Character;
  canEdit: boolean;
  canDelete: boolean;
}

export default function CharacterDetailClient({
  character,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const characterId = String(character._id);

  async function handleDelete() {
    const confirmed = window.confirm(
      `"${character.codename}" 캐릭터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/erp/characters/${characterId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "삭제에 실패했습니다.");
        setIsDeleting(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: characterKeys.all });
      router.push("/erp/characters");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setIsDeleting(false);
    }
  }

  if (isEditing) {
    return (
      <CharacterEditForm
        character={character}
        onCancel={() => setIsEditing(false)}
        onSaved={async () => {
          setIsEditing(false);
          await queryClient.invalidateQueries({ queryKey: characterKeys.all });
        }}
      />
    );
  }

  if (!canEdit && !canDelete) return null;

  return (
    <>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.page__actions}>
        {canEdit && (
          <button
            type="button"
            className={styles.page__editBtn}
            onClick={() => setIsEditing(true)}
          >
            수정
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className={styles.page__deleteBtn}
            disabled={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? "삭제 중..." : "삭제"}
          </button>
        )}
      </div>
    </>
  );
}
