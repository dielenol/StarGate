# Image Path Strategy

## 목적

로컬 개발 환경과 배포 환경(Vercel 루트/서브패스)에서 동일한 코드로 이미지 경로가 깨지지 않도록 관리합니다.

## 적용 방식

- 공통 유틸: `lib/asset-path.ts`
- 사용 함수: `resolvePublicAssetPath("/assets/...")`
- 적용 파일: `app/page.tsx`

## 환경변수

`.env.local` 또는 Vercel Environment Variables에서 아래 값을 사용합니다.

```bash
# 기본값(로컬, Vercel 루트 배포): 비워둠
NEXT_PUBLIC_APP_BASE_PATH=

# 서브패스 배포가 필요한 경우 예시
NEXT_PUBLIC_APP_BASE_PATH=/StarGate
```

## 권장값

- 로컬: 비워둠
- Vercel 커스텀 도메인 루트(예: https://novus-ordo.vercel.app): 비워둠
- 서브패스 호스팅(예: https://domain.com/StarGate): `/StarGate`
