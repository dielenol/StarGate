import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as recovery from "../recovery.ts";
import { ERP_MAINTENANCE_WINDOW } from "../schedule.ts";
import {
  RECOVERY_STAGES,
  RECOVERY_PENDING_PROGRESS,
  RECOVERY_UPDATES,
  SECTOR_COLUMNS,
  formatKstClock,
  incidentCode,
  recoveryLog,
  recoveryProgress,
  recoveryStageIndex,
  recoveryUpdates,
  sectorRows,
} from "../recovery.ts";

const { startsAt, endsAt } = ERP_MAINTENANCE_WINDOW;
const start = Date.parse(startsAt);
const end = Date.parse(endsAt);
const SECTOR_ORDER = ["corrupted", "quarantined", "recovering", "restored"];

test("복구율은 검증 대기 상한까지 단조 증가하고 안내 기준 시각 이후에도 완료되지 않는다", () => {
  for (const [time, expected] of [[start - 60_000, 0], [start, 0], [end, RECOVERY_PENDING_PROGRESS], [end + 60_000, RECOVERY_PENDING_PROGRESS], [end + 90 * 24 * 60 * 60_000, RECOVERY_PENDING_PROGRESS]]) {
    assert.equal(recoveryProgress(startsAt, endsAt, time), expected);
  }
  assert.equal(recoveryProgress("bad", endsAt, start), 0);
  assert.equal(recoveryProgress(startsAt, endsAt, Number.NaN), 0);
  let previous = 0;
  for (let time = start; time <= end; time += 10 * 60_000) {
    const progress = recoveryProgress(startsAt, endsAt, time);
    assert.ok(progress >= previous);
    previous = progress;
  }
});

test("단계는 복구율 경계에서 넘어가고 마지막 단계는 종료까지 유지된다", () => {
  assert.equal(recoveryStageIndex(0), 0);
  RECOVERY_STAGES.slice(0, -1).forEach((stage, index) => {
    assert.equal(recoveryStageIndex(stage.until - 1e-9), index);
    assert.equal(recoveryStageIndex(stage.until), index + 1);
  });
  assert.equal(recoveryStageIndex(1), RECOVERY_STAGES.length - 1);
});

test("구역 블록은 오염 → 격리 → 복구 중 → 정상으로만 진행하며 추가 검증 구역이 남는다", () => {
  let previous = sectorRows(0);
  for (let step = 1; step <= 100; step += 1) {
    const rows = sectorRows(step / 100);
    rows.forEach((row, rowIndex) => row.cells.forEach((cell, column) => {
      assert.ok(SECTOR_ORDER.indexOf(cell) >= SECTOR_ORDER.indexOf(previous[rowIndex].cells[column]));
    }));
    previous = rows;
  }
  assert.ok(sectorRows(1).every((row) => row.cells.length === SECTOR_COLUMNS));
  assert.ok(sectorRows(1).some((row) => row.restored < 1));
  assert.deepEqual(sectorRows(1), sectorRows(RECOVERY_PENDING_PROGRESS));
  const opening = sectorRows(recoveryProgress(startsAt, endsAt, start + 5 * 60_000)).flatMap((row) => row.cells);
  assert.ok(opening.filter((cell) => cell === "corrupted").length / opening.length > 0.75);
});

test("로그는 같은 시각에 같은 내용이고 순서를 지키며 사고 직후에는 발생 기록부터 보인다", () => {
  const now = start + 5 * 60_000;
  const lines = recoveryLog(startsAt, endsAt, now, 13);
  assert.deepEqual(recoveryLog(startsAt, endsAt, now, 13), lines);
  assert.equal(lines.length, 13);
  lines.slice(1).forEach((line, index) => {
    assert.equal(line.seq, lines[index].seq + 1);
    assert.ok(line.time >= lines[index].time);
  });
  assert.deepEqual(recoveryLog(startsAt, endsAt, start - 1, 13), []);
  const [first] = recoveryLog(startsAt, endsAt, start + 20_000, 13);
  assert.equal(first.seq, 0);
  assert.equal(first.tag, "ALERT");
  assert.match(first.time, /^20:00:0\d$/);
  for (let time = start; time < end; time += 7 * 60_000) {
    for (const line of recoveryLog(startsAt, endsAt, time, 13)) {
      assert.doesNotMatch(line.text, /[{}]/);
      // 로그의 IP는 문서용 예약 대역만 쓴다.
      for (const [ip] of line.text.matchAll(/\d+\.\d+\.\d+\.\d+/g)) assert.match(ip, /^(198\.51\.100|203\.0\.113)\.\d+$/);
    }
  }
});

test("대응 공지는 게시 시각이 지난 것만 최신순으로 보이고 다음 공지는 종료 전 예정만 알린다", () => {
  const atFive = recoveryUpdates(startsAt, endsAt, start + 5 * 60_000);
  assert.deepEqual(atFive.published.map((update) => update.time), ["20:02", "20:00"]);
  assert.equal(atFive.next, "20:14");
  const all = recoveryUpdates(startsAt, endsAt, end - 1);
  assert.equal(all.published.length, RECOVERY_UPDATES.length);
  assert.equal(all.next, null);
  assert.deepEqual(recoveryUpdates(startsAt, endsAt, start - 1).published, []);
  // 단계 공지는 해당 단계가 시작된 뒤에 게시된다.
  for (const [label, stageIndex] of [["정화", 1], ["복원", 2], ["검증", 3]]) {
    const first = RECOVERY_UPDATES.find((update) => update.label === label);
    const at = start + first.minute * 60_000;
    assert.equal(recoveryStageIndex(recoveryProgress(startsAt, endsAt, at)), stageIndex, label);
  }
});

test("열어 둔 화면의 로그는 뒤에만 추가되고 같은 줄의 내용·시각은 바뀌지 않는다", () => {
  const seen = new Map();
  // 시작 직후와 세 단계 전환 지점 앞뒤 30초를 100ms 간격으로 훑는다.
  for (const anchor of [start, start + 87.5 * 60_000, start + 359.8 * 60_000, start + 712.2 * 60_000]) {
    let lastSeq = -1;
    for (let now = anchor - 30_000; now <= anchor + 30_000; now += 100) {
      const lines = recoveryLog(startsAt, endsAt, now, 13);
      const tail = lines.at(-1)?.seq ?? -1;
      assert.ok(tail >= lastSeq, `마지막 줄이 되돌아감: ${now}`);
      lastSeq = tail;
      for (const line of lines) {
        const value = JSON.stringify(line);
        if (seen.has(line.seq)) assert.equal(seen.get(line.seq), value, `seq ${line.seq} 내용 변경`);
        else seen.set(line.seq, value);
      }
    }
  }
});

test("대응 공지는 게시 시각 정각에 나타나고 1ms 전에는 보이지 않는다", () => {
  for (const { minute } of RECOVERY_UPDATES) {
    const at = start + minute * 60_000;
    assert.equal(recoveryUpdates(startsAt, endsAt, at - 1).published.some((update) => update.minute === minute), false);
    assert.equal(recoveryUpdates(startsAt, endsAt, at).published[0].minute, minute);
  }
});

test("KST 시각과 사고 번호는 실행 환경의 시간대와 무관하다", () => {
  assert.equal(formatKstClock(start), "20:00:00");
  assert.equal(formatKstClock(Date.parse("2026-10-25T15:00:00Z")), "00:00:00");
  assert.equal(incidentCode(startsAt), "INC-261025-01");
});


test("안내 기준 시각 후 수개월이 지나도 검증 로그와 무기한 차단 공지를 유지한다", () => {
  const monthsLater = end + 90 * 24 * 60 * 60_000;
  const progress = recoveryProgress(startsAt, endsAt, monthsLater);
  assert.ok(progress < 1);
  assert.equal(RECOVERY_STAGES[recoveryStageIndex(progress)].code, "VERIFY");
  const updates = recoveryUpdates(startsAt, endsAt, monthsLater);
  assert.equal(updates.next, null);
  assert.match(updates.published[0].text, /사이트 전체.*제한.*재개 일정.*추후 공지/);
  assert.doesNotMatch(updates.published.map((update) => update.text).join(" "), /예정된 시각에.*재개|자동.*재개/);
  const lines = recoveryLog(startsAt, endsAt, monthsLater, 100);
  assert.equal(lines.length, 100);
  assert.ok(lines.at(-1).seq > recoveryLog(startsAt, endsAt, end, 1)[0].seq);
  assert.ok(lines.some((line) => line.tag === "HOLD"));
  assert.doesNotMatch(lines.map((line) => line.text).join(" "), /재개 준비|복구 완료|100%/);
});


const nativeRequire = createRequire(import.meta.url);
const componentDirectory = new URL("../../../components/maintenance/", import.meta.url);

function loadNotice({ react = React, globals = {} } = {}) {
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const source = readFileSync(new URL(`${name}.tsx`, componentDirectory), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const exported = { exports: {} };
    function componentRequire(id) {
      if (id === "react") return react;
      if (id === "@/lib/maintenance/recovery") return recovery;
      if (id === "@/lib/asset-path") return { resolvePublicAssetPath: (path) => path };
      if (id.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
      if (["./CorruptedEmblem", "./GlitchText"].includes(id)) return { __esModule: true, default: ({ text }) => text ?? null };
      if (id.startsWith("./")) return load(id.slice(2));
      return nativeRequire(id);
    }
    vm.runInNewContext(`(function (require, module, exports) { ${compiled}\n})`, globals)(componentRequire, exported, exported.exports);
    cache.set(name, exported.exports);
    return exported.exports;
  }
  return load("MaintenanceNotice").default;
}

test("공지 화면은 다음 상황 안내와 기한 이후 점검 계속 문구를 구분하고 우회 링크를 제공하지 않는다", () => {
  const Notice = loadNotice();
  for (const now of [start + 5 * 60_000, end, end + 90 * 24 * 60 * 60_000]) {
    const html = renderToStaticMarkup(React.createElement(Notice, { startsAt, endsAt, serverNow: now, preview: true }));
    assert.match(html, /사이트 전체/);
    assert.match(html, /공개 홈페이지·로그인·ERP/);
    assert.match(html, /재개 일정 추후 공지/);
    assert.doesNotMatch(html, /href=|자동 재개|자동으로 전환|재개 예정|100[.]0/);
    if (now < end) {
      assert.match(html, /다음 상황 안내까지/);
      assert.doesNotMatch(html, /보안 점검이 계속되고 있습니다/);
    } else {
      assert.match(html, /보안 점검이 계속되고 있습니다[.] 서비스 재개 일정은 추후 별도 공지하겠습니다[.]/);
      assert.doesNotMatch(html, /00:00:00|HOURS : MINUTES : SECONDS/);
      assert.match(html, /94[.]0/);
    }
  }
});

test("카운트다운 0과 비활성 이외 응답은 해제하지 않고 명시적 off에서만 홈으로 한 번 이동한다", async () => {
  let effect;
  let tick;
  let elapsed = 0;
  let currentStatus = { phase: "active", startsAt, endsAt, serverNow: end + 90 * 24 * 60 * 60_000 };
  const listeners = new Map();
  const navigations = [];
  const states = [];
  let intervalCleared = false;
  const Notice = loadNotice({
    react: {
      useState(initial) {
        const slot = states.length;
        states.push(typeof initial === "function" ? initial() : initial);
        return [states[slot], (value) => { states[slot] = value; }];
      },
      useEffect(callback) { effect = callback; },
    },
    globals: {
      performance: { now: () => elapsed },
      AbortController,
      setInterval(callback) { tick = callback; return 1; },
      clearInterval() { intervalCleared = true; },
      setTimeout() { return 2; },
      clearTimeout() {},
      window: {
        location: { replace: (path) => { navigations.push(path); } },
        addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: (name) => listeners.delete(name),
      },
      document: {
        visibilityState: "visible",
        addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: (name) => listeners.delete(name),
      },
      fetch: async () => ({ ok: true, json: async () => currentStatus }),
    },
  });
  Notice({ startsAt, endsAt, serverNow: end - 1_000 });
  const cleanup = effect();
  elapsed = 2_000;
  tick();
  assert.equal(states[0], 0);
  assert.deepEqual(navigations, []);
  for (const phase of ["scheduled", "ended", "invalid", "active"]) {
    currentStatus = { ...currentStatus, phase };
    listeners.get("focus")();
    await new Promise(setImmediate);
    assert.deepEqual(navigations, [], phase);
  }
  assert.equal(states[0], 0);
  assert.equal(states[1], currentStatus.serverNow);
  elapsed += 1_000;
  tick();
  assert.ok(states[1] > currentStatus.serverNow, "안내 기준 시각 이후에도 화면 시간이 계속 흐른다");
  currentStatus = { ...currentStatus, phase: "off" };
  listeners.get("focus")();
  await new Promise(setImmediate);
  listeners.get("focus")();
  tick();
  await new Promise(setImmediate);
  assert.deepEqual(navigations, ["/"]);
  cleanup();
  assert.equal(intervalCleared, true);
  assert.equal(listeners.size, 0);
});
