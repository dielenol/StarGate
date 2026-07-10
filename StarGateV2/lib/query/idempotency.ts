const actionKeys = new WeakMap<object, Map<string, string>>();

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
