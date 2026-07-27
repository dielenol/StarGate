const actionKeys = new WeakMap<object, Map<string, string>>();

export interface RetainedIdempotencyOperation {
  fingerprint: string;
  key: string;
}

/**
 * TanStack Query 재시도는 같은 variables 객체를 다시 전달한다. 사용자 액션 객체별로
 * 생성한 키를 보관해 네트워크 재시도에도 동일한 Idempotency-Key를 재사용한다.
 */
export function createIdempotencyKey(
  domain: string,
  action?: object,
): string {
  if (!action) return `${domain}:${crypto.randomUUID()}`;

  let keys = actionKeys.get(action);
  if (!keys) {
    keys = new Map();
    actionKeys.set(action, keys);
  }

  const existing = keys.get(domain);
  if (existing) return existing;

  const created = `${domain}:${crypto.randomUUID()}`;
  keys.set(domain, created);
  return created;
}

/**
 * 서버 commit 뒤 응답이 유실된 경우에도 사용자가 같은 payload를 다시 제출하면
 * 동일한 key를 재사용한다. payload가 바뀌거나 성공한 key를 명시적으로 지울 때만
 * 새 operation을 만든다.
 */
export function retainIdempotencyOperation(
  current: RetainedIdempotencyOperation | null,
  domain: string,
  fingerprint: string,
): RetainedIdempotencyOperation {
  if (current?.fingerprint === fingerprint) return current;
  return {
    fingerprint,
    key: `${domain}:${crypto.randomUUID()}`,
  };
}

export function clearRetainedIdempotencyOperation(
  current: RetainedIdempotencyOperation | null,
  completedKey: string,
): RetainedIdempotencyOperation | null {
  return current?.key === completedKey ? null : current;
}
