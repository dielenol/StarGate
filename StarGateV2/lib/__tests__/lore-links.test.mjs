import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

async function loadLoreLinksModule() {
  const reportSource = await readFile(
    new URL("../format/session-report.ts", import.meta.url),
    "utf8",
  );
  const reportModuleUrl = `data:text/javascript;base64,${Buffer.from(
    stripTypeScriptTypes(reportSource, { mode: "transform" }),
  ).toString("base64")}`;

  const loreLinksSource = await readFile(
    new URL("../lore-links.ts", import.meta.url),
    "utf8",
  );
  const loreLinksModule = stripTypeScriptTypes(loreLinksSource, {
    mode: "transform",
  }).replace(
    'from "./format/session-report";',
    `from "${reportModuleUrl}";`,
  );

  return import(
    `data:text/javascript;base64,${Buffer.from(loreLinksModule).toString("base64")}`
  );
}

const {
  relatedPersonnelLinkMatchesParticipant,
  toRelatedPersonnelLink,
} = await loadLoreLinksModule();

function character(overrides = {}) {
  return {
    _id: "character-id",
    codename: "TEST",
    type: "NPC",
    role: "테스트",
    lore: {
      name: "테스트 인물",
      loreTags: [],
    },
    ...overrides,
  };
}

test("주제용 loreTags를 참가자 신원 별칭으로 사용하지 않는다", () => {
  const maria = toRelatedPersonnelLink(
    character({
      codename: "MARIA",
      lore: {
        name: "마리아",
        nickname: "외우주의 포식자",
        loreTags: ["백진연"],
      },
    }),
  );

  assert.ok(maria);
  assert.equal(relatedPersonnelLinkMatchesParticipant("백진연", maria), false);
});

test("정식 이름은 참가자 링크와 계속 일치한다", () => {
  const unyeon = toRelatedPersonnelLink(
    character({
      codename: "UNYEON",
      lore: {
        name: "백진연",
        nameNative: "雲煙",
        nickname: "운연",
        loreTags: [],
      },
    }),
  );

  assert.ok(unyeon);
  assert.equal(relatedPersonnelLinkMatchesParticipant("백진연", unyeon), true);
});

test("Dr.와 닥터 표기를 같은 참가자 별칭으로 처리한다", () => {
  const doctorMoss = toRelatedPersonnelLink(
    character({
      codename: "DOCTOR_MOSS",
      lore: {
        name: "모이세이 알렉산드로비치 코헨",
        nickname: "Dr.모스",
        loreTags: [],
      },
    }),
  );

  assert.ok(doctorMoss);
  assert.equal(
    relatedPersonnelLinkMatchesParticipant("닥터 모스", doctorMoss),
    true,
  );
});
