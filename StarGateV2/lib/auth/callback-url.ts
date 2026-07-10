/**
 * 로그인 콜백 URL 화이트리스트 검증.
 *
 * `/erp` 하위 경로만 허용. 외부 URL / protocol-relative / 비-내부 경로는 모두 `/erp` 로 폴백.
 *
 * - middleware 가 unauth redirect 시 set 한 callbackUrl 을 login page 가 받아 검증 후 사용한다.
 * - 단일 출처 (`lib/auth`) 에 두어 middleware 와 login page 가 같은 정책을 공유한다.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/erp";
  if (typeof raw !== "string") return "/erp";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/erp";

  try {
    // WHATWG URL은 역슬래시를 슬래시로 정규화하므로, 검증 전에 거부한다.
    if (raw.includes("\\")) return "/erp";
    const base = new URL("https://stargate.invalid");
    const parsed = new URL(raw, base);
    if (parsed.origin !== base.origin) return "/erp";
    if (parsed.pathname !== "/erp" && !parsed.pathname.startsWith("/erp/")) {
      return "/erp";
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/erp";
  }
}
