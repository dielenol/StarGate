/**
 * 같은 컨테이너에서 도는 bgutil POT provider 의 응답 여부 확인 (운영 알림 진단용)
 *
 * provider 가 죽으면 PO token 이 필요한 폴백 player client 가 403 을 받는다. 알림에
 * 주소만 실으면 살아 있다고 오해하기 쉬워 `/ping` 응답까지 함께 싣는다.
 *
 * @module music/pot-provider
 */

import { getPotProviderBaseUrl } from "./youtube-source.js";

const POT_PING_TIMEOUT_MS = 2_000;

type FetchLike = (
  input: URL,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * POT provider 상태를 사람이 읽을 한 줄로 돌려준다.
 * 예: `http://127.0.0.1:4416 · 응답함 v1.3.1`, `… · 응답 없음`, `미설정`
 */
export async function describePotProvider(
  fetchImpl: FetchLike = fetch,
  baseUrl: string | null = getPotProviderBaseUrl(),
): Promise<string> {
  if (!baseUrl) return "미설정";
  try {
    const response = await fetchImpl(new URL("/ping", `${baseUrl}/`), {
      signal: AbortSignal.timeout(POT_PING_TIMEOUT_MS),
    });
    if (!response.ok) return `${baseUrl} · 응답 오류 HTTP ${response.status}`;
    const body = (await response.json().catch(() => null)) as {
      version?: unknown;
    } | null;
    const version =
      typeof body?.version === "string" ? ` v${body.version}` : "";
    return `${baseUrl} · 응답함${version}`;
  } catch {
    return `${baseUrl} · 응답 없음`;
  }
}
