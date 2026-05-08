"""MongoDB 클라이언트 싱글턴.

tia_bot 은 단일 PM2 fork process 라서 모듈 전역 MongoClient 하나로 충분하다.
maxPoolSize=10 (default 100 의 10%) — 봇 동시 명령 핸들러 수 대비 여유 있음.

Phase 2 에서 multi-process 또는 motor(async) 도입 시 다음을 재검토:
- pool size (process 당)
- transaction (현재 미사용; 단일 process race 는 atomic findOneAndUpdate 로 충분)
- 연결 수명/health check
"""

import os
from threading import Lock
from typing import Optional

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.database import Database

# ─────────────────────────────────────────────
# .env 로드 (모듈 import 시 1회)
# ─────────────────────────────────────────────
# tia_bot 루트의 .env 를 명시적으로 로드. cwd 가 다른 위치여도 안전.
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DOTENV_PATH = os.path.join(_PROJECT_ROOT, ".env")
load_dotenv(_DOTENV_PATH, override=False)

# ─────────────────────────────────────────────
# 상수
# ─────────────────────────────────────────────
_MAX_POOL_SIZE = 10
_DEFAULT_DB_NAME = "stargate"

# ─────────────────────────────────────────────
# 싱글턴 상태
# ─────────────────────────────────────────────
_client: Optional[MongoClient] = None
_lock = Lock()


def _build_client() -> MongoClient:
    """MongoClient 신규 생성. 환경변수 미설정 시 명확한 에러."""
    uri = os.environ.get("MONGODB_URI", "").strip()
    if not uri:
        raise RuntimeError(
            "MONGODB_URI not set. tia_bot/.env 에 MONGODB_URI 를 추가하세요. "
            "(.env.example 참고)"
        )
    return MongoClient(uri, maxPoolSize=_MAX_POOL_SIZE, appname="tia_bot")


def get_client() -> MongoClient:
    """싱글턴 MongoClient 반환. 첫 호출 시 lazy init."""
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is None:
            _client = _build_client()
    return _client


def get_db() -> Database:
    """기본 stargate DB 핸들."""
    db_name = os.environ.get("MONGODB_DB_NAME", _DEFAULT_DB_NAME).strip() or _DEFAULT_DB_NAME
    return get_client()[db_name]


def close_client() -> None:
    """MongoClient 정리. atexit 등록 권장 (호출자 책임 — 예: bot.py main 진입점).

    Lock 점유 중 blocking I/O 회피: client 참조를 atomic swap 후 lock 외부에서 close.
    이렇게 해야 close 도중 다른 스레드가 get_client() 호출 시 빠르게 새 client 를
    얻을 수 있다 (또는 명확히 None → 재생성 경로).

    [Usage]
    봇 main 진입점에서 atexit 등록 권장:
        import atexit
        from tia_bot.mongo.client import close_client
        atexit.register(close_client)

    PM2 SIGTERM 시 connection drain. 미등록 시 MongoDB idle timeout 으로 자동 정리됨.
    """
    global _client
    with _lock:
        client_to_close, _client = _client, None
    if client_to_close is not None:
        client_to_close.close()
