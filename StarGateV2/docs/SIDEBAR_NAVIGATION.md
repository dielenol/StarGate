# Sidebar Navigation Guide

## 개요

사이드바는 메인 페이지 톤(어두운 배경, 금색 포인트, 기밀 아카이브 분위기)을 유지하면서
전체 페이지 이동을 담당하는 전역 네비게이션입니다.

## 구성 파일

- `components/sidebar/Sidebar.tsx`
- `components/sidebar/Sidebar.module.css`
- `app/layout.tsx`
- `app/layout.module.css`

## 동작 정책

- 데스크톱(`>=1024px`)
  - 기본: 아이콘만 노출되는 축소 상태
  - hover: 사이드바가 확장되며 텍스트 라벨 노출
- 모바일(`<1024px`)
  - 좌상단 햄버거 버튼으로 열기/닫기
  - 백드롭 클릭 시 닫힘

## 메뉴 구조

- 메인(`/`)
- 가입신청(`/apply`)
- 문의하기(`/contact`)
- 세계관(`/world`)
  - 메인(`/world`)
  - A(`/world/a`)
  - B(`/world/b`)
  - C(`/world/c`)
- 작전 내규(`/gameplay`)
- 룰 설명(`/rules`)

## 확장 가이드

- 메뉴를 추가할 때는 `Sidebar.tsx`의 `NAV_ITEMS` 상수만 수정하면 됩니다.
- 활성 상태는 현재 경로 기준(`usePathname`)으로 자동 처리됩니다.
