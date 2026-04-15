# Git 커밋 컨벤션

## 기본 형식

```
<type>(<scope>): <한국어 제목>

* 본문 불릿 1
* 본문 불릿 2
```

- 제목/본문: **한국어** 사용. 기술 용어, 변수명, 함수명은 영어 허용
- 본문은 불릿 포인트(`*`)로 작성
- 자동 서명 금지 (Co-Authored-By 등 추가하지 않음)

## type

| type | 용도 | 예시 |
|------|------|------|
| `feat` | 새 기능(로직) 추가 | `feat(novusweb): 특정 서비스 list API 추가` |
| `fix` | 버그 수정 | `fix(registra): 누락된 파라미터 추가` |
| `refactor` | 외부 동작 변화 없는 구조 개선, 디버그 코드 제거 | `refactor(trbot): 사용하지 않는 함수 제거` |
| `style` | 코드 스타일 수정 (포매팅, 세미콜론 등) | `style: indent 수정` |
| `build` | 빌드 프로세스, 툴, 라이브러리, 버전 변경 | `build: lodash 추가` |
| `ci` | CI 설정 파일, 스크립트 변경 | `ci: 배포 스크립트 변경` |
| `docs` | 문서 및 코드 주석 수정 | `docs: readme 문서에 실행 방법 추가` |
| `perf` | 성능 개선 | `perf: 불필요한 array 탐색 제거` |
| `test` | 테스트 케이스 추가 | `test: 전문교정 채팅 테스트 추가` |

- 그 외 타입은 [Angular Commit Message Guidelines](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md) 참조

## scope

| scope | 대상 디렉토리 |
|-------|--------------|
| `registra` | `registra-bot` |
| `trbot` | `trpg-bot` |
| `novusweb` | `StarGateV2` |
| `all` | 여러 app에 영향을 미치는 변경 |
| 기타 | 해당 서비스/도메인 축약어 |

## 브랜치

### Main branches (2-tier)
- `main` — 프로덕션
- `develop` — 개발 통합

### Feature / Hotfix branches
- `feature/<기능명>` — 신규 기능, 리팩토링 등 일반 작업
- `hotfix/<기능명>` — 프로덕션 긴급 수정
