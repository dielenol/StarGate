---
title: NOSB-S1E1-MINI session sync coverage
category: session-sync
tags: [NOSB-S1E1-MINI, S1E1-MINI, stargate-lore]
updated: 2026-06-02
source: stargate-lore
---

# NOSB-S1E1-MINI Sync Coverage

이 문서는 공개 위키가 아니라 `stargate-lore` 동기화 감사를 위한 내부 coverage matrix다. 목적은 `NOSB-S1E1-MINI` 로그에서 추출한 대상이 ERP의 작전보고서, 위키, 카탈로그, 신원조회, 관계 서사 축 중 어디에 반영됐는지와 어디가 아직 후보/미해결인지 분리하는 것이다.

## Source Profile

- Source: NOVUS ORDO `S1E1 질서 - 미니 세션` PDF, 79 pages, pypdf text extraction.
- Session key: `NOSB-S1E1-MINI`; shorthand marker: `S1E1-MINI`.
- Timing: `2026-03-22` to `2026-03-23` log lines.
- Supplement: user-provided ZULU-113 containment archive text and official image for ZULU-0113.
- Parser warning: Cocofolia-style extraction duplicates speaker labels and may garble some visual text; durable writes use cross-checked names, existing DB codenames, user-provided archive facts, and visible repeated log terms.

## Lorebook Coverage Matrix

| subject | source evidence | target surface | action | status |
|---|---|---|---|---|
| S1E1 mini session | PDF title and full log p.1-p.79 | `session_reports`, `wiki_pages.slug=s1e1-mini` | Maintain as separate scenario from `NOSB-S1E1-ORDER` | Applied; exact session key required |
| S1E1 main session separation | Existing report/wiki plus mini session marker collision | link logic, `s1e1-order` wiki cleanup | Remove broad mini bleed-through from main report links | Applied; broad `S1E1` over-linking must stay avoided |
| ZULU-0113 / ZULU-113 전자화 눈물 | PDF p.27, p.32, p.35-p.43; user archive | wiki entity, catalog samples, asset | Register archive-backed entity and sourced image | Applied |
| ZULU-0113 눈물 샘플 | PDF sample recovery sequence; archive expected samples | `master_items` MATERIAL, catalog spec | Track as limited research sample | Applied |
| 행동교정물질 | PDF research direction choice; archive expected sample | consumable spec, `master_items` CONSUMABLE | Register as research direction, not shop/economy mutation | Applied; use/stock/grant remains approval-only |
| 전자화된 정신교란물질 | Archive expected sample | catalog spec, `master_items` MATERIAL | Register as expected sample, not confirmed distributed item | Applied |
| 우디 / 무디 | PDF uses `우디 (WD-03)` and `무디` for generated body; existing Dossier `WD-(𝓃)` | Dossier tag, report/wiki wording | Disambiguate as `우디의 분신체 무디` | Follow-up payload required/applied in this pass |
| 검열된 비명 / ZULU-0028 | Mini log white cushion room sequence; existing S1E1 main entity | existing wiki, catalog samples/equipment | Merge mini facts into existing entity and linked catalog rows | Applied |
| 깨진 음절 | ZULU-0028 sample condition | `master_items` MATERIAL, catalog spec | Add mini marker while preserving main S1E1 origin | Applied |
| 소닉 이미터 | ZULU-0028 research direction | `master_items` SPECIAL, catalog spec | Register as development direction, not inventory grant | Applied |
| ZULU-0028 특수 격리 상자 | Existing catalog item linked to entity | `master_items` SPECIAL | Keep linked to report/catalog graph | Applied |
| 닥터 모스 | Office assignment sequence and existing NPC spec | NPC spec, characters Dossier, official image | Update appearsInEvents and sourced background | Applied |
| CLAIRVOYANCE / 수잔 | Mini cafeteria/steak shop contact | NPC spec, characters Dossier | Add mini event and note | Applied |
| 해쉬 태거 / INDEXER | Europe lab emergency call | characters Dossier, report hook | Add event link/tag and preserve as next-operation hook | Applied; no separate operation report until next source |
| AGENT participants | Log speakers plus existing codename map | characters Dossier | Add `NOSB-S1E1-MINI` to `lore.appearsInEvents` | Applied for 14 records |
| 스페이스 제로 | CEO contact and existing SPACE_ZERO spec | institution spec, institution DB, wiki | Update institution with S1E1-MINI contact | Applied |
| 요한 스미스 | CEO name appears in mini log; GM-provided Dossier profile/image | characters Dossier, SPACE_ZERO leader link, relation narrative | Create Dossier as `JOHAN_SMITH` and link to S1E1-MINI | Applied |
| 개조 실험체 / 나사형 제어 장치 | CEO exchange offer | operation report, Space Zero notes | Preserve in report/institution context | Candidate-only; no character/spec row |
| 구내식당 and steak shop encounter | Mini log social conflict sequence | operation report, CLAIRVOYANCE note | Keep as session context | Merged; no standalone place page |
| 내무군 / 알렉산더 키호프 | Cafeteria conflict mention | operation report | Preserve as event context | Candidate-only; no Dossier without canonical record |
| 관계 서사 | Doctor Moss assignment, ZULU handling, Space Zero offer, Hash hook | report/wiki prose, Dossier `lore.relations`, Dossier `lore.sessionAppearances` | Persist as sourced narrative notes and structured Dossier graph | Applied for sourced character-to-character edges; non-character edges remain prose/catalog/wiki |
| economy/inventory/shop/credits | Session has research outcomes but no explicit grant approval | economy mutation plan | Do not mutate economy | Skipped by policy |

## Relationship Narrative Candidates

| from | to | beat | persistence target | status |
|---|---|---|---|---|
| 닥터 모스 | 마리아 / 클라운 / 오틸리아 | 사후 처리와 연구 방향 결정을 강제 배정 | operation report, Dossier `lore.relations` | Applied |
| 마리아 | WD-(𝓃) | 전자화 눈물 샘플 회수에서 우디의 분신체 무디 투입 | report, Dossier `lore.relations`, ZULU-0113 wiki, catalog lore | Applied |
| 마리아 팀 | ZULU-0113 | 해치 개방 유도를 차단하고 우디의 분신체 무디로 샘플 회수 | report, ZULU-0113 wiki, catalog lore | Applied; entity relation remains prose/catalog/wiki |
| 스페이스 제로 CEO 요한 스미스 | 스타크 팀 / 노부스 오르도 | ZULU-0028 이전과 연구 기록 확보 제안, 거절 | report, Space Zero spec/wiki, Dossier `JOHAN_SMITH` | Applied |
| 요한 스미스 | 클라운 / 오틸리아 | ZULU-0028 이전과 연구 기록 확보 제안, 거절 | Dossier `lore.relations` | Applied |
| 오틸리아 / 이동식 / 키아나 | 서로 간 연구 조합 | 소음, 백색소음, 자극 발화 조합으로 샘플 조건 확인 | report, Dossier `lore.relations`, catalog lore | Applied |
| 오틸리아 / 이동식 / 키아나 | ZULU-0028 | 소음, 백색소음, 자극 발화 조합으로 샘플 조건 확인 | report, catalog lore | Applied; entity relation remains prose/catalog/wiki |
| 해쉬 태거 | 마리아 / 클라운 / 오틸리아 | 유럽 연구소 봉쇄/전멸 긴급 호출 | report hook, Dossier `lore.relations`, Dossier event link | Applied; next session pending |

## ERP Gap Map

| target | status | issue | action |
|---|---|---|---|
| `/erp/sessions/report` | partial until rechecked | DB summary had `무디` without parent disambiguation | Apply follow-up payload and re-read |
| `/erp/wiki` | applied | `s1e1-mini` exists and is separated from `s1e1-order` | Recheck link graph after payload |
| `/erp/wiki/catalog/*` | applied | No economy grant/stock should be inferred | Keep catalog-only |
| `/erp/personnel` | applied | Dossier now reads structured `lore.relations` and `lore.sessionAppearances` in addition to `appearsInEvents` | Keep future session imports source-mapped and avoid unsourced relationship edges |
| 요한 스미스 Dossier | applied | GM provided profile and image; codename mechanically normalized to `JOHAN_SMITH` | Keep future edits source-mapped |
| relation graph | partially applied | Character-to-character edges are persisted; entity/institution-only beats still live in report/wiki/catalog prose | Add entity/institution relation model only if the ERP needs cross-domain graphing |

## Applied Writes In This Pass

- Follow-up payload: `StarGateV2/scripts/seed-payloads/nosb-s1e1-mini-followup.json`
- Dossier relation payload: `StarGateV2/scripts/seed-payloads/nosb-s1e1-mini-dossier-relations.json`
- 요한 스미스 Dossier payload: `StarGateV2/scripts/seed-payloads/npc-johan-smith.json`
- Reproducibility updates: mini seed payloads and ZULU-0113 archive payload now disambiguate `우디의 분신체 무디`.
- Spec update: `StarGateV2/docs/spec/catalog/zulu-0113-tear-sample.md` now uses `분신체`.
- Schema/UI update: Dossier relationship and session-appearance fields now exist in shared-db types/Zod schema, character PATCH allowlist, personnel redaction, and `/erp/personnel/[id]` UI.
- NPC spec/image: `StarGateV2/docs/spec/npc/johan-smith.md`, `/assets/npcs/Johan-Smith-profile.webp`.

## Post-write Verification

- DB re-read: `session_reports.NOSB-S1E1-MINI`, `wiki_pages.s1e1-mini`, `wiki_pages.zulu-0113-electronic-tear`, `master_items.zulu-0113-tear-sample`, and `characters.WD-(𝓃)` contain `우디의 분신체 무디`.
- Dossier event count: 14 character records currently include `NOSB-S1E1-MINI` in `lore.appearsInEvents`.
- Structured Dossier sync: 14 character records now include one `NOSB-S1E1-MINI` `lore.sessionAppearances` entry each; sourced character-to-character relation counts are Doctor Moss 3, Maria 3, WD-(𝓃) 1, Clown 2, Otilia 4, Lee Dongsik 2, 네베드 2, Indexer 3.
- 요한 스미스 Dossier: `characters.JOHAN_SMITH` includes `NOSB-S1E1-MINI`, official image path, one session appearance, and relations to CLOWN and OTILIA; `institutions.SPACE_ZERO.leaderCodename` is `JOHAN_SMITH`.
- Browser check on local ERP session:
  - report page renders `우디의 분신체 무디`, `전자화 눈물`, and `ZULU-0113`.
  - mini wiki page renders `우디의 분신체 무디`, `스페이스 제로`, and `소닉 이미터`.
  - ZULU-0113 wiki and catalog detail render the disambiguated sample acquisition.
  - `WD-(𝓃)` Dossier renders `NOSB-S1E1-MINI` and links back to the mini operation report.
- ERP link graph check:
  - report -> wiki: 4 links.
  - report -> catalog: 6 links.
  - report -> personnel: 14 links.
  - wiki-mini -> report: 1 link.
  - catalog ZULU-0113 tear sample -> report/wiki: confirmed.
  - personnel WD -> report: confirmed.

## Completion Status

- Status: partial, not full completion.
- Completed axes: source extraction, main/mini separation, report/wiki/catalog/personnel/institution/entity registration, ZULU-0113 archive image, relation prose fallback.
- Completed in this follow-up: formal Dossier relation/session-appearance persistence for sourced character-to-character mini-session beats.
- Remaining gaps: economy mutations, future Europe lab operation source, optional cross-domain relation model for entity/institution-only beats.
- Full sync is still not declared complete because the remaining gaps are outside the current persistence/source approval boundary.
