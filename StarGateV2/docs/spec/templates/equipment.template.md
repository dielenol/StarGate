<!-- 장비 템플릿 — /create-lore equipment 로 자동 생성 가능. 필드 명세: packages/shared-db/src/schemas/equipment.schema.ts 참조 -->
<!--
  frontmatter 필드 안내
  ─────────────────────
  필수: code, slug, name, category, price, description, isAvailable, isPublic
  권장: nameEn, damage, tags, source, previewImage, createdAt, updatedAt

  규칙
  - code: UPPER_SNAKE_CASE (예: STANDARD_PISTOL, KEVLAR_VEST)
  - slug: kebab-case 소문자
  - category: "WEAPON" | "ARMOR"
  - price: 숫자 (KRW). master_items.price 와 정합.
  - damage: 자유 문자열 ("9mm / 단발", "방어력 +30" 등). 80자 이내.
  - description: 한 줄 카탈로그 설명 (필수, 500자 이내). master_items.description 매핑.
  - 긴 서술(배경/획득 경로/비고)은 body 섹션. master_items.lore.* 에 적재.
  - frontmatter 는 평탄 YAML 만. 중첩 객체 금지.
-->
---
code: EXAMPLE_EQUIPMENT
slug: example-equipment
name: 예시 장비
nameEn: Example Equipment
category: WEAPON
price: 0
damage:
description: 한 줄 설명 (필수, 500자 이내).
previewImage:
isAvailable: true
isPublic: false
tags: []
source: create-lore
createdAt: 2026-05-13T00:00:00Z
updatedAt: 2026-05-13T00:00:00Z
---

<!-- body 섹션: 섹션 ID 는 파서가 매칭하는 고정 키. 다른 이름으로 바꾸면 DB 적재 실패. -->

## 설명
카탈로그 설명. frontmatter description 이 비어 있을 경우 이 섹션이 폴백으로 적재된다.

## 배경
이 장비의 유래·서사 (옵션). master_items.lore.background 로 적재.

## 획득 경로
어떻게 얻을 수 있는지 (옵션). 상점/임무/이벤트 보상 등. master_items.lore.acquisition.

## 비고
기타 메모 (옵션). master_items.lore.notes.
