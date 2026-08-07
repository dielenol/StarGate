import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  countStaffingPersonnel,
  isDeceasedPersonnel,
  isStaffingPersonnel,
} from "../_lib/personnel-status.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("명시적 사망 기록은 조직 정원에서 제외하고 아카이브로 판정", () => {
  const records = [
    { codename: "UNSTRUCTURED" },
    { codename: "DECEASED", lifeStatus: "DECEASED" },
    { codename: "CURRENT" },
  ];

  assert.equal(isDeceasedPersonnel(records[1]), true);
  assert.equal(isStaffingPersonnel(records[1]), false);
  assert.equal(isStaffingPersonnel(records[0]), true);
  assert.equal(countStaffingPersonnel(records), 2);
});

test("사망 아카이브 모바일 보정은 viewport가 아닌 personnel 컨테이너를 사용", () => {
  const pageCss = readFileSync(resolve(__dirname, "../page.module.css"), "utf8");
  const cardCss = readFileSync(
    resolve(__dirname, "../_components/PersonnelCard.module.css"),
    "utf8",
  );
  const personnelContainerRule =
    /@container\s+personnel\s+\(max-width:\s*600px\)\s*\{/;

  assert.match(pageCss, personnelContainerRule);
  assert.match(pageCss, /@container[\s\S]*?\.archiveSection\s*\{/);
  assert.match(cardCss, personnelContainerRule);
  assert.match(cardCss, /@container[\s\S]*?\.deceasedStamp\s*\{/);
});
