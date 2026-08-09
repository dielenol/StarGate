# 페이지별 작업 이력

페이지를 기준으로 기능 개발, 버그 수정, 성능 최적화와 UI 개선 이력을 누적한다. 이 문서의 목적은 릴리즈 노트를 대체하는 것이 아니라, 최근에 완료한 작업을 코드 변경 없이 다시 수행하는 일을 막는 것이다.

## 저장 위치

route 구조를 `docs/work-history/routes/` 아래에 그대로 반영한다.

- `/erp/stock` → `routes/erp/stock.md`
- `/erp/sessions/report` → `routes/erp/sessions/report.md`
- `/erp/characters/[id]` → `routes/erp/characters/_id.md`

동적 segment는 대괄호를 제거하고 앞에 `_`를 붙인다. 정확한 route 문서가 없으면 가장 가까운 상위 route 문서를 확인한다. 여러 하위 화면이 하나의 사용자 탭으로 동작한다면 상위 탭 문서에 영향 경로를 함께 적을 수 있다.

페이지로 귀속할 수 없는 공용 인프라나 디자인 시스템 변경만 `shared/<주제>.md`에 기록한다. 공용 변경을 관련 없는 모든 페이지 문서에 복제하지 않는다.

## 작업 전 중복 확인

1. 대상 route와 가장 가까운 상위 route의 이력 문서를 찾는다.
2. 최근 30일 항목에서 현재 요청과 목적이 같은 작업이 있는지 확인한다.
3. 같은 작업이 있으면 관련 커밋과 현재 `HEAD` 사이에서 해당 페이지와 당시 영향 파일이 실질적으로 바뀌었는지 확인한다.
4. 관련 변경이 없다면 구현을 중단하고 기존 작업일, 변경 내용, 검증 결과와 커밋을 사용자에게 알린다.
5. 사용자가 회귀를 제보했거나 재검증을 명시했다면 현재 동작을 재현한다. 이력은 현재 정상 동작의 증거를 대신하지 않는다.

`git show --name-only <관련 커밋>`으로 당시 영향 파일을 확인한 뒤 `git diff <관련 커밋>..HEAD -- <영향 파일>`로 비교한다. 같은 route 폴더의 무관한 파일이 바뀌었다는 이유만으로 동일 작업을 자동 재실행하지 않는다.

사용자가 기존 이력을 확인한 뒤에도 재실행을 명시하면 진행할 수 있다.

## 기록 대상

다음과 같이 사용자 동작이나 유지보수 판단에 영향을 주는 완료 작업을 기록한다.

- 기능 추가 또는 기존 기능의 의미 있는 변경
- 사용자에게 보이는 버그 수정
- 측정과 검증이 있는 성능 최적화
- 반응형, 접근성 또는 주요 UI 동작 개선
- API, 권한, 데이터 흐름 변경이 특정 페이지 동작에 영향을 준 작업

다음 항목은 기록하지 않는다.

- 코드 변경 없이 끝난 조사와 상태 보고
- 임시 디버깅, 실험 또는 완료되지 않은 작업
- 포매팅, 주석, 오탈자만 수정한 작업
- 생성 파일이나 의존성 갱신처럼 페이지 동작과 무관한 기계적 변경

줄 수가 아니라 사용자 동작이 달라졌는지를 기준으로 판단한다.

## 기록 순서

1. 구현과 검증을 완료한다.
2. 구현 파일만 커밋한다.
3. 영향을 받은 각 페이지 문서의 끝에 새 항목을 추가한다.
4. 관련 구현 커밋 해시를 적는다.
5. 이력 문서 변경을 별도의 `docs(novusweb)` 커밋으로 만든다.

기존 항목을 새 내용으로 덮어쓰지 않는다. 날짜는 `Asia/Seoul` 기준이며 오래된 항목부터 최신 항목 순으로 아래에 추가한다.

## 항목 형식

```md
## YYYY-MM-DD · 작업 유형

- 변경 내용 A
- 변경 내용 B
- 검증: 실행한 테스트, 측정 또는 확인한 viewport
- 관련 커밋: `abcdef1`
- 후속 작업: 필요한 경우에만 작성
```

같은 날짜에 같은 유형의 작업이 여러 번 있으면 제목 뒤에 짧은 구분명을 추가한다.

```md
## 2026-07-28 · 버그 수정 · 주문 중복 방지
```

## 현재 페이지 이력

- [`/erp/account`](routes/erp/account.md)
- [`/erp`](routes/erp.md)
- [`/erp/admin/inventory`](routes/erp/admin/inventory.md)
- [`/erp/admin/catalog`](routes/erp/admin/catalog.md)
- [`/erp/admin/bureaucrat-votes`](routes/erp/admin/bureaucrat-votes.md)
- [`/erp/admin/equipment-workshop`](routes/erp/admin/equipment-workshop.md)
- [`/erp/admin/dialogue-beep`](routes/erp/admin/dialogue-beep.md)
- [`/erp/characters`](routes/erp/characters.md)
- [`/erp/characters/[id]`](routes/erp/characters/_id.md)
- [`/erp/equipment-shop`](routes/erp/equipment-shop.md)
- [`/erp/credits`](routes/erp/credits.md)
- [`/erp/factions`](routes/erp/factions.md)
- [`/erp/inventory/[characterId]`](routes/erp/inventory/_characterId.md)
- [`/erp/notifications`](routes/erp/notifications.md)
- [`/erp/research`](routes/erp/research.md)
- [`/erp/equipment-shop/custom`](routes/erp/equipment-shop/custom.md)
- [`/erp/equipment-shop/lab`](routes/erp/equipment-shop/lab.md)
- [`/erp/equipment-shop/simulator`](routes/erp/equipment-shop/simulator.md)
- [`/erp/equipment-shop/towaski`](routes/erp/equipment-shop/towaski.md)
- [`/erp/personnel`](routes/erp/personnel.md)
- [`/erp/sessions`](routes/erp/sessions.md)
- [`/erp/sessions/report`](routes/erp/sessions/report.md)
- [`/erp/shop`](routes/erp/shop.md)
- [`/erp/stock`](routes/erp/stock.md)
- [`/erp/trades`](routes/erp/trades.md)
- [`/erp/wiki`](routes/erp/wiki.md)
- [`/erp/wiki/[id]`](routes/erp/wiki/_id.md)
- [`/erp/wiki/catalog`](routes/erp/wiki/catalog.md)
- [공용 ERP realtime](shared/realtime.md)
- [`/rules`](routes/rules.md)
- [`/world/player`](routes/world/player.md)
