/**
 * 확장 프로그램이 주입한 인라인 `user-select` 선언 제거 스크립트.
 *
 * 우클릭·드래그 허용류 브라우저 확장은 hydration 전에 모든 요소의 style 속성에
 * `user-select: auto`를 CSSOM으로 써 넣는다. 그러면 React가 SSR 원본과 다른 style
 * 속성을 보고 모든 페이지에서 hydration mismatch 경고를 낸다(개발 오버레이 "N Issue").
 *
 * CSSOM 쓰기는 기존 선언까지 재직렬화하므로("color:transparent" → "color: transparent;")
 * user-select 선언만 도려내도 원본과 바이트가 달라진다. 그래서 MutationRecord.oldValue로
 * 주입 직전 원본 문자열을 요소별로 기억했다가 그대로 복원하고, 원본을 모르는 요소
 * (이 스크립트보다 먼저 파싱된 요소)만 선언 제거로 처리한다.
 * - `user-select: none`은 앱의 의도로 보고 건드리지 않는다. 그 밖의 인라인 user-select 값은 관찰 중 제거 대상이다.
 * - 확장이 복원 직후 다시 주입하면 두 observer가 마이크로태스크 루프를 돌아 탭이 멈추므로 요소당
 *   복원 횟수를 제한한다. 상한에 걸린 요소는 주입이 남아 mismatch 경고가 날 수 있다.
 * - 관찰은 hydration이 끝났을 DOMContentLoaded 후 3초까지만 유지하고, 해제 후에는 아무것도 하지 않는다.
 * - 알려진 한계: 관찰 중 같은 태스크에서 주입 직후 앱이 같은 요소의 style을 바꾸면 그 갱신은 주입 전 값으로 되돌아간다.
 *
 * 본문은 String.raw다 — 정규식 백슬래시는 한 번만 쓰고, `${`와 백틱은 쓰지 않는다.
 * StarGateV2의 `lib/runtime/strip-injected-user-select.ts`와 같은 내용이다. 수정 시 함께 갱신한다
 * (`tests/runtime/strip-injected-user-select.test.mjs`가 두 사본의 동일성을 검사한다).
 */
export const STRIP_INJECTED_USER_SELECT_SCRIPT = String.raw`
(() => {
  const USER_SELECT_PATTERN =
    /(?:^|;)\s*(?:-webkit-|-ms-)?user-select\s*:(?!\s*none\b)[^;]*/i;
  const USER_SELECT_DECLARATION =
    /(?:^|;)\s*(?:-webkit-|-ms-)?user-select\s*:(?!\s*none\b)[^;]*/gi;
  const MAX_RESTORES_PER_ELEMENT = 5;
  // 요소별 SSR 원본 style 문자열 (null = 원래 style 속성 없음)
  const pristine = new WeakMap();
  const restoreCount = new WeakMap();

  const isInjected = (style) =>
    typeof style === "string" && USER_SELECT_PATTERN.test(style);

  const remember = (element) => {
    const style = element.getAttribute("style");
    if (!isInjected(style)) pristine.set(element, style);
  };

  const restore = (element) => {
    const style = element.getAttribute("style");
    if (!isInjected(style)) return;

    const count = restoreCount.get(element) ?? 0;
    if (count >= MAX_RESTORES_PER_ELEMENT) return;
    restoreCount.set(element, count + 1);

    const original = pristine.has(element)
      ? pristine.get(element)
      : style.replace(USER_SELECT_DECLARATION, "").replace(/^\s*;\s*/, "");

    if (original === null || !original.trim()) {
      element.removeAttribute("style");
    } else if (original !== style) {
      element.setAttribute("style", original);
    }
  };

  const forEachStyled = (root, callback) => {
    if (!(root instanceof Element)) return;
    callback(root);
    root.querySelectorAll("[style]").forEach(callback);
  };

  const observer = new MutationObserver((records) => {
    const touched = new Set();
    for (const record of records) {
      if (record.type === "attributes") {
        const element = record.target;
        if (!(element instanceof Element)) continue;
        const current = element.getAttribute("style");
        if (!isInjected(current)) {
          // React 등 정상 갱신 — 현재 값이 최신 원본
          pristine.set(element, current);
        } else if (!isInjected(record.oldValue)) {
          // 주입 직전 값이 원본
          pristine.set(element, record.oldValue);
        }
        touched.add(element);
        continue;
      }
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        forEachStyled(node, (element) => {
          remember(element);
          touched.add(element);
        });
      });
    }
    touched.forEach(restore);
  });

  forEachStyled(document.documentElement, (element) => {
    remember(element);
    restore(element);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style"],
    attributeOldValue: true,
    childList: true,
    subtree: true,
  });

  const scheduleStop = () => window.setTimeout(() => observer.disconnect(), 3000);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleStop, { once: true });
  } else {
    scheduleStop();
  }
})();
`;
