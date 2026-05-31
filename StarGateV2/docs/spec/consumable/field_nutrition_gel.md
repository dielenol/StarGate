---
code: FIELD_NUTRITION_GEL
slug: field_nutrition_gel
name: 야전 영양젤
nameEn: Field Nutrition Gel
category: CONSUMABLE
price: 45
effect: HP 10 / SAN 5
description: 짠맛과 단맛이 묘하게 섞인 휴대용 영양젤. 야전에서 몸과 정신을 동시에 끌어올린다.
isAvailable: true
isPublic: true
tags:
  - 편의점
  - 회복
  - 야전
source: create-lore
previewImage:
createdAt: 2026-05-31T00:00:00Z
updatedAt: 2026-05-31T00:00:00Z
---

## 설명

한 손으로 뜯어 바로 삼킬 수 있는 파우치형 영양젤이다. 당분, 전해질, 향료가 강하게 배합되어 있어 맛은 호불호가 갈리지만, 몸을 다시 움직이게 만드는 목적에는 충실하다.

## 배경

노부스 오르도 현장 요원 사이에서는 "식사라고 부르기엔 애매하지만 쓰러지지 않게는 해준다"는 평가를 받는다. 컵라면이나 소다보다 확실한 회복량이 필요하지만, 고급 회복품을 쓰기엔 아까운 상황을 담당한다.

## 획득 경로

STAR MART 편의점 회복 품목으로 구매할 수 있다. 운영 편의점 카탈로그와 `master_items`에는 기존 shop slug 규칙에 맞춰 `field_nutrition_gel`로 동기화한다.

## 비고

상태이상 해제 기능은 없다. HP와 SAN을 동시에 조금 회복하는 중간 단계 소모품으로, 장기 세션에서 기본 회복템과 고가 보험템 사이의 빈 구간을 메운다.
