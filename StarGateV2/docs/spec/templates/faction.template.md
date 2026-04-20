<!-- Faction 템플릿 — /create-lore faction 로 자동 생성 가능. 필드 명세: packages/shared-db/src/schemas/faction.schema.ts 참조 -->
<!--
  frontmatter 필드 안내
  ─────────────────────
  필수: code, slug, label, summary, isPublic
  권장: labelEn, tags, source
  선택: notableMembers, createdAt, updatedAt, authorId, authorName

  규칙
  - code: UPPER_SNAKE_CASE (예: CIVIL, COUNCIL, MILITARY)
  - slug: kebab-case 소문자 (예: civil-society)
  - label: 한국어 40자 이내
  - labelEn: 영문 60자 이내
  - summary: 1~2문장 요약 (최대 500자)
  - notableMembers: NPC codename 배열. UPPER_SNAKE_CASE 코드만 허용
  - tags: 자유 태그 배열
  - isPublic: 공개 노출 여부
  - relationships: frontmatter 평탄 제약으로 본문 "## 타 세력/기관 관계" 섹션에 서술. skill이 파싱해 DB에 반영.
  - ideology(이념): 본문 "## 이념/가치관" 섹션 사용 (어댑터가 자동 추출)
  - loreMd: 본문 전체가 자동 저장됨 (별도 필드 작성 불필요)
-->
---
code: EXAMPLE_FACTION
slug: example-faction
label: 예시 세력
labelEn: Example Faction
summary: 1~2문장 요약.
tags: []
notableMembers: []
isPublic: false
source: create-lore
createdAt: 2026-04-20T00:00:00Z
updatedAt: 2026-04-20T00:00:00Z
---

<!-- 섹션 ID "## 이념/가치관"은 파서가 ideology 필드로 매핑. 제목 변경 금지. -->

## 이념/가치관
이념·가치관·슬로건 등. 이 섹션 내용이 factionDoc.ideology로 저장된다.

## 역사
창설 배경, 주요 사건, 전환점.

## 주요 인물
- `REGISTRAR` — 현 사무국장
- `OTHER_NPC` — 역할 요약

<!-- 관계는 "- CODE — type — note" 형식. type: ally | rival | neutral | subordinate | parent. skill이 파싱해 relationships 배열로 반영. -->

## 타 세력/기관 관계
- `COUNCIL` — ally — 창설 이래 공식 동맹
- `MILITARY` — neutral — 사안별 대응
- `UNDERGROUND` — rival — 자원 쟁탈

## 현재 동향
최근 움직임, 진행 중인 이슈.
