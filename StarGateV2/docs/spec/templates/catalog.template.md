<!-- 일반 카탈로그 템플릿 — MATERIAL/SPECIAL 또는 범용 master_items mirror. 필드 명세: packages/shared-db/src/schemas/catalog.schema.ts 참조 -->
<!--
  frontmatter 필드 안내
  ─────────────────────
  필수: code, slug, name, category, price, description, isAvailable, isPublic
  권장: nameEn, effect, damage, tags, source, previewImage, createdAt, updatedAt

  규칙
  - code: UPPER_SNAKE_CASE (예: BROKEN_SYLLABLE, ZULU_0028_CONTAINMENT_BOX)
  - slug: kebab-case 소문자
  - category: "WEAPON" | "ARMOR" | "CONSUMABLE" | "MATERIAL" | "SPECIAL"
  - MATERIAL은 샘플/재료, SPECIAL은 격리 장비·작전 물증·비표준 물품에 사용
  - price: 숫자 (KRW). 판매 대상이 아니면 0
  - effect: 샘플 성격, 보관 효과, 운용상 의미 등. 120자 이내.
  - damage: 전투 장비일 때만 사용. 80자 이내.
  - description: 한 줄 카탈로그 설명 (필수, 500자 이내). master_items.description 매핑.
  - 긴 서술(배경/획득 경로/비고)은 body 섹션. master_items.lore.* 에 적재.
  - frontmatter 는 평탄 YAML 만. 중첩 객체 금지.
-->
---
code: EXAMPLE_CATALOG_ITEM
slug: example-catalog-item
name: 예시 카탈로그 항목
nameEn: Example Catalog Item
category: SPECIAL
price: 0
effect:
damage:
description: 한 줄 설명 (필수, 500자 이내).
previewImage:
isAvailable: false
isPublic: true
tags: []
source: create-lore
createdAt: 2026-05-31T00:00:00Z
updatedAt: 2026-05-31T00:00:00Z
---

<!-- body 섹션: 섹션 ID 는 파서가 매칭하는 고정 키. 다른 이름으로 바꾸면 DB 적재 실패. -->

## 설명
카탈로그 설명. frontmatter description 이 비어 있을 경우 이 섹션이 폴백으로 적재된다.

## 배경
이 항목의 유래·서사 (옵션). master_items.lore.background 로 적재.

## 획득 경로
어떻게 얻을 수 있는지 (옵션). 임무 회수, 연구 보관, 지급, 상점 등.

## 비고
기타 메모 (옵션). master_items.lore.notes.
