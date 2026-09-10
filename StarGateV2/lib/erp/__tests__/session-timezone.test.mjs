import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const utilsUrl = new URL("../../../app/(erp)/erp/sessions/_utils.ts", import.meta.url).href;

for (const timezone of ["UTC", "Asia/Seoul", "America/Los_Angeles"]) {
  test(`session dates, calendar placement and upcoming cutoff agree in ${timezone}`, () => {
    const output = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
      import * as u from ${JSON.stringify(utilsUrl)};
      const instants = [
        "2026-09-30T14:59:00Z", "2026-09-30T15:30:00Z",
        "2026-12-31T15:00:00Z", "2024-02-28T15:00:00Z"
      ];
      const now = new Date("2026-09-30T15:05:00Z");
      const october = u.buildCalendarGrid(2026, 10);
      console.log(JSON.stringify({
        dates: instants.map(iso => [u.formatDateMD(iso), u.formatTime(iso), u.sessionDateKey(iso), u.sessionDateParts(iso).weekday]),
        days: instants.slice(0, 2).map(iso => u.diffDays(iso, now)),
        cutoff: new Date(u.sessionDayStart(now)).toISOString(),
        upcoming: ["2026-09-30T14:59:59Z", "2026-09-30T15:00:00Z"].filter(iso => new Date(iso).getTime() >= u.sessionDayStart(now)),
        october: {length: october.length, first: october[0].key, last: october.at(-1).key, event: october.find(cell => cell.key === u.sessionDateKey(instants[1]))},
        sixWeeks: u.buildCalendarGrid(2026, 8).length,
        leapDays: u.buildCalendarGrid(2024, 2).filter(cell => cell.inMonth).length,
        dstDays: u.diffDays("2026-03-09T01:00:00Z", new Date("2026-03-07T01:00:00Z"))
      }));
    `], { env: { ...process.env, TZ: timezone }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const actual = JSON.parse(output);
    assert.deepEqual(actual.dates, [
      ["09.30", "23:59", "2026-09-30", 3],
      ["10.01", "00:30", "2026-10-01", 4],
      ["01.01", "00:00", "2027-01-01", 5],
      ["02.29", "00:00", "2024-02-29", 4],
    ]);
    assert.deepEqual(actual.days, [-1, 0]);
    assert.equal(actual.cutoff, "2026-09-30T15:00:00.000Z");
    assert.deepEqual(actual.upcoming, ["2026-09-30T15:00:00Z"]);
    assert.deepEqual(actual.october, {
      length: 35, first: "2026-09-27", last: "2026-10-31",
      event: { key: "2026-10-01", month: 10, day: 1, inMonth: true },
    });
    assert.equal(actual.sixWeeks, 42);
    assert.equal(actual.leapDays, 29);
    assert.equal(actual.dstDays, 2);
  });
}
