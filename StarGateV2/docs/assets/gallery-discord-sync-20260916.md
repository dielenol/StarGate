# 2026-09-16 Discord 컷씬 갤러리 누락 동기화

## ERP에 추가·수정한 내용

저장소와 인증된 로컬 갤러리에 누락 이미지 **29장**을 부분 반영했다. 운영 배포는 실행하지 않았다.

| 앨범 | sessionId | 신규 이미지 |
|---|---|---:|
| 5959 격리 | NOSB-MINI-5959-CONTAINMENT | 1 |
| 악 1부 | NOSB-S1E5-EVIL-PART1 | 4 |
| 변곡점 1부 | NOSB-S1E6-TURNING-POINT-PART1 | 1 |
| 변곡점 2부 | NOSB-S1E6-TURNING-POINT-PART2 | 10 |
| 빈 창고의 자장가 2부 | NOSB-MINI-LULLABY-PART2 | 3 |
| 욕구 1부 | NOSB-S1E7-DESIRE-PART1 | 2 |
| 욕구 2부 | NOSB-S1E7-DESIRE-PART2 | 8 |

- 정적 컷씬 manifest: 424→453장. 같은 인증 세션에서 갤러리 전체: 620→649장.
- 신규 WebP 29개, 총 3,763,114 bytes. 장변 1400px 이하·단일 프레임·완전 불투명·파일당 1MiB 이하. 원본 프레임의 구도를 자르지 않았다.
- 구현: `lib/gallery/session-cutscenes.ts`, `public/assets/session-reports/`의 해당 7개 폴더, corpus 수량 감사 기대값.
- [원본별 처리 기록](gallery-discord-sync-20260916.json)에 첨부·메시지 ID, 판정 근거, 신규 원본/정규화 입력/최종 출력 SHA-256을 기록했다. 만료되는 서명 URL과 인증 정보는 저장하지 않았다.

## 사용자가 확인할 내용

- `/erp/gallery`에서 `변곡점 2부 컷신` 검색 시 10장, `자장가 2부 컷신` 3장, `욕구 1부 컷신` 2장, `욕구 2부 컷신` 8장을 확인할 수 있다. 현재 변경은 로컬에만 반영되어 있다.
- 욕구의 인물 도판 7장과 거대 감염자 도판은 2부 보고서에 연결했다. 위버우드의 우디와 지하 무기고는 1부에 연결했다.
- 상세보기에서 원본 비율을 보존하며 각 회차 작전 보고서로 이동하는 링크를 제공한다.

## 검토안으로만 남긴 내용 / 건드리지 않은 내용

- 미귀속 80장과 보고서가 없는 역할극 31장은 새 앨범에 넣지 않았다. 게시 순서만으로 회차를 만들거나 보고서 본문을 작성하지 않았다.
- 투명·초록 크로마키가 남은 작업용 원본 15개와 동영상 10개는 이번 이미지 반영에서 제외했다. 인물 이미지라는 이유만으로 완성된 갤러리 도판을 제외하지 않았다.
- DB 보고서·위키·Dossier 레코드와 본문, 인증·권한 코드는 변경하지 않았다. 보고서/위키 이미지 동등성 gate는 해당 소비처 쓰기가 없어 적용 대상이 아니다.

## 이번 작업에서 끝낸 내용

- Discord 인게임 컷씬 채널 `1482731855584165939`의 2026-09-11까지 첨부 700개(이미지 690·동영상 10)를 기존 갤러리·보고서 이미지와 대조했다.
- 이미지 판정: 기존 수록 535, 신규 반영 29, 역할극 보고서 부재 31, 회차 미확정 80, 작업용 제외 15. 동영상 10개를 더하면 전체 700개가 모두 처리 기록에 포함된다.
- 단순 파일 hash 비교에 더해 보고서 크롭, 상하 합성의 기존 분할 컷, 표정 차이와 실제 별도 프레임을 검수했다.
- 신규 29개 원본 ID·source SHA·최종 경로는 모두 고유하고 실제 출력 파일의 SHA·bytes가 발행 영수증과 일치한다.

## 아직 끝나지 않은 일

- 역할극 31장: 2026-07-05 미니 세션 표지는 확인했지만 현재 21개 보고서에 대응 레코드가 없다. 현 갤러리는 접근 가능한 보고서가 있어야 세션 앨범을 만든다.
- 2026-09-11 묶음 78장: 세션명이 없는 8개 메시지. 오드·마리아 과거/A섹터·마리아 본체·뒤집어진 양말 보스·크로노스 회상 이미지가 있으며, 기존 욕구 1·2부 내용에 연결할 근거가 없어 미귀속이다.
- 2026-09-06 추가 2장: 대통령·경호 장면(attachment `1546231219396808804`)과 침상 남성·인형 장면(attachment `1546231394328383629`)의 세션을 확정하지 못했다.
- 운영 사이트에는 아직 배포하지 않았다.

## 진행에 필요한 확인·자료

- 9월 11일 묶음의 정확한 세션명과 대응 보고서.
- 9월 6일 대통령·경호 및 침상 남성 장면의 회차 또는 삽입할 앨범.
- 역할극 보고서를 별도로 작성할 경우, 해당 로그를 근거로 작성·운영 저장할 작업 범위.

## 다음에 할 일

- 확인된 세션과 보고서가 정해지면 JSON의 보류 첨부 ID를 기준으로 같은 대조 작업을 반복하지 않고 이어서 연결한다.
- 운영 반영 요청 시 현재 main의 다른 미발행 변경을 섞지 않고 이번 자산·manifest만 배포 대상으로 준비한다.

## 실제로 확인한 내용

- 최종 변경의 `pnpm gallery:test`: **45/45 통과**.
- `pnpm typecheck`, `pnpm lint`: 통과.
- `pnpm gallery:assets-audit`: **453 entries = 453 unique paths = 453 files, 오류 0**. 기존 경고 56(투명 18·near-opaque 37·기존 exact duplicate 1쌍)은 변동 없다. 신규 경고 0.
- `pnpm assets:test`: **22/23 통과**. `pnpm assets:audit`도 같은 기존 누락 1건으로 실패했다. `docs/spec/npc/wexler-junior.md`와 `scripts/seed-payloads/s1e9-wexler-family-reference-intake.json`이 참조하는 `/assets/npcs/Wexler-Junior-profile.webp`가 없다. 두 참조 파일은 HEAD와 동일하고 해당 이미지도 HEAD에 없어 이번 변경과 무관한 기존 문제다.
- 기존 인증 세션으로 `http://localhost:43849/erp/gallery`의 총 649장, 신규 4개 앨범 검색 결과, 세로·가로 상세 원본 표시와 회차 링크를 확인했다. 1498×1249 viewport에서 가로 넘침 0건, 확인한 신규 23장의 로딩 실패 0건, console error 0건이다. 실제 이미지의 naturalWidth/Height와 contain 표시를 관찰했다.
- 읽기 전용 lore 귀속 검토와 critical risk review에서 최종 29개의 경로·hash·manifest에 조치가 필요한 결함이 없었다.

## Visual Asset Ledger

갤러리 전용 추가다. 보고서·위키 본문의 이미지 순서·문구나 Dossier 역할로 자산을 재사용하지 않는다.

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| /assets/session-reports/mini03-5959/cut-028.webp | Discord attachment 1508120833552552036; message 1508120828267462726 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-MINI-5959-CONTAINMENT; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e5-sector-c/cut-037.webp | Discord attachment 1520826348166447194; message 1520826354701172800 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E5-EVIL-PART1; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e5-sector-c/cut-038.webp | Discord attachment 1520826377648210160; message 1520826380475044022 | 1448×1086 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E5-EVIL-PART1; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e5-sector-c/cut-039.webp | Discord attachment 1520826378155589784; message 1520826380475044022 | 1448×1086 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E5-EVIL-PART1; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e5-sector-c/cut-040.webp | Discord attachment 1520826482618794146; message 1520826482866524171 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E5-EVIL-PART1; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part1/cut-049.webp | Discord attachment 1531562261662011412; message 1531562263113236634 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART1; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-001.webp | Discord attachment 1536637958734614659; message 1536637963306278932 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-002.webp | Discord attachment 1536637961993457694; message 1536637963306278932 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-003.webp | Discord attachment 1536637962689974312; message 1536637963306278932 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-004.webp | Discord attachment 1536638162124800040; message 1536638164272283689 | 970×1622 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-005.webp | Discord attachment 1536638163047419984; message 1536638164272283689 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-006.webp | Discord attachment 1536638280420818944; message 1536638285189750885 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-007.webp | Discord attachment 1536638280882196590; message 1536638285189750885 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-008.webp | Discord attachment 1536638282476159058; message 1536638285189750885 | 1038×1516 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-009.webp | Discord attachment 1536638283898167307; message 1536638285189750885 | 1086×1448 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e6-turning-point-part2/cut-010.webp | Discord attachment 1536638284862853120; message 1536638285189750885 | 1086×1448 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E6-TURNING-POINT-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/lullaby-part2/cut-001.webp | Discord attachment 1541849904052310097; message 1541849904345915424 | 1086×1448 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-MINI-LULLABY-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/lullaby-part2/cut-002.webp | Discord attachment 1541849950877650994; message 1541849951343214602 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-MINI-LULLABY-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/lullaby-part2/cut-003.webp | Discord attachment 1541851641505124412; message 1541851641899257926 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-MINI-LULLABY-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part2/cut-001.webp | Discord attachment 1546230835479453757; message 1546230838767652864 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part2/cut-002.webp | Discord attachment 1546230835923910717; message 1546230838767652864 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part2/cut-003.webp | Discord attachment 1546230836435746907; message 1546230838767652864 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part2/cut-004.webp | Discord attachment 1546230837303972001; message 1546230838767652864 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part2/cut-005.webp | Discord attachment 1546230837723533402; message 1546230838767652864 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part2/cut-006.webp | Discord attachment 1546230838080053378; message 1546230838767652864 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part2/cut-007.webp | Discord attachment 1546230838486892614; message 1546230838767652864 | 832×1216 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART2; 원본·보고서와 육안 대조; 미세 알파 254→불투명 정상화; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part1/cut-001.webp | Discord attachment 1546230914974220388; message 1546230917268246629 | 1671×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART1; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part1/cut-002.webp | Discord attachment 1546231071916687370; message 1546231075540303872 | 1672×941 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART1; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
| /assets/session-reports/s1e7-desire-part2/cut-008.webp | Discord attachment 1546231072315023371; message 1546231075540303872 | 1007×1562 | no — 전체 프레임, 비율 유지 축소 | report-cutscene | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | excluded: 갤러리 추가 요청 범위; 기존 본문 유지 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | not-applicable: 갤러리만 반영 | included gallery: NOSB-S1E7-DESIRE-PART2; 원본·보고서와 육안 대조; 출력 hash·치수는 JSON 영수증 |
