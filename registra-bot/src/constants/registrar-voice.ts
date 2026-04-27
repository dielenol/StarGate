/**
 * 레지스트라(아그네타 스톨) 1인칭·기관 톤 문구 모음.
 * 사용자 출력·관리자 경고·콘솔 로그·PNG/HTML에 공통 적용.
 */

import { REGISTRAR_SIGNATURE } from "./registrar.js";

const E = "■ ";
const S = "◆ ";
const N = "※ ";
const A = "▶ ";

/** 슬래시 루트·옵션 설명 (Discord 100자 제한 준수) */
export const Cmd = {
  root: "NOVUS ORDO 통합일정 관리 비서. 등재·가용·불가 회신부터 집계까지 한 흐름으로 이용 부탁드립니다.",
  create:
    "신규 일정 및 작전 등재를 원하시면 이 항목을 사용해주십시오. 자동완성 예시는 참고용이며, 직접 기재를 권장드립니다.",
  optTitle:
    "일정 제목(자유 기재). 아래 자동완성은 양식 예시일 뿐, 직접 입력을 권장드립니다. 예) NOVUS ORDO — 회의명",
  optDate:
    "배정 일시 — 형식: YYYY-MM-DD HH:mm (24시간). 아래 자동완성은 양식 예시이며, 현재 이후 시각만 유효합니다.",
  optClose:
    "응답 마감 — 형식: YYYY-MM-DD HH:mm (24시간). 아래 자동완성은 양식 예시. 배정 이전·현재 이후만 유효.",
  optRole: "통보·집계 대상 역할군을 기재 부탁드립니다. 고르신 직책 기준으로 집계 결과가 정리됩니다.",
  optChannel:
    "안내 하실 공지 채널을 선택해주시면 공지 사항이 올라갑니다(선택). 비우시면 명령하신 채널에 공지 사항이 올라갑니다. 결과·전송·결과물 승인은 사전 확인 부탁드립니다.",
  list: "접수 중(OPEN) 등재만 요약합니다(관리권한). 전체·마감 건은 「한눈에」 이용을 부탁드립니다. 월별 조회는 「달력」을 참고 부탁드립니다.",
  overview:
    "접수·마감 건을 월별 대장으로 봅니다(등록ID·채널, 관리권한). 캘린더형 이미지 보고서는 「달력」을 참고 부탁드립니다.",
  calendar:
    "지정 월 등재를 캘린더형 이미지 보고서로 출력합니다(관리권한). 작업량에 다소 부하가 있어 필요할 때만 실행을 권장드립니다.",
  optMonth:
    "표시할 월 (1~12)을 입력 부탁드립니다. 시차·자정 전후는 관리자님을 기준으로 하니 참고 부탁드립니다.",
  result:
    "단일 건 집계·확정 보고를 출력합니다. 캘린더형 이미지 보고서는 부하가 있어 필요 시에만 선택을 권장드립니다.",
  optRegId:
    "대상 등록 ID. OPEN이 여러 건이면 필수입니다. 비우면 단일 OPEN·없으면 최근 마감이 자동 지정됩니다.",
  optWithImage:
    "캘린더형 이미지 보고서 첨부. 생략을 기본으로 권장드리며, 필요할 때만 요청 주시기 바랍니다.",
  participation:
    "본인이 가용으로 회신한 일정을 비밀 열람으로 조회합니다. 관리자가 아니실 경우 캘린더형 이미지 보고서로 내부 규약에 따라 주기적으로만 제공되는 점 참고 부탁드립니다.",
  close:
    "해당 건 응답 접수를 즉시 마감합니다. 확정 보고는 「집계」로 이어가실 수 있습니다.",
  optRegIdClose:
    "대상 등록 ID. 단일 OPEN이면 생략 가능하나, OPEN이 여러 건이면 필수입니다.",
  editClose:
    "접수 중 건의 회신 마감 시각 변경. 배정 일시와의 선후는 규칙에 맞게 기재 부탁드립니다.",
  optNewClose:
    "새 응답 마감 — 형식: YYYY-MM-DD HH:mm (24시간). 아래 자동완성은 양식 예시. 직접 입력 권장.",
  editDate:
    "접수 중 건의 배정 일시 변경. 마감이 늦으면 배정 1h 전 등으로 자동 조정될 수 있습니다.",
  optNewDate:
    "새 배정 일시 — 형식: YYYY-MM-DD HH:mm (24시간). 아래 자동완성은 양식 예시. 직접 입력 권장.",
  cancel:
    "등재 취소·기각. 확정 보고는 없으며, 공지는 안내에 따라 정리됩니다. 마감된 건도 **사후 철회**가 가능합니다(확정 보고에 표식 반영).",
  optCancelReason:
    "(선택) 취소 사유. 공지·확정 보고에 표식과 함께 노출되며, 로그에도 기록됩니다.",
  info: "이 채널에 봇 사용 안내 임베드를 영구 게시합니다.",
  optInfoChannel: "안내를 게시할 채널 (미지정 시 현재 채널)",
  optPin: "게시 후 메시지를 고정합니다",
} as const;

/** 디스코드 사용자 응답 */
export const D = {
  permManage: `${E}권한 부족. **서버 관리**가 승인된 인원만 이 절차를 발동할 수 있습니다.`,
  guildOnly: `${E}길드 서버 외부에서는 통합 일정 체계에 접근할 수 없습니다.`,
  interactionUnexpected:
    `${E}처리 중 예기치 않은 오류가 발생했습니다. 잠시 후 다시 시도하시거나 기술 담당에 문의하십시오.`,
  dateBad: `${E}시각 기재 형식이 프로토콜에 맞지 않습니다. 예: 2026-03-22 20:00`,
  closeNotBeforeTarget: `${E}회신 마감은 **배정 일시보다 앞서야** 합니다. 재기안하십시오.`,
  pastCloseBlock: (interpretedClose: string, yearHint: string) =>
    `${E}**회신 마감 시각이 이미 경과**했습니다. 즉시 마감 절차가 실행됩니다.\n` +
    `${N}해석된 마감: **${interpretedClose}**(봇 호스트 **로컬 타임존**)\n` +
    `${N}24시 표기 권장. 오후 3시 50분 → \`15:50\` (❌ \`03:50\`은 새벽)\n` +
    `${N}마감은 **현재 이후**여야 합니다.${yearHint}`,
  targetPast: (yearHint: string) =>
    `${E}**배정 일시**는 현재보다 이후여야 합니다. 과거 일정은 등재할 수 없습니다.${yearHint}`,
  roleBad: `${E}통보 대상 역할이 유효하지 않습니다. ID 또는 @역할멘션만. @here·@everyone은 제외됩니다.`,
  channelResolveFail: (msg: string) => msg,
  createRollbackFail: "등재 공지의 messageId를 기록하지 못했습니다. 절차를 중단합니다.",
  createErr: (detail: string) =>
    `${E}등재 처리 중 오류. 기술 담당에 통보하십시오: ${detail}`,
  createMissingAccess: `${E}봇이 **공지 채널**에 교신할 권한이 없습니다(\`Missing Access\`).\n${N}채널·역할 권한: **보기·메시지 전송·링크 임베드**.\n${N}스레드면 **스레드에서 전송**·비공개 스레드는 봇 **초대** 필요.`,
  /**
   * 등재 공지 메시지 본문 상단(@here). `safeTitle`은 마크다운·멘션 깨짐 방지 처리된 일정명.
   */
  createChannelAnnounceWithHere: (safeTitle: string) =>
    [
      `@here **관리자님**에 의해 **최우선** 등재 일정이 공표되었습니다.`,
      "",
      `**「${safeTitle}」**`,
      "",
      "노부스 오르도에 소속된 관료·군인·과학자·실험체 분들께서는, 공지사항에 명시된 **응답 마감 시간**까지 기한을 준수하여 아래 해당 일정에 **가용**·**불가**로 회신해 주시기 바랍니다.",
    ].join("\n"),
  /**
   * 마감 후 확정 보고 메시지 본문(@here). `scheduled`는 자동 마감, `force`는 `/일정 마감` 등.
   */
  closeChannelAnnounceWithHere: (
    kind: "scheduled" | "force",
    safeTitle: string
  ) => {
    const head =
      kind === "scheduled"
        ? "@here 공지에 명시된 **응답 마감 시간**이 경과하여, 아래 **최우선** 등재 일정의 접수를 **마감·확정**하였습니다."
        : "@here **관리자님**에 의해 아래 **최우선** 등재 일정의 접수를 **즉시 마감**하였습니다.";
    return [
      head,
      "",
      `**「${safeTitle}」**`,
      "",
      "노부스 오르도에 소속된 관료·군인·과학자·실험체 분들께서는, 본 메시지에 첨부된 **【확정 보고】**를 확인해 주시기 바랍니다. 이후 일정은 관리자님 외 변경이 불가능하며, 관리자님께 직접 문의 하셔야 합니다.",
    ].join("\n");
  },
  createDone: (url: string, regId: string, editDateCmd: string, editCloseCmd: string, optReg: string) =>
    [
      `${S}일정이 **등재**되었습니다. [공지 열람](${url})`,
      "",
      `등록 ID: \`${regId}\` — 대장·관리 명령에 인용하십시오.`,
      `배정·마감 조정: \`${editDateCmd}\` · \`${editCloseCmd}\``,
      `${N}\`${optReg}\`를 비우면 에서 가장 최근 **접수 중** 건이 자동 지정됩니다.`,
    ].join("\n"),

  btnNoRecord: `${E}해당 등록 번호를 대장에서 찾지 못했습니다. 재확인 바랍니다.`,
  btnClosed: `${E}이미 **마감**된 건입니다. 회신을 수정할 수 없습니다.`,
  btnClosing: `${E}해당 건은 현재 **마감 후속 처리 중**입니다. 잠시 후 다시 확인 바랍니다.`,
  btnCanceled: `${E}**기각** 처리된 건입니다. 회신을 수정할 수 없습니다.`,
  btnCanceling: `${E}해당 건은 현재 **기각 후속 처리 중**입니다. 잠시 후 다시 확인 바랍니다.`,
  /** 가용 최초 제출 시 에페메랄 1회(길드·유저 기준) */
  btnYesParticipationTipOnce: `${S}**가용**을 제출하셨습니다.\n${N}본인이 가용으로 회신한 일정은 슬래시 명령 \`/참여확인\`에서 **비밀 열람**(에페메랄)로 모아 볼 수 있습니다.\n${N}_이 안내는 서버당 최초 1회만 표시됩니다._`,

  listEmpty: `${N}본 길드에 **접수 중**인 등재 건이 없습니다.`,
  listTitle: (n: number) => `접수 중인 등재 건 · ${n}건`,
  listFooterMore: (shown: number, total: number, overviewCmd: string) =>
    `표시 한도: 앞선 ${shown}건만 · 전체 ${total}건 · 월별: ${overviewCmd}`,
  listFooterAll: (overviewCmd: string) => `월별·마감 포함 전체: ${overviewCmd}`,

  overviewEmpty: `${N}본 길드에 접수 중·마감된 등재가 없습니다(기각 제외).`,
  overviewTitle: "등재 대장(월별) — NOVUS ORDO",
  overviewCont: (i: number, n: number) => `계속 (${i + 1}/${n})`,
  overviewNoRender: `${E}표 형태로 출력할 수 없습니다. 나중에 재시도하십시오.`,
  overviewOmitted: "_이후 월·건은 표시 한도로 생략됩니다._",
  overviewFooterTools: (
    root: string,
    subResult: string,
    optReg: string,
    optImg: string,
    subCal: string
  ) =>
    `【참고】 집계: /${root} ${subResult} · ${optReg} · PNG:${optImg} · 월 격자: /${root} ${subCal}`,

  calImageOff: `${E}시각화( PNG )가 **비활성**입니다. \`RESULT_CARD_IMAGE\`와 실행 환경을 확인하십시오.`,
  calRenderFail: `${E}격자 이미지를 생성하지 못했습니다. 잠시 후 재시도하십시오.`,
  calPosted: (y: number, m: number) =>
    `📅 **${y}년 ${m}월** — 배정 기준 접수·마감(기각 제외)`,
  calDone: (url: string) => `${S}격자를 게시했습니다. [열람](${url})`,
  calSendFail: (detail: string) =>
    `${E}격자 전송 실패. ${detail}`,
  calMissingAccess: `${E}지정 채널에 봇이 교신할 수 없습니다(\`Missing Access\`).\n${N}**보기·전송·파일 첨부**·스레드 권한을 확인하십시오.`,

  resultMultiOpen: (n: number, optReg: string, overviewCmd: string) =>
    `접수 중인 건이 **${n}건**입니다. 임의 단일 지정은 하지 않습니다.\n` +
    `**${optReg}**로 등록 ID를 명시하십시오.\n` +
    `_후보·ID는 실행 관리자에게만 전달됩니다._`,
  resultPickIds: (lines: string, more: string, resultCmd: string, overviewCmd: string) =>
    `아래 ID를 \`${resultCmd}\`의 **등록아이디**에 넣으십시오.\n\n${lines}${more}\n\n` +
    `— 마감 건만 보려면 ID를 기재하거나 \`${overviewCmd}\` —`,
  mutationMultiOpen: (n: number, optReg: string, cmd: string) =>
    `접수 중인 건이 **${n}건**입니다. \`${cmd}\` 대상은 자동 지정하지 않습니다.\n` +
    `**${optReg}**로 등록 ID를 명시하십시오.\n` +
    `_후보·ID는 실행 관리자에게만 전달됩니다._`,
  mutationPickIds: (
    lines: string,
    more: string,
    cmd: string,
    overviewCmd: string
  ) =>
    `아래 ID를 \`${cmd}\`의 **등록아이디**에 넣으십시오.\n\n${lines}${more}\n\n` +
    `— 전체 대장은 \`${overviewCmd}\` —`,
  resultNotFound: (optReg: string, overviewCmd: string) =>
    `${E}지정한 등재를 찾지 못했습니다.\n${N}${optReg} 기재 시 ID를 재확인.\n${N}비웠을 때 OPEN이 없으면 **최근 마감** 1건을 택합니다. 전체: ${overviewCmd}`,
  resultCanceled: `【기각】 해당 건은 취소되었습니다.`,
  resultClosing: `【마감 처리 중】 해당 건은 공지 정리·확정 보고 송부를 재시도 중입니다. 잠시 후 다시 확인하십시오.`,
  resultCanceling: `【기각 처리 중】 해당 건은 공지 정리를 마무리하는 중입니다. 잠시 후 다시 확인하십시오.`,
  resultEphemeralId: (sid: string, rootCmd: string, optReg: string) =>
    `【대장·관리용】 집계 대상 등록번호\n\`${sid}\`\n${N}슬래시 \`${rootCmd}\` 의 **${optReg}** 필드에 기재.`,
  resultOpenFooter: "가용·불가 집계(접수 구간). 마감 전까지 수정 가능.",
  resultPosted: (url: string) => `${S}집계·보고를 게시했습니다. [열람](${url})`,
  resultSendFail: (detail: string) =>
    `${E}집계 전송 실패. ${detail}`,
  resultChannelDeny: `${E}지정 채널 교신 불가(\`Missing Access\`). 권한을 점검하십시오.`,

  closeNoOpen: `${E}접수 중인 등재를 찾지 못했습니다.`,
  closeNotOpen: `${E}이미 마감되었거나 기각된 건입니다.`,
  closeInProgress: `${N}해당 건은 이미 **마감 후속 처리 중**입니다.`,
  closeAlready: `${N}타 절차에서 이미 마감되었거나 OPEN이 아닙니다.`,
  closeDone: (title: string, warn: string) =>
    `${S}**${title}** — 응답 접수를 **즉시 마감**했습니다.${warn}`,
  closeErr: (detail: string) => `${E}마감 절차 오류: ${detail}`,

  editCloseDateBad: (opt: string) => `${E}\`${opt}\` 시각 형식이 잘못되었습니다.`,
  editCloseNoOpen: `${E}접수 중인 등재를 찾지 못했습니다.`,
  editMutationLostOpen:
    `${E}조회 직후 상태가 바뀌어 수정을 적용하지 못했습니다. 이미 마감·기각 절차가 진행 중인지 확인 바랍니다.`,
  dbFail: `${E}기록 갱신에 실패했습니다. 잠시 후 재시도하십시오.`,
  editCloseDone: (title: string, ts: string, announce: string, notes: string) =>
    `${S}**${title}** — 회신 마감 시각을 변경했습니다. 새 마감: ${ts}${announce}${notes}`,
  warnClosePast: "_마감 시각이 과거입니다. 스케줄러가 곧 자동 마감할 수 있습니다._",
  warnCloseAfterTarget: (editDateCmd: string) =>
    `_마감이 **배정 일시 이후**입니다. 필요 시 \`${editDateCmd}\`로 배정을 조정하십시오._`,
  announceOkClose: "\n· 공지 임베드의 **회신 마감**을 반영했습니다.",
  announceFailClose:
    "\n· _(공지 자동 갱신 실패 가능. 봇의 메시지 수정 권한을 확인.)_",

  editDateBad: (opt: string) => `${E}\`${opt}\` 시각 형식이 잘못되었습니다.`,
  editDateNoOpen: `${E}접수 중인 등재를 찾지 못했습니다.`,
  editDateDone: (title: string, ts: string, autoClose: string, announce: string, past: string) =>
    `${S}**${title}** — **배정 일시**를 변경했습니다. 새 시각: ${ts}${autoClose}${announce}${past}`,
  autoCloseNote: (ts: string) =>
    `\n· 회신 마감이 배정보다 늦어 **${ts}**(배정 1시간 전·불가 시 1분 전)으로 맞췄습니다.`,
  announceOkDate:
    "\n· 공지 사항의 **배정 일시**를 반영했습니다. 24h 알림은 새 시각 기준으로 재판단합니다.",
  announceFailDate: "\n· _(공지 자동 갱신 실패 가능. 권한 확인.)_",
  pastDateWarn: "\n\n_배정이 과거입니다. 알림·집계 의미를 재확인하십시오._",

  partEmpty: `${N}. 기존에 **가용**으로 회신하여 등재된 일정이 없습니다. 가용으로 회신한 일정이 있는 지 확인후 다시 시도해주십시오.`,
  partTitle: "【비밀 열람】 본인 가용 회신 대장",
  /** `codename`이 있으면 `표시닉(코드네임)님.` 형식 */
  partIntro: (displayNick: string, codename: string | null) => {
    const raw = displayNick.trim() || "요원";
    const safeNick = raw.length > 36 ? `${raw.slice(0, 33)}…` : raw;
    if (codename?.trim()) {
      return `${safeNick}(${codename.trim()})님. 예정된 일정은 다음과 같습니다.`;
    }
    return `${safeNick}님. 예정된 일정은 다음과 같습니다.`;
  },
  partFooterCap: (total: number, shown: number) =>
    `총 ${total}건 중 앞 ${shown}건만 표기(배정 시각 순)`,
  partCooldown: (mins: number) =>
    `월간 격자 PNG 재첨부까지 약 ${mins}분`,
  partNoCalMarks:
    "격자 PNG는 봇 기준 **이번 달·다음 달**에 배정 일시가 있는 가용 회신만 그립니다. 위 목록은 길드 전체 가용 회신(월 무관)이라, 두 달 모두에 해당이 없으면 격자는 생략됩니다.",
  partCalFail: "\n\n_격자 PNG 생성 실패. 글 목록만 유지._",
  partCalFooter: (y: number, m: number, shown: number, cdMin: string) =>
    `격자: ${y}년 ${m}월 · 목록 상한 ${shown}건${cdMin}`,
  /** `m1`·`m2`는 표시용 월(1~12). 연속 두 달 창. */
  partCalFooterTwo: (
    y1: number,
    m1: number,
    y2: number,
    m2: number,
    shown: number,
    cdMin: string
  ) =>
    y1 === y2
      ? `격자: ${y1}년 ${m1}~${m2}월 · 목록 상한 ${shown}건${cdMin}`
      : `격자: ${y1}년 ${m1}월 ~ ${y2}년 ${m2}월 · 목록 상한 ${shown}건${cdMin}`,
  partCalCdNext: (mins: number) => ` · 다음 격자 약 ${mins}분 후`,
  partDescTrunc: "\n… _대장 용량으로 일부만 표기._",
  partLineState: (st: string) => `· 상태: **${st}**`,
  partLineAssign: (ts: number) => `· 배정 시각: <t:${ts}:F>`,
  partLineClose: (ts: number) => `· 회신 마감: <t:${ts}:F>`,
  partLineLink: (url: string, sid: string) => `· 공지: [열람](${url}) · 등록 \`${sid}\``,
  statusOpen: "접수",
  statusClosing: "마감 처리 중",
  statusClosed: "마감 확정",
  statusCanceling: "기각 처리 중",
  statusCanceled: "기각",

  /**
   * OPEN 취소 시 채널에 별도 공지할 문구(@here). `safeTitle`은 멘션 깨짐 방지 처리된 일정명.
   */
  cancelChannelAnnounceWithHere: (
    safeTitle: string,
    reason: string | null
  ) => {
    const reasonLine = reason ? `\n> 사유: ${reason}` : "";
    return [
      `@here **관리자님**에 의해 아래 등재가 **기각(취소)** 처리되었습니다.`,
      "",
      `**「${safeTitle}」**${reasonLine}`,
      "",
      "응답 접수는 무효화되며, 본 건은 집행되지 않습니다.",
    ].join("\n");
  },
  /**
   * 배정 일시 변경 시 채널에 별도 공지할 문구(@here).
   * `autoCloseLine`이 비어있지 않으면 응답 마감도 자동 조정됐다는 줄이 포함됩니다.
   */
  editDateChannelAnnounceWithHere: (
    safeTitle: string,
    previousTs: number,
    newTs: number,
    autoCloseLine: string
  ) => {
    const autoPart = autoCloseLine ? `\n${autoCloseLine}` : "";
    return [
      `@here **관리자님**에 의해 아래 등재의 **배정 일시**가 변경되었습니다.`,
      "",
      `**「${safeTitle}」**`,
      `> 이전 배정: <t:${previousTs}:F>`,
      `> 새 배정: **<t:${newTs}:F>**${autoPart}`,
      "",
      "회신 가능 여부를 재확인해 주시기 바랍니다.",
    ].join("\n");
  },
  /** 배정 변경에 맞춰 응답 마감이 자동 조정됐을 때 덧붙이는 줄 */
  editDateChannelAutoCloseLine: (newCloseTs: number) =>
    `> 응답 마감: **<t:${newCloseTs}:F>** (배정에 맞춰 자동 조정)`,
  cancelNoOpen: `${E}접수 중인 등재를 찾지 못했습니다.`,
  cancelInProgress: `${N}해당 건은 이미 **기각 후속 처리 중**입니다.`,
  cancelAlready: `${N}타 절차에서 이미 기각되었거나 OPEN이 아닙니다.`,
  /** CLOSING — 마감 후속 처리 중이라 취소가 불가능한 상태 */
  cancelOnClosingBlocked: `${N}해당 건은 현재 **마감 후속 처리 중**입니다. 마감 완료 후 사후 철회가 필요하면 \`/일정 취소\`를 다시 실행하십시오.`,
  /** 일정 변경 시 채널 공지 송부 실패 경고(관리자 ephemeral 말미) */
  editDateChannelNotifyFail: `${N}변경 내용을 채널에 공지하지 못했습니다. 봇의 채널 **메시지 전송** 권한을 확인하십시오.`,
  cancelDone: (title: string, warn: string) =>
    `${S}**${title}** — 등재를 **기각**했습니다.${warn}`,
  cancelErr: (detail: string) => `${E}기각 절차 오류: ${detail}`,

  /** CLOSED 세션 사후 철회 — 관리자 ephemeral 완료 메시지 */
  retractDone: (title: string, reason: string | null, warn: string) => {
    const reasonLine = reason ? `\n${N}사유: ${reason}` : "";
    return `${S}**${title}** — 확정 보고된 건을 **사후 철회**했습니다.${reasonLine}${warn}`;
  },
  /** 이미 철회 처리된 경우 */
  retractAlready: `${N}타 절차에서 이미 철회되었거나 CLOSED 상태가 아닙니다.`,
  /** 사후 철회 시 채널에 별도 공지할 문구(@here) */
  retractChannelAnnounceWithHere: (
    safeTitle: string,
    reason: string | null
  ) => {
    const reasonLine = reason ? `\n> 사유: ${reason}` : "";
    return [
      `@here **관리자님**에 의해 확정 보고 이후, 아래 등재가 **사후 철회**되었습니다.`,
      "",
      `**「${safeTitle}」**${reasonLine}`,
      "",
      "이전 **【확정 보고】**는 더 이상 유효하지 않습니다. 일정 관련 문의는 관리자님께 직접 부탁드립니다.",
    ].join("\n");
  },

  warnPrefix: "\n\n【주의】 ",
} as const;

/** 세션 마감·취소 시 관리자에게 붙는 경고(문자열 배열) */
export const W = {
  noIdSkip: "등록 ID가 없어 마감을 집행하지 않았습니다.",
  channelInaccessible: "공지 채널에 접근할 수 없어 확정 보고를 송부하지 못했습니다.",
  announceEditFail: "기존 공지 교정에 실패했습니다. 권한·삭제 여부를 확인하십시오.",
  resultSendFail: "확정 보고 메시지 송부에 실패했습니다.",
  discordErr: "교신( Discord ) 후속 처리 중 오류가 발생했습니다.",
  logFail: "운영 대장(로그) 기록에 실패했습니다.",
  statePersistFail: "후속 처리 진행 상태 저장에 실패했습니다.",
  cancelAnnounceInaccessible: "공지 채널에 접근할 수 없어 기각 안내를 반영하지 못했습니다.",
} as const;

/** 콘솔 — 운영자가 읽되 레지스트라 서명 톤 */
export const L = {
  discordErr: "[Registrar] 교신 게이트 오류. 기술 반에 통보 요망.",
  login: (tag: string) => `[Registrar] 접속 확인: ${tag}`,
  slashOk: "[Registrar] 슬래시 명령을 본부에 등록했습니다.",
  slashFail: "[Registrar] 슬래시 등록 실패. 토큰·ID를 확인하십시오.",
  schedulerClose: "[Registrar] 자동 마감 감시를 가동했습니다.",
  schedulerRemind: "[Registrar] 24시간 전 통보 감시를 가동했습니다.",
  shutdown: "[Registrar] 절차 종료. 연결을 해제합니다.",
  bootFail: "[Registrar] 기동 실패. 환경·토큰·DB를 확인하십시오.",

  sessionCloseNoId: "[Registrar] 등록 ID 없음 — 마감을 집행하지 않습니다.",
  sessionCloseAnnounceEdit: "[Registrar] 공지 교정 실패:",
  sessionCloseResultSend: "[Registrar] 확정 보고 송부 실패:",
  sessionCloseFollowup: "[Registrar] 마감 후속 처리 실패:",
  sessionCloseState: "[Registrar] 마감 진행 상태 저장 실패:",
  sessionCloseLog: "[Registrar] 대장 기록 실패:",
  sessionCancelEdit: "[Registrar] 기각 시 공지 교정 실패:",
  sessionCancelFollow: "[Registrar] 기각 후속 실패:",
  sessionCancelState: "[Registrar] 기각 진행 상태 저장 실패:",
  sessionCancelLog: "[Registrar] 기각 대장 기록 실패:",

  closeWarn: "[Registrar] 마감은 끝났으나 아래 경고가 남았습니다.",
  closeRateWait: (sec: number, a: number, max: number) =>
    `[Registrar] 전송 제한 — ${sec.toFixed(1)}초 후 재시도 (${a}/${max})`,
  closeRetryExhausted: "[Registrar] 마감 재시도 한도 초과. 등록 ID:",
  closeFail: "[Registrar] 단일 건 마감 실패:",
  closeTick: "[Registrar] 마감 감시 틱 오류:",

  remindRow: "[Registrar] 통보 처리 중 오류(등록 ID):",
  remindTick: "[Registrar] 통보 감시 틱 오류:",
  remindLog: "[Registrar] 통보 발송 로그 기록 실패:",
  remindClaimRelease: "[Registrar] 통보 선점 해제 실패:",
  remindMarkSent: "[Registrar] 통보 발송 완료 기록 실패:",
  remindLeaseExtend: "[Registrar] 통보 선점 연장 실패:",

  btnEdit: "[Registrar] 공지 집계 갱신 실패:",
  btnParticipationTip: "[Registrar] 가용 안내(참여확인) 에페메랄 실패:",

  sessionCreate: "[Registrar] 등재 처리 오류:",
  sessionCreateRollbackDel: "[Registrar] 롤백 중 공지 삭제 실패:",
  sessionCreateRollbackMiss: "[Registrar] 롤백 대상 등재를 찾지 못함:",
  sessionCreateRollbackDb: "[Registrar] 롤백 중 DB 삭제 실패:",

  autocomplete: "[Registrar] 자동완성 처리 오류:",

  pngNoCard: "[Registrar] PNG: 카드 노드 없음 — 렌더 중단.",
  pngFail: "[Registrar] PNG 렌더 실패:",
  pngCalNoCard: "[Registrar] 월간 격자: 카드 노드 없음.",
  pngCalFail: "[Registrar] 월간 격자 렌더 실패:",

  guildGap: (gid: string, sec: number) =>
    `[Registrar] 멤버 조회 간격 유지 — 길드 ${gid}, ${sec.toFixed(1)}초 대기`,
  guildRl: (gid: string, sec: number, a: number, max: number) =>
    `[Registrar] 멤버 조회 제한 — 길드 ${gid}, ${sec.toFixed(1)}초 후 재시도 (${a}/${max})`,
  guildExhaust: "[Registrar] 멤버 조회 재시도 소진.",
  guildStale: (id: string) =>
    `[Registrar] 멤버 조회 실패 — 만료 캐시로 대체(길드 ${id}). 미제출 명단이 어긋날 수 있음.`,

  sessionCalendar: "[Registrar] 격자 게시 오류:",
  sessionResult: (ctx: string) => `[Registrar] 집계 송부 오류(${ctx}):`,
  sessionCloseCmd: "[Registrar] 강제 마감 명령 오류:",
  sessionEditClose: "[Registrar] 마감 시각 변경 — 공지 갱신 실패:",
  sessionEditDate: "[Registrar] 배정 변경 — 공지 갱신 실패:",
  sessionCancelCmd: "[Registrar] 기각 명령 오류:",
  sessionCancelAnnounce: "[Registrar] 기각 채널 공지 실패:",
  sessionRetractEdit: "[Registrar] 사후 철회 시 확정 보고 수정 실패:",
  sessionRetractAnnounce: "[Registrar] 사후 철회 채널 공지 실패:",
  sessionRetractLog: "[Registrar] 사후 철회 로그 기록 실패:",
  interactionUnhandled: (kind: string) =>
    `[Registrar] 인터랙션 처리 실패(${kind}):`,
  interactionFallback: (kind: string) =>
    `[Registrar] 인터랙션 fallback 응답 실패(${kind}):`,
  readyUnhandled: "[Registrar] 준비 완료 핸들러 오류:",

  infoSendFail: "[Registrar] 안내 게시 실패:",
  infoPinFail: "[Registrar] 안내 고정 실패:",
} as const;

export const ConfigErr = {
  token: `${E}DISCORD_TOKEN 미설정. 레지스트라는 가동할 수 없습니다.`,
  clientId: `${E}DISCORD_CLIENT_ID 미설정.`,
  mongo: `${E}MONGODB_URI 미설정.`,
} as const;

export const DbErr = {
  indexDup:
    `${E}MongoDB 색인 초기화 실패. session_responses의 (sessionId,userId) 중복을 제거하십시오.`,
  notConnected: `${E}기록소(DB)에 연결되지 않았습니다. connectDb() 선행.`,
} as const;

/** 채널 해석 실패 시 */
export const Channel = {
  noTarget: `${E}교신 채널을 확정할 수 없습니다. 텍스트 채널에서 명령하거나 **채널** 옵션을 지정하십시오.`,
  bad: `${E}채널을 찾을 수 없거나, 텍스트·공지·스레드만 허용됩니다.`,
} as const;

/** PNG/HTML 카드 문구 */
export const Png = {
  stPrimary: "조회 대상",
  stOpen: "접수",
  stClosing: "마감중",
  stClosed: "마감",
  stCanceling: "기각중",
  stCanceled: "기각",
  subGuild: "동일 월 등재(접수·마감)",
  subPart: "가용 회신(본인 · 이번·다음 달)",
  agendaEmpty: "이번 달 표시할 등재가 없습니다.",
  ribbonOpen: "응답 집계(접수 구간)",
  ribbonClosed: "확정 보고",
  footerOpen:
    "접수 구간입니다. 기한 내 가용·불가를 기재하십시오. 위반 시 집계에서 제외됩니다.",
  footerClosed: `집계가 확정되었습니다. 이후 변경은 허용되지 않습니다. — ${REGISTRAR_SIGNATURE}`,
  sectionHead: "가용·불가·미제출 대장",
  emptyNames: "해당 없음",
  agendaMore: (n: number) => `외 ${n}건(화면에 일부만 표기)`,
  agendaHead: "이번 달 등재",
  colAvail: "가용",
  colDeny: "불가",
  colPending: "미제출",
  namesMore: (n: number) => `외 ${n}명(화면에 일부만 표기)`,
  metaAssign: "배정 일시",
  calMonthLine: (y: number, m: number) => `${y}년 ${m}월`,
} as const;

export const CancelEmbed = {
  title: (t: string) => `【기각】 ${t}`,
  body: `본 건의 가용 회신 접수는 상급 권한에 의해 **기각**되었습니다.`,
  footer: REGISTRAR_SIGNATURE,
} as const;

/** 자동완성 드롭다운 접두 */
export const Ac = {
  example: "[양식] ",
  direct: "[직접기재] ",
} as const;

/** `/도움말`·`/help` — 권한별 사용 안내 */
export const Help = {
  cmd: "이 봇 사용 안내를 비밀 열람(본인 한정)으로 표시합니다.",

  playerTitle: "【이용 안내】 세션 참여자",
  playerDesc:
    "세션 일정 관리에서 참여자가 사용할 수 있는 기능은 다음과 같습니다.",
  playerFields: [
    {
      name: "▶ 참여 응답하기",
      value:
        "공지된 세션 메시지 하단의 **[가용]** · **[불가]** 버튼으로 응답 부탁드립니다. 응답 마감 시각 이전이면 언제든 다시 눌러 **수정**이 가능합니다.",
    },
    {
      name: "◆ 내 응답 확인",
      value:
        "`/참여확인` — 본인이 **가용**으로 응답한 세션 목록을 **본인에게만 보이는(비공개)** 형태로 조회합니다.",
    },
    {
      name: "※ 응답 마감 이후",
      value:
        "마감이 지나면 응답 수정이 차단되며, 최종 집계가 공지됩니다. 변경이 필요한 경우 운영자에게 직접 문의 부탁드립니다.",
    },
  ],
  playerFooter: "본 안내는 본인에게만 표시됩니다.",

  adminTitle: "【운영자 명령】 세션 일정 관리",
  adminDesc:
    "운영 권한 보유자에게 제공되는 전체 명령입니다. **등록 ID**는 대부분의 관리 명령에서 대상을 지정할 때 사용됩니다.",
  adminFields: [
    // ── 등재 ──
    { name: "​", value: "━━ **등재** ━━" },
    {
      name: "◆ `/일정 생성`",
      value:
        "새 세션 등록. 제목·일시·마감·역할·(선택)채널 입력 시 공지와 응답 버튼이 자동 설치됩니다. **등록 ID** 반환.",
      inline: true,
    },
    {
      name: "◆ `/일정 취소`",
      value:
        "세션 **기각(취소)** 처리. 최종 집계 공지는 없으며, 기존 공지에 취소 표식이 남습니다.",
      inline: true,
    },
    { name: "​", value: "​", inline: true },

    // ── 조회 ──
    { name: "​", value: "━━ **조회** ━━" },
    {
      name: "◆ `/일정 목록`",
      value: "응답 모집 중인 세션만 간단 요약(최대 20건). 빠른 점검용입니다.",
      inline: true,
    },
    {
      name: "◆ `/일정 한눈에`",
      value:
        "모집 중·마감된 세션을 세션 시각 기준 **월별 대장**으로 열람(최대 100건, 분할 표시).",
      inline: true,
    },
    {
      name: "◆ `/일정 달력 [월]`",
      value:
        "지정 월 세션을 **월간 달력 PNG**로 출력. 부하가 있어 필요할 때만 실행 권장.",
      inline: true,
    },

    // ── 수정 ──
    { name: "​", value: "━━ **수정** ━━" },
    {
      name: "◆ `/일정 응답마감변경`",
      value:
        "응답 모집 중인 세션의 **응답 마감 시각** 변경. 세션 시각 이전·현재 이후만 유효합니다.",
      inline: true,
    },
    {
      name: "◆ `/일정 일정변경`",
      value:
        "응답 모집 중인 세션의 **세션 시각** 변경. 마감이 늦어지면 세션 1시간 전(불가 시 1분 전)으로 자동 조정됩니다.",
      inline: true,
    },
    { name: "​", value: "​", inline: true },

    // ── 종결 ──
    { name: "​", value: "━━ **종결** ━━" },
    {
      name: "◆ `/일정 마감`",
      value:
        "응답 모집을 **즉시 마감**. 이후 최종 집계 공지는 `/일정 집계`로 별도 진행하십시오.",
      inline: true,
    },
    {
      name: "◆ `/일정 집계`",
      value:
        "단일 세션 **최종 집계(확정 보고)** 를 공지 채널에 게시. `이미지포함` 옵션 시 PNG 카드 첨부.",
      inline: true,
    },
    { name: "​", value: "​", inline: true },
  ],
  adminFooter:
    "세션 식별: /일정 목록 · /일정 한눈에  |  자동: 24h 전 통보 · 마감 자동 집계 · 전 명령 로그 보존",
} as const;

/** `/안내`·`/info` — 채널 공개 안내 임베드 */
export const Info = {
  title: "【NOVUS ORDO REGISTRAR】 일정 봇 안내",
  desc:
    "**세션 등재 · 가용/불가 회신 · 집계**를 본 채널에서 통합 운용합니다. 본 안내는 명령 및 응답 방법을 정리한 것입니다.",
  fields: [
    // ── 즉시 조작 ──
    { name: "​", value: "━━ **즉시 조작** ━━" },
    {
      name: "▶ 가용 / 불가 회신",
      value:
        "공지된 세션 메시지 하단의 **[가용]** · **[불가]** 버튼으로 응답합니다. 응답 마감 시각 이전이면 다시 눌러 **수정** 가능합니다.",
    },

    // ── 본인 명령 ──
    { name: "​", value: "━━ **본인 명령** ━━" },
    {
      name: "◆ `/참여확인`",
      value: "본인이 **가용**으로 응답한 세션 목록을 비공개로 조회합니다.",
      inline: true,
    },
    {
      name: "◆ `/도움말`",
      value: "권한별 전체 명령 안내를 **본인 한정**으로 표시합니다.",
      inline: true,
    },
    { name: "​", value: "​", inline: true },

    // ── 진행 흐름 ──
    { name: "​", value: "━━ **진행 흐름** ━━" },
    {
      name: "​",
      value:
        "**등재** → **모집(가용/불가 회신)** → **마감** → **집계(확정 보고)**",
    },
  ],
  footerLine: "운영자 전용 안내는 `/도움말` 명령을 사용해 주세요.",
  /** 결과 알림 */
  postedOk: (channelMention: string, messageId: string, pinNote: string) =>
    `${S}안내를 게시했습니다 (${channelMention}, 메시지 ID: \`${messageId}\`)${pinNote}`,
  pinFailNote: " — 단, 메시지 **고정에 실패**했습니다(권한 확인).",
  postedFail: (detail: string) =>
    `${E}안내 게시 실패: ${detail}`,
  postedMissingAccess: `${E}봇이 대상 채널에 메시지를 보낼 수 없습니다(\`Missing Access\`). 권한을 확인하십시오.`,
} as const;

/** 배정 24h 전 리마인드 임베드 */
export const Remind = {
  title: "【통보】 배정 24시간 전 — 가용 회신자 명단",
  lineTitle: (t: string) => `**${t}**`,
  lineWhen: (discordTs: string) => `배정 시각: <t:${discordTs}:F>`,
  lineMentions: (line: string) => `다음 인원은 가용으로 회신되어 있습니다: ${line}`,
  footer: `변경 사항은 관리자에게 즉시 보고할 것. ${REGISTRAR_SIGNATURE}`,
} as const;

