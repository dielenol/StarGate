# NOVUS 헤럴딕 아이콘 — 로어·기능 감사

검토일: 2026-08-30 · 생성 모드: built-in image_gen · 워크플로: stargate-images / heraldic-icon

## 판정과 범위

- 이전 두 배치 21개는 로어와 실제 페이지 기능에 부합해 유지했다.
- 이번 요청의 31개 도안은 신규 원화 생성 → 원화별 1회 축약 편집 → 55% binary/VTracer → 16·20·24·32px light/dark QA로 정리했다.
- 사용자가 일반 UI에도 heraldic-icon을 명시적으로 요청했으므로 캐릭터 내비게이션·분류·상세 슬롯에 같은 문장 문법을 적용했다. HP/SAN, 일반 잠금, 공용 인물 카드·인벤토리 장비 glyph는 범위 밖이다.
- 조직도는 `OrgIcon.tsx`를 source of truth로 유지한다. 재무·적대세력의 기존 공용 export 2개까지 같은 body로 맞춰 최종 SVG 파일은 33개다.
- 로어 사용 모드는 `consult-lore`다. 아래 근거는 기존 설정/기능이며, 도안 자체는 UI용 `design-proposal`이다. 새로운 공식 문장·교리·조직 계통을 canon으로 등록하지 않았다.
- DB·권한·경제·인벤토리 상태·Query 동작은 변경하지 않았다. 원화·binary·QA 보드는 임시 스테이징에만 보존한다.

## 근거

### canon-from-source

- `docs/spec/faction/novus-ordo.md`, `docs/spec/institution/secretariat.md`, `docs/spec/institution/manus.md`: 독립 초국가 조직, 머리/손 비유, 사무국 7개 기구와 MANUS 5개 섹터의 실제 임무.
- `docs/spec/faction/council.md`, `military.md`, `civil.md`, `hostile.md`: 외부 권력 블록의 성격과 적대세력이 단일 조직이 아닌 운영상 위협 분류라는 경계.
- `lib/external-sub-orgs.ts`: USA의 군사·정보망, RUSSIA의 국가 통제·군사 행정망, NOGA의 인류 우월주의·반비인간 폭력.
- `docs/spec/faction/golden-dawn.md`: `GOLDEN_DAWN / CONDUCTOR`의 금색 가면·검은 예복·무대 장막·금색 실. 세부 교리와 지휘자의 정식 계급은 미확정이다.
- `docs/spec/faction/ahnenerbe.md`: `AHNENERBE / EXPERIMENT_88`의 적대 연구·오래된 기록·실험체 흔적. 기존 명칭인 아넨에르베 “광명회”는 유지하며 현행 지휘 계통을 추정하지 않는다.
- 모노레포 `docs/lore/history/novus-ordo-founding.md`, `ww2-occult.md`, `docs/lore/faction/world-council.md`, `military.md`, `civil.md`를 보조 대조했다.

### 실제 UI 기능

- `components/erp/nav-config.ts`: Sidebar/Command-K의 실제 경로와 용도.
- `app/(erp)/erp/characters/CharactersClient.tsx`: MAIN/MINI와 실험체·관료·군인·과학자 분류.
- `app/(erp)/erp/characters/[id]/CharacterDetailClient.tsx`, `CharacterEquipmentPanel.tsx`: 외모·성격·배경·활성 무기·활성 방어구·장비 로드아웃.
- `app/(erp)/erp/personnel/_components/OrgIcon.tsx`, `packages/shared-db/src/types/character.ts`: 조직/세력/하위 기구 code와 실제 소비 슬롯.
- 기존 배치는 각 연결 페이지의 조회·운영 기능, `lib/catalog/categories.ts`, `WikiClient.tsx`, `wiki-display.ts`와 비교했다.

## 이전 배치 21개 재감사

| 아이콘 | 실제 기능과 도안 대응 | 판정 |
|---|---|---|
| 세력도 · ic_faction-map.svg | 조직 간 노드·관계 탐색 / 연결된 중심 문장 | 유지 |
| 명예의 전당 · ic_crown.svg | 연구·투자·작전 공적과 표창 / 공적 인장·월계 | 유지 |
| 인벤토리 · ic_inventory.svg | 보유 자산 보관·조회 / 보관 상자 | 유지 |
| 교환·전달 · ic_transactions.svg | 자산 교환·전달과 거래 흐름 / 순환 화살표 | 유지 |
| 편의점 · ic_shop.svg | STAR MART 상품 탐색·구매 / 상점 문장 | 유지 |
| 샘플 연구소 · ic_sample.svg | 샘플 분석·처리 / 격리 표본 용기 | 유지 |
| 병기부 · ic_armory.svg | 사무국 병기 조달 / 방패·직검·모루 | 유지 |
| 주식 · ic_stock.svg | NOVEX 시장·종목·보유 자산 / 시장 차트 인장 | 유지 |
| 위키 · ic_wiki.svg | 설정·기록 탐색 / 책·지식 나침반 | 유지 |
| 기록보관소 · ic_core-archive.svg | 카탈로그 분류·기록 열람 / 잠금 기록철 | 유지 |
| 연대기 · ic_world.svg | 세계 사건의 시간 축 / 모래시계·궤도 | 유지 |
| 관리자 · ic_admin.svg | GM 운영 진입점 / 지휘 문장 | 유지 |
| VTT 운영 · ic_admin-vtt.svg | VTT 호스트·운영 상태 / 전술 지도·호스트 | 유지 |
| 사용자 관리 · ic_admin-users.svg | 사용자 계정·권한 / 사용자 보호 인장 | 유지 |
| 크레딧 운영 · ic_admin-credits.svg | 크레딧 조정·감사 / 균형 저울 | 유지 |
| 주식 운영 · ic_admin-stocks.svg | 시장·종목 운영 / 관리 차트 | 유지 |
| 대사 비프 테스트 · ic_admin-dialogue-beep.svg | 대사·비프 오디오 점검 / 대화 파형 | 유지 |
| 인벤토리 운영 · ic_admin-inventory.svg | 보유 품목·자산 운영 / 확인된 보관 상자 | 유지 |
| 신규 품목 운영 · ic_admin-catalog.svg | 편의점 신규 품목 등록 / 상점·추가 표식 | 유지 |
| 투표 운영 · ic_admin-votes.svg | 관료 투표 운영 / 투표함·표결 | 유지 |
| 캐릭터 운영 · ic_admin-characters.svg | 캐릭터 등록·가져오기 / 검증된 인물 기록 | 유지 |

## 신규 도안과 동기화 슬롯

다음 모티프는 기능/기존 설정을 해석한 디자인이며 기존 국가 국장·국기나 실제 극단주의 문장을 복제하지 않는다. 일반 `IconPersonCard`와 `IconInventoryEquipment`는 다른 소비처를 위해 유지하고, 캐릭터 내비게이션과 활성 장비에 전용 export를 사용한다.

| Master key | 공개 SVG · public/assets/svg/ | 근거/소비 의미 |
|---|---|---|
| character | ic_character.svg | UI · 캐릭터 목록/등록부 |
| main | org_scope_main.svg | UI · 주 캠페인 정체성 |
| mini | org_scope_mini.svg | UI · 보조 캐릭터 분류 |
| subject | ic_subject.svg | UI · 실험체 직군 |
| bureaucrat | ic_bureaucrat.svg | UI · 관료 직군 |
| soldier | ic_soldier.svg | UI · 군인 직군 |
| scientist | ic_scientist.svg | UI · 과학자 직군 |
| profile | ic_profile.svg | UI · 외모/시각 식별 |
| personality | ic_personality.svg | UI · 성격/내적 특성 |
| background | ic_background.svg | UI · 과거/형성 경로 |
| activeWeapon | ic_active-weapon.svg | UI · 현재 장착 무기 |
| activeArmor | ic_active-armor.svg | UI · 현재 장착 방어구 |
| swordShield | ic_sword-shield.svg | UI · 장비 구성 |
| secretariat | org_institution_secretariat.svg | canon-from-source · SECRETARIAT |
| manus | org_institution_manus.svg | canon-from-source · MANUS |
| control | org_subunit_control.svg | canon-from-source · SECRETARIAT/CONTROL |
| finance | org_subunit_finance.svg | canon-from-source · SECRETARIAT/FINANCE |
| sectorA | org_subunit_sector_a.svg | canon-from-source · MANUS/SECTOR_A |
| sectorB | org_subunit_sector_b.svg | canon-from-source · MANUS/SECTOR_B |
| sectorC | org_subunit_sector_c.svg | canon-from-source · MANUS/SECTOR_C |
| sectorD | org_subunit_sector_d.svg | canon-from-source · MANUS/SECTOR_D |
| sectorE | org_subunit_sector_e.svg | canon-from-source · MANUS/SECTOR_E |
| board | org_faction_council.svg | canon-from-source · COUNCIL |
| military | org_faction_military.svg | canon-from-source · MILITARY |
| civil | org_faction_civil.svg | canon-from-source · CIVIL |
| extNoga | org_extorg_noga.svg | canon-from-source · MILITARY/NOGA |
| extUsa | org_extorg_usa.svg | canon-from-source · MILITARY/USA |
| extRussia | org_extorg_russia.svg | canon-from-source · MILITARY/RUSSIA |
| hostile | org_faction_hostile.svg | canon-from-source · HOSTILE |
| extGoldenDawn | org_extorg_golden_dawn.svg | canon-from-source · GOLDEN_DAWN/CONDUCTOR |
| extAhnenerbe | org_extorg_ahnenerbe.svg | canon-from-source · AHNENERBE/EXPERIMENT_88 |

`FINANCE`는 `ic_finance.svg`, `HOSTILE`는 `ic_hostile.svg`에도 동일 body를 적용한다. 조직도·신원조회·세력도·위키 예산 분류가 같은 뜻의 도안을 공유한다.

활성 장비 전용 아이콘을 분리한 뒤에도 기존 `IconInventoryEquipment`가 마스터에서 빠지지 않도록 인벤토리·위키의 실제 장비 분류에 연결했다. 기록보관소의 `IconEquipment`와는 구분하며, 마스터의 모든 정의가 적어도 한 페이지/예비 그룹에서 렌더링되는지 회귀 검사한다.

현재 `nav-config.ts`에서 일반 내비게이션 경로로 제공되는 명예의 전당은 마스터의 낡은 `GM preview` 표식만 제거했다. 이 아이콘 작업에서 해당 경로의 공개 범위나 권한 로직을 바꾸지는 않았다.

## 최종 축약 프롬프트 세트

모든 원화에 아래 고정 템플릿을 정확히 한 번 적용했다. `organization_name`, `essential_shapes`, `details_to_remove`만 아래 표로 치환하며, 입력은 해당 subject의 semantic staging 원화 한 장이다.

```text
Edit the supplied {{organization_name}} emblem into a radically simplified small-icon master while preserving its distinctive identity.
Keep: {{essential_shapes}}
Remove: {{details_to_remove}}, all hairlines, tiny gaps, decorative flourishes, texture, and details that disappear at 24×24.
Result: exactly one compact coherent glyph, solid black shapes with broad white negative-space cuts on a transparent or pure white background, maximum 5–8 major shapes, centered with generous padding, crisp flat SVG/logo appearance, immediately legible at 24×24.
Do not add new symbols, text, letters, numbers, runes, watermark, mockup, gradient, shadow, gray, color, or 3D.
```

| organization_name | essential_shapes | details_to_remove |
|---|---|---|
| Character Registry | one compact dossier silhouette, one agent bust cutout, and one broad four-point compass star fused to its base | the outer compass ring and pointers, duplicate pages, text-like lines, separate star ring, and thin gaps |
| Main Character | one adult agent bust and one full four-point compass crown integrated into a compact circular upper mantle | hair strands, facial features, lapels, lower book-like wings, side dots, concentric rings, and narrow rays |
| Mini Character | one simple ordinary adult human silhouette nestled inside one broad orbital crescent, with one small broad spark | astronaut helmet, visor highlight, spacesuit/cape styling, cute proportions, satellite ball, second orbit, and narrow cuts |
| Subject Class | one containment capsule around one human bust with a single broad anomaly spiral cut | full-body anatomy, extra orbit rings, side dots, cylindrical rim detail, repeated spiral coils, and tiny gaps |
| Bureaucrat Class | one solid closed ledger whose spine forms an authority pillar and one broad quill cut | multiple page outlines, seal rosette scallops, feather barbs, fluted pillar lines, and stepped ornament |
| Soldier Class | one severe armored helmet silhouette within one shield with its crest continuing into a short spearhead | nested shield borders, double helmet outlines, extra visor notches, and thin vertical seams |
| Scientist Class | one laboratory vessel containing one broad anomaly spark and one single controlled orbit | inner flame curls, loose bubbles, duplicated ring segments, satellite ball, and fine glass outline details |
| Character Appearance | one face-profile silhouette inside one broad optical scan frame | hair strands, scan arrowhead, double circular frames, tiny pupil, and thin face details |
| Character Personality | two opposing mask profiles merged around one broad inner flame | maze rings, facial expression strokes, fine hair curls, narrow eye cuts, and decorative cheek lines |
| Character Background | one open archive folio with one broad winding origin-to-present path | mountain peaks, intermediate path dots, multiple page lines, outer compass points, and fine ring details |
| Active Weapon | one strong active weapon silhouette with one broad activation spark and two short targeting brackets | full outer circle, extra star rays, grip wrapping lines, tiny center hole, and duplicate blade outlines |
| Active Armor | one broad breastplate silhouette within one simple shield contour, with one large activation-star cut | abdominal plate seams, shoulder plate outlines, collar detail, double shield borders, and tiny pointed cuts |
| Equipment Loadout | one central shield and weapon spine joined to two broad modular equipment blocks | medical cross, numerous pouches, buckles, straps, extra pockets, grip wraps, and thin shield segments |
| Secretariat | one commanding compass headpiece over one solid administrative ledger with seven broad radiating administrative facets | thin ring details, narrow page lines, tiny seal rings, and decorative needle points |
| MANUS | one strong hand gripping one spear-like field compass in a compact open ring | knuckle creases, narrow finger gaps, duplicate ring segments, and extra needle outlines |
| Control Bureau | one heavy padlock containing one watchful eye and two broad inspection bars | wing-like repeated stripes, nested shield borders, keyhole detail, tiny pupil highlight, and thin inner outlines |
| Finance Bureau | one solid balanced scale around one audit disc inside one broad ring | laurel leaves, column fluting, multiple coin outlines, decorative top and bottom points, and thin suspension wires |
| Sector Alpha | one reinforced shield with one central forward spearhead and one broad impact cut | multiple jagged lightning wings, extra impact rays, nested shield outlines, and narrow spear slots |
| Sector Bravo | one broad cipher key forming the central axis of one intelligence eye, with two short circuit branches | tiny circular terminals, four duplicated branches, nested shield border, key-tooth clutter, and thin connection lines |
| Sector Charlie | one stealth crescent merged with one sealed containment capsule containing one broad ice-crystal cut | hooded face eyes, extra cloak edges, multiple capsule rims, complex snowflake twigs, and narrow white seams |
| Sector Delta | two opposing simple profiles sharing one bridge-shaped handshake at the base | hair bands, suit collars, finger creases, upper dot, extra rim arc, and narrow central sparkle rays |
| Sector Echo | one open healing hand supporting a large recovery cross with a single broad heartbeat notch | individual finger creases, double medical halo, extra shield rim, and thin pulse zigzags |
| World Council | one globe with a severe three-point signet crown and one broad orbital balance ring | dense latitude-longitude lattice, tiny crown balls, nested orbital rings, and small bottom circles |
| Military Authority | one fortress-topped tower shield with two broad command chevrons and one vertical spearhead | duplicate shield outlines, tiny spear collars, narrow parallel lines, and extra edge notches |
| Civil Society | three linked human forms supported by one open hand with one broad rising spark | fine finger divisions, narrow body loops, small detached flourishes, and thin gaps |
| NOGA | one clenched human fist inside one broken containment ring with one angular hostile flame | finger crease details, small detached ring shards, multiple flame tips, and narrow wrist zigzags |
| United States Network | one original eagle silhouette with broad geometric wings sharing its body with one intelligence key | multiple feather bands, giant overlapping compass star, extra circular rings, tiny eye, and key teeth clutter |
| Russian Network | one original geometric bear head under a simple fortress crown with one broad polar-compass cut | fur spikes, facial wrinkles, complex globe lattice, giant overlapping compass star, tiny crown windows, and thin white gaps |
| Hostile Classification | one fractured target ring, four broad inward threat shards, and one central watchful void | extra radial shards, tiny points, duplicated ring gaps, and narrow interior rays |
| Golden Dawn | one expressionless mask embraced by two broad stage-curtain folds and three thick ritual-thread ends | facial nose and mouth details, multiple curtain pleats, nested halo lines, tiny string rings, and fine thread strokes |
| Ahnenerbe | one sealed specimen vessel with one captive anomaly eye merged into one fractured archive folio | triangle/pyramid frame, outer orbital ring, multiple crack branches, specimen bubbles, curling fluid strands, repeated vessel rims, and thin page outlines |

원화는 `heraldic-icon` 고정 `logo-brand` 템플릿으로 생성했다. 주요 조건은 단색 검정, 24px 실루엣, 하나로 통합된 2~3개 모티프, 무문자·무룬·무국기·무그라데이션이다. 생성은 모두 built-in 도구를 사용했으며 CLI fallback은 사용하지 않았다.

아넨에르베의 축약본은 작은 크기에서 표본 눈과 책 균열이 약해, 원 도안의 구성은 유지하고 미세선/겹테를 줄여 8개 fill path로 정리했다. 눈과 균열의 negative space를 넓힌 후 동일 4크기·2배경 QA를 다시 확인했다. 추가 생성 편집은 하지 않았다.

## 검증 결과

- 신규 동기화 계약 36건, 기존 외부 조직 계약 3건, 자산 테스트 12건을 통과했다. `pnpm typecheck`, `pnpm lint`, `pnpm assets:audit`, `git diff --check`도 통과했다.
- 최종 SVG 33파일은 XML 파싱과 `24×24 / currentColor / fill-only` 계약을 통과했다. 아이콘 감사는 128종·내비게이션 38경로, 마스터 JavaScript syntax는 정상이다.
- 마스터 브라우저에서 128개 정의 모두 렌더링되고 기록보관소 5경로가 표시됨을 확인했다. 공용 그룹 중복을 포함하면 카드 259개이며, 고아 정의는 없다. 마스터·ERP의 콘솔 오류·경고와 런타임 오류는 모두 0건이다.
- 인증된 `localhost:43849`에서 캐릭터 목록·상세와 신원조회 조직도를 `1440×1000`, `390×844`로 확인했다. 사무국·MANUS·군부·적대세력 하위 화면, Dossier 상세, 세력도·위키는 `1440×1000`으로 확인했다. 가로 넘침과 깨진 이미지가 없으며, 조직 아이콘의 실제 SVG body·크기·조직별 색상 상속을 대조했다.
- Dossier 첫 자동 확인은 breadcrumb가 본문 `main` 밖의 공용 헤더에 렌더링되어 대기 조건이 만료됐다. QA 선택자를 실제 화면 구조로 수정한 재검증에서는 MANUS 문양의 16px 렌더와 오류 없는 화면을 확인했다. 앱 코드 수정은 필요하지 않았다.
- 현재 위키 목록에는 예산 분류가 없어 재무 glyph는 `WikiClient`의 매핑과 공용 SVG·OrgIcon·마스터 parity로 확인했다. 검증을 위해 문서나 카테고리 데이터를 생성하지 않았다.
- production build·배포·push·라이브 데이터 mutation은 실행하지 않았다. 기존 개발 서버를 사용해 읽기 전용 UI를 확인했다.

## 미확정 사항

- 각 조직의 공식 문장 규정은 별도 canon으로 확정되어 있지 않다. 이 문서는 UI 도안의 근거와 재현용 프롬프트를 기록할 뿐이다.
- 황금여명회 세부 교리, 지휘자의 본명/정식 계급, 아넨에르베 현행 지휘 계통은 기존 문서처럼 미확정으로 둔다.
