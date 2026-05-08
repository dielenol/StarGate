"""Discord ↔ MongoDB User 매핑.

shared-db `upsertDiscordUser` 시맨틱과 동등.
모듈 경계에서 Discord snowflake (int) → str(int) 변환을 강제한다.
다른 어댑터 (credits/shop/stock) 는 항상 user_id_hex (User._id.toHexString()) 만 받는다.

캐시: 모듈 전역 dict[discord_id_int, user_id_hex]. tia_bot 단일 프로세스에서만 안전.
"""

from datetime import datetime, timezone
from threading import Lock
from typing import Optional

from pymongo import ReturnDocument
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError

from .client import get_db

# ─────────────────────────────────────────────
# 컬렉션 이름 (shared-db `collections.ts` COL.USERS 와 일치)
# ─────────────────────────────────────────────
_COL_USERS = "users"

# ─────────────────────────────────────────────
# Discord snowflake (int) → User._id hex string 캐시
# 단일 봇 프로세스 가정. 다중 프로세스 환경에서는 유효성 잃음.
# GIL 로 dict 자체는 안전하지만 일관성/명시성을 위해 Lock 으로 가드.
# ─────────────────────────────────────────────
_USER_ID_CACHE: dict[int, str] = {}
_USER_ID_CACHE_LOCK = Lock()


def _users_col() -> Collection:
    return get_db()[_COL_USERS]


def ensure_user(
    discord_id: int,
    discord_username: str,
    discord_global_name: Optional[str] = None,
    discord_avatar: Optional[str] = None,
) -> str:
    """Discord snowflake → User._id hex string.

    shared-db `upsertDiscordUser` 동등 시맨틱.
    - 기존 유저 (discordId 일치): discordUsername / discordGlobalName /
      discordAvatar / updatedAt 갱신.
    - 미등록 유저: U 등급 ACTIVE 상태로 자동 생성. username = "_discord_<snowflake>".

    동시 요청 race 시 E11000 발생 가능 → discordId 로 재조회하여 복구.

    Note: discord_global_name / discord_avatar 는 Phase 1B 에서 추가됨. 호출자가
    discord.User 의 `global_name`, `display_avatar.url` 을 전달. 미전달 시 None
    으로 set (shared-db 시맨틱 — 명시적 None 허용).
    """
    if not isinstance(discord_id, int):
        raise TypeError(
            f"ensure_user: discord_id must be int (snowflake), got {type(discord_id).__name__}"
        )

    with _USER_ID_CACHE_LOCK:
        cached = _USER_ID_CACHE.get(discord_id)
    if cached is not None:
        return cached

    discord_id_str = str(discord_id)
    now = datetime.now(timezone.utc)
    generated_username = f"_discord_{discord_id_str}"

    col = _users_col()
    try:
        result = col.find_one_and_update(
            {"discordId": discord_id_str},
            {
                "$set": {
                    "discordUsername": discord_username,
                    "discordGlobalName": discord_global_name,
                    "discordAvatar": discord_avatar,
                    "updatedAt": now,
                },
                "$setOnInsert": {
                    "username": generated_username,
                    "hashedPassword": None,
                    "displayName": discord_global_name or discord_username,
                    "discordId": discord_id_str,
                    "role": "U",
                    "status": "ACTIVE",
                    "characterIds": [],
                    "lastLoginAt": None,
                    "passwordChangedAt": None,
                    "createdAt": now,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        # E11000: 동시 upsert 경합 또는 username/discordId 충돌 → 재조회
        result = col.find_one({"discordId": discord_id_str})

    if result is None:
        raise RuntimeError(
            f"Failed to upsert Discord user (discordId={discord_id_str})"
        )

    user_id_hex = str(result["_id"])
    with _USER_ID_CACHE_LOCK:
        _USER_ID_CACHE[discord_id] = user_id_hex
    return user_id_hex


def get_user_by_discord_id(discord_id: int) -> Optional[dict]:
    """캐시 미적용. 항상 DB 조회 (display_name / role 등 최신 값이 필요한 경우 사용)."""
    if not isinstance(discord_id, int):
        raise TypeError(
            f"get_user_by_discord_id: discord_id must be int, got {type(discord_id).__name__}"
        )
    return _users_col().find_one({"discordId": str(discord_id)})


def get_user_by_id_hex(user_id_hex: str) -> Optional[dict]:
    """User._id hex string → user document. 미존재 시 None."""
    from bson import ObjectId  # 지연 import (모듈 로드 시 비용 회피)

    if not ObjectId.is_valid(user_id_hex):
        return None
    return _users_col().find_one({"_id": ObjectId(user_id_hex)})


def clear_cache() -> None:
    """봇 종료 또는 GM 명령용. 캐시 무효화."""
    with _USER_ID_CACHE_LOCK:
        _USER_ID_CACHE.clear()
