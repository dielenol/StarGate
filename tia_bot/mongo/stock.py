"""stock_prices + stock_holdings 어댑터.

shared-db `crud/stocks.ts` 시맨틱 그대로 옮김.

- stock_prices: ticker 별 단일 문서. price/prevPrice 정수.
- stock_holdings: user × ticker. shares < 0 금지 (atomic guard).
  avgPrice 는 가중평균 정수 절사:
    newAvg = floor((oldShares * oldAvg + buyShares * buyPrice) / (oldShares + buyShares))

핵심 atomic 패턴:
- updateStockPrice: aggregation pipeline 단일 호출 — prevPrice = $price 백업 동시.
- buyHolding: aggregation pipeline upsert — read+write race window 제거.
- sellHolding: { shares: $gte: shares } filter + race-aware deleteOne.

호출자는 user_id_hex (User._id.toHexString()) 만 주입. Discord snowflake 받지 않음.
"""

from datetime import datetime, timezone
from typing import Optional

from pymongo import ReturnDocument, UpdateOne
from pymongo.collection import Collection

from .client import get_db

# ─────────────────────────────────────────────
# 컬렉션 이름
# ─────────────────────────────────────────────
_COL_PRICES = "stock_prices"
_COL_HOLDINGS = "stock_holdings"


def _prices_col() -> Collection:
    return get_db()[_COL_PRICES]


def _holdings_col() -> Collection:
    return get_db()[_COL_HOLDINGS]


# ─────────────────────────────────────────────
# stock_prices
# ─────────────────────────────────────────────


def get_stock_prices() -> list[dict]:
    """전 ticker 가격 문서 (ticker 사전순)."""
    return list(_prices_col().find().sort("ticker", 1))


def get_stock_price(ticker: str) -> Optional[dict]:
    if not isinstance(ticker, str) or not ticker:
        raise ValueError(f"get_stock_price: invalid ticker: {ticker!r}")
    return _prices_col().find_one({"ticker": ticker})


def ensure_stock_prices(
    seeds: list[tuple[str, int]],
    initial_lastupdate_kst: str,
    initial_event_text: str = "상장",
) -> None:
    """다수 ticker 시드 일괄 멱등 생성.

    shared-db `ensureStockPrices` 동등 — bulkWrite + $setOnInsert.
    이미 있는 ticker 는 건드리지 않음.

    seeds: [(ticker, initial_price), ...]
    initial_lastupdate_kst: KST 타임스탬프 문자열 (호출자 주입).
    """
    if not isinstance(seeds, list):
        raise ValueError(
            f"ensure_stock_prices: seeds must be list, got {type(seeds).__name__}"
        )
    if not seeds:
        return
    if not isinstance(initial_lastupdate_kst, str) or not initial_lastupdate_kst:
        raise ValueError(
            f"ensure_stock_prices: invalid initial_lastupdate_kst: "
            f"{initial_lastupdate_kst!r}"
        )

    ops = []
    for seed in seeds:
        if not isinstance(seed, tuple) or len(seed) != 2:
            raise ValueError(
                f"ensure_stock_prices: each seed must be (ticker, price) tuple, "
                f"got {seed!r}"
            )
        ticker, price = seed
        if not isinstance(ticker, str) or not ticker:
            raise ValueError(
                f"ensure_stock_prices: invalid ticker in seed: {ticker!r}"
            )
        if not isinstance(price, int) or isinstance(price, bool):
            raise ValueError(
                f"ensure_stock_prices: price must be int, got {type(price).__name__} "
                f"for ticker {ticker}"
            )
        ops.append(
            UpdateOne(
                {"ticker": ticker},
                {
                    "$setOnInsert": {
                        "ticker": ticker,
                        "price": price,
                        "prevPrice": price,
                        "eventText": initial_event_text,
                        "lastUpdate": initial_lastupdate_kst,
                    }
                },
                upsert=True,
            )
        )

    res = _prices_col().bulk_write(ops, ordered=False)
    write_errors = res.bulk_api_result.get("writeErrors", [])
    if write_errors:
        raise RuntimeError(
            f"ensure_stock_prices partial failure: {write_errors}"
        )


def update_stock_price(
    ticker: str,
    new_price: int,
    event_text: str,
    last_update_kst: str,
) -> dict:
    """가격 갱신 (aggregation pipeline atomic).

    prevPrice = old price (mongo 가 평가 — read-then-write 없음).
    미존재 ticker 면 ValueError.
    """
    if not isinstance(ticker, str) or not ticker:
        raise ValueError(f"update_stock_price: invalid ticker: {ticker!r}")
    if not isinstance(new_price, int) or isinstance(new_price, bool):
        raise ValueError(
            f"update_stock_price: new_price must be int, got {type(new_price).__name__}"
        )
    if not isinstance(event_text, str):
        raise ValueError(
            f"update_stock_price: event_text must be str, got {type(event_text).__name__}"
        )
    if not isinstance(last_update_kst, str) or not last_update_kst:
        raise ValueError(
            f"update_stock_price: invalid last_update_kst: {last_update_kst!r}"
        )

    result = _prices_col().find_one_and_update(
        {"ticker": ticker},
        [
            {
                "$set": {
                    "prevPrice": "$price",
                    "price": new_price,
                    "eventText": event_text,
                    "lastUpdate": last_update_kst,
                }
            }
        ],
        upsert=False,  # 미존재 ticker 는 ValueError. ensure_stock_prices 와 책임 분리.
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise ValueError(f"Stock price not found: {ticker}")
    return result


# ─────────────────────────────────────────────
# stock_holdings
# ─────────────────────────────────────────────


def get_holdings(user_id_hex: str) -> list[dict]:
    """활성 보유만 (shares > 0)."""
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(f"get_holdings: invalid user_id_hex: {user_id_hex!r}")
    return list(
        _holdings_col()
        .find({"userId": user_id_hex, "shares": {"$gt": 0}})
        .sort("ticker", 1)
    )


def get_holdings_raw(user_id_hex: str) -> list[dict]:
    """0 shares 포함 전체 (감사/마이그용)."""
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(
            f"get_holdings_raw: invalid user_id_hex: {user_id_hex!r}"
        )
    return list(
        _holdings_col().find({"userId": user_id_hex}).sort("ticker", 1)
    )


def get_holding(user_id_hex: str, ticker: str) -> Optional[dict]:
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(f"get_holding: invalid user_id_hex: {user_id_hex!r}")
    if not isinstance(ticker, str) or not ticker:
        raise ValueError(f"get_holding: invalid ticker: {ticker!r}")
    return _holdings_col().find_one({"userId": user_id_hex, "ticker": ticker})


def buy_holding(
    user_id_hex: str,
    ticker: str,
    shares: int,
    buy_price: int,
) -> dict:
    """매수 — 가중평균 매수단가 갱신 (aggregation pipeline upsert).

    shared-db `buyHolding` 동등 — race-free.
    동일 (userId, ticker) 동시 매수에서도 oldShares stale 없음 (mongo 문서 단위 atomic).

    신규 보유 시 avgPrice = buy_price.
    기존 보유 시:
      newAvg = floor((oldShares * oldAvg + shares * buy_price) / (oldShares + shares))
    """
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(f"buy_holding: invalid user_id_hex: {user_id_hex!r}")
    if not isinstance(ticker, str) or not ticker:
        raise ValueError(f"buy_holding: invalid ticker: {ticker!r}")
    if not isinstance(shares, int) or isinstance(shares, bool):
        raise ValueError(
            f"buy_holding: shares must be int, got {type(shares).__name__}"
        )
    if shares <= 0:
        raise ValueError(f"buy_holding: shares must be positive, got {shares}")
    if not isinstance(buy_price, int) or isinstance(buy_price, bool):
        raise ValueError(
            f"buy_holding: buy_price must be int, got {type(buy_price).__name__}"
        )
    if buy_price <= 0:
        raise ValueError(
            f"buy_holding: buy_price must be positive, got {buy_price}"
        )

    # aggregation pipeline upsert — read+write 단일화로 race window 제거.
    # 가중평균 산식은 위 docstring 참조.
    result = _holdings_col().find_one_and_update(
        {"userId": user_id_hex, "ticker": ticker},
        [
            {
                "$set": {
                    "shares": {"$add": [{"$ifNull": ["$shares", 0]}, shares]},
                    "avgPrice": {
                        "$let": {
                            "vars": {
                                "oldS": {"$ifNull": ["$shares", 0]},
                                "oldA": {"$ifNull": ["$avgPrice", 0]},
                            },
                            "in": {
                                "$cond": [
                                    {"$gt": ["$$oldS", 0]},
                                    {
                                        "$floor": {
                                            "$divide": [
                                                {
                                                    "$add": [
                                                        {
                                                            "$multiply": [
                                                                "$$oldS",
                                                                "$$oldA",
                                                            ]
                                                        },
                                                        shares * buy_price,
                                                    ]
                                                },
                                                {"$add": ["$$oldS", shares]},
                                            ]
                                        }
                                    },
                                    buy_price,
                                ]
                            },
                        }
                    },
                    "updatedAt": datetime.now(timezone.utc),
                    "userId": {"$ifNull": ["$userId", user_id_hex]},
                    "ticker": {"$ifNull": ["$ticker", ticker]},
                }
            }
        ],
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        # upsert + return after → 정상 케이스에서는 항상 truthy. 드라이버 nullable
        # 타입 가드 차원의 방어.
        raise RuntimeError(
            f"buy_holding: unexpected null result for {user_id_hex} {ticker}"
        )
    return result


def sell_holding(
    user_id_hex: str,
    ticker: str,
    shares: int,
) -> dict:
    """매도 — atomic 차감.

    - { shares: $gte: shares } filter 로 race condition 차단.
    - 부족 시 {"ok": False, "remaining_shares": 현재 보유}.
    - avgPrice 는 매도 시 변경 없음.
    - shares == 0 도달 시 race-aware deleteOne (tia_bot 원본 DELETE 시맨틱).

    Returns: {"ok": bool, "remaining_shares": int}
    """
    if not isinstance(user_id_hex, str) or not user_id_hex:
        raise ValueError(f"sell_holding: invalid user_id_hex: {user_id_hex!r}")
    if not isinstance(ticker, str) or not ticker:
        raise ValueError(f"sell_holding: invalid ticker: {ticker!r}")
    if not isinstance(shares, int) or isinstance(shares, bool):
        raise ValueError(
            f"sell_holding: shares must be int, got {type(shares).__name__}"
        )
    if shares <= 0:
        raise ValueError(f"sell_holding: shares must be positive, got {shares}")

    col = _holdings_col()
    result = col.find_one_and_update(
        {
            "userId": user_id_hex,
            "ticker": ticker,
            "shares": {"$gte": shares},
        },
        {
            "$inc": {"shares": -shares},
            "$set": {"updatedAt": datetime.now(timezone.utc)},
        },
        return_document=ReturnDocument.AFTER,
    )

    if result is None:
        current = col.find_one({"userId": user_id_hex, "ticker": ticker})
        return {
            "ok": False,
            "remaining_shares": int(current.get("shares", 0)) if current else 0,
        }

    if result.get("shares") == 0:
        # race-aware: { _id, shares:0 } filter 자체가 동시 +shares 를 막아준다.
        # delete_one 은 매치 0건이어도 예외를 던지지 않으므로 swallow 불필요.
        col.delete_one({"_id": result["_id"], "shares": 0})

    return {"ok": True, "remaining_shares": int(result.get("shares", 0))}


def get_active_holders_by_ticker(ticker: str) -> list[dict]:
    """특정 ticker 의 활성 보유자 (shares > 0) 전체.

    폭락/IPO/배당 등 이벤트 알림 대상 산출.
    """
    if not isinstance(ticker, str) or not ticker:
        raise ValueError(
            f"get_active_holders_by_ticker: invalid ticker: {ticker!r}"
        )
    return list(_holdings_col().find({"ticker": ticker, "shares": {"$gt": 0}}))


def get_all_holdings() -> list[dict]:
    """0 shares 포함 전체 보유 (감사/마이그용)."""
    return list(_holdings_col().find())
