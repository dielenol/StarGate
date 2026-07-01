/**
 * `/크레딧` (GM 전용) + `/잔액` (누구나) 슬래시 커맨드 핸들러.
 *
 * `/크레딧` 서브커맨드:
 * - `지급` / `차감` — 단일 인원 메인 캐릭터 크레딧 운영
 * - `전체지급` — ledger 보유 운영 캐릭 전원 일괄 지급
 * - `작전지급` / `작전차감` — 작전 크레딧 풀 입출금
 * - `조회` — 지정 인원 메인 캐릭 잔액 + 최근 5건
 * - `전체조회` — 메인 캐릭 전원 잔액 + 작전 풀 + 총 자금
 * - `작전풀` — 작전 크레딧 풀 잔액 단건
 *
 * `/잔액` (단일 명령, 서브 ❌):
 * - 본인 메인 캐릭 잔액 + 최근 5건 (비밀 열람)
 *
 * 권한 정책:
 * - `/크레딧 *`: Discord 네이티브 Administrator | ManageGuild 만 (운영 자금 영향).
 *   `MINI_SESSION_MASTER_ROLE_ID` Role 위임 ❌.
 *   `default_member_permissions` 로 Discord UI 노출도 차단 (defense-in-depth: 핸들러 게이트도 유지).
 * - `/잔액`: 권한 게이트 없음. 발화자 본인 정보만 노출.
 *
 * 데이터 무결성:
 * - 1인 1 MAIN 캐릭터 강제 — `findMainCharacterByOwner` throw 시 정합성 위반 안내.
 * - StarGate 계정 미등록 → "웹 가입 후 재시도" 안내.
 * - 메인 캐릭터 미등록 → "캐릭터 등재 후 재시도" 안내.
 *
 * @module commands/credit
 */

import {
  type ChatInputCommandInteraction,
  type User as DiscordUser,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import {
  type AgentCharacter,
  type Character,
  type CreditTransaction,
  type CreditTransactionType,
  type User as DbUser,
  OPERATION_POOL_DEFAULT_NAME,
  OPERATION_POOL_ID,
  addCredit,
  addCreditPoolBalance,
  creditTransactionsCol,
  ensureCreditPool,
  findCharacterById,
  findMainCharacterByOwner,
  findUserByDiscordId,
  findUserById,
  getCharacterBalance,
  getCreditPool,
  listAgentCharacters,
  listCreditTransactions,
  upsertDiscordUser,
} from "@stargate/shared-db";

import { REGISTRAR_COLORS } from "../constants/registrar.js";
import { D } from "../constants/registrar-voice.js";
import { CreditOpt, CreditSub } from "../slash/ko-names.js";
import { deferReplyAndRequireAdminOrManageGuild } from "../utils/require-admin-or-manage-guild.js";

/* ── 상수 ── */

/** 조회/잔액 임베드에 노출하는 최근 거래 건수 상한. */
const RECENT_TX_LIMIT = 5;
/** 전체지급 결과 메시지에 노출하는 실패 codename 상한 (그 이상은 "외 N건" 표기). */
const FAIL_LIST_DISPLAY_LIMIT = 10;

/* ── 타입 ── */

/**
 * GM 자신의 user 컨텍스트. addCredit 호출 시 createdById/Name 으로 사용.
 */
interface GmContext {
  hex: string;
  name: string;
}

/**
 * 전체지급 1건 실패 정보 — 결과 메시지에 codename 목록을 노출하기 위해 보존.
 */
interface GrantAllFailure {
  characterId: string;
  codename: string | null;
  reason: string;
}

interface GrantAllResult {
  success: number;
  failed: number;
  failures: GrantAllFailure[];
  total: number;
}

/* ── 공통 헬퍼 ── */

/**
 * GM 자신을 users 컬렉션에 ensure 하고 ledger 식별자를 반환한다.
 *
 * GM 본인이 웹 미가입이어도 봇 명령은 차단되지 않도록 upsert 한다 (GM 신원은
 * Discord 측 Admin 권한으로 이미 검증된 상태).
 */
async function ensureGmContext(
  discordUser: DiscordUser
): Promise<GmContext> {
  const user = await upsertDiscordUser({
    discordId: discordUser.id,
    discordUsername: discordUser.username,
    discordGlobalName: discordUser.globalName ?? null,
    discordAvatar: discordUser.displayAvatarURL() ?? null,
  });
  return {
    hex: user._id!.toHexString(),
    name:
      user.discordGlobalName ?? user.discordUsername ?? user.username,
  };
}

/**
 * target 의 메인 캐릭터를 owner 단위로 라우팅한다. 결과 케이스:
 *
 * - `not_registered`: target 이 StarGate 계정 미등록 (웹 가입 ❌)
 * - `no_main`: 계정은 있으나 메인 캐릭터 미등록
 * - `integrity_violation`: 1인 1 MAIN 위반 (다중 메인) — codenames 노출
 * - `resolved`: 정상. owner + main 둘 다 반환
 */
type ResolveTargetResult =
  | { kind: "not_registered" }
  | { kind: "no_main"; owner: DbUser }
  | { kind: "integrity_violation"; message: string }
  | { kind: "resolved"; owner: DbUser; main: Character };

async function resolveTargetMain(discordId: string): Promise<ResolveTargetResult> {
  const owner = await findUserByDiscordId(discordId);
  if (!owner) return { kind: "not_registered" };

  try {
    const main = await findMainCharacterByOwner(owner._id!.toHexString());
    if (!main) return { kind: "no_main", owner };
    return { kind: "resolved", owner, main };
  } catch (err) {
    // findMainCharacterByOwner 는 정합성 위반 시 throw — codename 목록을 보존해 안내.
    return {
      kind: "integrity_violation",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 정합성 위반 메시지에서 codename 만 추출 (UI 노출용).
 * 실패 시 원본 메시지 일부를 fallback 노출.
 *
 * TODO(shared-db): typed error (예: `IntegrityViolationError { codenames: string[] }`)
 * 도입 후 substring 매칭 제거. 현재는 `findMainCharacterByOwner` 의 메시지 포맷에
 * 결합되어 있어 메시지 변경 시 silent fallback.
 */
function extractCodenamesFromIntegrityError(message: string): string {
  const match = message.match(/MAIN agents \(([^)]+)\)/);
  if (match?.[1]) return match[1];
  return "운영 대장 확인 필요";
}

/**
 * owner 표시명 — ledger 의 ownerName 컬럼에 저장한다.
 * Discord 정보 우선, 없으면 internal username.
 */
function ownerDisplayName(owner: DbUser): string {
  return (
    owner.discordGlobalName ?? owner.discordUsername ?? owner.username
  );
}

/**
 * 사유(reason) 옵션을 description 본문에 안전하게 결합.
 *
 * 형식: `"<base> (by <gm>)"` 또는 `"<base> (by <gm>) — <reason>"`
 */
function buildDescription(
  base: string,
  gmName: string,
  reason: string | null
): string {
  const trimmed = reason?.trim();
  const prefix = `${base} (by ${gmName})`;
  return trimmed ? `${prefix} — ${trimmed}` : prefix;
}

/**
 * 거래 1건을 임베드 라인으로 직렬화 (조회/잔액 임베드 공용).
 */
function formatTransactionLine(tx: CreditTransaction): string {
  const ts = Math.floor(tx.createdAt.getTime() / 1000);
  const sign = tx.amount >= 0 ? "+" : "";
  const desc = tx.description.length > 60
    ? `${tx.description.slice(0, 57)}…`
    : tx.description;
  return `<t:${ts}:f> · \`${tx.type}\` · **${sign}${tx.amount}** CR · ${desc}`;
}

/**
 * 잔액/거래 임베드 빌드 — 조회/잔액 두 군데에서 공용.
 */
function buildBalanceEmbed(
  character: Character,
  balance: number,
  recent: CreditTransaction[]
): EmbedBuilder {
  const desc =
    recent.length === 0
      ? "_최근 거래 내역이 없습니다._"
      : recent.map(formatTransactionLine).join("\n");

  return new EmbedBuilder()
    .setTitle(`【크레딧 대장】 ${character.codename}`)
    .setColor(REGISTRAR_COLORS.primary)
    .addFields({
      name: "현재 잔액",
      value: `**${balance.toLocaleString("ko-KR")}** CR`,
      inline: false,
    })
    .addFields({
      name: `최근 거래 (최대 ${RECENT_TX_LIMIT}건)`,
      value: desc,
      inline: false,
    })
    .setFooter({ text: D.creditQueryFooter(character.codename) })
    .setTimestamp();
}

/**
 * `/크레딧 전체지급` 의 일괄 지급 helper.
 *
 * "운영 캐릭터" 정의: `credit_transactions` 에 ledger 1건 이상이 적재된 character.
 * - 신규 등재된 AGENT 는 첫 ledger (예: 시드 지급) 발생 후 자연스럽게 포함됨.
 * - 모든 AGENT 를 일괄 대상으로 하려면 `characters.find({ type: "AGENT", tier: "MAIN" })`
 *   을 직접 사용해야 한다 (현재 정의는 의도적으로 ledger 보유자에만 한정).
 *
 * `credit_transactions.distinct("characterId")` 로 ledger 보유 캐릭터 식별 →
 * 각각 메타데이터 hydrate (`findCharacterById` + `findUserById`) 후 `addCredit` 호출.
 *
 * 실패 사유(없는 캐릭터, 없는 owner 등)는 throw 가 아닌 카운트 + codename 목록으로 집계 —
 * 부분 성공 허용. 실패 항목은 결과 메시지에 codename 으로 노출되어 GM 이 후속 조치 가능.
 */
async function grantToAllCharacters(
  amount: number,
  type: CreditTransactionType,
  description: string,
  gm: GmContext
): Promise<GrantAllResult> {
  const col = await creditTransactionsCol();
  const characterIds = (await col.distinct("characterId")) as string[];

  const failures: GrantAllFailure[] = [];
  let success = 0;

  for (const characterId of characterIds) {
    let codename: string | null = null;
    try {
      const character = await findCharacterById(characterId);
      codename = character?.codename ?? null;
      if (!character || character.type !== "AGENT") {
        failures.push({
          characterId,
          codename,
          reason: "non-AGENT or deleted",
        });
        continue;
      }
      const owner = character.ownerId
        ? await findUserById(character.ownerId)
        : null;
      if (!owner) {
        failures.push({
          characterId,
          codename,
          reason: "owner missing",
        });
        continue;
      }
      await addCredit({
        characterId,
        characterCodename: character.codename,
        ownerId: character.ownerId!,
        ownerName: ownerDisplayName(owner),
        amount,
        type,
        description,
        createdById: gm.hex,
        createdByName: gm.name,
        allowNegative: false,
      });
      success += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[credit/grantAll] addCredit 실패:", characterId, err);
      failures.push({ characterId, codename, reason });
    }
  }

  return {
    success,
    failed: failures.length,
    failures,
    total: characterIds.length,
  };
}

/**
 * 전체지급 실패 목록을 사용자에게 노출할 한 줄로 직렬화.
 *
 * codename 우선, 없으면 characterId fallback. `FAIL_LIST_DISPLAY_LIMIT` 초과 시
 * "외 N건" 으로 자른다 (Discord 메시지 길이 제약 + 가독성).
 */
function formatFailureListLine(failures: GrantAllFailure[]): string {
  const labels = failures
    .slice(0, FAIL_LIST_DISPLAY_LIMIT)
    .map((f) => f.codename ?? f.characterId);
  const more =
    failures.length > FAIL_LIST_DISPLAY_LIMIT
      ? ` 외 ${failures.length - FAIL_LIST_DISPLAY_LIMIT}건`
      : "";
  return `※ 실패 캐릭터: ${labels.join(", ")}${more}`;
}

/* ── 서브커맨드: 지급 / 차감 ── */

/**
 * 단일 인원 ledger 운영 — `지급` 과 `차감` 공용 진입.
 *
 * `mode` 가 `"deduct"` 면 amount 부호를 뒤집고 ADMIN_DEDUCT + allowNegative 모드.
 *
 * race-free: 사전 `getCharacterBalance` 호출 ❌. `addCredit` 가 반환하는 `tx.balance`
 * 에서 새 잔액을 얻고, `previousBalance = tx.balance - signedAmount` 로 역산 → 표시.
 * 봇/웹 동시 mutation 시에도 표시되는 prev/next 가 일관 (read 1회 절감 + race window 제거).
 */
async function handleSingleMutation(
  interaction: ChatInputCommandInteraction,
  mode: "grant" | "deduct"
): Promise<void> {
  const target = interaction.options.getUser(CreditOpt.user, true);
  const inputAmount = interaction.options.getInteger(CreditOpt.amount, true);
  const reason = interaction.options.getString(CreditOpt.reason, false);

  if (target.bot) {
    await interaction.editReply({ content: D.botAccountRejected });
    return;
  }

  const resolved = await resolveTargetMain(target.id);
  if (resolved.kind === "not_registered") {
    await interaction.editReply({ content: D.userNotRegistered });
    return;
  }
  if (resolved.kind === "no_main") {
    await interaction.editReply({ content: D.mainCharNotFound });
    return;
  }
  if (resolved.kind === "integrity_violation") {
    await interaction.editReply({
      content: D.mainCharIntegrityViolation(
        extractCodenamesFromIntegrityError(resolved.message)
      ),
    });
    return;
  }

  const { owner, main } = resolved;
  const gm = await ensureGmContext(interaction.user);

  const isDeduct = mode === "deduct";
  const signedAmount = isDeduct ? -inputAmount : inputAmount;
  const txType: CreditTransactionType = isDeduct
    ? "ADMIN_DEDUCT"
    : "ADMIN_GRANT";
  const baseLabel = isDeduct ? "GM 차감" : "GM 지급";

  try {
    const tx = await addCredit({
      characterId: main._id!.toHexString(),
      characterCodename: main.codename,
      ownerId: owner._id!.toHexString(),
      ownerName: ownerDisplayName(owner),
      amount: signedAmount,
      type: txType,
      description: buildDescription(baseLabel, gm.name, reason),
      createdById: gm.hex,
      createdByName: gm.name,
      // 차감만 음수 허용 — GM 의도 차감을 거부하지 않는다.
      allowNegative: isDeduct,
    });

    // tx.balance = 새 잔액. signedAmount 만큼 거꾸로 빼면 직전 잔액 — race-free.
    const previousBalance = tx.balance - signedAmount;
    const responseFn = isDeduct ? D.creditDeducted : D.creditGranted;
    await interaction.editReply({
      content: responseFn(main.codename, inputAmount, previousBalance, tx.balance),
    });
  } catch (err) {
    // addCredit 의 음수 거부 throw — 지급(grant) 경로에서는 발생 가능성 거의 없으나
    // 안전 차원에서 잔액 부족 안내로 변환. (deduct 는 allowNegative=true 라 throw 없음)
    // TODO(shared-db): typed error (예: `InsufficientBalanceError { current, requested }`)
    // 도입 후 substring 매칭 제거.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("음수 잔액 거부")) {
      // throw 케이스는 mutation 미적용 → race-free 표시를 못 하므로, 이 경로만 read 1회.
      const currentBalance = await getCharacterBalance(main._id!.toHexString());
      await interaction.editReply({
        content: D.insufficientCredit(
          main.codename,
          currentBalance,
          inputAmount
        ),
      });
      return;
    }
    throw err;
  }
}

/* ── 서브커맨드: 전체지급 ── */

async function handleGrantAll(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const amount = interaction.options.getInteger(CreditOpt.amount, true);
  const reason = interaction.options.getString(CreditOpt.reason, false);

  const gm = await ensureGmContext(interaction.user);

  const description = buildDescription("GM 일괄 지급", gm.name, reason);
  const result = await grantToAllCharacters(
    amount,
    "ADMIN_GRANT",
    description,
    gm
  );

  if (result.total === 0) {
    await interaction.editReply({ content: D.creditAllNoTarget });
    return;
  }

  const lines = [
    D.creditAllGranted(
      result.success,
      amount,
      result.success * amount,
      result.failed
    ),
  ];
  if (result.failures.length > 0) {
    lines.push(formatFailureListLine(result.failures));
  }
  await interaction.editReply({ content: lines.join("\n") });
}

/* ── 서브커맨드: 작전지급 / 작전차감 ── */

/**
 * 작전 풀 입출금.
 *
 * race-free: 사전 `getCreditPool` 호출 제거. `addCreditPoolBalance` 가 반환하는
 * `updated.balance` 에서 새 잔액을 얻고 `previousBalance = updated.balance - delta`
 * 로 역산 → 표시. (잔액 부족 throw 시점은 별도 — 그 경로는 finally fetch 1회.)
 */
async function handleOpPoolMutation(
  interaction: ChatInputCommandInteraction,
  mode: "grant" | "deduct"
): Promise<void> {
  const amount = interaction.options.getInteger(CreditOpt.amount, true);

  const isDeduct = mode === "deduct";
  const delta = isDeduct ? -amount : amount;

  // ensure 로 풀 부재 시 0 으로 초기화 (기본 운영 풀이 미생성된 fresh DB 보호).
  // 풀이 이미 존재하면 ensureCreditPool 은 기존 도큐먼트를 그대로 반환 (멱등).
  await ensureCreditPool(OPERATION_POOL_ID, OPERATION_POOL_DEFAULT_NAME, 0);

  try {
    const updated = await addCreditPoolBalance(OPERATION_POOL_ID, delta, {
      // 입금은 음수 진입 불가, 출금은 잔액 가드 (false 유지).
      allowNegative: false,
    });
    const previousBalance = updated.balance - delta;
    const responseFn = isDeduct ? D.opPoolDeducted : D.opPoolGranted;
    await interaction.editReply({
      content: responseFn(amount, previousBalance, updated.balance),
    });
  } catch (err) {
    // TODO(shared-db): typed error (예: `InsufficientPoolError { current, requested }`)
    // 도입 후 substring 매칭 제거. 현재는 `addCreditPoolBalance` 의 메시지 포맷에 결합.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("insufficient")) {
      // 가드 실패 시점 잔액 fetch — addCreditPoolBalance 에서 이미 snapshot 을 본 적 있으나
      // 본 표시도 race window 가 있다는 점을 인지하고 정확한 표시값을 다시 시도한다.
      const snapshot = await getCreditPool(OPERATION_POOL_ID);
      await interaction.editReply({
        content: D.opPoolInsufficient(snapshot?.balance ?? 0, amount),
      });
      return;
    }
    throw err;
  }
}

/* ── 서브커맨드: 조회 (GM) / `/잔액` (사용자) ── */

async function handleQuery(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const target = interaction.options.getUser(CreditOpt.user, true);
  if (target.bot) {
    await interaction.editReply({ content: D.botAccountRejected });
    return;
  }
  await replyWithBalance(interaction, target.id);
}

/**
 * `/잔액` 핸들러 — 단일 명령 진입점 (서브 ❌).
 *
 * 권한 게이트 없이 발화자 본인 정보만 ephemeral 응답. defer 도 직접 수행.
 *
 * 본 함수는 `index.ts` 의 `safeHandleInteraction` 래퍼 안에서 호출되므로,
 * defer 실패/응답 실패 시에도 fallback 메시지가 자동 송부된다.
 */
export async function handleSelfBalanceCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: D.guildOnly,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await replyWithBalance(interaction, interaction.user.id);
}

/**
 * 조회/잔액 공용 — 임베드 응답.
 */
async function replyWithBalance(
  interaction: ChatInputCommandInteraction,
  discordId: string
): Promise<void> {
  const resolved = await resolveTargetMain(discordId);
  if (resolved.kind === "not_registered") {
    await interaction.editReply({ content: D.userNotRegistered });
    return;
  }
  if (resolved.kind === "no_main") {
    await interaction.editReply({ content: D.mainCharNotFound });
    return;
  }
  if (resolved.kind === "integrity_violation") {
    await interaction.editReply({
      content: D.mainCharIntegrityViolation(
        extractCodenamesFromIntegrityError(resolved.message)
      ),
    });
    return;
  }

  const { main } = resolved;
  const characterId = main._id!.toHexString();

  // 잔액 + 최근 5건 병렬 조회.
  const [balance, recent] = await Promise.all([
    getCharacterBalance(characterId),
    listCreditTransactions(characterId, RECENT_TX_LIMIT),
  ]);

  const embed = buildBalanceEmbed(main, balance, recent);
  await interaction.editReply({ embeds: [embed] });
}

/* ── 서브커맨드: 전체조회 (GM) ── */

/**
 * codeblock 정렬용 — codename 을 고정 폭으로 padEnd 한다.
 * Discord codeblock 은 monospace 라 시각 폭과 char 길이가 일치 (한글은 2배 폭으로 보이지만
 * codename 은 영문/숫자 위주라 무시 가능).
 */
function padCodename(codename: string, width: number): string {
  return codename.length >= width
    ? codename
    : codename + " ".repeat(width - codename.length);
}

function padNumberLeft(value: number, width: number): string {
  const s = value.toLocaleString("ko-KR");
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

interface CharacterBalance {
  character: AgentCharacter;
  balance: number;
}

/**
 * `/크레딧 전체조회` — 운영 캐릭(메인) 전원 잔액 + 작전 풀 + 합계.
 *
 * - `listAgentCharacters("MAIN")` → AGENT type + tier MAIN (또는 미설정) 전원 (ledger 보유 여부 무관).
 * - 각 캐릭터 잔액은 `Promise.all` 로 병렬 조회.
 * - 작전 풀은 `getCreditPool(OPERATION_POOL_ID)` 단일 호출 (없으면 0 으로 표시).
 * - 정렬: 잔액 내림차순 → codename 알파벳 (안정 정렬).
 * - 표시: codeblock + monospace padEnd 정렬. embed description 4096 자 한도 내.
 */
async function handleListAll(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // 1. 메인 캐릭터 전원 조회
  const characters = (await listAgentCharacters("MAIN")) as Character[];
  if (characters.length === 0) {
    await interaction.editReply({ content: D.creditListAllNoTarget });
    return;
  }

  // 2. 각 캐릭터 잔액 + 작전 풀 잔액 병렬 조회
  const [balances, pool] = await Promise.all([
    Promise.all(
      characters.map(async (c): Promise<CharacterBalance> => ({
        character: c as AgentCharacter,
        balance: await getCharacterBalance(c._id!.toHexString()),
      }))
    ),
    getCreditPool(OPERATION_POOL_ID),
  ]);

  // 3. 정렬 — 잔액 내림차순 → codename 알파벳 (tie-break)
  balances.sort((a, b) => {
    if (b.balance !== a.balance) return b.balance - a.balance;
    return a.character.codename.localeCompare(b.character.codename);
  });

  // 4. monospace 정렬 폭 계산
  const codenameWidth = Math.min(
    24,
    Math.max(...balances.map((b) => b.character.codename.length))
  );
  const balanceWidth = Math.max(
    5,
    ...balances.map((b) => b.balance.toLocaleString("ko-KR").length)
  );

  // 5. 사용자 잔액 라인 + 합계 산출
  const userLines = balances.map(
    ({ character, balance }) =>
      `${padCodename(character.codename, codenameWidth)}  ${padNumberLeft(balance, balanceWidth)} CR`
  );
  const userSum = balances.reduce((acc, b) => acc + b.balance, 0);
  const poolBalance = pool?.balance ?? 0;
  const totalSum = userSum + poolBalance;

  // 6. embed description (codeblock) 빌드. 4096 한도 보호: 길면 끝 잘라내기.
  const sections = [
    `[ 운영 캐릭 (${balances.length}) ]`,
    userLines.join("\n"),
    "",
    "[ 작전 풀 ]",
    `${padCodename("OPERATION", codenameWidth)}  ${padNumberLeft(poolBalance, balanceWidth)} CR`,
    "",
    "[ 합계 ]",
    `${padCodename("사용자 합계", codenameWidth)}  ${padNumberLeft(userSum, balanceWidth)} CR`,
    `${padCodename("작전풀", codenameWidth)}  ${padNumberLeft(poolBalance, balanceWidth)} CR`,
    `${padCodename("총 자금", codenameWidth)}  ${padNumberLeft(totalSum, balanceWidth)} CR`,
  ];
  let body = `\`\`\`\n${sections.join("\n")}\n\`\`\``;
  // Discord embed description 한도: 4096. 안전하게 4000 자 컷 + 잘림 안내.
  if (body.length > 4000) {
    const truncated = body.slice(0, 3950);
    body = `${truncated}\n... (목록 일부 생략)\n\`\`\``;
  }

  const embed = new EmbedBuilder()
    .setTitle("【 전체 크레딧 현황 】")
    .setColor(REGISTRAR_COLORS.primary)
    .setDescription(body)
    .setFooter({ text: D.creditListAllFooter(balances.length) })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/* ── 서브커맨드: 작전풀 (GM, 단건 조회) ── */

/**
 * `/크레딧 작전풀` — 작전 크레딧 풀 잔액만 단건 조회.
 *
 * 풀이 없으면 (fresh DB) 잔액 0 으로 표시 + 미초기화 안내. 본 명령은 read-only 라
 * `ensureCreditPool` 로 새로 생성하지 않는다 (입금/출금 시점에만 자동 생성).
 */
async function handleOpPoolStatus(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const pool = await getCreditPool(OPERATION_POOL_ID);
  if (!pool) {
    await interaction.editReply({
      content: `${D.opPoolStatus(0)}\n${D.opPoolNotInitialized}`,
    });
    return;
  }
  await interaction.editReply({ content: D.opPoolStatus(pool.balance) });
}

/* ── 진입점 ── */

/**
 * `/크레딧 ...` 라우터 — GM 전용 8 서브커맨드.
 *
 * 1. defer + Admin/ManageGuild 게이트 통과 (defense-in-depth: Discord
 *    `default_member_permissions` 로 UI 노출은 이미 차단되었으나 직접 호출 방어).
 * 2. 게이트 통과 후 서브커맨드별 핸들러로 dispatch.
 *
 * 본인 잔액 조회는 별도 단일 명령 `/잔액` 으로 분리 (`handleSelfBalanceCommand`).
 */
export async function handleCreditCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const ok = await deferReplyAndRequireAdminOrManageGuild(interaction);
  if (!ok) return;

  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case CreditSub.grant:
      await handleSingleMutation(interaction, "grant");
      return;
    case CreditSub.deduct:
      await handleSingleMutation(interaction, "deduct");
      return;
    case CreditSub.grantAll:
      await handleGrantAll(interaction);
      return;
    case CreditSub.opGrant:
      await handleOpPoolMutation(interaction, "grant");
      return;
    case CreditSub.opDeduct:
      await handleOpPoolMutation(interaction, "deduct");
      return;
    case CreditSub.query:
      await handleQuery(interaction);
      return;
    case CreditSub.listAll:
      await handleListAll(interaction);
      return;
    case CreditSub.opPool:
      await handleOpPoolStatus(interaction);
      return;
    default:
      // 알 수 없는 서브커맨드는 등록 표와 핸들러 누락 시 발생 — 운영자에게만 노출.
      await interaction.editReply({
        content: `${D.interactionUnexpected}`,
      });
      return;
  }
}
