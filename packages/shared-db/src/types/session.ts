/** 마감/기각 후속 처리 종류 */
export type SessionFinalizationKind = "CLOSE" | "CANCEL";

/** 후속 처리를 최초로 시작한 원인 */
export type SessionFinalizationTrigger = "scheduled" | "force" | "cancel";

/** Discord 결과 공지 전달 상태 */
export type SessionFinalizationDeliveryState =
  | "PENDING"
  | "DISPATCHING"
  | "SENT"
  | "DELIVERY_UNKNOWN";

/** 자동 재개를 중단하고 운영 reconciliation이 필요한 원인 */
export type SessionFinalizationReconciliationReason =
  | "DELIVERY_RESULT_UNKNOWN"
  | "LEGACY_STATE_UNKNOWN";

/** 일정 상태: OPEN(접수 중), CLOSING/CANCELING(후속 처리 중), CLOSED/CANCELED(완료) */
export type SessionStatus =
  | "OPEN"
  | "CLOSING"
  | "CANCELING"
  | "CLOSED"
  | "CANCELED";

/** 가용 여부: YES(가용), NO(불가) */
export type ResponseStatus = "YES" | "NO";

/** DB에 저장되는 등록 일정 문서 */
export interface Session {
  _id?: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  targetDateTime: Date;
  closeDateTime: Date;
  targetRoleId: string;
  status: SessionStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** 보고서 FK 생성과 세션 삭제/수정 경합을 직렬화하는 내부 revision. */
  reportReferenceRevision?: number;
  /** 배정 24시간 전 리마인드(가용 YES 멘션) 발송 여부 */
  sessionStartReminder24hSent?: boolean;
  /** 배정 24시간 전 리마인드 발송권 선점 토큰 */
  sessionStartReminder24hClaimToken?: string;
  /** 배정 24시간 전 리마인드 발송권 선점 시각 */
  sessionStartReminder24hClaimedAt?: Date;
  /** 배정 24시간 전 리마인드 발송권 만료 시각 */
  sessionStartReminder24hClaimLeaseUntil?: Date;
  /** 마감/기각 후속 처리 진행 중 여부 */
  finalizationPending?: boolean;
  /** 후속 처리 종류 */
  finalizationKind?: SessionFinalizationKind;
  /** 최초 시작 원인. 재시작·재시도에서도 변경하지 않습니다. */
  finalizationTrigger?: SessionFinalizationTrigger;
  /** 취소 시작 시 전달된 사유. null도 의도된 값으로 보존합니다. */
  finalizationCancelReason?: string | null;
  /** 후속 처리 수명주기별 고유 키. 로그 멱등 키로 사용합니다. */
  finalizationOperationKey?: string;
  /** 원본 공지 수정 완료 여부 */
  finalizationAnnouncementDone?: boolean;
  /** 마감 확정·기각 결과 공지 메시지 ID */
  finalizationResultMessageId?: string;
  /** Discord 결과 공지 전달 상태 */
  finalizationDeliveryState?: SessionFinalizationDeliveryState;
  /** DELIVERY_UNKNOWN 전환 시 마지막으로 관찰한 Discord 메시지 ID */
  finalizationDeliveryObservedMessageId?: string;
  /** 전달 상태를 운영 조정 대상으로 전환한 시각 */
  finalizationDeliveryUnknownAt?: Date;
  /** 자동 재개를 중단한 원인 */
  finalizationReconciliationReason?: SessionFinalizationReconciliationReason;
  /** 운영 로그 기록 완료 여부 */
  finalizationLogDone?: boolean;
  /** 후속 처리를 요청한 사용자 ID */
  finalizationRequestedBy?: string;
  /** 후속 처리 시작 시각 */
  finalizationRequestedAt?: Date;
}

/** DB에 저장되는 응답 문서 */
export interface SessionResponse {
  _id?: string;
  sessionId: string;
  userId: string;
  status: ResponseStatus;
  /** 응답 시점의 디스코드 표시명 (서버 닉네임 우선, 없으면 유저명) */
  displayName?: string;
  respondedAt: Date;
  updatedAt: Date;
}

/** 집계 수 (임베드 갱신용) */
export interface ResponseCounts {
  yes: number;
  no: number;
}
