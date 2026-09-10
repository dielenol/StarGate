import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const folder = new URL("../../../app/(erp)/erp/sessions/", import.meta.url);
const initialNow = "2026-09-30T14:59:59.900Z";
const session = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa", source: "registra", title: "자정 경계 작전",
  targetDateTime: "2026-09-30T14:59:00Z", closeDateTime: "2026-09-30T15:30:00Z",
  status: "CLOSED", myRsvp: "YES", participants: [], counts: { yes: 1, no: 0 },
  guildId: "fixture", channelId: "fixture", messageId: "fixture",
};

function render(wallClock, view) {
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [wallClock])); }
    static now() { return new Date(wallClock).getTime(); }
  }
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const exports = {};
    const source = readFileSync(new URL(name, folder), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    vm.runInNewContext(outputText, { exports, Date: ClockDate, URL, URLSearchParams, console,
      require(id) {
        if (id === "react" || id === "react/jsx-runtime") return require(id);
        if (id.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
        if (id === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
        if (id === "@/components/ui/PageHead/PageHead") return { default: () => null };
        if (id === "@/components/icons") return { IconMenu: () => null, IconSession: () => null };
        if (id === "@/hooks/queries/useSessionsQuery") return {
          useSessionsByMonth: () => ({ data: [session], refetch: () => {} }),
          useUpcomingSessions: () => ({ data: { sessions: [session] } }),
        };
        if (id === "@/types/dashboard-sessions") return load("../../../../types/dashboard-sessions.ts");
        if (id === "./_utils") return load("_utils.ts");
        if (id === "./SessionCalendar") return load("SessionCalendar.tsx");
        throw new Error(`Unexpected dependency ${id}`);
      },
    });
    modules.set(name, exports);
    return exports;
  }
  const Client = load("SessionsClient.tsx").default;
  return renderToStaticMarkup(React.createElement(Client, {
    initialSessions: [session], initialNow, initialYear: 2026, initialMonth: 9,
    initialSessionTarget: view === "list" ? {
      sessionId: session._id, source: "registra", date: "2026-09-30", year: 2026, month: 9,
    } : null,
    initialSessionTargetInvalid: false, initialUpcoming: [session],
    guildId: "fixture", guestReadOnly: false, canCreateReport: false, trpgWebBaseUrl: null,
  }));
}

for (const view of ["calendar", "list"]) {
  test(`${view} first render stays identical when hydration crosses KST midnight`, () => {
    const server = render(initialNow, view);
    const client = render("2026-09-30T15:00:00.100Z", view);
    assert.equal(client, server);
    assert.match(server, /TODAY/);
    assert.match(server, /23:59/);
    assert.match(server, /자정 경계 작전/);
  });
}
