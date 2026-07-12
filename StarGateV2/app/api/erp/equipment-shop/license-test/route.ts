import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { getClient } from "@stargate/shared-db";

import {
  isValidIdempotencyKey,
  readIdempotencyKey,
} from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import {
  claimTowaskiLicenseChallengeRedemption,
  findTowaskiLicenseTestRequestChallenge,
  markTowaskiLicenseChallengeRedeemed,
  releaseTowaskiLicenseChallengeRedemption,
  resolveTowaskiLicenseChallengeRound,
  startOrResumeTowaskiLicenseChallenge,
  TowaskiLicenseChallengeError,
  type TowaskiLicenseChallenge,
} from "@/lib/db/equipment-license-tests";
import {
  grantTowaskiLicenseOnce,
  hasOwnedTowaskiLicense,
  prepareTowaskiLicenseGrant,
} from "@/lib/db/equipment-licenses";
import { findMasterItemBySlug } from "@/lib/db/inventory";
import { equipmentShopItemZone } from "@/lib/equipment-shop/catalog";
import {
  evaluateTowaskiBasicLicenseTest,
  getTowaskiLicenseTestProgram,
  getTowaskiLicenseTestRules,
  parseTowaskiLicenseTestRequest,
  TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
  type TowaskiLicenseTestResponse,
  type TowaskiLicenseTestStats,
} from "@/lib/equipment-shop/license-test";
import {
  TOWASKI_LICENSE_DEFINITIONS,
  type TowaskiLicenseSlug,
} from "@/lib/equipment-shop/licenses";
import { notifyUser } from "@/lib/notifications/events";

async function isTowaskiLicenseTestAvailable(
  licenseSlug: TowaskiLicenseSlug,
): Promise<boolean> {
  const item = await findMasterItemBySlug(licenseSlug);
  return Boolean(
    item?._id &&
      item.slug === licenseSlug &&
      item.isPublic !== false &&
      item.isAvailable !== false &&
      equipmentShopItemZone(item) === "towaski",
  );
}

function challengeStats(
  challenge: TowaskiLicenseChallenge,
): TowaskiLicenseTestStats {
  return {
    hostileHits: challenge.hostileHits,
    civilianHits: challenge.civilianHits,
    shots: challenge.shots,
  };
}

function activeResponse(
  challenge: TowaskiLicenseChallenge,
): TowaskiLicenseTestResponse | null {
  const challengeId = challenge._id?.toString();
  const target = challenge.sequence[challenge.currentRound];
  if (!challengeId || !target) return null;
  return {
    status: "active",
    challengeId,
    round: challenge.currentRound,
    target,
    licenseSlug: challenge.licenseSlug,
    difficulty: challenge.difficulty ?? "standard",
    stats: challengeStats(challenge),
    roundDeadlineAt: new Date(
      challenge.roundStartedAt.getTime() +
        getTowaskiLicenseTestRules(challenge.difficulty ?? "standard")
          .targetWindowMs,
    ).toISOString(),
  };
}

function challengeEvaluation(challenge: TowaskiLicenseChallenge) {
  const completedAt = challenge.completedAt ?? new Date();
  return evaluateTowaskiBasicLicenseTest(
    {
      ...challengeStats(challenge),
      durationMs: completedAt.getTime() - challenge.startedAt.getTime(),
    },
    challenge.difficulty ?? "standard",
  );
}

function challengeErrorResponse(error: TowaskiLicenseChallengeError) {
  const status =
    error.code === "LICENSE_TEST_EXPIRED"
      ? 410
      : error.code === "LICENSE_TEST_TOO_FAST"
        ? 422
        : error.code === "INVALID_LICENSE_TEST"
          ? 400
          : 409;
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status },
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestId = new URL(request.url).searchParams.get("requestId")?.trim();
  if (!requestId || !isValidIdempotencyKey(requestId)) {
    return NextResponse.json(
      { error: "조회할 requestId가 필요합니다.", code: "INVALID_IDEMPOTENCY_KEY" },
      { status: 400 },
    );
  }
  const mainCharacter = await findMainCharacterByOwner(session.user.id);
  if (!mainCharacter || mainCharacter.type !== "AGENT" || !mainCharacter._id) {
    return NextResponse.json(
      { error: "메인 AGENT 캐릭터가 필요합니다.", code: "NO_MAIN_CHARACTER" },
      { status: 400 },
    );
  }
  const characterId = String(mainCharacter._id);
  const result = await findTowaskiLicenseTestRequestChallenge({
    userId: session.user.id,
    characterId,
    requestId,
  });
  if (!result) {
    return NextResponse.json(
      { error: "요청 처리 기록을 찾을 수 없습니다.", code: "LICENSE_TEST_CONFLICT" },
      { status: 404 },
    );
  }
  const { challenge } = result;
  const license = TOWASKI_LICENSE_DEFINITIONS[challenge.licenseSlug];
  if (await hasOwnedTowaskiLicense(characterId, challenge.licenseSlug)) {
    return NextResponse.json({ status: "already_owned", license });
  }
  const challengeId = challenge._id?.toString();
  if (!challengeId) {
    return NextResponse.json(
      { error: "사격 시험 기록이 손상되었습니다.", code: "INVALID_LICENSE_TEST" },
      { status: 409 },
    );
  }
  if (challenge.status === "active") {
    const response = activeResponse(challenge);
    if (response) return NextResponse.json(response);
  }
  const evaluation = challengeEvaluation(challenge);
  if (challenge.status === "failed" || !evaluation.passed) {
    return NextResponse.json({
      status: "failed",
      challengeId,
      licenseSlug: challenge.licenseSlug,
      difficulty: challenge.difficulty ?? "standard",
      stats: challengeStats(challenge),
      evaluation,
    } satisfies TowaskiLicenseTestResponse);
  }
  return NextResponse.json({
    status: "processing",
    challengeId,
    licenseSlug: challenge.licenseSlug,
    difficulty: challenge.difficulty ?? "standard",
  } satisfies TowaskiLicenseTestResponse);
}

async function waitForOwnedTowaskiLicense(
  characterId: string,
  licenseSlug: TowaskiLicenseSlug,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await hasOwnedTowaskiLicense(characterId, licenseSlug)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      {
        error: "유효한 Idempotency-Key 헤더가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400 },
    );
  }

  const body = parseTowaskiLicenseTestRequest(
    await request.json().catch(() => null),
  );
  if (!body) {
    return NextResponse.json(
      {
        error: "서버에서 발급한 사격 시험 세션이 필요합니다.",
        code: "INVALID_LICENSE_TEST",
      },
      { status: 400 },
    );
  }

  let mainCharacter;
  try {
    mainCharacter = await findMainCharacterByOwner(session.user.id);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "메인 캐릭터 조회 실패 (정합성 위반)";
    return NextResponse.json(
      { error: message, code: "MAIN_CHARACTER_INTEGRITY" },
      { status: 409 },
    );
  }
  if (!mainCharacter || mainCharacter.type !== "AGENT") {
    return NextResponse.json(
      {
        error: "메인 AGENT 캐릭터가 등록되어 있지 않습니다.",
        code: "NO_MAIN_CHARACTER",
      },
      { status: 400 },
    );
  }

  const characterId = String(mainCharacter._id);

  let challenge: TowaskiLicenseChallenge;
  let challengeId: string;

  if (body.action === "start") {
    const program = getTowaskiLicenseTestProgram(body.licenseSlug);
    const license = TOWASKI_LICENSE_DEFINITIONS[body.licenseSlug];
    if (!(await isTowaskiLicenseTestAvailable(body.licenseSlug))) {
      return NextResponse.json(
        {
          error: "현재 운영 중인 자격시험이 아닙니다.",
          code: "LICENSE_TEST_UNAVAILABLE",
        },
        { status: 404 },
      );
    }
    if (await hasOwnedTowaskiLicense(characterId, body.licenseSlug)) {
      return NextResponse.json({ status: "already_owned", license });
    }
    if (
      program.requiresBasicLicense &&
      !(await hasOwnedTowaskiLicense(
        characterId,
        TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
      ))
    ) {
      return NextResponse.json(
        {
          error: "전문 자격시험은 기본 화기 라이센스 취득 후 응시할 수 있습니다.",
          code: "BASIC_LICENSE_REQUIRED",
        },
        { status: 403 },
      );
    }
    try {
      challenge = await startOrResumeTowaskiLicenseChallenge({
        userId: session.user.id,
        characterId,
        characterCodename: mainCharacter.codename,
        licenseSlug: body.licenseSlug,
        difficulty: program.difficulty,
        requestId,
      });
      if (!challenge._id) throw new Error("사격 시험 challenge ID 발급 실패");
      challengeId = challenge._id.toString();
      if (challenge.status === "expired" || challenge.status === "superseded") {
        throw new TowaskiLicenseChallengeError(
          challenge.status === "expired"
            ? "LICENSE_TEST_EXPIRED"
            : "LICENSE_TEST_CONFLICT",
          "이미 종료된 사격 시험 시작 요청입니다.",
        );
      }
      const response = activeResponse(challenge);
      if (response) return NextResponse.json(response);
    } catch (error) {
      if (error instanceof TowaskiLicenseChallengeError) {
        return challengeErrorResponse(error);
      }
      const message =
        error instanceof Error ? error.message : "사격 시험 세션 발급 실패";
      return NextResponse.json(
        { error: message, code: "LICENSE_TEST_CONFLICT" },
        { status: 409 },
      );
    }
  } else {
    challengeId = body.challengeId;
    try {
      challenge = await resolveTowaskiLicenseChallengeRound({
        ...body,
        userId: session.user.id,
        characterId,
        requestId,
      });
    } catch (error) {
      if (error instanceof TowaskiLicenseChallengeError) {
        return challengeErrorResponse(error);
      }
      const message =
        error instanceof Error ? error.message : "사격 기록 처리 실패";
      return NextResponse.json(
        { error: message, code: "LICENSE_TEST_CONFLICT" },
        { status: 409 },
      );
    }

    if (
      challenge.status === "active" &&
      challenge.currentRound < challenge.sequence.length
    ) {
      const response = activeResponse(challenge);
      if (response) return NextResponse.json(response);
    }

  }

  const licenseSlug = challenge.licenseSlug;
  const license = TOWASKI_LICENSE_DEFINITIONS[licenseSlug];
  const program = getTowaskiLicenseTestProgram(licenseSlug);
  if (!(await isTowaskiLicenseTestAvailable(licenseSlug))) {
    return NextResponse.json(
      {
        error: "자격시험 운영 상태가 변경되어 발급을 중단했습니다.",
        code: "LICENSE_TEST_UNAVAILABLE",
      },
      { status: 409 },
    );
  }
  if (
    program.requiresBasicLicense &&
    !(await hasOwnedTowaskiLicense(
      characterId,
      TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    ))
  ) {
    return NextResponse.json(
      {
        error: "전문 자격 발급에는 유효한 기본 화기 라이센스가 필요합니다.",
        code: "BASIC_LICENSE_REQUIRED",
      },
      { status: 403 },
    );
  }
  const evaluation = challengeEvaluation(challenge);

  if (challenge.status === "failed" || !evaluation.passed) {
    return NextResponse.json({
      status: "failed",
      challengeId,
      licenseSlug,
      difficulty: challenge.difficulty ?? "standard",
      stats: challengeStats(challenge),
      evaluation,
    } satisfies TowaskiLicenseTestResponse);
  }

  const redemptionToken = randomUUID();
  const redemptionClaimed =
    ["passed", "redeeming"].includes(challenge.status) &&
    (await claimTowaskiLicenseChallengeRedemption(
      challengeId,
      redemptionToken,
    ));
  if (!redemptionClaimed) {
    if (await waitForOwnedTowaskiLicense(characterId, licenseSlug)) {
      return NextResponse.json({
        status: "already_owned",
        license,
        difficulty: challenge.difficulty ?? "standard",
        evaluation,
      } satisfies TowaskiLicenseTestResponse);
    }
    return NextResponse.json(
      {
        error: "라이선스 발급이 이미 처리 중이거나 완료되었습니다.",
        code: "LICENSE_TEST_CONFLICT",
      },
      { status: 409 },
    );
  }

  try {
    await prepareTowaskiLicenseGrant(
      characterId,
      licenseSlug,
    );
    const client = await getClient();
    const mongoSession = client.startSession();
    let result;
    try {
      result = await mongoSession.withTransaction(async () => {
        if (
          program.requiresBasicLicense &&
          !(await hasOwnedTowaskiLicense(
            characterId,
            TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
            { session: mongoSession },
          ))
        ) {
          throw new TowaskiLicenseChallengeError(
            "LICENSE_TEST_CONFLICT",
            "기본 화기 라이센스가 회수되어 전문 자격을 발급할 수 없습니다.",
          );
        }
        const granted = await grantTowaskiLicenseOnce(
          {
            characterId,
            characterCodename: mainCharacter.codename,
            licenseSlug,
            note: `${license.name} 자격시험 합격`,
          },
          { session: mongoSession },
        );
        const redeemed = await markTowaskiLicenseChallengeRedeemed(
          challengeId,
          redemptionToken,
          { session: mongoSession },
        );
        if (!redeemed) {
          throw new TowaskiLicenseChallengeError(
            "LICENSE_TEST_CONFLICT",
            "라이선스 발급 권한이 만료되었습니다. 다시 시도해 주세요.",
          );
        }
        return granted;
      });
    } finally {
      await mongoSession.endSession();
    }
    if (!result) throw new Error("라이선스 지급 transaction 결과가 없습니다.");

    if (result.granted && mainCharacter.ownerId) {
      await notifyUser({
        userId: mainCharacter.ownerId,
        type: "SYSTEM",
        title: `${license.label} 라이선스가 발급되었습니다`,
        message: `${mainCharacter.codename} · ${license.name} 시험 합격`,
        link: "/erp/equipment-shop/towaski",
      }).catch((error) => {
        console.error("[equipment-shop/license-test] notification failed:", error);
      });
    }

    return NextResponse.json(
      {
        status: result.granted ? "granted" : "already_owned",
        license,
        difficulty: challenge.difficulty ?? "standard",
        evaluation,
      } satisfies TowaskiLicenseTestResponse,
      { status: result.granted ? 201 : 200 },
    );
  } catch (error) {
    await releaseTowaskiLicenseChallengeRedemption(
      challengeId,
      redemptionToken,
    ).catch(() => undefined);
    if (error instanceof TowaskiLicenseChallengeError) {
      return challengeErrorResponse(error);
    }
    const message = error instanceof Error ? error.message : "라이선스 지급 실패";
    const missingMaster = message.includes("마스터 품목 누락");
    return NextResponse.json(
      {
        error: message,
        code: missingMaster ? "LICENSE_ITEM_MISSING" : "LICENSE_GRANT_FAILED",
      },
      { status: missingMaster ? 503 : 500 },
    );
  }
}
