"""tia_bot ↔ stargate MongoDB 어댑터.

Phase 1B 신규. Phase 1C 에서 shop.py / stock_system.py 가 본 패키지로 이주한다.
"""

from . import client, credits, shop, stock, users

__all__ = ["client", "credits", "shop", "stock", "users"]
