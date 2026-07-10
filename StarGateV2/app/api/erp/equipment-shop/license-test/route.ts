import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { getClient } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import {
  completeTowaskiLicenseChallenge,
  claimTowaskiLicenseChallengeRedemption,
  createTowaskiLicenseChallenge,
  findRecoverableTowaskiLicenseChallenge,
  findTowaskiLicenseChallenge,
  markTowaskiLicenseChallengeRedeemed,
  releaseTowaskiLicenseChallengeRedemption,
  resolveTowaskiLicenseChallengeRound,
  TowaskiLicenseChallengeError,
  type TowaskiLicenseChallenge,
} from "@/lib/db/equipment-license-tests";
import {
  grantTowaskiLicenseOnce,
  hasOwnedTowaskiLicense,
  prepareTowaskiLicenseGrant,
} from "@/lib/db/equipment-licenses";
import {
  evaluateTowaskiBasicLicenseTest,
  parseTowaskiLicenseTestRequest,
  TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
  type TowaskiLicenseTestResponse,
  type TowaskiLicenseTestStats,
} from "@/lib/equipment-shop/license-test";
import { TOWASKI_LICENSE_DEFINITIONS } from "@/lib/equipment-shop/licenses";
import { notifyUser } from "@/lib/notifications/events";

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
    stats: challengeStats(challenge),
  };
}

function challengeEvaluation(challenge: TowaskiLicenseChallenge) {
  const completedAt = challenge.completedAt ?? new Date();
  return evaluateTowaskiBasicLicenseTest({
    ...challengeStats(challenge),
    durationMs: completedAt.getTime() - challenge.startedAt.getTime(),
  });
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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const license = TOWASKI_LICENSE_DEFINITIONS[TOWASKI_BASIC_FIREARM_LICENSE_SLUG];
  if (
    await hasOwnedTowaskiLicense(
      characterId,
      TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    )
  ) {
    return NextResponse.json({ status: "already_owned", license });
  }

  let challenge: TowaskiLicenseChallenge;
  let challengeId: string;

  if (body.action === "start") {
    try {
      const recoverable = await findRecoverableTowaskiLicenseChallenge({
        userId: session.user.id,
        characterId,
      });

      if (recoverable?._id && challengeEvaluation(recoverable).passed) {
        challenge = recoverable;
        challengeId = recoverable._id.toString();
      } else {
        const created = await createTowaskiLicenseChallenge({
          userId: session.user.id,
          characterId,
          characterCodename: mainCharacter.codename,
        });
        const response = activeResponse(created);
        if (!response) throw new Error("첫 사격 표적 발급에 실패했습니다.");
        return NextResponse.json(response, { status: 201 });
      }
    } catch (error) {
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

    const initialEvaluation = challengeEvaluation(challenge);
    if (challenge.status === "active") {
      const completed = await completeTowaskiLicenseChallenge({
        challengeId,
        status: initialEvaluation.passed ? "passed" : "failed",
      });
      if (completed) {
        challenge = completed;
      } else {
        const latest = await findTowaskiLicenseChallenge({
          challengeId,
          userId: session.user.id,
          characterId,
        });
        if (latest) challenge = latest;
      }
    }
  }

  const evaluation = challengeEvaluation(challenge);

  if (challenge.status === "failed" || !evaluation.passed) {
    return NextResponse.json({
      status: "failed",
      challengeId,
      stats: challengeStats(challenge),
      evaluation,
    } satisfies TowaskiLicenseTestResponse);
  }

  const redemptionToken = randomUUID();
  if (
    !["passed", "redeeming"].includes(challenge.status) ||
    !(await claimTowaskiLicenseChallengeRedemption(
      challengeId,
      redemptionToken,
    ))
  ) {
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
      TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    );
    const client = await getClient();
    const mongoSession = client.startSession();
    let result;
    try {
      result = await mongoSession.withTransaction(async () => {
        const granted = await grantTowaskiLicenseOnce(
          {
            characterId,
            characterCodename: mainCharacter.codename,
            licenseSlug: TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
            note: "토와스키 기본 화기 자격시험 합격",
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
        title: "기본 화기 라이선스가 발급되었습니다",
        message: `${mainCharacter.codename} · 토와스키 사격 자격시험 합격`,
        link: "/erp/equipment-shop/towaski",
      }).catch((error) => {
        console.error("[equipment-shop/license-test] notification failed:", error);
      });
    }

    return NextResponse.json(
      {
        status: result.granted ? "granted" : "already_owned",
        license,
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
