<!-- Institution 템플릿 — /create-lore institution 로 자동 생성 가능. 필드 명세: packages/shared-db/src/schemas/institution.schema.ts 참조 -->
<!--
  frontmatter 필드 안내
  ─────────────────────
  필수: code, slug, label, summary, isPublic
  권장: labelEn, parentFactionCode, tags, source
  선택: leaderCodename, headquartersLocation, createdAt, updatedAt

  규칙
  - code: UPPER_SNAKE_CASE (예: SECRETARIAT, FINANCE)
  - slug: kebab-case 소문자
  - parentFactionCode: 상위 세력 code (UPPER_SNAKE_CASE). 예: COUNCIL
  - leaderCodename: 수장 NPC codename (UPPER_SNAKE_CASE)
  - headquartersLocation: 본부 위치 (자유 문자열, 120자 이내)
  - subUnits: frontmatter 평탄 제약으로 본문 "## 조직 구조" 섹션에 서술. skill이 파싱해 배열 생성.
  - relationships: 본문 "## 타 조직 관계" 섹션에 서술.
  - mission: 본문 "## 임무" 섹션 사용 (어댑터가 자동 추출)
  - loreMd: 본문 전체가 자동 저장됨
-->
---
code: EXAMPLE_INSTITUTION
slug: example-institution
label: 예시 기관
labelEn: Example Institution
parentFactionCode: COUNCIL
leaderCodename:
headquartersLocation:
summary: 1~2문장 요약.
tags: []
isPublic: false
source: create-lore
createdAt: 2026-04-20T00:00:00Z
updatedAt: 2026-04-20T00:00:00Z
---

<!-- "## 임무" 섹션 내용이 institutionDoc.mission으로 저장된다. -->

## 임무
기관의 공식 임무 및 역할.

<!-- subUnits 형식: "- CODE — label — 설명(optional)". skill이 파싱해 subUnits 배열로 구성. -->

## 조직 구조
- `SUB_UNIT_1` — 하위 부서 1 — 설명
- `SUB_UNIT_2` — 하위 부서 2 — 설명

## 운영 현황
조직 규모, 예산, 주요 활동.

## 주요 인물
- `LEADER_CODENAME` — 수장
- `MEMBER_CODENAME` — 역할

<!-- 관계 형식: "- CODE — type — note". type: ally | rival | neutral | subordinate | parent. -->

## 타 조직 관계
- `OTHER_INSTITUTION` — ally — 비고
- `RIVAL_ORG` — rival — 비고
