"""shop_inventory + shop_daily_stock 어댑터.

shared-db `crud/shop.ts` 시맨틱 그대로 옮김.

- shop_inventory: 사용자(User) 단위 편의점 보유. character_inventory 와 도메인 분리.
- shop_daily_stock: 아이템 일별 재고. lastRefresh 는 KST 'YYYY-MM-DD' 문자열.
  UTC Date 가 아닌 이유 — KST 기준 일자 변경 + 봇 코드와 정합.

Atomic 패턴:
- removeInventory: { quantity: $gte: qty } filter + $inc + race-aware deleteOne.
- reduceStock: { stock: $gte: qty } filter + $inc.

호출자는 user_id_hex (User._id.toHexString()) 만 주입. Discord snowflake 받지 않음.
"""

from datetime import datetime, timezone
from typing import Optional

from pymongo import ReturnDocument
from pymongo.collection import Collection

from .client import get_db

# ─────────────────────────────────────────────
# 컬렉션 이름
# ─────────────────────────────────────────────
_COL_INV = "shop_inventory"
_COL_STOCK = "shop_daily_stock"


def _inv_col() -> Collection:
    return get_db()[_COL_INV]


def _stock_col() -> Collection:
    return get_db()[_COL_STOCK]


# ─────────────────────────────────────────────
# shop_inventory
# ─────────────────────────────────────────────


def get_user_inventory(user_id_hex: str) -> list[dict]:
    """활성 보유만 (quantity > 0). 일반 표시/조회용."""
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(
            f"get_user_inventory: invalid user_id_hex: {user_id_hex!r}"
        )
    return list(
        _inv_col()
        .find({"userId": user_id_hex, "quantity": {"$gt": 0}})
        .sort("itemId", 1)
    )


def get_user_inventory_raw(user_id_hex: str) -> list[dict]:
    """0 quantity 포함 전체 (감사/마이그용)."""
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(
            f"get_user_inventory_raw: invalid user_id_hex: {user_id_hex!r}"
        )
    return list(_inv_col().find({"userId": user_id_hex}).sort("itemId", 1))


def add_inventory(user_id_hex: str, item_id: str, qty: int) -> None:
    """upsert + $inc. qty 양수 강제."""
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(f"add_inventory: invalid user_id_hex: {user_id_hex!r}")
    if not isinstance(item_id, str) or not item_id:
        raise ValueError(f"add_inventory: invalid item_id: {item_id!r}")
    if not isinstance(qty, int) or isinstance(qty, bool):
        raise ValueError(
            f"add_inventory: qty must be int, got {type(qty).__name__}"
        )
    if qty <= 0:
        raise ValueError(f"add_inventory: qty must be positive, got {qty}")

    _inv_col().update_one(
        {"userId": user_id_hex, "itemId": item_id},
        {
            "$inc": {"quantity": qty},
            "$set": {"updatedAt": datetime.now(timezone.utc)},
            "$setOnInsert": {"userId": user_id_hex, "itemId": item_id},
        },
        upsert=True,
    )


def remove_inventory(user_id_hex: str, item_id: str, qty: int) -> bool:
    """atomic 차감.

    - quantity >= qty 일 때만 매치 → race condition 방지.
    - 보유 부족 시 False (수정 없음).
    - 차감 후 quantity == 0 이면 race-aware deleteOne 으로 row 정리.
      (다른 호출이 그 사이 +qty 했으면 quantity:0 매치 안 되어 보존.)

    Returns: 성공 시 True, 보유 부족 시 False.
    """
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(
            f"remove_inventory: invalid user_id_hex: {user_id_hex!r}"
        )
    if not isinstance(item_id, str) or not item_id:
        raise ValueError(f"remove_inventory: invalid item_id: {item_id!r}")
    if not isinstance(qty, int) or isinstance(qty, bool):
        raise ValueError(
            f"remove_inventory: qty must be int, got {type(qty).__name__}"
        )
    if qty <= 0:
        raise ValueError(f"remove_inventory: qty must be positive, got {qty}")

    col = _inv_col()
    result = col.find_one_and_update(
        {"userId": user_id_hex, "itemId": item_id, "quantity": {"$gte": qty}},
        {
            "$inc": {"quantity": -qty},
            "$set": {"updatedAt": datetime.now(timezone.utc)},
        },
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        return False
    if result.get("quantity") == 0:
        # race-aware: { _id, quantity:0 } filter 자체가 동시 +qty 를 막아준다.
        # delete_one 은 매치 0건이어도 예외를 던지지 않으므로 swallow 불필요.
        col.delete_one({"_id": result["_id"], "quantity": 0})
    return True


# ─────────────────────────────────────────────
# shop_daily_stock
# ─────────────────────────────────────────────


def needs_refresh(item_id: str, today_kst: str) -> bool:
    """lastRefresh 가 today_kst 와 다르면 True. 문서 미존재도 True."""
    if not isinstance(item_id, str) or not item_id:
        raise ValueError(f"needs_refresh: invalid item_id: {item_id!r}")
    if not isinstance(today_kst, str) or not today_kst:
        raise ValueError(f"needs_refresh: invalid today_kst: {today_kst!r}")
    doc = _stock_col().find_one({"itemId": item_id})
    if not doc:
        return True
    return doc.get("lastRefresh") != today_kst


def refresh_stock(item_id: str, stock: int, today_kst: str) -> None:
    """재고를 today_kst 기준으로 강제 갱신 (upsert)."""
    if not isinstance(item_id, str) or not item_id:
        raise ValueError(f"refresh_stock: invalid item_id: {item_id!r}")
    if not isinstance(stock, int) or isinstance(stock, bool):
        raise ValueError(
            f"refresh_stock: stock must be int, got {type(stock).__name__}"
        )
    if stock < 0:
        raise ValueError(f"refresh_stock: stock must be non-negative, got {stock}")
    if not isinstance(today_kst, str) or not today_kst:
        raise ValueError(f"refresh_stock: invalid today_kst: {today_kst!r}")

    _stock_col().update_one(
        {"itemId": item_id},
        {
            "$set": {"stock": stock, "lastRefresh": today_kst},
            "$setOnInsert": {"itemId": item_id},
        },
        upsert=True,
    )


def ensure_stock_entry(
    item_id: str, today_kst: str, default_stock: int
) -> dict:
    """문서 없으면 default_stock 으로 생성, 있으면 그대로 반환 (멱등)."""
    if not isinstance(item_id, str) or not item_id:
        raise ValueError(f"ensure_stock_entry: invalid item_id: {item_id!r}")
    if not isinstance(today_kst, str) or not today_kst:
        raise ValueError(
            f"ensure_stock_entry: invalid today_kst: {today_kst!r}"
        )
    if not isinstance(default_stock, int) or isinstance(default_stock, bool):
        raise ValueError(
            f"ensure_stock_entry: default_stock must be int, got {type(default_stock).__name__}"
        )
    if default_stock < 0:
        raise ValueError(
            f"ensure_stock_entry: default_stock must be non-negative, got {default_stock}"
        )

    col = _stock_col()
    existing = col.find_one({"itemId": item_id})
    if existing is not None:
        return existing

    doc = {
        "itemId": item_id,
        "stock": default_stock,
        "lastRefresh": today_kst,
    }
    result = col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def get_stock(item_id: str) -> Optional[dict]:
    if not isinstance(item_id, str) or not item_id:
        raise ValueError(f"get_stock: invalid item_id: {item_id!r}")
    return _stock_col().find_one({"itemId": item_id})


def reduce_stock(item_id: str, qty: int) -> bool:
    """재고 atomic 차감. 부족 시 False."""
    if not isinstance(item_id, str) or not item_id:
        raise ValueError(f"reduce_stock: invalid item_id: {item_id!r}")
    if not isinstance(qty, int) or isinstance(qty, bool):
        raise ValueError(
            f"reduce_stock: qty must be int, got {type(qty).__name__}"
        )
    if qty <= 0:
        raise ValueError(f"reduce_stock: qty must be positive, got {qty}")

    result = _stock_col().update_one(
        {"itemId": item_id, "stock": {"$gte": qty}},
        {"$inc": {"stock": -qty}},
    )
    return result.modified_count > 0


def get_all_daily_stocks() -> list[dict]:
    return list(_stock_col().find().sort("itemId", 1))
