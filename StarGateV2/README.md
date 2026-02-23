# StarGateV2

Stargate TRPG 공식 랜딩 웹앱 - 세계관 소개, 프로젝트 소식, 이메일 문의 및 지원 접수.

## 실행 방법

```bash
pnpm install
pnpm dev
```

개발 서버: `http://localhost:3000`

## 스크립트

- `pnpm dev`: 개발 서버 실행
- `pnpm lint`: ESLint 검사
- `pnpm build`: 프로덕션 빌드(정적 export)
- `pnpm start`: 빌드 결과 실행

## 페이지 구조

- `/`: 메인 랜딩 페이지
- `/apply`: 가입 신청 폼 (1차: 클라이언트 검증 + 임시 제출 플로우)
- `/contact`: 문의 폼 (1차: 클라이언트 검증 + 임시 제출 플로우)

## 배포

GitHub Pages + GitHub Actions로 자동 배포됩니다.

1. GitHub 저장소 Settings > Pages에서 Source를 `GitHub Actions`로 설정
2. `main` 브랜치에 push
3. `.github/workflows/deploy-pages.yml` 워크플로가 `out/` 산출물을 Pages에 배포

`next.config.ts`에서 `GITHUB_ACTIONS=true`일 때 `basePath`/`assetPrefix`를 `"/StarGate"`로 설정해 서브패스 배포를 처리합니다.

## 다음 단계 TODO

- `/apply`, `/contact`를 실제 메일/API(예: Resend, Formspree, Supabase)와 연동
- 관리자 확인용 저장소(DB/Spreadsheet) 구성
- SEO 메타/OG 이미지 보강
