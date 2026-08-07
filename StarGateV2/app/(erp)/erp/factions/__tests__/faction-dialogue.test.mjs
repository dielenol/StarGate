import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getFactionGameProfile } from "../_game.ts";

const FACTION_CASES = [
  ["COUNCIL", /이사회|의결|명분/],
  ["MILITARY", /지원|철수|편성|작전/],
  ["CIVIL", /현장 사람|피해자|지역 접점|민간/],
  ["WHITE_ROSE", /제보자|증언|공개|피해자/],
  ["SPACE_ZERO", /계약|책임|회수|자산/],
  ["GOLDEN_DAWN", /신호|의식|패턴|차단/],
  ["AHNENERBE", /연구|시설|증거|자료/],
];

test("each named faction owns an independent six-band voice", () => {
  const profiles = FACTION_CASES.map(([code]) =>
    getFactionGameProfile(code, "external"),
  );

  for (let index = 0; index < profiles.length; index += 1) {
    const [code, voicePattern] = FACTION_CASES[index];
    const dialogue = profiles[index].scene.dialogue;
    assert.equal(dialogue.length, 6, `${code} should cover six relation bands`);
    assert.match(
      dialogue.map((line) => line.line).join(" "),
      voicePattern,
      `${code} should retain its own vocabulary`,
    );
    for (const other of profiles.slice(index + 1)) {
      assert.notEqual(dialogue, other.scene.dialogue);
    }
  }
});

test("preview, confirmed, and error lines keep their event tense", () => {
  for (const [code] of FACTION_CASES) {
    const dialogue = getFactionGameProfile(code, "external").scene.dialogue;
    for (const line of dialogue) {
      assert.ok(line.previewLine, `${code} preview line is required`);
      assert.doesNotMatch(
        line.previewLine,
        /기록(?:했|됐|되었습니다)|반영(?:됐|되었습니다)|접수했습니다/,
      );
      assert.match(
        line.afterActionLine,
        /기록|접수|반영|올렸다|전달했|후속|후보/,
      );
      assert.ok(line.errorLine, `${code} error line is required`);
    }
  }
});

test("hostile faction screens stay NOVUS analysis rather than enemy speech", () => {
  for (const code of ["GOLDEN_DAWN", "AHNENERBE"]) {
    const profile = getFactionGameProfile(code, "hostile");
    assert.match(profile.scene.operatorName, /분석관/);
    assert.doesNotMatch(
      profile.scene.dialogue.map((line) => line.line).join(" "),
      /우리 조직|우리의 의식|우리 연구소|가입하라/,
    );
  }
});

test("contact UI selects preview text before mutation and confirmed text after success", async () => {
  const source = await readFile(
    new URL("../[code]/FactionContactClient.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /dialoguePhase === "confirmed"/);
  assert.match(source, /activeDialogue\.previewLine \?\? activeDialogue\.line/);
  assert.match(source, /setDialoguePhase\("confirmed"\)/);
  assert.match(source, /setDialoguePhase\("error"\)/);
  assert.doesNotMatch(
    source,
    /messageId:[\s\S]{0,180}currentFavorability/,
  );
  assert.match(
    source,
    /messageId: \[code, dialoguePhase, baseDialogueLine\]\.join\(":"\)/,
  );
  assert.doesNotMatch(
    source,
    /messageId:[\s\S]{0,180}selected\.(?:kind|id)/,
  );
});
