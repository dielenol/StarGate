# 욕구 2부 전용 초상 확인 기록

2026-09-08 사용자가 지정한 다섯 원본의 순서와 신원 대응을 보존했다. 원본/1차/보완 후보는 덮어쓰지 않았다. 마테오·성직자·코르티잔의 수동 투명 마스크 보정은 같은 날 사용자 승인을 받았다.

| 인물 | 파일 | 원본 SHA-256 | 채택 과정 | 픽셀·검토 |
|---|---|---|---|---|
| PARIS_MARQUIS | `/assets/npcs/Paris-Marquis-profile.webp` | `60e108030f05efdc6df5b3002697167d0846a9fd3158c451e04f6fed54c4e021` | isnet-anime | 832×1216, alpha min 0; 체커·흰색·검은색·원본 및 실제 검은 배경 확대 검사. 가발/손/권총/지팡이 보존 |
| MATTEO_FEDERATIO | `/assets/npcs/Matteo-Federatio-profile.webp` | `0b292b7b730aa83f9a51d0e62ef741573effc8a3c408932a4e385bbf8c8dd67c` | isnet-anime + 사용자 승인 수동 마스크 | 832×1216, alpha min 0; 체커·흰색·검은색·원본 및 실제 검은 배경 확대 검사. 가발/손/권총/지팡이 보존 |
| PARIS_PRIEST | `/assets/npcs/Paris-Priest-profile.webp` | `994f2034bc25e7cf92a0602cd55bef9818af6d2f756963c65d1b724c3c6d59d5` | isnet-anime + 사용자 승인 수동 마스크 | 832×1216, alpha min 0; 체커·흰색·검은색·원본 및 실제 검은 배경 확대 검사. 가발/손/권총/지팡이 보존 |
| PUPPETEER | `/assets/npcs/Courtesan-profile.webp` | `1e23c6d34905739615381e1993332f040d0060b3ba231d33727c17ed7d8194bc` | isnet-anime + 사용자 승인 수동 마스크 | 832×1216, alpha min 0; 체커·흰색·검은색·원본 및 실제 검은 배경 확대 검사. 가발/손/권총/지팡이 보존 |
| FEDERATIO_PARIS_BOSS | `/assets/npcs/Federatio-Godfather-profile.webp` | `3e691ed701eac8f6157c4fd8a54ae07fc6729883363cfee4ff466324b37db71a` | lucida | 832×1216, alpha min 0; 체커·흰색·검은색·원본 및 실제 검은 배경 확대 검사. 가발/손/권총/지팡이 보존 |

## 보존 자료

- 원본·후보·4배경 확인표: `/tmp/stargate-s1e7-part2-portraits-20260908.4J36MT`
- 수동 보정 영역·시드·RGB 무변경 검증: `/tmp/stargate-s1e7-part2-portraits-20260908.4J36MT/manual-mask-record.json`
- 수동 보정은 마테오의 양팔/다리 사이, 성직자의 팔·손가락 사이, 코르티잔의 팔·머리카락·소매 고리 내부 빈 공간에 한정했다. 얼굴/의상/무기 RGB를 고치지 않았다.
- 후작은 1차 ISNet Anime, 대부는 보완 Lucida 채택. 나머지 세 명은 Lucida까지 비교한 뒤 사용자 승인에 따라 1차 결과의 alpha만 보정했다.
- 모든 파일은 `pnpm asset:publish`로 WebP quality 90 변환했다. 5장 모두 실제 투명 픽셀 확인.
- `node --test lib/assets/__tests__/asset-system.test.mjs`: 18/18 통과.
- 사진 재생성·새 얼굴·연령/성별 추정은 하지 않았다. 머리카락의 극세선까지 완전한 픽셀 보존을 보장하는 판정은 아니다.
- 보고서 장면/보고서 위키판/전용 위키/물품 도판으로 재사용하지 않는다. 신원조회 카드·상세의 전용 초상이다.
