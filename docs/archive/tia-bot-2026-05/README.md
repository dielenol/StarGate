# tia_bot 운영 종료 아카이브

`tia_bot`은 운영이 종료되었고 편의점·주식·크레딧 기능은 StarGateV2가 대체합니다.

이 디렉토리는 2026년 5월 SQLite → MongoDB 이관 당시의 계획·검증·컷오버 기록을 보존합니다. 문서 안의 PM2 명령, 봇 재기동, migration 및 rollback 절차는 현재 운영 절차가 아니므로 실행하지 않습니다.

레거시 Python 코드와 이미지 자산만 저장소에서 제거하며, 통합 MongoDB 컬렉션·shared schema·현재 ERP 데이터는 삭제하거나 되돌리지 않습니다.
