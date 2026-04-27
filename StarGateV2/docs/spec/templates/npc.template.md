<!-- NPC 템플릿 — /create-lore npc 로 자동 생성 가능. 필드 명세: packages/shared-db/src/schemas/npc.schema.ts 참조 -->
<!--
  frontmatter 필드 안내
  ─────────────────────
  필수: codename, type, role, nameKo, isPublic
  권장: slug, factionCode, institutionCode, gender, age, height, weight, source
  선택: department, nameEn, nameNative, nickname, loreTags, appearsInEvents, previewImage, createdAt, updatedAt

  규칙
  - codename: UPPER_SNAKE_CASE (예: REGISTRAR, INDEXER)
  - slug: kebab-case 소문자 (예: registrar, indexer-hash). 생략 시 codename을 소문자·언더바→하이픈 변환
  - type: "NPC" 고정
  - factionCode/institutionCode: 기존 FACTIONS/INSTITUTIONS const 또는 DB 승격된 code
  - isPublic: 공개 랜딩 페이지 노출 여부 (true/false)
  - source: 생성 출처. "create-lore" | "discord" | "legacy-json" | "manual"
  - loreTags: 자유 태그 배열 (인라인 [tag1, tag2] 또는 빈 배열 [])
  - nameNative: 원어 표기 (한자/일본어 등). 한국어 nameKo 와 별개.
  - nickname: 짧은 별칭/통칭.
  - weight: 체중. lore 영역(신상 정보)으로 분류.
  - 긴 서술(대사/외형/성격/배경/역할 상세/이름 설명)은 아래 body 섹션에 작성
  - frontmatter는 평탄 YAML만 허용. 중첩 객체 금지.
-->
---
codename: EXAMPLE_NPC
slug: example-npc
type: NPC
role: 역할 한 줄 요약
nameKo: 한국어 이름
nameNative:
nickname:
nameEn: English Name
gender: female
age: 32
height: 168cm
weight:
factionCode: CIVIL
institutionCode:
department:
isPublic: false
loreTags: []
appearsInEvents: []
source: create-lore
previewImage:
createdAt: 2026-04-20T00:00:00Z
updatedAt: 2026-04-20T00:00:00Z
---

<!-- body 섹션: 섹션 ID는 파서가 매칭하는 고정 키. 다른 이름으로 바꾸면 DB 적재 실패. -->

## 대사
> 대사 한 줄. blockquote(>) 사용 권장.

## 외형
외형 서술 (머리색, 체격, 복장 등). 자유 문단.

## 성격
성격 서술. 행동 양식, 말투, 가치관.

## 배경
배경 서술. 출신·과거·동기·현재 상황. 볼드/이탤릭 허용.

## 역할 상세
세계관 내에서의 구체적 역할과 상호작용. 불릿 허용.

- 관리 대상:
- 업무 범위:
- NPC 특성:
- 등장 방식:

## 이름 설명
코드네임/이름의 유래 및 의미.

<!-- 아래 "관계" 섹션은 DB 필드 매핑이 아닌 참고용 주석 영역. NPC 스키마는 relationships 필드가 없으므로 서술만 남는다. -->

## 관계 (참고)
- `REGISTRAR` — 업무상 상하관계 / 중립 등
- `OTHER_NPC` — 라이벌 등
