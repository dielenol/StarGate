# 제노 관계형 샘플 연구소 v2 실행 원장

- 문서 상태: `VERIFIED`
- 최초 작성: 2026-08-10 (Asia/Seoul)
- 대상 route: `/erp/research`
- 작업 lane / risk: `wide / critical`
- 라이브 운영 상태: 코드·로컬 테스트만 허용. 운영 DB index, master item, 크레딧, 인벤토리, worker 활성화는 별도 승인 전 실행 금지.

이 문서는 제노 관계형 샘플 연구소 v2의 유일한 실행 기준이다. 각 구현 배치를 시작할 때 이 문서를 다시 읽고, 작업 결과와 검증 증거를 아래 진행 원장에 갱신한다. 대화 내부 기억이나 이전 임시 계획을 구현 근거로 사용하지 않는다.

## 근거와 우선순위

1. 현재 사용자 확정 계획
2. `docs/spec/npc/doctor-zeno.md`
3. `NOSB 6 part 1.pdf`의 S1E6 제노 대사·행동
4. 기존 catalog spec과 공용 인벤토리의 정확한 slug
5. 기존 `/erp/research` v1 구현과 작업 이력

`doctor-zeno.md`는 제노의 신원·소속·등급·관계 SSOT다. `xeno-research-guide-candidate.md`의 blocked 신원 항목과 `immediate-action-plan-2026-08-05.md`의 GM 즉시 연구 규칙은 v1 역사 기록으로만 보존한다.

## 확정 연구 레시피

| recipeId | 공용 제출물 | 산출물 | 최초 연구 | 반복 생산 | 가격 |
|---|---|---|---:|---:|---:|
| `ZULU_0028` | `zulu-0028-contained-entity` ×1 | `broken-syllable` ×1 | 24시간 | 6시간 | 500 CR |
| `ZULU_0040` | `zulu-0040-crown-specimen` ×1 | `zulu-0040-crown-mycelium-fragment` ×1 | 24시간 | 6시간 | 500 CR |
| `INVERTED_SOCK` | `inverted-sock-contained-entity` ×1 | `aurora-virus-black-smoke-sample` ×1 | 24시간 | 6시간 | 500 CR |

`ZULU_0040`의 분리·반복생산 절차와 `INVERTED_SOCK`의 산출물 연결은 게임 기능 `design-proposal`이다. 특히 뒤집어진 양말에서 검은 연기를 직접 추출했다고 서술하지 않으며, 기존 `aurora-virus-black-smoke-sample`의 피펫 현장 채취 provenance를 변경하지 않는다.

- 연구선 상태: `LOCKED → INITIAL_RESEARCH → OPEN`
- 기존 산출물 수량은 연구 해금 근거가 아니다.
- 최초 연구 시작 권한은 활성 메인 캐릭터 중 `play.className === "과학자"`인 캐릭터에게만 있다. GM 우회 경로는 만들지 않는다.
- 최초 완료 산출물은 공용 인벤토리에 자동 지급한다.
- 연구선별로 하나의 전역 FIFO를 사용하며 최대 세 연구선이 병렬 동작한다.
- 반복 요청 등록 시 500 CR을 즉시 차감하고 `SHARED | CHARACTER` 수령처를 고정한다.
- 캐릭터당 연구선별 미완료 요청은 하나만 허용한다.
- `QUEUED`만 취소·전액 환불할 수 있고 `RUNNING` 이후에는 취소할 수 없다.
- `SHARED`는 완료 즉시 지급한다. `CHARACTER`는 `CLAIMABLE` 이후 6시간 안에 본인이 수령하며, 미수령 시 공용으로 전환한다.

## 상태 전이

```text
최초: LOCKED --과학자 제출--> INITIAL_RESEARCH/RUNNING --24h--> OPEN/COMPLETED + 공용 산출물 1

반복 공용: QUEUED --> RUNNING --6h--> COMPLETED + 공용 산출물 1 --> 다음 FIFO
반복 개인: QUEUED --> RUNNING --6h--> CLAIMABLE --본인 수령--> COMPLETED + 개인 산출물 1 --> 다음 FIFO
                                             \--6h 미수령--> DIVERTED_SHARED + 공용 산출물 1 --> 다음 FIFO
취소: QUEUED --본인 취소--> CANCELLED + 500 CR 멱등 환불
```

## 관계 점수 계약

숫자 `-100..100`은 서버에만 저장하고 API·클라이언트 캐시에는 정성 상태만 반환한다.

| 범위 | 상태 | 사용자 문구 |
|---:|---|---|
| -100~-76 | `CONTEMPT` | 노골적인 경멸을 숨기지 않는다 |
| -75~-51 | `HOSTILE` | 적의를 품고 있는 듯하다 |
| -50~-26 | `DISPLEASED` | 심하게 못마땅해한다 |
| -25~-6 | `COLD` | 차갑게 선을 긋는다 |
| -5~5 | `NEUTRAL` | 별다른 관심이 없어 보인다 |
| 6~25 | `OBSERVING` | 관찰할 가치는 있다고 보는 듯하다 |
| 26~50 | `ACKNOWLEDGED` | 능력을 조금은 인정한다 |
| 51~75 | `FAVORABLE` | 드물게 호의를 보인다 |
| 76~100 | `DELIGHTED` | 꽤 만족한 듯 웃고 있다 |

초기값은 한 번만 계산한다.

- 직군: 과학자 `+20`, 관료 `0`, 군인 `-10`, 실험체 `-35`, 기타 `-15`
- 등급: V `+10`, A `+7`, M `+4`, H `0`, G `-4`, J `-7`, U `-10`
- 세션 우선값: `MARGARET -80`, `PIPETTE -55`, `INDEXER -35`
- 고정 선택지만 `-8..+5`를 한 번 반영한다. 자유대화·결제·생산은 관계 점수를 바꾸지 않는다.
- 관계는 말투·호칭·표정·서사 선택지만 바꾸고 가격·시간·수령 자격에는 영향을 주지 않는다.

## 제노 대화 계약

- 직군·등급·현재 정성 관계 상태·공개 성격 태그·연구 상태를 대사 문맥으로 사용한다.
- 피펫·인덱서·마가렛은 S1E6의 관계를 일반 직군 규칙보다 우선한다.
- 세션 근거가 있는 core voice와 3인 override는 `session-confirmed`, 직군·등급·호의 상태별 변화는 `design-proposal`로 구분한다.
- 피펫 대상의 성차별 발언은 일반 생성 규칙으로 확장하지 않고, 마가렛의 예고된 수술을 완료 사실로 생성하지 않는다.
- 거래·오류·상태 대사는 모두 고정 대사로 제공하고, Ollama는 선택형 자유대화에만 사용한다.
- Ollama 서버 환경: `OLLAMA_API_KEY`, `OLLAMA_NPC_MODEL` 기본 `qwen3.5:397b-cloud`.
- 캐릭터당 KST 일 30회, 5초 cooldown, 입력 300자, 출력 220자, timeout 12초.
- 응답은 일반 한국어 문자열만 허용한다. key 부재·429·timeout·비정상 응답은 고정 대사로 복구한다.
- 대화 기억은 장기 요약 + 최근 20개 메시지다. 10회마다 비동기 요약하며 실패 시 최대 40개까지 보존한다.
- Ollama에 비공개 캐릭터 문서, DB 접근, 도구 호출 권한을 제공하지 않는다.

## 데이터·API 계약

### 컬렉션

- `research_lab_lines`
- `research_lab_jobs`
- `npc_relationships`
- `npc_relationship_events`
- `npc_conversations`

### 공개 enum

- `ResearchRecipeId`
- `ResearchLineStatus = LOCKED | INITIAL_RESEARCH | OPEN`
- `ResearchJobStatus = QUEUED | RUNNING | CLAIMABLE | COMPLETED | CANCELLED | DIVERTED_SHARED`
- `ResearchDestination = SHARED | CHARACTER`
- `RelationshipState` 9종

### API

- `GET /api/erp/research`
- `POST /api/erp/research/[recipeId]/initial`
- `POST /api/erp/research/[recipeId]/jobs`
- `POST /api/erp/research/jobs/[jobId]/cancel`
- `POST /api/erp/research/jobs/[jobId]/claim`
- `POST /api/erp/research/xeno/choices`
- `POST /api/erp/research/xeno/chat`

`GET`은 `serverNow`, 연구선, FIFO, 본인 작업, 정성 관계 상태, 남은 AI 한도만 반환한다. 숨겨진 점수는 반환하지 않는다.

## 알림 계약

- 최초 완료: 제출자 ERP + Discord DM, 전체 활성 사용자 ERP 해금 알림
- 공용 생산 완료: 요청자 ERP + Discord DM
- 개인 생산 준비: 즉시 ERP + Discord DM, 마감 1시간 전 재알림
- 개인 미수령 전환: 요청자 ERP + Discord DM
- Discord는 멱등 `RESEARCH_LAB_DM` integration outbox를 사용하며 실패해도 생산 상태를 막지 않는다.

## UI 계약

- 데스크톱: 좌측 제노 스테이지, 우측 연구·생산 콘솔
- 모바일: 제노 → 대화 → 연구선 → 하단 고정 생산 액션
- 숫자 호감도·게이지 금지. 정성 문구와 관계 아이콘만 노출
- 3개 연구선 탭, 제출물/산출물, 현재 작업, 서버 기준 시간, FIFO 순번, 수령처, 개인 수령함 제공
- 1초 시계는 leaf 컴포넌트에서만 갱신하고 0초·focus 복귀 시 서버 재조회
- 애니메이션은 `prefers-reduced-motion`에서 비활성화

## 에셋 manifest

### 범용 skill

- `$stargate-images`에 `character-expression-set` 워크플로 추가
- 기준 이미지 + arbitrary expression manifest를 받아 동일 인물·의상·실루엣·팔레트를 유지
- 고정 캔버스, 투명 배경, 명명 규칙, contact sheet QA 포함

### 제노

- 대화 초상 5종: `neutral`, `smirk`, `interested`, `displeased`, `angry`
- 관계 아이콘 9종: 관계 enum과 동일한 slug
- 기준 이미지: `/assets/npcs/Xeno-profile.webp`

### 왕관 균사편

- 신규 catalog spec: `docs/spec/catalog/zulu-0040-crown-mycelium-fragment.md`
- 신규 preview: `/assets/catalog/samples/zulu-0040-crown-mycelium-fragment.webp`
- `MATERIAL`, `price: 0`, `isAvailable: false`, `isPublic: true`, `design-proposal`

## 검증 기준

- 권한·CAS·트랜잭션·FIFO·취소/환불·claim/diversion 동시성 테스트
- worker lease 재시작·멱등 inventory/credit/notification/outbox 테스트
- API가 숨겨진 점수를 노출하지 않는 계약 테스트
- Ollama key 부재·timeout·429·malformed·prompt injection fallback 테스트
- TanStack Query의 연구·공용/개인 인벤토리·크레딧·알림 invalidation 테스트
- `pnpm typecheck`, `pnpm lint`, 관련 테스트, `pnpm build`, `pnpm dialogue:lint`, `pnpm dialogue:test`
- 과학자·비과학자 인증 브라우저의 데스크톱 및 390×844 QA. 운영 mutation은 클릭하지 않는다.
- critical 변경 완료 뒤 읽기 전용 `stargate_risk_reviewer` 검토

## 진행 원장

| 단계 | 상태 | 산출물 | 검증/증거 |
|---|---|---|---|
| 0. preflight·SSOT 문서·v2 정정 | VERIFIED | 이 문서와 구 계획 정정 | 대상 문서·worktree·최근 이력 확인, `git diff --check` 통과 |
| 1. skill·에셋·catalog 후보 | VERIFIED | 표정 workflow, 제노 14종, 왕관 균사편 | skill validator, 두 contact sheet 육안 QA, 14종 alpha·규격 QA, catalog dry-run |
| 2. 도메인·DB·worker·알림 | VERIFIED | registry, collections, indexes, operations, consumer/outbox | shared/worker build, 85개 worker test, lease·idempotency 계약 검증 |
| 3. API·Query·UI | VERIFIED | 일반화 API, hooks, VN 연구소 | typecheck, lint, production build, 관련 계약·대화 test |
| 4. 브라우저·리뷰·이력 | VERIFIED | responsive QA, risk review, work history | GM desktop/mobile QA, P0~P3 없음, 구현 커밋과 페이지 이력 기록 |
| 5. 사후 코드리뷰 개선 | VERIFIED | 복구 mutation 경계, 안전정지 결제 차단, VN 중복 제거, active job 조회 보강 | 집중 테스트 24 pass·Mongo 7 skip, typecheck·lint·build, 위험 재리뷰 P0~P3 없음 |
| 6. VN 화면 재설계·GM 시뮬레이션 | VERIFIED | 샘플 연구소 배경, 풀스테이지 대화 UI, 비영속 GM 테스트 | skill validator, 계약 6/6, typecheck·lint·build, 1440×900·390×844 QA, 위험 리뷰 P0~P3 없음 |

## 변경·검증 로그

### 2026-08-10 · 시작

- 사용자 확정 계획을 이 문서에 고정했다.
- `doctor-zeno.md`를 현재 제노 SSOT로 채택했다.
- 운영 mutation은 실행하지 않는다.
- 실행 원장과 v2 정정 문서의 `git diff --check`를 통과했다.

### 2026-08-10 · S1E6 로어 경계 감사

- 세션 원문에서 제노 core voice와 `MARGARET`·`INDEXER`·`PIPETTE` override를 분리했다.
- 직군·등급·긍정 관계 변화, 왕관 균사편 생산, 뒤집어진 양말 연구 산출물은 `design-proposal`로 표시했다.
- 기존 검은 연기 샘플의 획득 provenance와 미완료 수술 상태를 덮어쓰지 않도록 금지 규칙을 추가했다.

### 2026-08-10 · 제노 대화 기반 구현

- S1E6 voice card, 캐릭터 override, 직군·등급 후보 규칙, 15개 고정 장면과 장면별 선택지 registry를 구현했다.
- 관계 숫자·선택지 변화량은 공개 API 타입에서 제외하고 정성 상태·아이콘·표정만 전달하도록 계약을 분리했다.
- Ollama Cloud 일반 텍스트 호출, 12초 timeout, key 부재·429·모델 폐기·비정상 응답·프롬프트 주입 fallback, 최근 20개/실패 시 40개 기억 계약을 구현했다.
- 제노 대화·Ollama 단위 테스트 13건을 통과했다.
- 초상 5종은 768×1024 alpha와 콘택트시트 육안 QA를 통과했다. 관계 아이콘은 계속 생성 중이다.

### 2026-08-10 · 범용 표정 에셋과 catalog 후보 검증

- `$stargate-images`에 NPC 비종속 `character-expression-set` workflow와 정규화·contact-sheet 도구를 추가하고 skill validator를 통과했다.
- 제노 대화 초상 5종(768×1024 RGBA)과 관계 아이콘 9종(256×256 RGBA)을 생성했다. 두 contact sheet에서 동일 인물성, 표정 구분, 투명 배경, 잘림 부재를 육안 확인했다.
- `ZULU-0040 왕관 균사편` 후보 아이콘·catalog spec·seed payload를 만들고 `pnpm run seed:payload -- scripts/seed-payloads/catalog-zulu-0040-crown-mycelium-fragment.json`을 쓰기 플래그 없이 실행했다. 결과는 `master_items` 예상 insert 1건이며 라이브 적재는 수행하지 않았다.

### 2026-08-10 · v2 API·Query·화면 통합

- 서버 페이지 초기 데이터와 `GET /api/erp/research`를 같은 overview serializer에 연결했다. GET은 관계 초기값을 계산만 하며 관계 레코드를 생성하지 않는다.
- 최초 연구·생산·취소·수령은 각각 멱등 economic operation과 MongoDB transaction 안의 도메인 함수를 호출하도록 일반화했다. 게스트 mutation과 GM 우회는 명시적으로 차단했다.
- 제노 선택지는 현재 장면의 서버 registry 항목만 허용하고 `sceneId` 기준 한 번만 반영한다. 자유대화는 일 30회·5초 cooldown reserve, 12초 Ollama fallback, 10회 비동기 요약 경로를 연결했다.
- 서버 초기값을 받는 TanStack Query와 연구·공용/개인 인벤토리·크레딧·알림 동시 invalidation을 연결하고, 구 `/zulu-0028/*` API·DB·UI 하드코딩을 제거했다.
- VN형 제노 스테이지와 세 연구선/FIFO/수령처/개인 수령 콘솔을 실제 overview에 연결했다. API 계약 테스트를 포함한 관련 테스트 29건이 통과했고 Mongo opt-in 4건은 테스트 URI 부재로 skip됐다. `npx tsc --noEmit`, 영향 파일 ESLint, `git diff --check`를 통과했다.
- 코드 배포와 라이브 동작을 분리하기 위해 모든 POST는 `RESEARCH_LAB_MUTATIONS_ENABLED=true`, worker DB mutation은 추가로 `RESEARCH_LAB_WORKER_ENABLED=true`일 때만 열리도록 기본 차단했다. 두 flag는 live index·master item 적재와 같은 별도 승인 절차에서만 전환한다.
- 대화 요약 주기는 KST 일일 quota와 분리한 누적 `totalUsageCount` 10회 기준으로 보정했다.

### 2026-08-10 · 경제·worker·대화 경합 보강

- 연구선별 active key와 캐릭터·연구선별 outstanding key를 partial unique index로 고정했다. 최초 제출, 500CR 차감, 취소 환불, 공용·개인 산출물 지급과 상태 CAS는 MongoDB transaction 안에서만 실행한다.
- 개인 수령은 현재 ACTIVE MAIN 소유권, 기한, 생산·signal·reminder lease를 함께 확인한다. 만료 lease가 FIFO를 막지 않되 살아 있는 worker의 낡은 ERP/DM side effect는 lease 갱신 CAS로 차단한다.
- 전이 알림은 FIFO signal queue로 보존하고 `CLAIMABLE T0 → 1시간 전 T+5h → 공용 전환 T+6h` 순서를 outbox partition 시각으로 고정했다. 발송 직전 실제 job 상태와 수령 기한을 다시 확인한다.
- worker는 8회 연속 실패 시 연구선을 안전정지하고 CRITICAL incident를 노출한다. mutation 전에 연구 컬렉션의 exact index와 여섯 catalog slug/category를 읽기 전용으로 검사한다.
- 관계·대화 저장 키를 `userId + characterId`로 분리해 소유권 이전 시 이전 소유자의 대화·요약이 새 소유자에게 노출되지 않게 했다.
- 같은 장면의 동시 선택은 실제 DB 승자 `choiceId`를 loser 응답에도 사용한다. 자유대화는 turn lease로 직렬화하고 summary generation CAS로 느린 요약의 덮어쓰기를 차단했다.
- 최대 길이 idempotency key의 하위 key는 parent hash를 포함해 뒤쪽만 다른 요청끼리 충돌하지 않게 했다. claim replay는 저장된 완료 응답을 inventory preflight보다 먼저 반환한다.

### 2026-08-10 · 배포 준비 상태와 기본 차단

- 신규 최초 연구·반복생산 POST는 `RESEARCH_LAB_MUTATIONS_ENABLED=true`와 90초 이내 active worker heartbeat를 함께 요구한다. 이미 결제된 작업의 취소·수령과 제노 선택·자유대화는 worker 장애 중에도 복구할 수 있도록 Web mutation flag만 요구하며, 완료된 멱등 replay는 gate보다 먼저 반환한다.
- worker heartbeat는 active mode, 별도 worker flag, 실제 enabled consumer 세 조건을 모두 만족할 때만 연구 mutation consumer를 광고한다.
- 신규 균사편 payload의 `sourceClass: design-proposal`을 seed schema, master item type, lore snapshot loader와 projection까지 전달했다. 필드 누락 시 canon으로 추측되는 fallback이 있으므로 라이브 seed readback과 lore postflight를 활성화 조건으로 남긴다.
- realtime `research` resource가 없는 현재 구조에서는 60초 안전 polling을 유지하고, focus 복귀는 fresh 여부와 무관하게 강제 refetch하며, countdown 0초에서도 한 번 재조회한다.

### 2026-08-10 · 브라우저 QA와 위험 리뷰

- 로컬 production server의 GM 인증 화면에서 1280×720 desktop과 390×844 mobile을 확인했다. desktop 2열, mobile 제노→대화→연구선 순서와 sticky 생산 액션, 관계 아이콘·초상·세 연구선 탭, overflow·console 오류 부재를 확인했다.
- 설정된 플레이어 테스트 계정 6개는 모두 `/erp/research`의 운영 차단 상태까지 확인했다. 현재 계정들의 MAIN class가 모두 `테스트`라 과학자·비과학자 화면 분기는 라이브 데이터 변경 없이 검증할 수 없었다.
- 운영 mutation 버튼은 클릭하지 않았고 크레딧·인벤토리·index·master item·worker 상태를 변경하지 않았다.
- `stargate_risk_reviewer` 최종 재리뷰에서 P0·P1·P2·P3 잔여 finding이 없음을 확인했다.

### 2026-08-10 · 검증 스냅샷

- PASS: `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- PASS: worker 전체 85/85, dialogue 22/22, 연구 API·도메인·readiness·관계·Ollama·lore 집중 테스트.
- PASS: `pnpm dialogue:lint` exit 0. 저장소 기존 후보 경고 176건이 있으며 제노 신규 소스의 차단 경고는 없다.
- PASS: 왕관 균사편 payload dry-run에서 `master_items` 예상 insert 1건을 확인했다. 실행 플래그는 사용하지 않았다.
- SKIP: `RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI`가 없어 replica-set Mongo 동시성 7건은 실행하지 못했다.
- 기존 harness 제한: `hooks/__tests__/cache-invalidation.test.mjs`의 독립 Node 실행은 `@/lib` path alias를 해석하지 못한다. 연구 mutation invalidation은 별도 연구 API source contract와 production build로 검증했다.

### 2026-08-10 · 사후 코드리뷰 개선 시작

- 생산 시작·최초 연구는 fresh worker readiness를 계속 요구하되, 이미 결제된 작업의 취소·수령과 제노 상호작용은 Web mutation flag만으로 복구할 수 있도록 활성화 경계를 분리한다.
- 안전정지된 연구선은 동일 transaction 안에서 500 CR 차감 전에 거절하고 overview/UI에 결제 불가 상태를 노출한다.
- 선택지 응답의 Query cache와 로컬 VN 상호작용이 같은 제노 대사를 중복 표시하지 않도록 단일 표시 소유권과 방어적 dedupe를 적용한다.
- overview의 전역 `limit: 500`을 제거해 오래 실행 중인 active job이 조회에서 사라지지 않게 한다.
- 이 배치에서는 운영 DB, index, seed, 크레딧·인벤토리, worker flag를 변경하지 않는다.

### 2026-08-10 · 사후 코드리뷰 개선 완료

- 신규 연구·생산과 복구 mutation의 readiness를 분리했다. 취소·수령은 worker heartbeat가 만료돼도 Web mutation flag 아래에서 실행되며, 모든 경제 API의 완료 replay가 준비 검사보다 먼저 반환된다.
- 안전정지 active job에 `queueAdmissionVersion` 조건부 write를 수행해 worker halt·terminal 전이와 enqueue를 같은 문서에서 직렬화했다. 안전정지 승자 시 500 CR 차감과 job insert가 모두 abort되며 UI는 해당 연구선을 결제 불가로 표시한다.
- 선택지 mutation은 관계 상태와 선택지 소진만 Query cache에 반영하고 실제 응답 대사는 로컬 VN interaction이 한 번만 표시한다. action refetch와 같은 대사가 겹치는 경우도 텍스트 dedupe로 방어한다.
- active job 조회는 전역 500건 절단 없이 등록 recipe·활성 status만 기존 compound index 순서로 조회한다. 전용 projection 타입과 최소 필드 projection, recipe Map 그룹화로 full-document 조회와 반복 필터링을 제거했다.
- PASS: 연구·관계·Ollama 집중 테스트 24건, readiness·guest·계약 테스트, shared-db build, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm dialogue:test`, `pnpm dialogue:lint`, `git diff --check`.
- SKIP: `RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI`가 없어 새 halt/enqueue barrier를 포함한 replica-set Mongo 7건은 실행하지 못했다.
- 읽기 전용 critical 위험 재리뷰에서 P0·P1·P2·P3 잔여 결함 없음 판정을 받았다. 라이브 활성화 차단 조건은 그대로 유지한다.

### 2026-08-10 · 비주얼노벨 화면 재설계 시작

- 기존 2열 카드 화면이 제노와 상호작용하는 연애 시뮬레이션의 무대감보다 ERP 콘솔의 인상을 우선한다는 실제 화면 피드백을 반영한다.
- `$stargate-images`에 범용 `environment-background` 규격을 추가하고, 캐릭터 안전 영역과 하단 대화창 안전 영역을 갖춘 샘플 연구소 배경을 제작한다.
- 제노를 큰 전신 초상으로 배치한 풀스테이지, 하단 VN 대화창·선택지, 필요할 때 여는 연구 콘솔 오버레이 구조로 데스크톱과 모바일을 다시 설계한다.
- GM은 실제 경제·인벤토리·관계 API를 우회하지 않고도 모든 대표 상태를 확인할 수 있는 클라이언트 비영속 시뮬레이션 모드를 사용한다. 시뮬레이션 동작은 라이브 mutation을 호출하지 않는다.
- 이 배치에서도 운영 DB, index, seed, 크레딧·인벤토리, worker flag를 변경하지 않는다.

### 2026-08-10 · 비주얼노벨 화면 재설계 완료

- 1920×1080 샘플 격리 연구소 배경과 큰 제노 초상을 한 무대에 배치하고, 선택지·현재 대사·관계 상태·자유대화를 하단 비주얼노벨 인터페이스로 통합했다.
- 연구선은 무대 위 장치에서 여는 반투명 콘솔로 옮겼다. 연구 상태·투입물·산출물·FIFO·수령처·생산 액션을 유지하면서 desktop 우측 drawer와 mobile 전면 console로 반응형을 구성했다.
- GM에게만 서버 세션 역할로 비영속 시뮬레이션을 노출했다. 최초 제출 전·연구 중·생산 가능·대기열·개인 수령 대기와 관계 9단계를 로컬 fixture로 전환하며, 최초 연구·결제·취소·수령·선택지·자유대화가 라이브 mutation보다 먼저 반환하도록 계약 테스트로 고정했다.
- modal 초기 초점·동적 focus trap·Escape/닫기 후 실제 opener 복귀와 연구선 tab의 roving focus·방향키/Home/End·tabpanel 연결을 적용했다. `prefers-reduced-motion`에서는 무대·대화·장치 전환 효과를 생략한다.
- PASS: `$stargate-images` skill validator, `pnpm typecheck`, `pnpm lint`, `pnpm build`, 연구 계약 6/6, dialogue 22/22, `git diff --check`.
- PASS: GM 인증 브라우저 1440×900과 390×844에서 배경·대화 선택·자유대화·다섯 연구 상태·관계 9단계·drawer·개인 수령 액션·가로 overflow·console error·키보드 초점 이동을 확인했다.
- 읽기 전용 critical 위험 재리뷰에서 P0·P1·P2·P3 잔여 결함 없음 판정을 받았다. 구현 커밋은 `6ee19b74`이며 라이브 운영 데이터는 변경하지 않았다.

## 라이브 활성화 차단 조건

아래 항목은 구현 완료와 별개이며 정확한 대상과 실행 동작에 대한 별도 승인 전에는 `BLOCKED`다.

1. 격리 replica-set Mongo에서 skip된 동시성 7건 실행.
2. 운영 research index 생성 후 `listIndexes()`로 key·unique·partial 조건 재조회.
3. 왕관 균사편 master item 적재 후 slug/category와 `sourceClass: design-proposal` 재조회.
4. 승인된 lore rebuild 뒤 catalog graph entity가 candidate 상태인지 postflight.
5. worker flag를 먼저 켜고 fresh ready heartbeat를 확인한 뒤 Web mutation flag 활성화. 비활성화는 Web flag부터 내린다.
6. 과학자·비과학자·GM·guest와 소유권 이전 claim/cancel을 격리 DB에서 검증.

## 구현 커밋

- `ff983be6` · `feat(all): 관계형 제노 샘플 연구소를 구현한다`
- `b20cfc8d` · `fix(all): 제노 연구소의 복구와 안전정지를 보강한다`
- `6ee19b74` · `feat(novusweb): 제노 연구소를 비주얼노벨 무대로 개편한다`
- 라이브 mutation·index 생성·seed·lore rebuild·worker 활성화는 이 커밋들에 포함되지 않았다.
