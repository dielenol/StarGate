import assert from "node:assert/strict";
import test from "node:test";
import { ERP_MAINTENANCE_WINDOW } from "../schedule.ts";
import {
  RECOVERY_STAGES,
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

test("복구율은 시작 0에서 종료 1까지 단조 증가하고 구간 밖과 잘못된 입력에서는 고정된다", () => {
  for (const [time, expected] of [[start - 60_000, 0], [start, 0], [end, 1], [end + 60_000, 1]]) {
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

test("구역 블록은 오염 → 격리 → 복구 중 → 정상으로만 진행하고 종료 시 모두 정상이다", () => {
  let previous = sectorRows(0);
  for (let step = 1; step <= 100; step += 1) {
    const rows = sectorRows(step / 100);
    rows.forEach((row, rowIndex) => row.cells.forEach((cell, column) => {
      assert.ok(SECTOR_ORDER.indexOf(cell) >= SECTOR_ORDER.indexOf(previous[rowIndex].cells[column]));
    }));
    previous = rows;
  }
  assert.ok(sectorRows(1).every((row) => row.restored === 1 && row.cells.length === SECTOR_COLUMNS));
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
