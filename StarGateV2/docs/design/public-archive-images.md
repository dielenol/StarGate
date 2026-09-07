# 공개 아카이브 카드 이미지

- 생성 모드: built-in image_gen
- Skill: stargate-images / environment-background / stargate-v2
- 시각 기준: 고정 Maria 레퍼런스의 선화·회색 워시·종이 질감. 특정 공식 장소의 설정을 추가하는 자료가 아닌 공개 탐색 카드용 환경 삽화다.
- 출력: 불투명 4:3 WebP. 기존 세계 지도는 유지하고 CSS에서 세 이미지의 색감·크롭·본문 대비를 맞춘다.
- 소비처: `app/(public)/page.tsx`의 룰·플레이어 카드.

## 룰 — 작전 매뉴얼 열람실 (이전 자산)

최종 경로: `public/assets/world-view/novus-protocol-reading-room.webp`

발행 규격: 1448×1086, 불투명 WebP, quality 90, 198,384 bytes. SHA-256: `73d8e2f17c4970c1539416016b2255ed57a71429f3d82ef43173b23aba12191a`.

```text
Use case: stylized-concept
Asset type: StarGate visual-novel environment background for an interactive web game
Input images: Image 1 is the fixed Maria style reference only.
Reference roles: take only the fine hand-drawn linework, pale grayscale wash, selective accent-color handling, paper-like texture, and soft angular shadow language from Image 1. Never copy its character, anatomy, costume, facial features, pose, tongue, teeth, or ornaments.
Style/medium: hand-drawn 2D visual-novel environment illustration matching Image 1's delicate graphite-and-ink contour work, translucent grayscale brush washes, lightly broken handmade edges, restrained cel-like shadow blocks, sparse selective accent colors, and quiet paper-textured atmosphere; clearly illustrated rather than photorealistic; grounded materials and readable spatial depth
Composition/framing: 4:3 landscape wide establishing view, designed as a full-bleed illustrated archive cover; central focal scene in the upper two thirds with generous side margins; the upper left label-safe area must stay calm; keep the lower 25% as a continuous low-detail, low-contrast dialogue-safe zone; retain the scene identity under responsive cover cropping.
Lighting/mood: restrained side light and soft angular shadows, quiet dignified institutional archive, rich material detail in the focal object, restrained mystery.
Color palette: warm parchment, graphite gray and charcoal, small muted antique-brass accents only; predominantly grayscale with a faint sepia wash. No vivid colors.
Constraints: environment only; opaque background; no people, no characters, no human or creature silhouettes, no copied subject matter from Image 1, no readable text, no letters, no numbers, no logos, no watermark, no UI panels, no borders; do not place high-contrast focal details in the dialogue-safe zone
Avoid: photorealistic or 3D-rendered finish, generic empty sci-fi room, glossy stock-image look, excessive bloom, dense clutter across the whole canvas, illegible pseudo-text, foreground objects cut off by the frame, Maria's character content leaking into the environment.
Primary request: NOVUS Protocol Reading Room — an atmospheric archival illustration for the tabletop RPG rules navigation card, evoking operational discipline, study and decisions.
Scene/backdrop: a wood reading desk in a quiet twentieth-century institutional reference library, shallow shelves fading into graphite shadow behind it.
Subject: an unoccupied environmental establishing shot; an impressive thick open leather-bound operations manual centered in the upper-middle, its cream pages bearing only sparse abstract geometric tactical diagrams, absolutely no writing; a closed reference volume behind it, a slim brass divider beside the manual, a soft desk-lamp pool of light from outside the frame. The open book is broad and immediately readable even as a thumbnail; show the desk surface and a little room depth, not a floating isolated object.
Additional composition: camera slightly above desk level, looking down at a three-quarter angle; the manual occupies roughly half the image width, all its corners inside frame. The lower quarter is plain softly shaded wood with no objects.
```

## 룰 — 공식 규정집 (현재 사용)

- 생성 모드: built-in image_gen, `stargate-images`의 environment-background 워크플로.
- 플레이어 이미지에 대한 사용자 승인과 유사한 룰 이미지 제작 요청을 근거로 공식 문장·조직명·규정집 제목만 로고·문자 금지의 예외로 사용했다.
- 입력 역할: 고정 Maria 화풍 기준 → 사용자가 승인한 `novus-agent-credentials.webp`의 책상·카메라·강조 구도 → 기존 `StarGate_logo.webp`의 공식 문장. 지갑·명찰·끈은 규정집에 복제하지 않는다.
- 최종 경로: `public/assets/world-view/novus-protocol-codex.webp`. 기존 열람실 이미지는 보존하고 메인 룰 카드의 소비 경로만 교체했다.
- 발행 검증: 1448×1086, 불투명 RGB WebP, quality 90, 295,714 bytes. SHA-256 `7f3dd2d57886ffbdafea2d7cfce25c6b8d73c346addfce0396b9ace50c9ee9b5`.

### 최종 생성 프롬프트

```text
Use case: stylized-concept
Asset type: StarGate visual-novel environment background for an interactive web game
Input images: Image 1 is the fixed Maria style reference only; Image 2 is the user-approved agent-credentials scene/composition reference only; Image 3 is the official NOVUS ORDO insignia, used only as the exact identity reference for the physical book emblem.
Reference roles: take only the fine hand-drawn linework, pale grayscale wash, selective accent-color handling, paper-like texture, and soft angular shadow language from Image 1. Never copy its character, anatomy, costume, facial features, pose, tongue, teeth, or ornaments. From Image 2 preserve only the archive drawer strip, wooden desktop, camera angle, close framing, focal scale, and quiet institutional setting. Do not reproduce its wallet, ID card, badge, lanyard, clip, or strap. From Image 3 accurately reproduce the eye within interlocked triangular stars, globe and olive wreath as a crisp antique-gold emblem embossed into the book cover.
Primary request: NOVUS Protocol Codex — create the rules-card counterpart to the approved player-card image, with the organization's authoritative rulebook as the immediately legible, strongly emphasized main subject. The viewer should recognize a substantial bound regulations manual at thumbnail size.
Scene/backdrop: the same dark walnut registrar desk with a narrow, softly faded strip of archival metal drawers across the upper background, in an intimate view from above.
Subject: an unoccupied environmental establishing shot; one large, closed, landscape-foreshortened charcoal leather hardbound codex resting diagonally across the upper-middle of the desk. Give it a clearly thick pale ivory page block, visible stitched spine, restrained antique-brass corner protectors, and one slim dark-gold ribbon bookmark tucked between the pages. The cover faces the viewer clearly, showing a large, sharply readable inset gold official emblem from Image 3. Small elegant debossed serif words "NOVUS ORDO" and below them "PROTOCOL" sit above the emblem and fit comfortably inside the cover. The emblem is the principal visual focus. The thick page block and spine must make this unmistakably a book, not another credentials wallet. No other foreground objects.
Style/medium: hand-drawn 2D visual-novel environment illustration matching Image 1's delicate graphite-and-ink contour work, translucent grayscale brush washes, lightly broken handmade edges, restrained cel-like shadow blocks, sparse selective accent colors, and quiet paper-textured atmosphere; clearly illustrated rather than photorealistic; grounded materials and readable spatial depth
Composition/framing: 4:3 landscape wide establishing view with intimate close-up framing. Keep the entire book inside the central 76% width and between 15% and 65% height; all important emblem and title details must lie between 22% and 53% height, so they remain readable in a tall web navigation card using cover cropping. The upper-left margin is quiet for an overlaid card label. Keep the lower 35% as a continuous low-detail, low-contrast dialogue-safe zone of plain dark wood; retain the scene identity under responsive cover cropping. The book should dominate the upper-middle half, not appear as a distant small prop.
Lighting/mood: soft directional light gently catches the gold insignia and the pale page edges against dark leather. Quiet, authoritative and tactile, with clear focal separation and natural soft shadows.
Color palette: graphite gray, charcoal leather, dark warm walnut, restrained warm ivory page edges, selective antique gold on the emblem and book fittings. Predominantly grayscale with a faint warm wash.
Constraints: environment only; opaque background; no people, no characters, no human or creature silhouettes, no copied subject matter from Image 1, no watermark, no UI panels, no borders; do not place high-contrast focal details in the dialogue-safe zone.
User-requested exception to the environment workflow's default no-logo/no-text rule: include only the exact official NOVUS ORDO insignia from Image 3 and the precise words "NOVUS ORDO" and "PROTOCOL" on the physical rulebook. No other letters, numbers, false writing, symbols, brands or seals. This exception follows the user's request for the rules image to match the approved official-logo credentials image.
Avoid: photorealistic or 3D-rendered finish, generic empty sci-fi room, glossy stock-image look, excessive bloom, dense clutter across the whole canvas, illegible pseudo-text, foreground objects cut off by the frame, Maria's character content leaking into the environment, an ID wallet or lanyard, a tiny emblem, a plain open book without an identifiable cover.
```

## 플레이어 — 인사 기록실 (이전 자산)

최종 경로: `public/assets/world-view/novus-personnel-registry.webp`

발행 규격: 1448×1086, 불투명 WebP, quality 90, 305,592 bytes. SHA-256: `1c34b57ebd2a79dd1133a50564e831e1e867cf2739731cab42549bf18c8891a7`.

```text
Use case: stylized-concept
Asset type: StarGate visual-novel environment background for an interactive web game
Input images: Image 1 is the fixed Maria style reference only.
Reference roles: take only the fine hand-drawn linework, pale grayscale wash, selective accent-color handling, paper-like texture, and soft angular shadow language from Image 1. Never copy its character, anatomy, costume, facial features, pose, tongue, teeth, or ornaments.
Style/medium: hand-drawn 2D visual-novel environment illustration matching Image 1's delicate graphite-and-ink contour work, translucent grayscale brush washes, lightly broken handmade edges, restrained cel-like shadow blocks, sparse selective accent colors, and quiet paper-textured atmosphere; clearly illustrated rather than photorealistic; grounded materials and readable spatial depth
Composition/framing: 4:3 landscape wide establishing view, designed as a full-bleed illustrated archive cover; central focal scene in the upper two thirds with generous side margins; the upper left label-safe area must stay calm; keep the lower 25% as a continuous low-detail, low-contrast dialogue-safe zone; retain the scene identity under responsive cover cropping.
Lighting/mood: restrained side light and soft angular shadows, quiet dignified institutional archive, rich material detail in the focal object, restrained mystery.
Color palette: warm parchment, graphite gray and charcoal, small muted antique-brass accents only; predominantly grayscale with a faint sepia wash. No vivid colors.
Constraints: environment only; opaque background; no people, no characters, no human or creature silhouettes, no copied subject matter from Image 1, no readable text, no letters, no numbers, no logos, no watermark, no UI panels, no borders; do not place high-contrast focal details in the dialogue-safe zone
Avoid: photorealistic or 3D-rendered finish, generic empty sci-fi room, glossy stock-image look, excessive bloom, dense clutter across the whole canvas, illegible pseudo-text, foreground objects cut off by the frame, Maria's character content leaking into the environment.
Primary request: NOVUS Personnel Registry — an atmospheric archival illustration for the tabletop RPG player navigation card, evoking individual records and the many stories inside a covert international organization.
Scene/backdrop: a quiet twentieth-century personnel archive with metal index-card drawers and leather document boxes fading into soft graphite shadows.
Subject: an unoccupied environmental establishing shot; a tidy cluster of three cream dossier folders with distinctive blank index tabs centered in the upper-middle of a wood registrar desk, one folder partly open with archival sheets and empty photo-mount corners, a blank metal identification tag on the folder and an open shallow index-card drawer behind it. No portraits, no people, no silhouettes, no writing. Dossiers and card drawers make the personnel-record function clear at thumbnail size. This is a complete room-and-desk illustration, not a floating icon.
Additional composition: camera slightly above desk level, looking down at a three-quarter angle; the folders occupy roughly half the image width, all corners inside frame. The lower quarter is plain softly shaded wood with no objects.
```

## 플레이어 — 로고와 명찰 (현재 사용)

- 생성 모드: built-in image_gen. 기존 인사 기록실 대신 공식 문장이 있는 가죽 증명서와 금속 명찰을 강조한다.
- 사용자 요청에 따라 환경 배경의 기본 로고·문자 금지 조건에서 공식 NOVUS ORDO 문장과 조직명만 예외로 허용했다. 인물 이름·사진·등급은 만들지 않았다.
- 입력 역할: 고정 Maria 화풍 기준, 명찰 장면 편집 대상, 기존 `public/assets/StarGate_logo.webp`의 공식 문장 정체성.
- 발행 검증: 1448×1086, RGB WebP, quality 90, 294,872 bytes. SHA-256 `91da5cc0bc496eea8da3831cf1863ee547fdcba384022f604b44728ba1b61522`.
- 최종 경로: `public/assets/world-view/novus-agent-credentials.webp`.
- 기존 인사 기록실 원본은 보존하며 현재 카드 소비 경로만 새 자산으로 변경한다.

### 최종 편집 프롬프트

```text
Use case: stylized-concept
Asset type: StarGate visual-novel environment background for an interactive web game
Input images: Image 1 is the fixed Maria style reference only; Image 2 is the existing personnel archive scene/composition reference only; Image 3 is the official NOVUS ORDO insignia, provided exclusively as the exact logo identity reference requested by the user.
Reference roles: take only the fine hand-drawn linework, pale grayscale wash, selective accent-color handling, paper-like texture, and soft angular shadow language from Image 1. Never copy its character, anatomy, costume, facial features, pose, tongue, teeth, or ornaments. From Image 2 preserve the old institutional desk and archive setting and the quiet warm grayscale art direction, while replacing its foreground composition. From Image 3 reproduce the eye inside interlocked triangular stars, globe and surrounding olive wreath accurately as a crisp gold emblem on the physical credential.
Primary request: NOVUS Agent Credentials — revise the player-card environmental illustration so the official organization insignia and an agent's physical identification badge are immediately the main focal subject, strongly recognizable even in a small navigation card.
Scene/backdrop: a close view across a dark walnut registrar desk; the same archive drawers from Image 2 remain small and softly faded far behind. Remove the three large blank paper folders from the foreground.
Subject: an unoccupied environmental establishing shot focused on one large premium charcoal leather credential holder lying on the desk, with a prominent inset antique-gold metal NOVUS ORDO insignia from Image 3; beside it, partially overlapping the holder, lies a substantial brushed-metal rectangular name badge with a real clip and dark woven lanyard. The name badge carries the precise words "NOVUS ORDO" and a clean blank name strip, without inventing a named character, photo, personal data or agent number. The large gold insignia and name badge must occupy most of the upper-middle half of the frame, with clear silhouettes, substantial material thickness and restrained handmade detail. Paperwork should be only a barely visible supporting edge behind the credentials.
Style/medium: hand-drawn 2D visual-novel environment illustration matching Image 1's delicate graphite-and-ink contour work, translucent grayscale brush washes, lightly broken handmade edges, restrained cel-like shadow blocks, sparse selective accent colors, and quiet paper-textured atmosphere; clearly illustrated rather than photorealistic; grounded materials and readable spatial depth
Composition/framing: 4:3 landscape wide establishing view, intimate close-up of the physical credentials; upper left margin is calm for a web label; the emblem and badge are fully inside the central 70% of the canvas, upper two thirds; keep the lower 25% as a continuous low-detail, low-contrast dialogue-safe zone; retain the scene identity under responsive cover cropping.
Lighting/mood: a controlled soft side light catches the brushed brass insignia and nameplate against deep charcoal leather. Quiet, authoritative, tactile; strong focal separation rather than a busy pile of documents.
Color palette: graphite gray, charcoal leather, pale warm paper and selective antique gold; the most saturated color belongs to the official emblem. No bright colorful accents.
Constraints: environment only; opaque background; no people, no characters, no human or creature silhouettes, no copied subject matter from Image 1, no watermark, no digital UI panels, no borders; do not place high-contrast focal details in the dialogue-safe zone.
User-requested exception to the environment workflow's default no-logo/no-text rule: include only the exact official insignia from Image 3 and the words "NOVUS ORDO" on the physical credentials. Do not add other letters, numbers, logos or pseudo-writing.
Avoid: photorealistic or 3D-rendered finish, generic empty sci-fi room, glossy stock-image look, excessive bloom, dense clutter across the whole canvas, illegible pseudo-text, foreground objects cut off by the frame, Maria's character content leaking into the environment.

Focused composition correction: Image 2 is now the generated credentials scene being edited. Keep its successful physical leather holder, exact official gold emblem, brushed-metal name badge, words "NOVUS ORDO", hand-drawn materials, art style and palette. Change only placement and framing for the navigation-card crop. Move both credential objects higher and arrange them SIDE BY SIDE at nearly the SAME vertical center: the leather holder on the center-left and the horizontal name badge on the center-right, with a small natural overlap. Both subjects, including the entire name badge and all of its letters, must fit inside the CENTRAL 70% WIDTH and between 18% and 60% HEIGHT of the image. Reduce their projected height to fit that band, while retaining their clear readable focal scale. Do not put the badge in the lower-right corner. Reserve the BOTTOM 35% of the canvas as plain, dark, low-detail wood; absolutely no badge, letters, chains, or important emblem detail there. Reduce the upper room background to a soft supporting strip. A 4:3 landscape card background, seen from a somewhat higher camera angle; the emblem and nameplate remain the two unmistakable subjects. No new objects, no character identity, no UI.
```
