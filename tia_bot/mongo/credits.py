"""credit_transactions + credit_pools 어댑터.

shared-db `crud/credits.ts` + `crud/credit-pools.ts` 시맨틱 그대로 옮김.

핵심 가드:
- 모든 mutation 진입부에서 amount/delta 가 int 인지 검증 (NaN/float 차단).
- ADMIN_DEDUCT 외 type 에서 잔액이 음수가 되는 호출은 ValueError.
- Pool atomic 가드: { balance: $gte: -delta } filter 로 race 차단.
- credit type 은 ALL_CREDIT_TYPES 화이트리스트 검사 (오타/도메인 외 type 차단).

Discord snowflake 는 받지 않는다. 항상 user_id_hex (User._id.toHexString()) 와
user_name (string) 을 호출자가 주입.
"""

from datetime import datetime, timezone
from typing import Optional

from pymongo import ReturnDocument
from pymongo.collection import Collection

from .client import get_db

# ─────────────────────────────────────────────
# 상수
# ─────────────────────────────────────────────
# shared-db `OPERATION_POOL_INITIAL_BALANCE` (packages/shared-db/src/types/credit-pool.ts)
# 와 동일 값. 변경 시 양쪽 동기화 필수.
# 동기화 대상 3곳:
#   1. shared-db/src/types/credit-pool.ts: OPERATION_POOL_INITIAL_BALANCE
#   2. shared-db/src/crud/credit-pools.ts: ensureCreditPool 의 default
#   3. tia_bot/mongo/credits.py (이 파일): INITIAL_OP_POOL_BALANCE
INITIAL_OP_POOL_BALANCE = 400
OPERATION_POOL_ID = "OPERATION"

# ─────────────────────────────────────────────
# 컬렉션 이름
# ─────────────────────────────────────────────
_COL_TX = "credit_transactions"
_COL_POOLS = "credit_pools"


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _round_credit(value) -> float:
    rounded = round(float(value) + 1e-9, 2)
    return int(rounded) if rounded.is_integer() else rounded

# ─────────────────────────────────────────────
# credit type 화이트리스트 (오타/도메인 외 type 차단).
# shared-db `ALL_CREDIT_TYPES` 와 동기화. 새 type 추가 시 양쪽 갱신.
# ─────────────────────────────────────────────
ALL_CREDIT_TYPES = frozenset(
    [
        "SESSION_REWARD",
        "PURCHASE",
        "ADMIN_GRANT",
        "ADMIN_DEDUCT",
        "TRANSFER",
        "STOCK_BUY",
        "STOCK_SELL",
        "OP_GRANT",
        "OP_DEDUCT",
        "MIGRATION",
    ]
)

# ─────────────────────────────────────────────
# 봇이 직접 호출하는 type — 웹 API 화이트리스트 대상 아님.
# (shared-db `BOT_ONLY_CREDIT_TYPES` 와 일치)
# 호출자 참고용 + Phase 1C 라우팅 결정에 활용.
# ─────────────────────────────────────────────
BOT_ONLY_CREDIT_TYPES = frozenset(
    [
        "PURCHASE",
        "TRANSFER",
        "STOCK_BUY",
        "STOCK_SELL",
        "OP_GRANT",
        "OP_DEDUCT",
        "MIGRATION",
    ]
)

# ─────────────────────────────────────────────
# 웹 API 가 직접 발행 가능한 type (감사/정정/세션 보상 한정).
# shared-db `WEB_ALLOWED_CREDIT_TYPES` 와 일치.
# ─────────────────────────────────────────────
WEB_ALLOWED_CREDIT_TYPES = frozenset(
    [
        "SESSION_REWARD",
        "ADMIN_GRANT",
        "ADMIN_DEDUCT",
    ]
)


def _tx_col() -> Collection:
    return get_db()[_COL_TX]


def _pools_col() -> Collection:
    return get_db()[_COL_POOLS]


# ─────────────────────────────────────────────
# credit_transactions
# ─────────────────────────────────────────────


def get_balance(user_id_hex: str) -> float:
    """latest 트랜잭션의 balance. 없으면 0. 이벤트 소싱 스냅샷.

    [RACE WINDOW]
    호출자가 read 직후 mutation 한다면, 그 사이 다른 mutation 이 끼어들면 stale.
    add_credit 의 race window 주석 참조.
    """
    if not user_id_hex:
        raise ValueError("get_balance: user_id_hex must be non-empty")
    doc = _tx_col().find_one({"userId": user_id_hex}, sort=[("createdAt", -1)])
    return _round_credit(doc["balance"]) if doc else 0


def list_transactions(user_id_hex: str, limit: int = 100) -> list[dict]:
    """createdAt -1 정렬, limit. 페이징은 호출자 책임."""
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(
            f"list_transactions: invalid user_id_hex: {user_id_hex!r}"
        )
    return list(
        _tx_col()
        .find({"userId": user_id_hex})
        .sort("createdAt", -1)
        .limit(limit)
    )


def add_credit(
    user_id_hex: str,
    user_name: str,
    amount: float,
    type_: str,
    description: str,
    created_by_id: str,
    created_by_name: str,
    metadata: Optional[dict] = None,
    character_id: Optional[str] = None,
    character_codename: Optional[str] = None,
) -> dict:
    """잔액 계산 후 트랜잭션 생성.

    - amount 는 정수 강제 (NaN/float 차단).
    - type_ 은 ALL_CREDIT_TYPES 화이트리스트 검사.
    - ADMIN_DEDUCT 외에는 newBalance < 0 시 ValueError.

    [RACE WINDOW — 봇 + 웹 동시 mutation 시 잔액 stale 가능]
    이벤트 소싱 latest balance 스냅샷 패턴은 race window 가 있음:
    - get_balance read 와 insert_one 사이에 다른 mutation insert 시 balance 필드 stale.
    - 봇 단일 프로세스에서는 동일 user 동시 명령 빈도가 낮아 현실 영향 적음.
    - 봇 + 웹 (Vercel serverless) 동시 mutation 환경에서는 표면화 가능.

    [Phase 2 계획]
    - mongo transaction (with session) 도입
    - userId 키 분산락 또는 credit_transactions 에 seq 단조증가 필드 + 낙관적 잠금

    [Phase 1 호출자 권장]
    - 동일 user 동시 mutation 가능 명령 (일하기/구매/매수 등) 은 봇에서 직렬 큐로 처리
    - asyncio.Lock 또는 user-scope queue 적용

    Returns: 삽입된 transaction 문서 (with _id).
    """
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(f"add_credit: invalid user_id_hex: {user_id_hex!r}")
    if not _is_number(amount):
        raise ValueError(
            f"add_credit: amount must be number, got {type(amount).__name__} ({amount!r})"
        )
    amount = _round_credit(amount)
    if not isinstance(type_, str) or not type_:
        raise ValueError(f"add_credit: invalid type_: {type_!r}")
    if type_ not in ALL_CREDIT_TYPES:
        raise ValueError(
            f"add_credit: invalid type '{type_}'. Must be one of {sorted(ALL_CREDIT_TYPES)}"
        )

    # 잔액 조회 1회 (P2-6 — 중복 read 제거).
    latest_balance = get_balance(user_id_hex)

    # 음수 잔액 가드 (ADMIN_DEDUCT 만 우회 허용).
    if type_ != "ADMIN_DEDUCT" and latest_balance + amount < 0:
        raise ValueError(
            f"add_credit: insufficient balance "
            f"(user={user_id_hex} {latest_balance} + {amount} < 0, type={type_})"
        )

    new_balance = _round_credit(latest_balance + amount)

    doc: dict = {
        "userId": user_id_hex,
        "userName": user_name,
        "type": type_,
        "amount": amount,
        "balance": new_balance,
        "description": description,
        "createdById": created_by_id,
        "createdByName": created_by_name,
        "createdAt": datetime.now(timezone.utc),
    }
    if character_id is not None:
        doc["characterId"] = character_id
    if character_codename is not None:
        doc["characterCodename"] = character_codename
    if metadata is not None:
        if not isinstance(metadata, dict):
            raise ValueError(
                f"add_credit: metadata must be dict or None, got {type(metadata).__name__}"
            )
        doc["metadata"] = metadata

    result = _tx_col().insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def list_balances_with_names() -> list[dict]:
    """전체 유저별 latest balance + userName.

    `!전체지급` 같은 일괄 명령 + ERP 표시용.
    aggregation: createdAt 내림차순 → userId 별 first 문서로 group.

    Returns: [{ "userId": str, "userName": str, "balance": int }, ...]
    """
    pipeline = [
        {"$sort": {"createdAt": -1}},
        {
            "$group": {
                "_id": "$userId",
                "userName": {"$first": "$userName"},
                "balance": {"$first": "$balance"},
            }
        },
        {
            "$project": {
                "_id": 0,
                "userId": "$_id",
                "userName": 1,
                "balance": 1,
            }
        },
    ]
    return list(_tx_col().aggregate(pipeline))


def list_purchases_grouped(start_date: datetime) -> dict[str, dict]:
    """편의점 구매 집계 (`draw_summary_image` 호출처 용도).

    type='PURCHASE' filter + createdAt >= start_date.
    metadata.itemId 기준 group. metadata 누락 row 는 'unknown' 키로 묶음.

    Returns: { itemId: { 'count': int, 'total': int, 'users': list[str] } }
      - count: 거래 row 수 (수량 합 아님; PURCHASE 1건 = 1 row)
      - total: 총 차감액 절댓값
      - users: 정렬된 구매자 userName 목록 (중복 제거. 빈 문자열은 skip).

    Note: PURCHASE 의 amount 는 음수 (차감). total 은 abs 합산.
    """
    if not isinstance(start_date, datetime):
        raise ValueError(
            f"list_purchases_grouped: start_date must be datetime, got {type(start_date).__name__}"
        )

    cursor = _tx_col().find(
        {
            "type": "PURCHASE",
            "createdAt": {"$gte": start_date},
        }
    )

    grouped: dict[str, dict] = {}
    for tx in cursor:
        meta = tx.get("metadata") or {}
        item_id = meta.get("itemId") if isinstance(meta, dict) else None
        if not isinstance(item_id, str) or not item_id:
            item_id = "unknown"

        bucket = grouped.setdefault(
            item_id, {"count": 0, "total": 0, "users": set()}
        )
        bucket["count"] += 1
        amount = tx.get("amount", 0)
        if _is_number(amount):
            bucket["total"] += abs(amount)
        name = tx.get("userName") or ""
        if name:
            bucket["users"].add(name)

    # set → 정렬된 list (호출자 직렬화 호환)
    for bucket in grouped.values():
        bucket["users"] = sorted(bucket["users"])
    return grouped


# ─────────────────────────────────────────────
# credit_pools
# ─────────────────────────────────────────────


def ensure_op_pool(
    pool_id: str = OPERATION_POOL_ID,
    name: str = "작전 크레딧 풀",
    initial_balance: int = INITIAL_OP_POOL_BALANCE,
) -> dict:
    """풀이 없으면 생성, 있으면 그대로 반환 (멱등).

    shared-db `ensureCreditPool` 동등.
    """
    if not isinstance(initial_balance, int) or isinstance(initial_balance, bool):
        raise ValueError(
            f"ensure_op_pool: initial_balance must be int, got {type(initial_balance).__name__}"
        )

    col = _pools_col()
    existing = col.find_one({"poolId": pool_id})
    if existing is not None:
        return existing

    now = datetime.now(timezone.utc)
    doc = {
        "poolId": pool_id,
        "name": name,
        "balance": initial_balance,
        "createdAt": now,
        "updatedAt": now,
    }
    result = col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def get_op_balance(pool_id: str = OPERATION_POOL_ID) -> int:
    """풀 잔액. 미존재 시 0."""
    doc = _pools_col().find_one({"poolId": pool_id})
    if not doc:
        return 0
    return int(doc.get("balance", 0))


def add_op_credit(
    pool_id: str,
    delta: int,
    allow_negative: bool = False,
) -> dict:
    """풀 잔액에 delta 를 atomic 가산.

    shared-db `addCreditPoolBalance` 동등 시맨틱.

    - allow_negative=False (기본) + delta<0 시 { balance: $gte: -delta } 가드.
      차감 후 잔액이 음수가 되지 않도록 race-free 보장.
    - 가드 실패 (잔액 부족) 또는 풀 미존재 시 ValueError.
    """
    if not isinstance(delta, int) or isinstance(delta, bool):
        raise ValueError(
            f"add_op_credit: delta must be int, got {type(delta).__name__}"
        )
    if not isinstance(allow_negative, bool):
        raise ValueError(
            f"add_op_credit: allow_negative must be bool, got {type(allow_negative).__name__}"
        )

    filter_: dict = {"poolId": pool_id}
    if not allow_negative and delta < 0:
        filter_["balance"] = {"$gte": -delta}

    col = _pools_col()
    result = col.find_one_and_update(
        filter_,
        {
            "$inc": {"balance": delta},
            "$set": {"updatedAt": datetime.now(timezone.utc)},
        },
        return_document=ReturnDocument.AFTER,
    )

    if result is None:
        snapshot = col.find_one({"poolId": pool_id})
        if not snapshot:
            raise ValueError(f"Credit pool not found: {pool_id}")
        raise ValueError(
            f"Pool {pool_id} insufficient "
            f"(snapshot at error time: balance={snapshot.get('balance')}, requested={-delta})"
        )

    return result
