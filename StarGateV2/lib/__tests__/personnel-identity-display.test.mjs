import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getPersonnelAliasOrNull,
  getPersonnelPrimaryName,
} from "../format/personnel-name.ts";

test("Dossier 기본 표기는 실명이고 별칭은 별도 값으로 유지한다", () => {
  const rodion = {
    codename: "RODION",
    lore: {
      name: "로드리온 로마노비치 라스콜니코프",
      nickname: "로쟈",
    },
  };

  assert.equal(
    getPersonnelPrimaryName(rodion),
    "로드리온 로마노비치 라스콜니코프",
  );
  assert.equal(getPersonnelAliasOrNull(rodion), "로쟈");
});

test("실명이 마스킹되면 열람 가능한 별칭을 기본 표기로 사용한다", () => {
  const rodion = {
    codename: "RODION",
    lore: {
      name: "[CLASSIFIED]",
      nickname: "로쟈",
    },
  };

  assert.equal(getPersonnelPrimaryName(rodion), "로쟈");
  assert.equal(getPersonnelAliasOrNull(rodion), null);
});

test("신원조회는 누락된 agentLevel을 J로 보정하지 않는다", async () => {
  const files = await Promise.all(
    [
      "../../app/(erp)/erp/personnel/_components/PersonnelCard.tsx",
      "../../app/(erp)/erp/personnel/PersonnelClient.tsx",
      "../../app/(erp)/erp/personnel/[id]/DossierClient.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const source = files.join("\n");

  assert.doesNotMatch(source, /agentLevel\s*\?\?\s*["']J["']/u);
  assert.match(source, /권한등급\s*:\s*미지정/u);
  assert.match(source, /미지정\s*·\s*GM 확인 필요/u);
  assert.match(source, /ALIAS\s*·\s*\{displayAlias\}/u);
});
