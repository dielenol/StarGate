import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import {
  charactersCol,
  getClient,
  masterItemsCol,
  usersCol,
} from "@stargate/shared-db";
import { ObjectId } from "mongodb";

import {
  isValidIdempotencyKey,
  readIdempotencyKey,
} from "@/lib/api/idempotency";
import {
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from "@/lib/api/bounded-request-body";
import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import {
  activateTowaskiLicenseChallengeStep,
  claimTowaskiLicenseChallengeRedemption,
  findTowaskiLicenseTestRequestChallenge,
  markTowaskiLicenseChallengeRedeemed,
  releaseTowaskiLicenseChallengeRedemption,
  resolveTowaskiLicenseChallengeRound,
  resolveTowaskiLicenseChallengeStep,
  startOrResumeTowaskiLicenseChallenge,
  TowaskiLicenseChallengeError,
  type TowaskiLicenseChallenge,
} from "@/lib/db/equipment-license-tests";
import {
  getTowaskiLicenseQualificationStatus,
  grantTowaskiLicenseOnce,
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
  evaluateTowaskiLicenseProgramProgress,
  getTowaskiLicenseStepWindowMs,
  TOWASKI_LICENSE_PROGRAM_VERSION,
} from "@/lib/equipment-shop/license-test-v2";
import {
  evaluateTowaskiLicenseV3Progress,
  getTowaskiLicenseV3StepWindowMs,
  toTowaskiLicenseV3PublicScenario,
  TOWASKI_LICENSE_PROGRAM_VERSION_V3,
} from "@/lib/equipment-shop/license-test-v3";
import {
  TOWASKI_LICENSE_DEFINITIONS,
  type TowaskiLicenseSlug,
} from "@/lib/equipment-shop/licenses";
import { notifyUser } from "@/lib/notifications/events";

const MAX_LICENSE_TEST_REQUEST_BYTES = 32_768;

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

function pinnedChallengeProgramVersion(
  challenge: TowaskiLicenseChallenge,
): number {
  const validV2 =
    challenge.v2 &&
    challenge.programVersion === TOWASKI_LICENSE_PROGRAM_VERSION &&
    challenge.v2.programVersion === challenge.programVersion &&
    challenge.mode === challenge.v2.mode;
  const validV3 =
    challenge.v3 &&
    challenge.programVersion === TOWASKI_LICENSE_PROGRAM_VERSION_V3 &&
    challenge.v3.programVersion === challenge.programVersion &&
    challenge.mode === challenge.v3.mode;
  if (!validV2 && !validV3) {
    throw new TowaskiLicenseChallengeError(
      "INVALID_LICENSE_TEST",
      "지원하지 않거나 버전 정보가 손상된 자격시험입니다.",
    );
  }
  return challenge.programVersion!;
}

function activeResponse(
  challenge: TowaskiLicenseChallenge,
): TowaskiLicenseTestResponse | null {
  const challengeId = challenge._id?.toString();
  if (challengeId && challenge.v3 && challenge.mode) {
    pinnedChallengeProgramVersion(challenge);
    const scenario = challenge.v3.scenarios[challenge.v3.progress.step];
    if (!scenario) return null;
    return {
      status: "active",
      programVersion: TOWASKI_LICENSE_PROGRAM_VERSION_V3,
      mode: challenge.mode,
      challengeId,
      step: challenge.v3.progress.step,
      scenario: toTowaskiLicenseV3PublicScenario(scenario),
      licenseSlug: challenge.licenseSlug,
      difficulty: challenge.difficulty ?? "standard",
      progress: challenge.v3.progress,
      stepDeadlineAt: new Date(
        challenge.roundStartedAt.getTime() +
          getTowaskiLicenseV3StepWindowMs(scenario),
      ).toISOString(),
    };
  }
  if (challengeId && challenge.v2 && challenge.mode) {
    const programVersion = pinnedChallengeProgramVersion(challenge);
    const scenario = challenge.v2.scenarios[challenge.v2.progress.step];
    if (!scenario) return null;
    return {
      status: "active",
      programVersion: programVersion as 2,
      mode: challenge.mode,
      challengeId,
      step: challenge.v2.progress.step,
      scenario,
      licenseSlug: challenge.licenseSlug,
      difficulty: challenge.difficulty ?? "standard",
      progress: challenge.v2.progress,
      stepDeadlineAt: new Date(
        challenge.roundStartedAt.getTime() +
          getTowaskiLicenseStepWindowMs(scenario),
      ).toISOString(),
    };
  }
  const target = challenge.sequence[challenge.currentRound];
  if (!challengeId || !target) return null;
  return {
    status: "active",
    programVersion: 1,
    mode: "firearm",
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

async function activateV3ChallengeForResponse(
  challenge: TowaskiLicenseChallenge,
  userId: string,
  characterId: string,
): Promise<TowaskiLicenseChallenge> {
  let current = challenge;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const challengeId = current._id?.toString();
    if (
      current.status !== "active" ||
      !current.v3 ||
      !challengeId
    ) {
      return current;
    }
    current = await activateTowaskiLicenseChallengeStep({
      challengeId,
      userId,
      characterId,
      step: current.v3.progress.step,
    });
    if (
      current.status !== "active" ||
      !current.v3 ||
      current.v3ActivatedStep === current.v3.progress.step
    ) {
      return current;
    }
  }
  throw new TowaskiLicenseChallengeError(
    "LICENSE_TEST_CONFLICT",
    "V3 자격시험 조작 시간을 활성화하지 못했습니다.",
  );
}

function challengeEvaluation(challenge: TowaskiLicenseChallenge) {
  if (challenge.v3) {
    pinnedChallengeProgramVersion(challenge);
    return evaluateTowaskiLicenseV3Progress(challenge.v3.progress);
  }
  if (challenge.v2) {
    return evaluateTowaskiLicenseProgramProgress(
      pinnedChallengeProgramVersion(challenge),
      challenge.v2.progress,
    );
  }
  const completedAt = challenge.completedAt ?? new Date();
  return evaluateTowaskiBasicLicenseTest(
    {
      ...challengeStats(challenge),
      durationMs: completedAt.getTime() - challenge.startedAt.getTime(),
    },
    challenge.difficulty ?? "standard",
  );
}

function expectedChallengeProgramVersion(
  challenge: TowaskiLicenseChallenge,
): number {
  return challenge.v2
    ? pinnedChallengeProgramVersion(challenge)
    : challenge.v3
    ? pinnedChallengeProgramVersion(challenge)
    : (challenge.programVersion ?? 1);
}

function qualificationCoversChallenge(
  qualification: Awaited<
    ReturnType<typeof getTowaskiLicenseQualificationStatus>
  >,
  challenge: TowaskiLicenseChallenge,
): boolean {
  const qualifiedAt = qualification.qualifiedAt
    ? new Date(qualification.qualifiedAt).getTime()
    : Number.NaN;
  return (
    qualification.owned &&
    (qualification.programVersion ?? 0) >=
      expectedChallengeProgramVersion(challenge) &&
    Number.isFinite(qualifiedAt) &&
    qualifiedAt >= challenge.startedAt.getTime()
  );
}

function failedResponse(
  challenge: TowaskiLicenseChallenge,
  challengeId: string,
): Extract<TowaskiLicenseTestResponse, { status: "failed" }> {
  if (challenge.v2 && challenge.mode) {
    const programVersion = pinnedChallengeProgramVersion(challenge);
    const evaluation = evaluateTowaskiLicenseProgramProgress(
      programVersion,
      challenge.v2.progress,
    );
    return {
      status: "failed",
      programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
      mode: challenge.mode,
      challengeId,
      licenseSlug: challenge.licenseSlug,
      difficulty: challenge.difficulty ?? "standard",
      progress: challenge.v2.progress,
      evaluation,
    };
  }
  if (challenge.v3 && challenge.mode) {
    pinnedChallengeProgramVersion(challenge);
    const evaluation = evaluateTowaskiLicenseV3Progress(
      challenge.v3.progress,
    );
    return {
      status: "failed",
      programVersion: TOWASKI_LICENSE_PROGRAM_VERSION_V3,
      mode: challenge.mode,
      challengeId,
      licenseSlug: challenge.licenseSlug,
      difficulty: challenge.difficulty ?? "standard",
      progress: challenge.v3.progress,
      evaluation,
    };
  }
  const evaluation = evaluateTowaskiBasicLicenseTest(
    {
      ...challengeStats(challenge),
      durationMs:
        (challenge.completedAt ?? new Date()).getTime() -
        challenge.startedAt.getTime(),
    },
    challenge.difficulty ?? "standard",
  );
  return {
    status: "failed",
    programVersion: 1,
    mode: "firearm",
    challengeId,
    licenseSlug: challenge.licenseSlug,
    difficulty: challenge.difficulty ?? "standard",
    stats: challengeStats(challenge),
    evaluation,
  };
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
  if (!mainCharacter?._id) {
    return NextResponse.json(
      { error: "대표 캐릭터가 필요합니다.", code: "NO_MAIN_CHARACTER" },
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
  let { challenge } = result;
  const license = TOWASKI_LICENSE_DEFINITIONS[challenge.licenseSlug];
  const qualification = await getTowaskiLicenseQualificationStatus(
    characterId,
    challenge.licenseSlug,
  );
  if (
    (qualification.owned && !qualification.canTakeTest) ||
    (challenge.status === "redeemed" &&
      qualificationCoversChallenge(qualification, challenge))
  ) {
    return NextResponse.json({
      status: "already_owned",
      license,
      programVersion: expectedChallengeProgramVersion(challenge),
      mode: challenge.mode ?? "firearm",
    } satisfies TowaskiLicenseTestResponse);
  }
  const challengeId = challenge._id?.toString();
  if (!challengeId) {
    return NextResponse.json(
      { error: "사격 시험 기록이 손상되었습니다.", code: "INVALID_LICENSE_TEST" },
      { status: 409 },
    );
  }
  if (challenge.status === "active") {
    try {
      challenge = await activateV3ChallengeForResponse(
        challenge,
        session.user.id,
        characterId,
      );
    } catch (error) {
      if (error instanceof TowaskiLicenseChallengeError) {
        return challengeErrorResponse(error);
      }
      return NextResponse.json(
        {
          error: "자격시험 조작 시간 활성화에 실패했습니다.",
          code: "LICENSE_TEST_CONFLICT",
        },
        { status: 409 },
      );
    }
    const response = activeResponse(challenge);
    if (response) return NextResponse.json(response);
  }
  const evaluation = challengeEvaluation(challenge);
  if (challenge.status === "failed" || !evaluation.passed) {
    return NextResponse.json(failedResponse(challenge, challengeId));
  }
  return NextResponse.json({
    status: "processing",
    challengeId,
    licenseSlug: challenge.licenseSlug,
    difficulty: challenge.difficulty ?? "standard",
    programVersion: expectedChallengeProgramVersion(challenge),
    mode: challenge.mode ?? "firearm",
  } satisfies TowaskiLicenseTestResponse);
}

async function waitForCurrentTowaskiLicense(
  characterId: string,
  licenseSlug: TowaskiLicenseSlug,
  programVersion: number,
  qualifiedAfter: Date,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const qualification = await getTowaskiLicenseQualificationStatus(
      characterId,
      licenseSlug,
    );
    const qualifiedAt = qualification.qualifiedAt
      ? new Date(qualification.qualifiedAt).getTime()
      : Number.NaN;
    if (
      qualification.owned &&
      (qualification.programVersion ?? 0) >= programVersion &&
      Number.isFinite(qualifiedAt) &&
      qualifiedAt >= qualifiedAfter.getTime()
    ) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export async function POST(request: Request) {
  const declaredContentLength = Number(
    request.headers.get("content-length") ?? 0,
  );
  if (
    Number.isFinite(declaredContentLength) &&
    declaredContentLength > MAX_LICENSE_TEST_REQUEST_BYTES
  ) {
    return NextResponse.json(
      { error: "자격시험 입력 크기가 허용 범위를 초과했습니다." },
      { status: 413 },
    );
  }
  const bodyAbortController = new AbortController();
  const bodyReceiptPromise = readBoundedRequestBody(
    request,
    MAX_LICENSE_TEST_REQUEST_BYTES,
    bodyAbortController.signal,
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  let session;
  try {
    session = await auth();
  } catch (error) {
    bodyAbortController.abort();
    await bodyReceiptPromise;
    throw error;
  }
  if (!session?.user) {
    bodyAbortController.abort();
    await bodyReceiptPromise;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bodyReceiptResult = await bodyReceiptPromise;
  if (!bodyReceiptResult.ok) {
    if (!(bodyReceiptResult.error instanceof RequestBodyTooLargeError)) {
      throw bodyReceiptResult.error;
    }
    return NextResponse.json(
      { error: "자격시험 입력 크기가 허용 범위를 초과했습니다." },
      { status: 413 },
    );
  }
  const bodyReceipt = bodyReceiptResult.value;
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

  const rawBody = (() => {
    try {
      return JSON.parse(bodyReceipt.rawBody) as unknown;
    } catch {
      return null;
    }
  })();
  const body = parseTowaskiLicenseTestRequest(rawBody);
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
  if (!mainCharacter?._id) {
    return NextResponse.json(
      {
        error: "대표 캐릭터가 등록되어 있지 않습니다.",
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
    const qualification = await getTowaskiLicenseQualificationStatus(
      characterId,
      body.licenseSlug,
    );
    if (qualification.owned && !qualification.canTakeTest) {
      return NextResponse.json({
        status: "already_owned",
        license,
        programVersion: program.programVersion,
        mode: program.mode,
      } satisfies TowaskiLicenseTestResponse);
    }
    const basicQualification = program.requiresBasicLicense
      ? await getTowaskiLicenseQualificationStatus(
        characterId,
        TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
      )
      : null;
    if (
      program.requiresBasicLicense &&
      !basicQualification?.grantsPurchaseAccess
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
        programVersion: program.programVersion,
        mode: program.mode,
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
      challenge = await activateV3ChallengeForResponse(
        challenge,
        session.user.id,
        characterId,
      );
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
      challenge =
        "step" in body
          ? await resolveTowaskiLicenseChallengeStep({
              challengeId: body.challengeId,
              step: body.step,
              input: body.input,
              userId: session.user.id,
              characterId,
              requestId,
              requestReceivedAt: bodyReceipt.requestReceivedAt,
            })
          : await resolveTowaskiLicenseChallengeRound({
              challengeId: body.challengeId,
              round: body.round,
              hit: body.hit,
              shots: body.shots,
              userId: session.user.id,
              characterId,
              requestId,
            });
      if (challenge.status === "active") {
        challenge = await activateV3ChallengeForResponse(
          challenge,
          session.user.id,
          characterId,
        );
        const response = activeResponse(challenge);
        if (response) return NextResponse.json(response);
      }
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
  }

  const licenseSlug = challenge.licenseSlug;
  const license = TOWASKI_LICENSE_DEFINITIONS[licenseSlug];
  const program = getTowaskiLicenseTestProgram(licenseSlug);
  const challengeProgramVersion = expectedChallengeProgramVersion(challenge);
  if (!(await isTowaskiLicenseTestAvailable(licenseSlug))) {
    return NextResponse.json(
      {
        error: "자격시험 운영 상태가 변경되어 발급을 중단했습니다.",
        code: "LICENSE_TEST_UNAVAILABLE",
      },
      { status: 409 },
    );
  }
  const basicQualification = program.requiresBasicLicense
    ? await getTowaskiLicenseQualificationStatus(
      characterId,
      TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    )
    : null;
  if (
    program.requiresBasicLicense &&
    !basicQualification?.grantsPurchaseAccess
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
    return NextResponse.json(failedResponse(challenge, challengeId));
  }

  const redemptionToken = randomUUID();
  const redemptionClaimed =
    ["passed", "redeeming"].includes(challenge.status) &&
    (await claimTowaskiLicenseChallengeRedemption(
      challengeId,
      redemptionToken,
    ));
  if (!redemptionClaimed) {
    if (
      await waitForCurrentTowaskiLicense(
        characterId,
        licenseSlug,
        challengeProgramVersion,
        challenge.startedAt,
      )
    ) {
      return NextResponse.json({
        status: "already_owned",
        license,
        difficulty: challenge.difficulty ?? "standard",
        programVersion: challengeProgramVersion,
        mode: challenge.mode ?? "firearm",
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
        const transactionCharacter = await (await charactersCol()).findOne(
          {
            _id: new ObjectId(characterId),
            ownerId: session.user.id,
            type: mainCharacter.type,
          },
          { session: mongoSession, projection: { type: 1 } },
        );
        if (!transactionCharacter) {
          throw new TowaskiLicenseChallengeError(
            "LICENSE_TEST_CONFLICT",
            "대표 캐릭터 소유권이 변경되어 라이선스를 발급할 수 없습니다.",
          );
        }
        if (transactionCharacter.type === "NPC") {
          const activeGmOwner =
            ObjectId.isValid(session.user.id) &&
            (await (await usersCol()).findOne(
              {
                _id: new ObjectId(session.user.id),
                role: "GM",
                status: "ACTIVE",
              },
              { session: mongoSession, projection: { _id: 1 } },
            ));
          if (!activeGmOwner) {
            throw new TowaskiLicenseChallengeError(
              "LICENSE_TEST_CONFLICT",
              "GM 소유 NPC만 라이선스를 발급받을 수 있습니다.",
            );
          }
        }

        const transactionLicenseItem = await (await masterItemsCol()).findOne(
          { slug: licenseSlug },
          { session: mongoSession },
        );
        if (
          !transactionLicenseItem?._id ||
          transactionLicenseItem.isPublic === false ||
          transactionLicenseItem.isAvailable === false ||
          equipmentShopItemZone(transactionLicenseItem) !== "towaski"
        ) {
          throw new TowaskiLicenseChallengeError(
            "LICENSE_TEST_CONFLICT",
            "자격시험 운영 상태가 변경되어 라이선스를 발급할 수 없습니다.",
          );
        }

        const transactionBasicQualification = program.requiresBasicLicense
          ? await getTowaskiLicenseQualificationStatus(
            characterId,
            TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
            { session: mongoSession },
          )
          : null;
        if (
          program.requiresBasicLicense &&
          !transactionBasicQualification?.grantsPurchaseAccess
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
            programVersion: challengeProgramVersion,
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
        programVersion: challengeProgramVersion,
        mode: challenge.mode ?? "firearm",
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
