# StarGateV2 Adaptive Task Router

이 파일은 상위 `AGENTS.md`를 보완하며 `StarGateV2/` 작업에만 적용한다.

## Runtime Boundary

- 프로젝트 기본 모델/추론은 `.codex/config.toml`의 `gpt-5.6-sol` + `high`다.
- 이 값은 새 로컬 태스크의 기본값이다. 사용자가 composer, `/model`, CLI flag, `--config`로 명시한 현재 태스크 설정을 바꿨다고 주장하지 않는다.
- config와 custom agent 변경은 새 태스크에서 확실히 적용된다. 이미 열린 태스크가 hot reload됐다고 가정하지 않는다.
- 이 중첩 설정은 trusted 상태에서 태스크의 workspace/cwd가 `StarGateV2/` 또는 그 하위일 때 적용된다. 모노레포 루트 `StarGate/`에서 시작한 태스크에는 적용됐다고 가정하지 않는다.
- 현재 태스크가 `Ultra`면 루트 에이전트는 `Ultra`로 유지된다. 아래 라우터는 작업 분류, 검증 강도, delegation, 하위 에이전트 모델만 조절한다.
- `Ultra`는 병렬화 여유이지 모든 작업에 subagent를 만들라는 지시가 아니다. 사소한 수정은 루트가 직접 처리한다.
- 모델을 낮추기 위한 목적만으로 작은 작업을 subagent에 넘기지 않는다. subagent 자체도 추가 토큰과 통합 비용을 사용한다.

## Classification

비자명한 작업을 시작할 때 첫 commentary에 `lane`, `risk`, 최소 구현 경로, 검증 증거를 짧게 밝힌다.

### Lanes

| lane | 대상 | 기본 라우팅 |
|---|---|---|
| `design-publishing` | 기능 기반 UI, CSS Modules, 반응형, 브라우저 퍼블리싱 | 경계가 명확한 구현은 `stargate_ui_publisher` |
| `gameplay-feature` | 캐릭터, 편의점, 인벤토리, 주식, 장비 등 웹게임 기능 | 다계층 기능은 `stargate_gameplay_engineer` |
| `lore-data` | 로어 조회/생성, 로그 ingestion, spec/payload, DB/ERP 동기화 | 먼저 `stargate-lore` skill을 적용하고 `stargate_lore_curator`는 읽기·정리·충돌 감사에 사용 |
| `refactor-performance` | 전역 구조 개선, DB/Query/렌더링 성능 감사 | 조사 단계는 `stargate_performance_auditor`; 구현은 루트가 작은 배치로 수행 |

### Risk

- `routine`: 결과가 명확하고 단일 화면/파일 중심이며 영속 상태나 권한을 바꾸지 않는다.
- `standard`: UI, API, DB, Query 중 둘 이상의 계층을 연결하지만 기존 불변 조건을 유지한다.
- `critical`: auth/RBAC, credits, inventory 수량, stocks, 구매/환불, DB/schema/index/migration/seed, concurrency/idempotency, optimistic rollback, 비공개 데이터를 건드린다.
- `wide`: 서로 다른 파일 소유권과 검증 기준을 가진 독립 lane이 둘 이상이다.
- `inseparable`: 하나의 상태 불변 조건이나 canon 판정에 모든 근거가 강하게 결합된다.

`critical` 변경은 구현 뒤 `stargate_risk_reviewer`의 읽기 전용 리뷰를 거친다. migration, seed, live DB, economy mutation은 dry-run 또는 실행 직전 상태까지만 구현한다. 실제 라이브 실행은 상위 `AGENTS.md`의 **라이브 운영 권한 경계**에 따라 정확한 대상과 mutation에 대한 별도 명시 승인을 받은 경우에만 수행하고, 실행 뒤 DB 재조회와 후속 검증을 진행한다. risk review 통과나 사용자의 일반적인 권한 범위는 라이브 실행 승인을 대신하지 않는다. `wide`만 병렬화하며 최대 3개 하위 작업으로 나누고 파일 소유권을 겹치지 않게 한다. `inseparable`은 병렬 구현하지 않고 루트가 순차적으로 해결한다.

## Delegation Rules

- 각 custom agent에는 목표, 허용 파일, 금지 범위, 기대 결과, 검증 명령을 전달한다.
- custom agent가 보이지 않거나 spawn이 실패하면 루트가 같은 관점을 로컬로 수행하고 fallback 사실을 보고한다. 모델이 전환됐다고 주장하지 않는다.
- `stargate_ui_publisher`와 `stargate_gameplay_engineer`가 파일을 수정하는 동안 루트나 다른 agent가 같은 파일을 수정하지 않는다.
- `stargate_lore_curator`, `stargate_performance_auditor`, `stargate_risk_reviewer`는 읽기 전용이다. 최종 판정과 쓰기는 루트가 담당한다.
- custom agent의 `sandbox_mode = "read-only"`는 방어층이지 절대 경계가 아니다. 부모 태스크의 live permission override가 재적용될 수 있으므로 위임 프롬프트에도 쓰기 금지를 명시하고 루트가 결과와 git diff를 확인한다.
- lore의 canon 충돌은 병렬 다수결로 결정하지 않는다. 독립 추출 후 루트가 출처 등급과 기존 canon을 함께 보고 병합한다.
- 성능 최적화는 측정 없는 추측성 `useMemo`, cache, index 추가로 완료하지 않는다.

## Verification Matrix

- `design-publishing`: `pnpm typecheck`, `pnpm lint`, 영향 viewport의 인증된 브라우저 확인. dev server를 시작했다면 콘솔 오류도 확인한다.
- `gameplay-feature`: 관련 테스트, `pnpm typecheck`, `pnpm lint`; API/DB 경계 변경은 필요 시 `pnpm build`. mutation 후 캐시, 재진입, 중복 요청, 실패 복구를 확인한다.
- `lore-data`: `stargate-lore` verification gates를 그대로 따른다. schema/payload 검증, 쓰기 후 DB 재조회, ERP graph/link/image consumer 확인을 생략하지 않는다.
- `refactor-performance`: 변경 전 baseline과 성공 기준을 먼저 기록하고, 변경 후 동일 지표와 `pnpm typecheck`, `pnpm lint`, 필요 시 `pnpm build`를 비교한다.

추론 강도나 agent 리뷰는 테스트, DB 재조회, 브라우저 관찰, 성능 측정을 대체하지 않는다.

## Authenticated Browser QA

- 로컬 ERP 인증 브라우저 테스트는 `http://localhost:3000`을 사용한다. `AUTH_URL`과 쿠키 호스트가 달라지는 `127.0.0.1`은 사용하지 않는다.
- 테스트 계정 값은 Git 비추적 파일인 `.env.local`의 `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD`에서 읽는다. 기준 주소는 `E2E_TEST_BASE_URL`을 사용한다.
- 테스트 자격증명, 해시, URI를 명령 인자·로그·스크린샷·커밋·대화 응답에 출력하지 않는다.
- 계정은 인증 UI 검증용 GM 테스트 계정이다. 메인 캐릭터·크레딧·인벤토리·경제 상태가 필요하면 기존 데이터를 임의 생성하지 말고 `critical` 변경 절차와 사용자 범위를 다시 확인한다.
