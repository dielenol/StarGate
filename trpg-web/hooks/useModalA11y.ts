"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface ScrollLockTarget {
  style: { overflow: string };
}

/**
 * 열린 모달의 스택과 body 스크롤 잠금을 한곳에서 관리한다.
 * - 맨 위 모달만 키 입력을 처리한다 — 딥링크(`?sessionId=…&google=connected`)로
 *   상세 모달과 Google 설정 모달이 동시에 열려도 아래 모달이 Tab/Escape 를 가로채지 않는다.
 * - 스크롤 잠금은 첫 모달이 열릴 때 원래 값을 저장하고 마지막 모달이 닫힐 때만 복원한다.
 *   닫히는 순서나 StrictMode 의 이중 실행과 무관하게 잠금이 남지 않는다.
 * - 스택 순서는 마운트 순서다. dev 의 Fast Refresh 로 아래 모달의 effect 만 재실행되면
 *   화면 순서와 잠시 뒤집힐 수 있다(모달을 닫으면 풀리고, prod 에는 없는 경로).
 */
export function createModalRegistry() {
  const stack: symbol[] = [];
  let savedOverflow = "";

  return {
    open(id: symbol, body: ScrollLockTarget) {
      if (stack.length === 0) {
        savedOverflow = body.style.overflow;
        body.style.overflow = "hidden";
      }
      stack.push(id);
    },
    close(id: symbol, body: ScrollLockTarget) {
      const index = stack.lastIndexOf(id);
      if (index === -1) return;
      stack.splice(index, 1);
      if (stack.length === 0) body.style.overflow = savedOverflow;
    },
    isTop(id: symbol) {
      return stack[stack.length - 1] === id;
    },
  };
}

const registry = createModalRegistry();

interface UseModalA11yOptions {
  /** `role="dialog"` 요소 — 포커스 트랩 범위. */
  dialogRef: RefObject<HTMLElement | null>;
  /** 열릴 때 포커스할 요소. 없으면 다이얼로그 안의 첫 포커스 가능 요소. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Escape 로 닫을 때 호출. 매 렌더 새 함수여도 효과는 재실행되지 않는다. */
  onClose: () => void;
}

/**
 * 모달 공통 접근성 동작. 모달 컴포넌트가 마운트된 동안:
 * - Escape → onClose (IME 조합 취소용 Escape 는 무시)
 * - Tab / Shift+Tab 이 다이얼로그 밖으로 나가지 않게 순환 (포커스 트랩)
 * - 열릴 때 initialFocusRef(없으면 첫 포커스 가능 요소)에 포커스
 * - body 스크롤 잠금, 마지막 모달이 닫힐 때 이전 값으로 복원
 * - 언마운트 시 열기 전에 포커스돼 있던 요소로 복귀
 */
export function useModalA11y({
  dialogRef,
  initialFocusRef,
  onClose,
}: UseModalA11yOptions): void {
  const requestClose = useEffectEvent(onClose);

  useEffect(() => {
    const id = Symbol("modal");
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;
    registry.open(id, document.body);

    const initialTarget =
      initialFocusRef?.current ??
      dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      null;
    initialTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveModalKeyAction(event, registry.isTop(id));
      if (action === "close") {
        requestClose();
        return;
      }
      if (action !== "tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const next = resolveTabTarget(
        focusable,
        document.activeElement,
        event.shiftKey,
      );
      if (!next) return;
      event.preventDefault();
      next.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      registry.close(id, document.body);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [dialogRef, initialFocusRef]);
}

export type ModalKeyAction = "close" | "tab" | null;

/**
 * 키 입력을 이 모달이 처리해야 하는지 판정한다. 맨 위 모달이 아니거나 이미 처리된 이벤트,
 * 한글 IME 조합 중의 입력(조합 취소용 Escape — Safari 는 keyCode 229 로만 구분된다)은 무시한다.
 */
export function resolveModalKeyAction(
  event: Pick<
    KeyboardEvent,
    "key" | "isComposing" | "keyCode" | "defaultPrevented"
  >,
  isTop: boolean,
): ModalKeyAction {
  if (!isTop || event.defaultPrevented) return null;
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.key === "Escape") return "close";
  if (event.key === "Tab") return "tab";
  return null;
}

/**
 * Tab 키로 옮겨야 할 포커스 대상. 트랩 안의 자연 이동이면 null 을 돌려줘
 * 브라우저 기본 동작에 맡긴다. 포커스가 목록 밖에 있으면 첫/마지막 요소로 끌어온다.
 */
export function resolveTabTarget<T>(
  focusable: readonly T[],
  active: unknown,
  shiftKey: boolean,
): T | null {
  if (focusable.length === 0) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const index = focusable.indexOf(active as T);
  if (index === -1) return shiftKey ? last : first;
  if (shiftKey && index === 0) return last;
  if (!shiftKey && index === focusable.length - 1) return first;
  return null;
}
