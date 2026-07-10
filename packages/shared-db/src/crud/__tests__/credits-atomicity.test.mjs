import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";

import {
  addCredit,
  creditBalancesCol,
  creditTransactionsCol,
  ensureAllIndexes,
  getCharacterBalance,
  getClient,
  initServerless,
} from "../../../dist/index.js";

const TEST_DB_NAME = `stargate_test_credit_atomicity_${process.pid}`;
const TEST_OWNER_ID = "000000000000000000000123";
const TEST_ACTOR_ID = "000000000000000000000001";
const TEST_CHARACTER_IDS = [
  "credit-race-a",
  "credit-race-b",
  "credit-race-c",
  "credit-ledger-fault-a",
  "credit-ledger-fault-b",
  "credit-decimal",
  "credit-legacy-bootstrap",
];
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);

function creditInput(characterId, amount, requestId) {
  return {
    characterId,
    characterCodename: characterId,
    ownerId: TEST_OWNER_ID,
    ownerName: "credit-test-owner",
    amount,
    type: amount >= 0 ? "ADMIN_GRANT" : "PURCHASE",
    description: "credit atomicity integration test",
    createdById: TEST_ACTOR_ID,
    createdByName: "credit-test-system",
    requestId,
  };
}

before(async () => {
  if (!HAS_DB) return;
  initServerless({ uri: TEST_URI, dbName: TEST_DB_NAME });
  await ensureAllIndexes();
  await (await creditTransactionsCol()).deleteMany({
    characterId: { $in: TEST_CHARACTER_IDS },
  });
  await (await creditBalancesCol()).deleteMany({
    characterId: { $in: TEST_CHARACTER_IDS },
  });
});

after(async () => {
  if (!HAS_DB) return;
  await (await creditTransactionsCol()).deleteMany({
    characterId: { $in: TEST_CHARACTER_IDS },
  });
  await (await creditBalancesCol()).deleteMany({
    characterId: { $in: TEST_CHARACTER_IDS },
  });
  const client = await getClient().catch(() => null);
  await client?.close().catch(() => undefined);
});

test(
  "동일 캐릭터 병렬 20건은 balance와 ledger를 유실 없이 누적한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        addCredit(creditInput(TEST_CHARACTER_IDS[0], 10, `race-a-${index}`)),
      ),
    );

    assert.equal(await getCharacterBalance(TEST_CHARACTER_IDS[0]), 200);
    assert.equal(
      await (await creditTransactionsCol()).countDocuments({
        characterId: TEST_CHARACTER_IDS[0],
      }),
      20,
    );
  },
);

test(
  "ledger unique 충돌 시 선행 balance update도 transaction rollback된다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const requestId = "ledger-insert-conflict";
    const results = await Promise.allSettled([
      addCredit(creditInput("credit-ledger-fault-a", 10, requestId)),
      addCredit(creditInput("credit-ledger-fault-b", 10, requestId)),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      (await getCharacterBalance("credit-ledger-fault-a")) +
        (await getCharacterBalance("credit-ledger-fault-b")),
      10,
    );
  },
);

test(
  "소수 크레딧은 매 mutation마다 0.01 단위로 반올림한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await addCredit(creditInput("credit-decimal", 0.1, "decimal-a"));
    await addCredit(creditInput("credit-decimal", 0.2, "decimal-b"));
    assert.equal(await getCharacterBalance("credit-decimal"), 0.3);
  },
);

test(
  "legacy ledger-only snapshot이 있으면 balance row를 bootstrap한 뒤 신규 금액을 더한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await (await creditTransactionsCol()).insertOne({
      ...creditInput("credit-legacy-bootstrap", 40, "legacy-ledger"),
      balance: 40,
      createdAt: new Date(),
    });
    await addCredit(creditInput("credit-legacy-bootstrap", 5, "legacy-next"));
    assert.equal(await getCharacterBalance("credit-legacy-bootstrap"), 45);
  },
);

test(
  "동일 requestId 병렬 재전송은 거래 한 건만 생성한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const input = creditInput(TEST_CHARACTER_IDS[1], 25, "duplicate-request");
    const [first, second] = await Promise.all([addCredit(input), addCredit(input)]);

    assert.equal(String(first._id), String(second._id));
    assert.equal(await getCharacterBalance(TEST_CHARACTER_IDS[1]), 25);
    assert.equal(
      await (await creditTransactionsCol()).countDocuments({
        characterId: TEST_CHARACTER_IDS[1],
      }),
      1,
    );
  },
);

test(
  "동시 차감은 음수 잔액을 허용하지 않는다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await addCredit(creditInput(TEST_CHARACTER_IDS[2], 50, "seed-balance"));
    const results = await Promise.allSettled([
      addCredit(creditInput(TEST_CHARACTER_IDS[2], -40, "debit-a")),
      addCredit(creditInput(TEST_CHARACTER_IDS[2], -40, "debit-b")),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(await getCharacterBalance(TEST_CHARACTER_IDS[2]), 10);
  },
);

test(
  "같은 requestId를 다른 거래에 재사용하면 DUPLICATE_REQUEST로 거부한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const requestId = "mismatched-replay";
    await addCredit(creditInput(TEST_CHARACTER_IDS[1], 5, requestId));

    await assert.rejects(
      addCredit(creditInput(TEST_CHARACTER_IDS[1], 6, requestId)),
      (error) => error?.code === "DUPLICATE_REQUEST",
    );
  },
);
