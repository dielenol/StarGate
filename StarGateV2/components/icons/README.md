# NOVUS Icon Set

StarGateV2 프로젝트 전용 커스텀 SVG 아이콘 세트. 전체 30개 아이콘으로 구성되며, 기존 유니코드 문자(◈, ⚔, ☰ 등) 대신 일관된 외형의 NOVUS 테마 라인 아이콘으로 통일한다.

## 개요

- **총 30개 아이콘** (ERP 10 / Public 8 / Nav 9 / Deco 3)
- **스타일**: Stroke-based 라인 아이콘 (stroke-width 1.5, 24×24 viewBox)
- **색상**: `currentColor` 상속 — 부모 `color` 속성으로 제어
- **접근성**: `aria-hidden="true"` 기본 (장식 용도). 의미가 필요하면 `aria-label` 오버라이드

### 카테고리

| 카테고리 | 개수 | 용도 |
|----------|------|------|
| ERP | 10 | 사이드바, ERP 대시보드 (Dashboard, Session, Character, Wiki, Credit, Equipment, Notification, Profile, UserAdmin, Members) |
| Public | 8 | 공개 랜딩 네비게이션 (Archive, Apply, Contact, World, Player, Notes, Rules, System) |
| Nav | 9 | UI 컨트롤 (Menu, Close, ChevronUp/Down/Right/Left, ArrowLeft/Right, Return) |
| Deco | 3 | 장식 요소 (Divider, Bullet, Crown) |

## 구조

| 유형 | 위치 | 규칙 | 예시 |
|------|------|------|------|
| SVG 원본 | `public/assets/svg/` | `ic_<kebab-case>.svg` | `ic_chevron-left.svg` |
| Barrel export | `components/icons/index.ts` | `Icon<PascalCase>` | `IconChevronLeft` |

SVG 원본은 **단일 소스**로 `public/assets/svg/`에 있으며, Next.js Turbopack SVGR 규칙(`next.config.ts`)을 통해 **React 컴포넌트로 직접 import**된다. 별도 `.tsx` 래퍼는 없고, `components/icons/index.ts`가 각 SVG를 `Icon*` 이름으로 re-export하는 barrel 역할만 한다.

```ts
// components/icons/index.ts 에서
export { default as IconDashboard } from "@/public/assets/svg/ic_dashboard.svg";
```

`viewBox`, `stroke="currentColor"`, `aria-hidden` 등 기본 속성은 **SVG 파일 자체에 명시**되어 있으므로 런타임 초기화 코드 없이 바로 사용 가능.

## 사용 예시

### 기본 import

```tsx
import { IconDashboard, IconChevronRight } from '@/components/icons'

export function MyComponent() {
  return (
    <button>
      <IconDashboard />
      대시보드 이동
      <IconChevronRight />
    </button>
  )
}
```

### 크기/색상 제어 (CSS)

컴포넌트는 `currentColor`와 기본 24×24 크기를 사용하므로, **부모 선택자에서 제어**하는 것이 권장 패턴이다.

```css
/* MyComponent.module.css */
.button {
  color: var(--color-ink);
  font-size: 14px;
}

.button svg {
  width: 16px;
  height: 16px;
}

.button:hover svg {
  color: var(--color-accent);
}
```

### Props 오버라이드 (인라인)

단발성 스타일이 필요하면 props로 직접 지정 가능:

```tsx
<IconDashboard width={32} height={32} style={{ color: '#ff0000' }} />
<IconChevronDown className={styles.chevron} aria-hidden />
```

SVGR로 생성된 컴포넌트는 `SVGProps<SVGSVGElement>`를 받으며, 호출부 props가 SVG 파일 속성을 오버라이드한다.

## Props API

```ts
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>
```

SVG 파일에 박혀 있는 기본값 (파일별로 동일):

```text
xmlns         = "http://www.w3.org/2000/svg"
viewBox       = "0 0 24 24"
fill          = "none"
stroke        = "currentColor"
stroke-width  = "1.5"
stroke-linecap = "round"
stroke-linejoin = "round"
width / height = 24
aria-hidden   = "true"
```

자주 쓰는 override:
- `width`, `height` — 직접 크기 지정 (CSS 제어 선호)
- `className` — 스타일 클래스 부여
- `aria-label`, `aria-hidden` — 접근성 제어
- `style` / `color` — 인라인 색상 (CSS 변수 선호)

### 접근성: `aria-hidden`과 `aria-label` 주의

SVG 파일에 `aria-hidden="true"`가 기본 세팅되어 있다. 아이콘 자체에 의미를 부여하려면 `aria-label`만 주는 것으로는 부족하고, `aria-hidden={false}`도 함께 명시해야 한다. 일반적으로는 **부모 요소(예: `<button>`)에 `aria-label`을 주고 아이콘은 `aria-hidden` 기본값을 유지**하는 패턴을 권장한다.

```tsx
// 권장: 부모 버튼에 label, 아이콘은 숨김
<button aria-label="닫기"><IconClose /></button>

// 비권장: 아이콘 자체에 label만 주면 AT가 읽지 못함
<IconClose aria-label="닫기" />  {/* aria-hidden이 이김 */}

// 꼭 아이콘 자체에 label을 줘야 한다면
<IconClose aria-label="닫기" aria-hidden={false} />
```

## 크기 가이드

| 용도 | 권장 크기 |
|------|-----------|
| 사이드바 항목 | 16px |
| 인라인 텍스트 앞 | 14–16px |
| 버튼 아이콘 (작은) | 16px |
| 버튼 아이콘 (중간) | 20–24px |
| 햄버거/닫기 모바일 UI | 20–24px |
| 섹션 확장 chevron | 12–14px |
| 장식 Divider | 16–24px (상황별) |
| CTA 대형 강조 | 24–32px |

## 신규 아이콘 추가 절차

1. **SVG 원본 저장** — `public/assets/svg/ic_<kebab-case>.svg`
   - viewBox 0 0 24 24, `stroke="currentColor"`, `stroke-width="1.5"` 기준 유지
   - `aria-hidden="true"` 기본 세팅
   - 속성명은 kebab-case (HTML 기준) — SVGR이 JSX 변환 시 camelCase로 자동 변환
2. **barrel export 추가** — `components/icons/index.ts`에 알파벳 순서로
   ```ts
   export { default as IconNew } from "@/public/assets/svg/ic_new.svg";
   ```
3. **README 카테고리 표 업데이트**

## 미매핑 목록 (향후 세트 확장 필요)

현재 세트에 포함되지 않아 유니코드가 유지되는 항목:

- `⚠` 경고 아이콘 — Keyring survey의 `app/(standalone)/survey/keyring/page.tsx`에서 사용 중. NOVUS 세트에 경고 아이콘이 없어 유지. 경고 의미 아이콘이 추가로 필요할 때 `IconWarning`으로 확장 검토
- `█` 검열 블록 — `app/(erp)/erp/personnel/[id]/DossierClient.tsx`의 검열 효과용 문자. 아이콘이 아니므로 교체 대상 아님
- CSS pseudo-element bullet — `\25C9`, `\2022` 등. JSX 구조 변경 없이 교체 불가하므로 현재 범위 외
