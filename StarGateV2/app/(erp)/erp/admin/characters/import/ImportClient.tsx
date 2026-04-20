"use client";

import { useState } from "react";

import type { CreateCharacterInput } from "@/types/character";

import type { ParsedCharacterDraft } from "@/lib/parsers/character-text";

import { useCreateCharacter } from "@/hooks/mutations/useCharacterMutation";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import { parseCharacterText } from "@/lib/parsers/character-text";

import styles from "./page.module.css";

const LORE_PREVIEW_LIMIT = 300;
const CODENAME_RE = /^[A-Z0-9_]+$/;

const PREVIEW_FIELDS: Array<{
  key: keyof ParsedCharacterDraft["sheet"];
  label: string;
}> = [
  { key: "name", label: "이름 (헤더)" },
  { key: "gender", label: "성별" },
  { key: "age", label: "나이" },
  { key: "height", label: "신장" },
  { key: "weight", label: "체중" },
  { key: "className", label: "직업" },
  { key: "abilityType", label: "능력명" },
  { key: "quote", label: "Quote" },
];

export default function ImportClient() {
  const [raw, setRaw] = useState("");
  const [draft, setDraft] = useState<ParsedCharacterDraft | null>(null);
  const [codename, setCodename] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useCreateCharacter();

  function handleParse() {
    const parsed = parseCharacterText(raw);
    setDraft(parsed);
    setCodename(parsed.suggestedCodename);
    setError(null);
  }

  function handleReset() {
    setRaw("");
    setDraft(null);
    setCodename("");
    setError(null);
  }

  async function handleSave() {
    if (!draft) return;

    const trimmedCodename = codename.trim();
    if (!trimmedCodename) {
      setError("codename은 필수입니다.");
      return;
    }

    if (!CODENAME_RE.test(trimmedCodename)) {
      setError(
        "codename은 대문자, 숫자, 언더스코어(_)만 허용됩니다 (예: AGENT_JOHN_SMITH)",
      );
      return;
    }

    setError(null);

    const body: CreateCharacterInput = {
      codename: trimmedCodename,
      type: "AGENT",
      role: draft.sheet.className || "AGENT",
      previewImage: "",
      ownerId: null,
      isPublic: false,
      source: "discord",
      lore: draft.lore || undefined,
      rawText: draft.rawText,
      sheet: {
        codename: trimmedCodename,
        name: draft.name,
        mainImage: "",
        quote: draft.sheet.quote ?? "",
        gender: draft.sheet.gender ?? "",
        age: draft.sheet.age ?? "",
        height: draft.sheet.height ?? "",
        appearance: "",
        personality: "",
        background: "",
        weight: draft.sheet.weight ?? "",
        className: draft.sheet.className ?? "",
        hp: 0,
        san: 0,
        def: 0,
        atk: 0,
        abilityType: draft.sheet.abilityType ?? "",
        credit: 0,
        weaponTraining: "",
        skillTraining: "",
        equipment: [],
        abilities: [],
      },
    };

    try {
      await mutateAsync(body);
      handleReset();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "캐릭터 저장에 실패했습니다.";
      setError(message);
    }
  }

  const lorePreview = draft?.lore
    ? draft.lore.length > LORE_PREVIEW_LIMIT
      ? `${draft.lore.slice(0, LORE_PREVIEW_LIMIT)}…`
      : draft.lore
    : "";

  return (
    <div className={styles.import}>
      <Box className={styles.import__col}>
        <PanelTitle>RAW TEXT</PanelTitle>
        <p className={styles.import__hint}>
          디스코드에서 복사한 캐릭터 시트를 그대로 붙여넣으세요.
        </p>
        <textarea
          className={styles.import__textarea}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={
            "[ 요한 스미스 ]\n\n성별 | 남\n직업 | 스페이스 제로 CEO\n나이 | 48\n..."
          }
          spellCheck={false}
        />
      </Box>

      <Box className={styles.import__col}>
        <PanelTitle>PREVIEW</PanelTitle>
        {draft ? (
          <div className={styles.import__preview}>
            {PREVIEW_FIELDS.map(({ key, label }) => {
              const value =
                key === "name" ? draft.name : draft.sheet[key];
              if (!value) return null;
              return (
                <div key={key} className={styles.import__previewField}>
                  <div className={styles.import__previewLabel}>{label}</div>
                  <div className={styles.import__previewValue}>
                    {String(value)}
                  </div>
                </div>
              );
            })}

            {draft.lore ? (
              <div className={styles.import__previewField}>
                <div className={styles.import__previewLabel}>Lore (미리보기)</div>
                <div className={styles.import__previewValue}>{lorePreview}</div>
              </div>
            ) : null}

            <details className={styles.import__details}>
              <summary className={styles.import__summary}>RAW TEXT 보기</summary>
              <pre className={styles.import__raw}>{draft.rawText}</pre>
            </details>
          </div>
        ) : (
          <p className={styles.import__empty}>
            파싱 미리보기를 실행하면 결과가 표시됩니다.
          </p>
        )}
      </Box>

      <div className={styles.import__actions}>
        <label className={styles.import__codenameField}>
          <span className={styles.import__codenameLabel}>CODENAME</span>
          <Input
            value={codename}
            onChange={(e) => setCodename(e.target.value)}
            placeholder="AGENT_XXXXXX (대문자/숫자/_ 만 허용)"
            disabled={!draft}
          />
        </label>

        <Button onClick={handleParse} disabled={!raw.trim()}>
          파싱 미리보기
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!draft || isPending || !codename.trim()}
        >
          {isPending ? "저장 중..." : "저장"}
        </Button>
        {draft ? (
          <Button onClick={handleReset} disabled={isPending}>
            초기화
          </Button>
        ) : null}
      </div>

      {error ? <div className={styles.import__error}>{error}</div> : null}
    </div>
  );
}
