# StarGateV2

Stargate TRPG 공식 랜딩 웹앱 - 세계관 소개, 프로젝트 소식, Discord 문의/지원 접수.

## 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 만들고 아래 값을 설정하세요.

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
NEXT_PUBLIC_APP_BASE_PATH=
```

Discord 채널에서 Webhook URL을 발급받아 입력하면 `/apply`, `/contact` 제출 시 해당 채널로 메시지가 전송됩니다.

- `NEXT_PUBLIC_APP_BASE_PATH`는 이미지 경로 보정용 옵션입니다.
- 로컬/Vercel 루트 도메인 배포에서는 비워두고, 서브패스 배포일 때만 `/StarGate` 같은 값을 설정하세요.

## 실행 방법

```bash
pnpm install
pnpm dev
```

개발 서버: `http://localhost:3000`

## 스크립트

- `pnpm dev`: 개발 서버 실행
- `pnpm lint`: ESLint 검사
- `pnpm build`: 프로덕션 빌드(서버 런타임 포함)
- `pnpm start`: 프로덕션 서버 실행

## 페이지 구조

- `/`: 메인 랜딩 페이지
- `/apply`: 가입 신청 폼 (클라이언트/서버 검증 + Discord 전송)
- `/contact`: 문의 폼 (클라이언트/서버 검증 + Discord 전송)

## 배포

현재 프로젝트는 Next API Route(`app/api/*`)를 사용하므로 서버 런타임이 필요합니다.

- 권장: Vercel 배포(자동 Preview/Production 파이프라인)
- 대안: Node 서버 환경(Render, Railway, Fly.io 등)
- 비권장: GitHub Pages(정적 호스팅)는 API Route 실행 불가

Vercel 배포 절차는 `docs/DEPLOYMENT_VERCEL.md`를 참고하세요.

## 다음 단계 TODO

- Discord 외 알림 채널(Resend 이메일, Slack 등) 추가
- 관리자 확인용 저장소(DB/Spreadsheet) 연동
- SEO 메타/OG 이미지 보강
