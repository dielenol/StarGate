import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
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
const { grantDailyCreditAllowances } = await import("../daily-allowance.ts");
if (originalMongoUri === undefined) delete process.env.MONGODB_URI;

test("allowance remains granted when the follow-up notification fails", async () => {
  const summary = await grantDailyCreditAllowances(
    new Date("2026-07-27T03:00:00.000Z"),
    {
      ensureIndex: async () => "credit_transactions_dailyAllowance_unique",
      listCharacters: async () => [
        {
          _id: { toString: () => "character-1" },
          type: "AGENT",
          tier: "MAIN",
          codename: "ALLOWANCE",
          agentLevel: "J",
          ownerId: "owner-1",
          isPublic: true,
        },
      ],
      listAlreadyPaid: async () => new Map(),
      findOwners: async () => [
        {
          _id: { toString: () => "owner-1" },
          displayName: "Owner",
        },
      ],
      grantCredit: async (input) => ({
        _id: { toString: () => "transaction-1" },
        ...input,
        amount: input.amount,
        balance: input.amount,
        createdAt: new Date(),
      }),
      createAllowanceNotification: async () => {
        throw new Error("notification unavailable");
      },
    },
  );

  assert.equal(summary.granted, 1);
  assert.equal(summary.failed, 0);
  assert.equal(summary.notificationsSent, 0);
  assert.equal(summary.notificationsFailed, 1);
  assert.equal(summary.totalAmount, 18);
  assert.equal(summary.results[0].status, "granted");
  assert.equal(summary.results[0].notificationStatus, "failed");
  assert.equal(
    summary.results[0].notificationError,
    "notification unavailable",
  );
});

test("already-paid replay retries only the idempotent notification", async () => {
  let grantCalls = 0;
  let notificationCalls = 0;
  const paidTransaction = {
    _id: { toString: () => "transaction-1" },
    characterId: "character-1",
    characterCodename: "ALLOWANCE",
    ownerId: "owner-1",
    amount: 18,
    balance: 118,
  };
  const summary = await grantDailyCreditAllowances(
    new Date("2026-07-27T03:00:00.000Z"),
    {
      ensureIndex: async () => "credit_transactions_dailyAllowance_unique",
      listCharacters: async () => [
        {
          _id: { toString: () => "character-1" },
          type: "AGENT",
          tier: "MAIN",
          codename: "ALLOWANCE",
          agentLevel: "J",
          ownerId: "owner-1",
          isPublic: true,
        },
      ],
      listAlreadyPaid: async () =>
        new Map([["character-1", paidTransaction]]),
      findOwners: async () => [
        {
          _id: { toString: () => "owner-1" },
          displayName: "Owner",
        },
      ],
      grantCredit: async () => {
        grantCalls += 1;
        throw new Error("must not grant again");
      },
      createAllowanceNotification: async (input) => {
        notificationCalls += 1;
        return {
          created: true,
          notification: {
            ...input,
            isRead: false,
            createdAt: new Date(),
          },
        };
      },
    },
  );

  assert.equal(grantCalls, 0);
  assert.equal(notificationCalls, 1);
  assert.equal(summary.granted, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.failed, 0);
  assert.equal(summary.notificationsSent, 1);
  assert.equal(summary.notificationsFailed, 0);
  assert.equal(summary.totalAmount, 0);
  assert.equal(summary.results[0].status, "skipped-already-paid");
  assert.equal(summary.results[0].notificationStatus, "sent");
});

test("already-paid replay targets the owner captured by the transaction", async () => {
  const recipients = [];
  const summary = await grantDailyCreditAllowances(
    new Date("2026-07-27T03:00:00.000Z"),
    {
      ensureIndex: async () => "credit_transactions_dailyAllowance_unique",
      listCharacters: async () => [
        {
          _id: { toString: () => "character-1" },
          type: "AGENT",
          tier: "MAIN",
          codename: "TRANSFERRED",
          agentLevel: "J",
          ownerId: "new-owner",
          isPublic: true,
        },
      ],
      listAlreadyPaid: async () =>
        new Map([
          [
            "character-1",
            {
              _id: { toString: () => "transaction-1" },
              characterId: "character-1",
              characterCodename: "TRANSFERRED-BEFORE",
              ownerId: "old-owner",
              amount: 18,
              balance: 118,
            },
          ],
        ]),
      findOwners: async () => [],
      grantCredit: async () => {
        throw new Error("must not grant again");
      },
      createAllowanceNotification: async (input) => {
        recipients.push(input.userId);
        return {
          created: true,
          notification: {
            ...input,
            isRead: false,
            createdAt: new Date(),
          },
        };
      },
    },
  );

  assert.deepEqual(recipients, ["old-owner"]);
  assert.equal(summary.results[0].status, "skipped-already-paid");
  assert.equal(summary.results[0].notificationStatus, "sent");
});
