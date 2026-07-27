import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionCandidates = ["", ".ts", ".tsx", ".js", ".mjs"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const basePath = specifier.startsWith("@/")
      ? resolve(rootDir, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(fileURLToPath(context.parentURL)), specifier)
        : null;
    if (basePath) {
      for (const extension of extensionCandidates) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const originalMongoUri = process.env.MONGODB_URI;
process.env.MONGODB_URI =
  originalMongoUri ?? "mongodb://127.0.0.1:27017/stargate-test";
const {
  runSessionReminderNotifications,
  sessionReminderDedupeKey,
} = await import("../session-reminders.ts");
if (originalMongoUri === undefined) delete process.env.MONGODB_URI;

test("ERP reminders dedupe per source, session, and recipient without bot claims", async () => {
  const now = new Date("2026-07-27T12:00:00.000Z");
  const saved = new Map();
  const dependencies = {
    findRegistraCandidates: async () => [
      {
        _id: { toString: () => "registra-session" },
        title: "Registra session",
        targetDateTime: new Date("2026-07-28T10:00:00.000Z"),
      },
    ],
    findTrpgCandidates: async () => [
      {
        _id: { toString: () => "trpg-session" },
        title: "TRPG session",
        date: "2026-07-28",
        startTime: "20:00",
        participantDiscordIds: ["discord-trpg"],
      },
    ],
    findRegistraResponses: async () => [
      { status: "YES", userId: "discord-registra" },
    ],
    findUsers: async (discordIds) =>
      discordIds.map((discordId) => ({
        _id: {
          toString: () =>
            discordId === "discord-registra"
              ? "user-registra"
              : "user-trpg",
        },
        status: "ACTIVE",
      })),
    createOnce: async (input) => {
      const existing = saved.get(input.dedupeKey);
      if (existing) return { notification: existing, created: false };
      const notification = {
        ...input,
        isRead: false,
        createdAt: now,
      };
      saved.set(input.dedupeKey, notification);
      return { notification, created: true };
    },
  };

  const first = await runSessionReminderNotifications(now, dependencies);
  const replay = await runSessionReminderNotifications(now, dependencies);

  assert.equal(first.registra.notifications, 1);
  assert.equal(first.trpg.notifications, 1);
  assert.equal(replay.registra.notifications, 0);
  assert.equal(replay.trpg.notifications, 0);
  assert.equal(replay.registra.items[0].reason, "already-notified");
  assert.equal(replay.trpg.items[0].reason, "already-notified");
  assert.deepEqual(Array.from(saved.keys()).sort(), [
    sessionReminderDedupeKey(
      "registra",
      "registra-session",
      "2026-07-28T10:00:00.000Z",
      "user-registra",
    ),
    sessionReminderDedupeKey(
      "trpg",
      "trpg-session",
      "2026-07-28T20:00",
      "user-trpg",
    ),
  ]);
});

test("ERP reminder implementation never reads or writes Discord reminder claims", async () => {
  const source = await readFile(
    new URL("../session-reminders.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /claimSessionStartReminder/);
  assert.doesNotMatch(source, /markSessionStartReminderSent/);
  assert.doesNotMatch(source, /releaseSessionStartReminderClaim/);
  assert.doesNotMatch(source, /\bclaimReminder\b/);
  assert.doesNotMatch(source, /\bmarkReminderSent\b/);
  assert.doesNotMatch(source, /sessionStartReminder24hSent/);
  assert.doesNotMatch(source, /reminderSentAt/);
});

test("rescheduled session gets a new occurrence-scoped dedupe key", () => {
  const before = sessionReminderDedupeKey(
    "registra",
    "session-1",
    "2026-07-28T10:00:00.000Z",
    "user-1",
  );
  const after = sessionReminderDedupeKey(
    "registra",
    "session-1",
    "2026-07-29T10:00:00.000Z",
    "user-1",
  );

  assert.notEqual(before, after);
});
