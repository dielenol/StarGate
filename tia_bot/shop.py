"""
편의점 + 크레딧 + 주식 시스템 — shop.py
bot.py에서 Cog으로 로드됨
Pillow로 카드 그리드 UI 이미지 생성

Phase 1C-1 (2026-05): 모든 SQLite 호출을 tia_bot/mongo/* 어댑터로 치환.
  - 잔액/풀: mongo.credits
  - 인벤토리/일별재고: mongo.shop
  - 시세/보유: mongo.stock
  - Discord ↔ User._id: mongo.users
PIL 렌더 코드는 그대로 유지. 함수 시그니처(SHOP_ITEMS / ITEM_MAP / get_all_stock /
ensure_stock / get_op_balance 등)는 외부 import 호환을 위해 보존.
"""

# 1. 코어 라이브러리, 기타 라이브러리
import asyncio
import io
import os
import random as _r
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import discord
from discord import app_commands
from discord.ext import commands, tasks
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

# 3. 자체 어댑터
import stock_system as ss
from mongo import credits as mongo_credits
from mongo import shop as mongo_shop
from mongo import stock as mongo_stock
from mongo import users as mongo_users
from mongo.client import get_db
from mongo.credits import OPERATION_POOL_ID

# 본 모듈 내 호환을 위해 random 별칭 유지 (random.choice / random.random / random.randint).
random = _r

TIMEZONE = ZoneInfo("Asia/Seoul")
SHOP_CHANNEL_ID = 1486557009590485174
STOCK_CHANNEL_ID = 1487426439182680094

# ============================================================
# GM 닉 — 단일 출처 (P3-1, P3-2)
# AGENT_NAMES 는 stock_system 의 매핑을 base 로 GM 닉을 합성.
# ============================================================
GM_NICKS = frozenset(["핏보이", "pitboy", "흑우"])
AGENT_NAMES = {**ss.AGENT_NAMES, **{n: "GM" for n in GM_NICKS}}


def _is_gm(user) -> bool:
    """display_name 이 GM_NICKS 에 있는지 단일 검사."""
    return getattr(user, "display_name", "") in GM_NICKS


# ============================================================
# 봇 자체 user._id (Phase 1C-3 bot.py main 진입점에서 set_bot_user_id_hex 호출)
# createdById 필드용. 미설정 시 RuntimeError — mutation 거절 (P2-3).
# ============================================================
_BOT_USER_ID_HEX: Optional[str] = None


def set_bot_user_id_hex(user_id_hex: str) -> None:
    """bot.py main 진입점에서 호출. 봇 자체 user._id 를 createdBy 기록에 사용."""
    global _BOT_USER_ID_HEX
    _BOT_USER_ID_HEX = user_id_hex


def _bot_user_id() -> str:
    """createdBy ID. 미주입 시 RuntimeError — mutation 차단 (P2-3).

    부트스트랩 실패 시 명령이 silent 통과하지 않도록 명시적 raise.
    """
    if not _BOT_USER_ID_HEX:
        raise RuntimeError(
            "Bot user not initialized. on_ready bootstrap may have failed. "
            "Check bot.py mongo connection / users.ensure_user logs."
        )
    return _BOT_USER_ID_HEX


def _bot_user_id_safe() -> str:
    """RuntimeError 회피 — 시드/조회 등 mutation 외 경로용. 미주입 시 빈 문자열."""
    return _BOT_USER_ID_HEX or ""


# ============================================================
# GM 알림 채널 (P1-3)
# bot.py 부트스트랩에서 set_gm_alert_channel_id + set_bot_instance 주입.
# 보상 ledger 자체 실패 등 critical path 의 운영 가시성 확보용.
# ============================================================
_GM_ALERT_CHANNEL_ID: Optional[int] = None
_BOT_INSTANCE = None  # discord.ext.commands.Bot — bot.py main 에서 주입


def set_gm_alert_channel_id(channel_id: int) -> None:
    """GM 알림 채널 ID 주입 (bot.py main 진입점)."""
    global _GM_ALERT_CHANNEL_ID
    _GM_ALERT_CHANNEL_ID = int(channel_id)


def set_bot_instance(bot_instance) -> None:
    """discord Bot 인스턴스 주입 — _try_alert_gm 의 channel.send 용."""
    global _BOT_INSTANCE
    _BOT_INSTANCE = bot_instance


def _try_alert_gm(message: str) -> None:
    """비동기 GM 알림 시도. 실패해도 swallow.

    Critical path (보상 ledger 실패 등) 직후 호출. 부트스트랩 미주입 / 채널 미발견 /
    asyncio loop 미초기화 등 어떤 실패도 더 이상의 에러를 일으키지 않도록 방어.
    """
    if _GM_ALERT_CHANNEL_ID is None or _BOT_INSTANCE is None:
        return
    try:
        channel = _BOT_INSTANCE.get_channel(_GM_ALERT_CHANNEL_ID)
        if channel is None:
            return
        try:
            asyncio.create_task(channel.send(message))
        except RuntimeError:
            # 이벤트 루프가 아직 안 도는 상황 — 부트스트랩 매우 초기. 콘솔만 기록.
            print(f"[GM_ALERT] no running loop — skip send: {message}")
    except Exception as e:
        print(f"[GM_ALERT] 실패: {e}")


# ============================================================
# KST 시간 헬퍼
# ============================================================
def _today_kst() -> str:
    return datetime.now(TIMEZONE).strftime("%Y-%m-%d")


def _now_kst_dt() -> datetime:
    return datetime.now(TIMEZONE)

# ============================================================
# 폰트 로드
# ============================================================
def load_font(size):
    """한국어 폰트 로드"""
    paths = [
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/malgun.ttf",
        "C:/Windows/Fonts/gulim.ttc",
        "C:/Windows/Fonts/NanumGothicBold.ttf",
        "C:/Windows/Fonts/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except (OSError, IOError):
                continue
    return ImageFont.load_default()

def load_emoji_font(size):
    """이모지 폰트 로드"""
    paths = [
        "C:/Windows/Fonts/seguiemj.ttf",    # Segoe UI Emoji (Windows 10/11)
        "C:/Windows/Fonts/segoe ui emoji.ttf",
        "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except (OSError, IOError):
                continue
    return load_font(size)  # 이모지 폰트 없으면 일반 폰트로 폴백

FONT_TITLE = load_font(20)
FONT_HEADER = load_font(16)
FONT_BODY = load_font(13)
FONT_SMALL = load_font(11)
FONT_TINY = load_font(9)
FONT_EMOJI = load_emoji_font(20)  # 이모지 전용
FONT_EMOJI_SM = load_emoji_font(14)
# 폰트 확인
try:
    print(f"  [폰트] 텍스트: {FONT_BODY.path}")
    print(f"  [폰트] 이모지: {FONT_EMOJI.path}")
except AttributeError:
    # ImageFont.load_default() 는 .path 미보유 → 기본 폰트 사용 케이스
    print("  [폰트] 기본 폰트 사용 중")

# ============================================================
# 테마 색상
# ============================================================
BG       = (10, 10, 8)
CARD_BG  = (20, 20, 16)
CARD_BG2 = (26, 26, 20)
GOLD     = (197, 162, 85)
GOLD_DIM = (138, 113, 48)
GOLD_DARK= (58, 42, 16)
RED      = (155, 32, 32)
BLUE     = (48, 104, 176)
GREEN    = (42, 139, 76)
TEXT     = (192, 184, 168)
TEXT_DIM = (104, 100, 96)
SOLD_OUT = (80, 30, 30)
WHITE    = (220, 215, 205)
BORDER   = (50, 42, 25)

# ============================================================
# 편의점 아이템 + 재고 설정
# ============================================================
SHOP_ITEMS = [
    {"id":"cup_ramen",  "name":"컵라면",              "icon":"🍜","price":10,  "effect":"HP 5 회복",
     "desc":"따뜻한 국물이 마음까지 녹여주는 야전의 벗.",
     "stock_min":3,"stock_max":8,"appear":0.95,"color":GREEN},
    {"id":"soda",       "name":"소다",                "icon":"🥤","price":10,  "effect":"SAN 5 회복",
     "desc":"톡 쏘는 탄산이 정신을 맑게 해줘요.",
     "stock_min":3,"stock_max":8,"appear":0.95,"color":BLUE},
    {"id":"coffee",    "name":"커피",                "icon":"☕","price":40,  "effect":"카페인 1턴",
     "desc":"쓴맛이 정신을 깨워줘요... 저도 좋아해요.",
     "stock_min":3,"stock_max":6,"appear":0.90,"color":(120,80,50)},
    {"id":"energy_bar", "name":"에너지바",            "icon":"🍫","price":40,  "effect":"탈진 해제",
     "desc":"한 입이면 다시 일어설 수 있어요.",
     "stock_min":2,"stock_max":4,"appear":0.80,"color":GREEN},
    {"id":"hotpack",   "name":"핫팩",                "icon":"🔥","price":40,  "effect":"동상 해제",
     "desc":"손이 시려울 때 딱이에요... 따뜻해요.",
     "stock_min":2,"stock_max":4,"appear":0.80,"color":(200,80,60)},
    {"id":"chocolate",  "name":"고급 초콜렛",         "icon":"🍬","price":40,  "effect":"절망 1턴 무효",
     "desc":"달콤함이 절망을 잠시 잊게 해줘요.",
     "stock_min":2,"stock_max":4,"appear":0.80,"color":GOLD},
    {"id":"beer_pack",  "name":"맥주팩x4",            "icon":"🍺","price":50,  "effect":"음주 1턴",
     "desc":"가볍게 한 캔... 네 캔이지만요.",
     "stock_min":2,"stock_max":5,"appear":0.75,"color":(180,140,60)},
    {"id":"cig_1",      "name":"담배",                "icon":"🚬","price":50,  "effect":"니코틴 1턴",
     "desc":"한 대 태우면 좀 나아질지도...",
     "stock_min":2,"stock_max":4,"appear":0.75,"color":TEXT_DIM},
    {"id":"cig_5",      "name":"담배 (5턴)",          "icon":"🚬","price":200, "effect":"니코틴 5턴",
     "desc":"한 갑 통째로. 폐가 걱정되지만...",
     "stock_min":0,"stock_max":2,"appear":0.40,"color":TEXT_DIM},
    {"id":"liquor",     "name":"독주",                "icon":"🥃","price":200, "effect":"음주 5턴",
     "desc":"아주 독한 술. 각오하고 드셔야 해요...",
     "stock_min":0,"stock_max":2,"appear":0.35,"color":RED},
    {"id":"icecream",   "name":"서울-만세",           "icon":"🍦","price":150, "effect":"HP30 SAN10",
     "desc":"전설의 아이스크림. 한 입이면 세상이 달라져요.",
     "stock_min":0,"stock_max":1,"appear":0.20,"color":(220,180,60)},
    {"id":"force_core", "name":"포스코어",            "icon":"💎","price":350, "effect":"???",
     "desc":"정체불명의 에너지 결정체. 강력한 힘이 느껴진다...",
     "stock_min":0,"stock_max":1,"appear":0.15,"color":(100,60,200)},
    {"id":"vf_blood",  "name":"VF혈액팩",            "icon":"🩸","price":500, "effect":"HP 전회복",
     "desc":"앙카가 맨날 사가서 항상 매진이에요...",
     "stock_min":0,"stock_max":0,"appear":0.0,"color":(180,20,20)},
]

ITEM_MAP = {item["id"]: item for item in SHOP_ITEMS}

# 아이템 이미지 경로 (images/ 폴더에 넣어두면 자동으로 로드)
ITEM_IMAGES = {}
IMG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
def load_item_images():
    global ITEM_IMAGES
    for item in SHOP_ITEMS:
        for ext in [".png", ".jpg", ".webp"]:
            path = os.path.join(IMG_DIR, f"{item['id']}{ext}")
            if os.path.exists(path):
                try:
                    img = Image.open(path).convert("RGBA")
                    ITEM_IMAGES[item["id"]] = img
                    print(f"  [이미지] {item['name']}: {path}")
                except (OSError, IOError):
                    pass
                break
load_item_images()

INITIAL_CREDITS = {
    "라면":290,"Arkaiyu":340,"버터누나":340,"힘이":210,
    "춤추기사랑하기노래부르기":180,"모스":300,"Bush Dog":130,"홀로서기":340,
    "세슘":320,"대형마법":340,"치자도우":140,"순대/soondae":30,"휴지":100,
    "카즈키":200,"실명":200,
}

# ============================================================
# Mongo bridge — discord.User → user_id_hex + 잔액 시드
# ============================================================
def _ensure_user_id(user) -> str:
    """discord.User/Member → user_id_hex. ensure_user 는 캐시 단일.

    user.name=username, user.global_name=글로벌 표시명, user.display_avatar.url=아바타.
    """
    avatar_url: Optional[str] = None
    try:
        avatar = getattr(user, "display_avatar", None)
        if avatar is not None:
            avatar_url = str(avatar.url)
    except Exception:
        avatar_url = None
    return mongo_users.ensure_user(
        discord_id=int(user.id),
        discord_username=getattr(user, "name", "") or "",
        discord_global_name=getattr(user, "global_name", None),
        discord_avatar=avatar_url,
    )


def _seed_user_if_first_time(user_id_hex: str, user) -> None:
    """첫 호출이면 INITIAL_CREDITS lookup → ADMIN_GRANT 1건 시드.

    P2-1: race 해소를 위해 metadata.kind="initial_seed" 사전 확인 + display_name/username
    fallback. 동시 진입 시 두 번째 task 가 ValueError(혹은 unique 충돌) 로 안전하게 실패.
    """
    db = get_db()
    # 1) 이미 initial_seed 트랜잭션이 있으면 skip (멱등 보호)
    seeded = db["credit_transactions"].find_one(
        {"userId": user_id_hex, "metadata.kind": "initial_seed"},
        projection={"_id": 1},
    )
    if seeded:
        return

    # 2) 트랜잭션이 1건이라도 있으면 skip (기존 운영 user — 시드 history 미존재이지만 거래 이력 보유)
    existing = mongo_credits.list_transactions(user_id_hex, limit=1)
    if existing:
        return

    # 3) INITIAL_CREDITS lookup (display_name + username fallback)
    display_name = getattr(user, "display_name", "") or ""
    username = getattr(user, "name", "") or ""
    initial = INITIAL_CREDITS.get(display_name) or INITIAL_CREDITS.get(username, 0)
    if initial <= 0:
        return

    # 4) 시드 시도. race 시 다른 task 가 먼저 시드 → silent fail OK (이중 시드 방지).
    try:
        mongo_credits.add_credit(
            user_id_hex=user_id_hex,
            user_name=display_name or username,
            amount=initial,
            type_="ADMIN_GRANT",
            description="INITIAL_SEED",
            created_by_id=_bot_user_id_safe(),  # 부트스트랩 미주입에도 시드 자체는 통과
            created_by_name="SYSTEM_INITIAL_SEED",
            metadata={"kind": "initial_seed"},
        )
    except Exception as e:
        # 부트스트랩 직후 race / mongo 일시 장애 등. 이중 시드 방지가 우선.
        print(f"[SEED] {user_id_hex} 시드 시도 실패 (race 가능): {e}")


def _ensure_and_get_balance(user) -> tuple[str, float]:
    """user → (user_id_hex, balance). 첫 호출이면 INITIAL_CREDITS 자동 시드.

    P2-2: 시드 트리거의 단일 출처. legacy get_balance 는 시드 책임 제거.
    """
    user_id_hex = _ensure_user_id(user)
    _seed_user_if_first_time(user_id_hex, user)
    return user_id_hex, mongo_credits.get_balance(user_id_hex)


def _apply_credit(
    user,
    amount: float,
    type_: str,
    description: str,
    metadata: Optional[dict] = None,
    actor=None,
) -> float:
    """크레딧 변동을 ledger 1건으로 기록. Returns: new balance.

    - user: 잔액 변경 대상 (discord.User/Member)
    - actor: 명령 실행 주체 (GM 등). None 이면 봇 자체.
      ADMIN_GRANT/ADMIN_DEDUCT 등 GM 발행 시 createdBy 를 GM 으로 기록.

    Note: 봇 자체 user 가 미주입이면 _bot_user_id() 가 RuntimeError → 명령 실패 (P2-3).
    """
    user_id_hex, _ = _ensure_and_get_balance(user)
    user_name = getattr(user, "display_name", "") or ""

    if actor is not None:
        actor_id_hex = _ensure_user_id(actor)
        actor_name = getattr(actor, "display_name", "") or ""
    else:
        actor_id_hex = _bot_user_id()  # 미주입 시 RuntimeError
        actor_name = "TIA_BOT"

    tx = mongo_credits.add_credit(
        user_id_hex=user_id_hex,
        user_name=user_name,
        amount=amount,
        type_=type_,
        description=description,
        created_by_id=actor_id_hex,
        created_by_name=actor_name,
        metadata=metadata,
    )
    return ss.round_stock_value(tx["balance"])


# ============================================================
# 재고 (mongo.shop 위임)
# ============================================================
def get_today_str():
    """레거시 호환 — bot.py 등 외부 호출 가능. 내부는 _today_kst() 사용."""
    return _today_kst()


def needs_refresh() -> bool:
    """SHOP_ITEMS 중 어느 하나라도 today 와 lastRefresh 가 다르면 True.

    원본 SQLite 시맨틱: 단일 last_refresh 컬럼 비교. Mongo 는 itemId 별로 저장되므로
    어느 한 아이템이라도 갱신 필요 시 True (전체 동시 리프레시 가정).
    """
    today = _today_kst()
    return any(mongo_shop.needs_refresh(item["id"], today) for item in SHOP_ITEMS)


def refresh_stock() -> None:
    """SHOP_ITEMS 전체에 대해 today 기준 재고를 새로 굴림 (upsert)."""
    today = _today_kst()
    for item in SHOP_ITEMS:
        stk = (
            random.randint(item["stock_min"], item["stock_max"])
            if random.random() <= item["appear"]
            else 0
        )
        mongo_shop.refresh_stock(item["id"], stk, today)


def ensure_stock() -> None:
    if needs_refresh():
        refresh_stock()


def get_stock(item_id: str) -> int:
    """오늘 재고 보장 후 stock 정수 반환. 미존재 시 0."""
    ensure_stock()
    doc = mongo_shop.get_stock(item_id)
    if not doc:
        return 0
    return int(doc.get("stock", 0))


def reduce_stock(item_id: str) -> None:
    """1개 차감. atomic. 부족 시 silently skip (원본 시맨틱 보존)."""
    mongo_shop.reduce_stock(item_id, 1)


def get_all_stock() -> dict:
    """{ item_id: stock } 딕셔너리. ensure_stock 보장."""
    ensure_stock()
    return {doc["itemId"]: int(doc.get("stock", 0)) for doc in mongo_shop.get_all_daily_stocks()}


# ============================================================
# 크레딧 (mongo.credits 위임) — 외부 호환 시그니처 보존
# ============================================================
def get_balance(user_id, user_name=""):
    """레거시 호환 시그니처 — 단순 잔액 조회만.

    P2-2: 시드 책임 제거 (DRY 단일화). 시드는 _ensure_and_get_balance 만 트리거.
    봇 핸들러에서는 항상 discord.User/Member 객체가 있으므로 _ensure_and_get_balance
    를 사용. 본 함수는 user_id (Discord snowflake int) + user_name 만 알 때의 폴백.
    """
    if user_id is None:
        return 0
    user_id_hex = mongo_users.ensure_user(
        discord_id=int(user_id),
        discord_username=user_name or "",
    )
    return mongo_credits.get_balance(user_id_hex)


def get_op_balance() -> int:
    """작전 풀 잔액. 풀 미존재 시 ensure 후 반환."""
    mongo_credits.ensure_op_pool()
    return mongo_credits.get_op_balance(OPERATION_POOL_ID)


# ============================================================
# 주식 거래 실행 (매수/매도) — Phase 1C-2 stock_system 마이그 전 인라인 처리.
# 1C-2 완료 후에도 호출자 변경 없이 그대로 유지.
# ============================================================
def _execute_stock_buy(user, ticker: str, qty: int) -> dict:
    """매수 처리. step1 잔액 차감 → step2 보유 갱신.

    P1-1: step2 실패 시 raise 가 아닌 dict 반환 (UI 미처리 해소). 보상 ledger 자체 실패 시
    GM 알림 + swallow 로 critical path 가시성 확보.

    Returns:
        성공: {"ok": True, "price": int, "new_balance": int}
        실패: {"ok": False, "error": str, "balance": int|None, "price"?: int}
    """
    price_doc = mongo_stock.get_stock_price(ticker)
    if not price_doc:
        return {"ok": False, "error": "없는 종목이도다...", "balance": None}
    price = ss.round_stock_value(price_doc["price"])
    if price <= 0:
        return {"ok": False, "error": "현재가가 0이라 거래할 수 없도다...", "balance": None}
    total = ss.round_stock_value(price * qty)
    user_id_hex = _ensure_user_id(user)

    # step 1: 잔액 차감 (ValueError = 잔액 부족 등).
    try:
        new_bal = _apply_credit(
            user=user,
            amount=-total,
            type_="STOCK_BUY",
            description=f"매수 {ticker} {qty}주 @ {price}",
            metadata={"ticker": ticker, "shares": qty, "price": price},
        )
    except ValueError:
        return {"ok": False, "error": "크레딧이 부족하도다...", "balance": None}

    # step 2: 보유 갱신 (실패 시 보상).
    try:
        mongo_stock.buy_holding(user_id_hex, ticker, qty, price)
    except Exception as e:
        # 보상: 잔액 환불 (audit 별도 ledger, metadata.kind=buy_rollback).
        try:
            _apply_credit(
                user=user,
                amount=+total,
                type_="ADMIN_GRANT",
                description=f"매수 보유 갱신 실패 보상 {ticker} {qty}주",
                metadata={
                    "ticker": ticker,
                    "shares": qty,
                    "kind": "buy_rollback",
                },
            )
        except Exception as e2:
            # 보상 자체 실패 — 운영 가시성 확보 (P1-3).
            print(
                f"[CRITICAL] buy 보상 실패 user={user_id_hex} ticker={ticker} "
                f"qty={qty}: {e2}"
            )
            _try_alert_gm(
                f"⚠️ 매수 실패+보상 실패 — user={user_id_hex} {ticker} {qty}주 "
                f"@ {price} CR — GM 수동 복구 필요"
            )
        print(f"[주식] buy_holding 실패 → 보상 ADMIN_GRANT: {e}")
        return {
            "ok": False,
            "error": "보유 갱신 실패. 잔액은 환불되었어요...",
            "balance": None,
        }

    return {"ok": True, "price": price, "new_balance": ss.round_stock_value(new_bal)}


def _execute_stock_sell(user, ticker: str, qty: int) -> dict:
    """매도 처리. step1 사전 fetch → step2 보유 차감 → step3 잔액 가산.

    P1-2: step3 (apply_credit) 실패 시 보유 원복 추가. 보상 자체 실패 시 GM 알림.

    Returns:
        성공: {"ok": True, "price": int, "new_balance": int, "profit": int}
        실패: {"ok": False, "error": str, "balance": int|None}
    """
    price_doc = mongo_stock.get_stock_price(ticker)
    if not price_doc:
        return {"ok": False, "error": "없는 종목이도다...", "balance": None}
    price = ss.round_stock_value(price_doc["price"])
    if price <= 0:
        return {"ok": False, "error": "현재가가 0이라 거래할 수 없도다...", "balance": None}

    user_id_hex = _ensure_user_id(user)

    # step 1: 사전 holding fetch (avg).
    pre = mongo_stock.get_holding(user_id_hex, ticker)
    avg = ss.round_stock_value(pre.get("avgPrice", 0)) if pre else 0

    # step 2: atomic shares 차감 (race 시 ok=False).
    res = mongo_stock.sell_holding(user_id_hex, ticker, qty)
    if not res.get("ok"):
        return {"ok": False, "error": "보유 주식이 부족하도다...", "balance": None}

    # step 3: 잔액 가산 — 실패 시 보유 원복 (P1-2).
    total = ss.round_stock_value(price * qty)
    profit = ss.round_stock_value((price - avg) * qty)
    try:
        new_bal = _apply_credit(
            user=user,
            amount=+total,
            type_="STOCK_SELL",
            description=f"매도 {ticker} {qty}주 @ {ss.format_stock_value(price)} (손익 {profit:+.2f})",
            metadata={
                "ticker": ticker,
                "shares": qty,
                "price": price,
                "avgPrice": avg,
                "profit": profit,
            },
        )
    except Exception as e:
        # 보상: 보유 원복 (avg 로 buy_holding — avg 미상이면 price 로 폴백).
        rollback_price = avg if avg > 0 else price
        try:
            mongo_stock.buy_holding(user_id_hex, ticker, qty, rollback_price)
        except Exception as e2:
            print(
                f"[CRITICAL] sell 보상도 실패 user={user_id_hex} ticker={ticker} "
                f"qty={qty}: {e2}"
            )
            _try_alert_gm(
                f"⚠️ 매도 처리 실패+보상 실패 — user={user_id_hex} {ticker} {qty}주 "
                f"@ {price} CR — GM 수동 복구 필요"
            )
        print(f"[주식] STOCK_SELL apply_credit 실패 → 보유 원복: {e}")
        return {
            "ok": False,
            "error": "매도 처리 실패. 다시 시도해주세요...",
            "balance": None,
        }

    return {
        "ok": True,
        "price": price,
        "new_balance": ss.round_stock_value(new_bal),
        "profit": profit,
    }


# ============================================================
# 인벤토리 (mongo.shop 위임)
# ============================================================
def get_inventory(user_id_hex: str) -> list[dict]:
    """user_id_hex 기준 활성 보유. SQLite 호환 키('item_id', 'quantity')로 변환."""
    docs = mongo_shop.get_user_inventory(user_id_hex)
    return [{"item_id": d["itemId"], "quantity": int(d.get("quantity", 0))} for d in docs]

# ============================================================
# 이미지 생성 — 공통 헬퍼
# ============================================================
def draw_emoji(draw, xy, text, font=None):
    """이모지를 안전하게 그리기 (embedded_color 지원 여부에 따라 분기)"""
    if font is None: font = FONT_EMOJI
    try:
        draw.text(xy, text, font=font, embedded_color=True)
    except TypeError:
        # 구버전 Pillow — embedded_color 미지원
        draw.text(xy, text, fill=GOLD, font=font)
def draw_rounded_rect(draw, xy, radius, fill, outline=None):
    x0,y0,x1,y1 = xy
    draw.rectangle([x0+radius,y0,x1-radius,y1], fill=fill)
    draw.rectangle([x0,y0+radius,x1,y1-radius], fill=fill)
    draw.pieslice([x0,y0,x0+2*radius,y0+2*radius], 180,270, fill=fill)
    draw.pieslice([x1-2*radius,y0,x1,y0+2*radius], 270,360, fill=fill)
    draw.pieslice([x0,y1-2*radius,x0+2*radius,y1], 90,180, fill=fill)
    draw.pieslice([x1-2*radius,y1-2*radius,x1,y1], 0,90, fill=fill)
    if outline:
        draw.arc([x0,y0,x0+2*radius,y0+2*radius],180,270,fill=outline)
        draw.arc([x1-2*radius,y0,x1,y0+2*radius],270,360,fill=outline)
        draw.arc([x0,y1-2*radius,x0+2*radius,y1],90,180,fill=outline)
        draw.arc([x1-2*radius,y1-2*radius,x1,y1],0,90,fill=outline)
        draw.line([x0+radius,y0,x1-radius,y0],fill=outline)
        draw.line([x0+radius,y1,x1-radius,y1],fill=outline)
        draw.line([x0,y0+radius,x0,y1-radius],fill=outline)
        draw.line([x1,y0+radius,x1,y1-radius],fill=outline)

def draw_header(draw, w, title, subtitle=""):
    # 상단 금색 라인
    draw.line([(0,0),(w,0)], fill=GOLD, width=2)
    draw.text((20,12), "NOVUS ORDO", fill=GOLD_DIM, font=FONT_TINY)
    draw.text((20,28), title, fill=GOLD, font=FONT_TITLE)
    if subtitle:
        draw.text((20,54), subtitle, fill=TEXT_DIM, font=FONT_SMALL)
    # 구분선
    y = 72 if subtitle else 56
    draw.line([(15,y),(w-15,y)], fill=BORDER, width=1)
    return y + 10

def draw_footer(draw, w, h, text):
    draw.line([(15,h-30),(w-15,h-30)], fill=BORDER, width=1)
    draw.text((20,h-24), text, fill=TEXT_DIM, font=FONT_TINY)
    draw.text((w-120,h-24), "NOVUS ORDO", fill=GOLD_DIM, font=FONT_TINY)

def img_to_buffer(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf

# ============================================================
# 이미지 — 편의점 카드 (페이지별)
# ============================================================
SHOP_PAGES = [
    {"title": "BASIC", "subtitle": "기본 소모품", "items": ["cup_ramen", "soda", "coffee"]},
    {"title": "RECOVERY", "subtitle": "회복 / 해제", "items": ["energy_bar", "hotpack", "chocolate"]},
    {"title": "LUXURY", "subtitle": "기호품", "items": ["beer_pack", "cig_1", "cig_5"]},
    {"title": "RARE", "subtitle": "고급 / 희귀", "items": ["liquor", "icecream", "force_core", "vf_blood"]},
]

def draw_shop_page(page_info, stocks):
    """한 페이지 분량의 상점 이미지 생성"""
    items = [ITEM_MAP[iid] for iid in page_info["items"] if iid in ITEM_MAP]
    cols = len(items)
    card_w, card_h = 300, 340
    pad = 14
    margin = 24
    w = margin*2 + cols*card_w + (cols-1)*pad
    header_h = 60
    footer_h = 36
    h = header_h + card_h + pad + footer_h

    img = Image.new("RGB", (w, h), (15, 18, 22))
    draw = ImageDraw.Draw(img)

    # ---- 헤더 ----
    draw.rectangle([0, 0, w, header_h], fill=(20, 24, 30))
    draw.rectangle([0, 0, w, 3], fill=GOLD)
    draw.text((margin, 12), page_info["title"], fill=GOLD, font=FONT_TITLE)
    draw.text((margin, 36), page_info["subtitle"], fill=TEXT_DIM, font=FONT_BODY)
    op_bal = get_op_balance()
    draw.text((w - margin - 120, 12), "OP POOL", fill=TEXT_DIM, font=FONT_TINY)
    draw.text((w - margin - 120, 26), f"{op_bal} CR", fill=GOLD, font=FONT_HEADER)
    draw.rectangle([0, header_h-1, w, header_h], fill=(40, 44, 50))

    start_y = header_h + pad//2

    for i, item in enumerate(items):
        x = margin + i*(card_w+pad)
        y = start_y
        stk = stocks.get(item["id"], 0)
        sold = stk <= 0

        # 카드 배경
        card_bg = (28, 22, 22) if sold else (24, 28, 36)
        card_border = (50, 35, 35) if sold else (45, 50, 60)
        draw_rounded_rect(draw, (x, y, x+card_w, y+card_h), 8, card_bg, card_border)

        # 아이콘 영역
        icon_area_h = 190
        icon_bg = (35, 28, 28) if sold else (30, 36, 48)
        draw_rounded_rect(draw, (x+3, y+3, x+card_w-3, y+icon_area_h), 6, icon_bg)

        # 아이콘 이미지 or 이모지
        if item["id"] in ITEM_IMAGES:
            item_img = ITEM_IMAGES[item["id"]].copy()
            icon_size = min(card_w - 40, icon_area_h - 24)
            item_img = item_img.resize((icon_size, icon_size), Image.LANCZOS)
            ix = x + (card_w - icon_size) // 2
            iy = y + (icon_area_h - icon_size) // 2
            if sold:
                item_img = ImageEnhance.Brightness(item_img).enhance(0.3)
            img.paste(item_img, (ix, iy), item_img if item_img.mode == "RGBA" else None)
        else:
            draw_emoji(draw, (x + card_w//2 - 14, y + 60), item["icon"], FONT_EMOJI)

        # 하이라이트 바
        accent = (60, 30, 30) if sold else item.get("color", GOLD_DIM)
        draw.rectangle([x+3, y+icon_area_h-4, x+card_w-3, y+icon_area_h], fill=accent)

        # 재고 뱃지
        if sold:
            badge_bg, badge_text = (120, 40, 40), "SOLD"
        else:
            badge_bg = (40, 90, 55) if stk >= 3 else (160, 100, 20) if stk >= 2 else (150, 40, 40)
            badge_text = f"x{stk}"
        bx, by = x + card_w - 56, y + 8
        draw_rounded_rect(draw, (bx, by, bx+48, by+24), 4, badge_bg)
        draw.text((bx+10, by+4), badge_text, fill=WHITE, font=FONT_HEADER)

        # 이름
        name_y = y + icon_area_h + 10
        draw.text((x+12, name_y), item["name"], fill=(80,60,60) if sold else WHITE, font=FONT_TITLE)

        # 효과
        eff_y = name_y + 28
        draw.text((x+12, eff_y), item["effect"], fill=(70,55,55) if sold else (120,180,140), font=FONT_HEADER)

        # 가격 바
        price_y = y + card_h - 44
        draw.rectangle([x+3, price_y, x+card_w-3, y+card_h-3], fill=(22,18,18) if sold else (18,22,30))
        pc = (60,45,45) if sold else GOLD
        draw.text((x+12, price_y+10), "CR", fill=pc, font=FONT_BODY)
        draw.text((x+40, price_y+6), f"{item['price']}", fill=pc, font=FONT_TITLE)

        # 품절 사선
        if sold:
            for dy in range(0, card_h, 10):
                draw.line([(x+3, y+dy), (x+3+min(dy, card_w-6), max(y+3, y+dy-min(dy, card_h)))],
                          fill=(50, 30, 30), width=1)

    # 푸터
    fy = h - footer_h
    draw.rectangle([0, fy, w, h], fill=(20, 24, 30))
    draw.text((margin, fy+10), "NO REFUNDS  |  RESTOCK 06:00  |  CLOSED SUNDAY", fill=TEXT_DIM, font=FONT_TINY)

    return img_to_buffer(img)

def draw_shop_images():
    """모든 페이지의 이미지를 리스트로 반환"""
    stocks = get_all_stock()
    return [draw_shop_page(page, stocks) for page in SHOP_PAGES]

# ============================================================
# 이미지 — 인벤토리 카드 그리드
# ============================================================
def draw_inventory_image(user_id_hex, user_name):
    """user_id_hex: User._id hex. 호출자가 mongo_users.ensure_user 결과를 주입.

    Note: 현재 호출처 없음 (Phase 1C-1 시점 데드 코드). 시그니처만 mongo 호환으로 갱신.
    """
    inv = get_inventory(user_id_hex)
    bal = mongo_credits.get_balance(user_id_hex)
    cols, card_w, card_h, pad, margin = 4, 150, 100, 8, 20
    max_slots = 12
    items_to_show = inv[:max_slots]
    rows_count = max(1, (max_slots + cols - 1) // cols)
    w = margin*2 + cols*card_w + (cols-1)*pad
    h = 82 + rows_count*(card_h+pad) + 50

    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    start_y = draw_header(draw, w, f"{user_name}", f"잔고: {bal} CR")

    inv_map = {e["item_id"]: e["quantity"] for e in items_to_show}

    for slot in range(max_slots):
        col, row = slot % cols, slot // cols
        x = margin + col*(card_w+pad)
        y = start_y + row*(card_h+pad)

        if slot < len(items_to_show):
            entry = items_to_show[slot]
            item = ITEM_MAP.get(entry["item_id"])
            if not item: continue
            draw_rounded_rect(draw, (x,y,x+card_w,y+card_h), 4, CARD_BG, GOLD_DARK)
            # 컬러 바
            draw.rectangle([x+1,y+4,x+5,y+card_h-4], fill=item.get("color",GOLD_DIM))
            # 아이콘 — 실제 이미지 또는 이모지
            if item["id"] in ITEM_IMAGES:
                item_img = ITEM_IMAGES[item["id"]].copy()
                icon_sz = min(card_w - 80, card_h - 40, 50)
                item_img = item_img.resize((icon_sz, icon_sz), Image.LANCZOS)
                img.paste(item_img, (x+10, y+6), item_img if item_img.mode == "RGBA" else None)
                # 이미지가 있으면 이름 위치 조정
                draw.text((x+10+icon_sz+4, y+8), item["name"], fill=WHITE, font=FONT_SMALL)
            else:
                draw_emoji(draw, (x+14, y+6), item["icon"])
                draw.text((x+36, y+8), item["name"], fill=WHITE, font=FONT_SMALL)
            # 수량
            draw.text((x+card_w-40, y+6), f"x{entry['quantity']}", fill=GOLD, font=FONT_BODY)
            # 효과
            draw.text((x+14, y+32), item["effect"], fill=GREEN, font=FONT_TINY)
            # 가격 참고
            draw.text((x+14, y+card_h-22), f"{item['price']} CR", fill=TEXT_DIM, font=FONT_TINY)
        else:
            # 빈 슬롯
            draw_rounded_rect(draw, (x,y,x+card_w,y+card_h), 4, (14,14,11), (30,28,18))
            draw.text((x+card_w//2-8, y+card_h//2-8), "--", fill=(40,38,28), font=FONT_BODY)

    used = len(items_to_show)
    draw_footer(draw, w, h, f"SLOT {used}/{max_slots} USED  |  💰 {bal} CR")
    return img_to_buffer(img)

# ============================================================
# 이미지 — 전체 잔고
# ============================================================
def draw_all_balances_image():
    rows = mongo_credits.list_balances_with_names()
    db_rows = {r.get("userName", ""): int(r.get("balance", 0)) for r in rows}
    op_bal = get_op_balance()

    # 전체 요원 목록 (DB에 있으면 실제 잔고, 없으면 초기 크레딧).
    # AGENT_NAMES 는 모듈 상단 단일 출처 (P3-1).
    all_agents = []
    seen = set()
    # DB에 있는 요원 먼저
    for nick, bal in db_rows.items():
        agent = AGENT_NAMES.get(nick, nick)
        all_agents.append({"nick": nick, "agent": agent, "balance": bal})
        seen.add(nick)
    # DB에 없는 요원은 초기 크레딧으로
    for nick, initial in INITIAL_CREDITS.items():
        if nick not in seen and nick in AGENT_NAMES:
            agent = AGENT_NAMES[nick]
            all_agents.append({"nick": nick, "agent": agent, "balance": initial})
            seen.add(nick)
    # 잔고 순으로 정렬
    all_agents.sort(key=lambda x: x["balance"], reverse=True)

    row_h, margin = 28, 20
    w = 500
    h = 82 + len(all_agents)*row_h + 60

    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    start_y = draw_header(draw, w, "AGENT BALANCES", f"작전 크레딧: {op_bal} CR")

    for i, a in enumerate(all_agents):
        y = start_y + i*row_h
        if i % 2 == 0:
            draw.rectangle([margin,y,w-margin,y+row_h], fill=(14,14,11))
        # 캐릭터명 + 닉
        draw.text((margin+10, y+4), f"{a['agent']}", fill=TEXT, font=FONT_BODY)
        draw.text((margin+80, y+4), f"({a['nick']})", fill=TEXT_DIM, font=FONT_TINY)
        # 금액 (먼저 그려서 위치 확보)
        cr_text = f"{a['balance']} CR"
        draw.text((w-margin-65, y+4), cr_text, fill=GOLD, font=FONT_BODY)
        # 잔고 바 (금액 텍스트 앞까지만)
        max_cr = 400
        bar_max_w = 130  # 바 최대 길이 제한
        bar_w = min(int((a["balance"]/max_cr)*bar_max_w), bar_max_w)
        bar_color = GOLD if a["balance"]>=100 else (200,120,40) if a["balance"]>=40 else RED
        bar_x = 280
        draw.rectangle([bar_x, y+8, bar_x+bar_w, y+row_h-8], fill=bar_color)

    draw_footer(draw, w, h, f"작전 풀: {op_bal} CR")
    return img_to_buffer(img)

# ============================================================
# 이미지 — 구매 내역 정리
# ============================================================
def _week_start_kst() -> datetime:
    """이번 주 월요일 06:00 KST. 월요일 06시 이전이면 지난 주 월요일 06시."""
    now = _now_kst_dt()
    # 월요일 = weekday 0. 이번 주 월요일 06시 산출.
    days_since_monday = now.weekday()
    monday_kst = now - timedelta(days=days_since_monday)
    monday_six = monday_kst.replace(hour=6, minute=0, second=0, microsecond=0)
    if now < monday_six:
        # 월요일 06시 이전 → 지난 주 월요일 06시
        monday_six = monday_six - timedelta(days=7)
    return monday_six


def draw_summary_image():
    """이번 주 (월요일 06시 KST 이후) 편의점 구매 내역 정리 이미지.

    원본 SQLite 시맨틱: trade_log 전체 (월요일 06시 DELETE 후 누적). Mongo 는 영구 보관이므로
    명시적으로 이번 주 시작 시점 이후만 집계.

    `(userName, itemId)` 페어로 group. mongo_credits.list_purchases_grouped 는 itemId
    단일 group 만 제공하므로 여기서는 직접 aggregation. (어댑터 확장은 1B 종료.)
    """
    start = _week_start_kst().astimezone(timezone.utc)
    pipeline = [
        {"$match": {"type": "PURCHASE", "createdAt": {"$gte": start}}},
        {
            "$group": {
                "_id": {
                    "userName": "$userName",
                    "itemId": {"$ifNull": ["$metadata.itemId", None]},
                },
                "cnt": {"$sum": 1},
                "total": {"$sum": {"$abs": "$amount"}},
            }
        },
    ]
    rows = list(get_db()["credit_transactions"].aggregate(pipeline))

    # group: (userName, itemId) → { cnt, total }
    pair_count: dict[tuple[str, str], dict] = {}
    for r in rows:
        key = r.get("_id") or {}
        name = key.get("userName") or ""
        item_id = key.get("itemId")
        if not name or not isinstance(item_id, str) or not item_id:
            continue
        cnt = int(r.get("cnt", 0))
        total = int(r.get("total", 0))
        pair_count[(name, item_id)] = {"cnt": cnt, "total": total}

    if not pair_count:
        return None

    # user_name 별로 묶기
    summary: dict[str, dict] = {}
    for (name, item_id), data in pair_count.items():
        if name not in summary:
            summary[name] = {"items": [], "total": 0}
        item = ITEM_MAP.get(item_id)
        if item:
            summary[name]["items"].append((item, data["cnt"]))
        summary[name]["total"] += data["total"]

    # 이름별 잔액 lookup
    balance_rows = mongo_credits.list_balances_with_names()
    balance_lookup = {r.get("userName", ""): int(r.get("balance", 0)) for r in balance_rows}

    margin, agent_h = 20, 80
    w = 600
    h = 82 + len(summary)*agent_h + 50

    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    start_y = draw_header(draw, w, "PURCHASE SUMMARY", "요원별 소모품 구매 내역")

    for i, (name, data) in enumerate(summary.items()):
        y = start_y + i*agent_h
        # 에이전트 배경
        draw.rectangle([margin,y,w-margin,y+agent_h-4], fill=CARD_BG, outline=BORDER)
        # 이름
        draw.text((margin+10, y+6), f"> {name}", fill=GOLD, font=FONT_BODY)
        # 잔고
        bal = balance_lookup.get(name, 0)
        draw.text((w-margin-80, y+6), f"잔고 {bal} CR", fill=TEXT_DIM, font=FONT_SMALL)
        # 아이템 목록
        item_strs = [f"{it['icon']}{it['name']} x{cnt}" for it, cnt in data["items"]]
        draw.text((margin+10, y+28), "  ".join(item_strs), fill=TEXT, font=FONT_SMALL)
        # 총 사용액
        draw.text((margin+10, y+agent_h-24), f"총 사용: {data['total']} CR", fill=RED, font=FONT_SMALL)

    op_bal = get_op_balance()
    draw_footer(draw, w, h, f"작전 풀: {op_bal} CR  |  주 단위 집계")
    return img_to_buffer(img)

# ============================================================
# 이미지 — 영수증 (편의점 영수증 스타일)
# ============================================================
def draw_receipt_image(user_name, item, new_bal, remaining, now, qty=1):
    # 디스코드 닉 → 요원명 변환 (모듈 상단 AGENT_NAMES 단일 출처, P3-1).
    agent_name = AGENT_NAMES.get(user_name, user_name)
    total_price = item["price"] * qty
    w = 280
    h = 400
    # 영수증 배경 (약간 누런 종이 느낌)
    paper = (245, 240, 228)
    ink = (40, 35, 30)
    ink_light = (120, 115, 105)
    ink_gold = (140, 110, 40)
    dash_color = (180, 175, 165)

    img = Image.new("RGB", (w, h), paper)
    draw = ImageDraw.Draw(img)

    y = 15

    # 상호명
    draw.text((w//2 - 70, y), "NOVUS ORDO", fill=ink, font=FONT_HEADER)
    y += 22
    draw.text((w//2 - 40, y), "CONVENIENCE", fill=ink_light, font=FONT_TINY)
    y += 18

    # 점선 구분
    for dx in range(10, w-10, 6):
        draw.rectangle([dx, y, dx+3, y+1], fill=dash_color)
    y += 12

    # 날짜/시간
    draw.text((15, y), f"DATE  {now.strftime('%Y-%m-%d')}", fill=ink_light, font=FONT_SMALL)
    y += 16
    draw.text((15, y), f"TIME  {now.strftime('%H:%M:%S')}", fill=ink_light, font=FONT_SMALL)
    y += 16
    draw.text((15, y), f"AGENT {agent_name}", fill=ink, font=FONT_SMALL)
    y += 22

    # 점선 구분
    for dx in range(10, w-10, 6):
        draw.rectangle([dx, y, dx+3, y+1], fill=dash_color)
    y += 12

    # 상품명
    draw.text((15, y), "ITEM", fill=ink_light, font=FONT_TINY)
    draw.text((w-65, y), "PRICE", fill=ink_light, font=FONT_TINY)
    y += 16

    # 아이콘 + 상품
    draw_emoji(draw, (15, y), item["icon"], FONT_EMOJI_SM)
    if qty > 1:
        draw.text((40, y+2), f"{item['name']} x{qty}", fill=ink, font=FONT_BODY)
    else:
        draw.text((40, y+2), item["name"], fill=ink, font=FONT_BODY)
    draw.text((w-65, y+2), f"{item['price']} CR", fill=ink, font=FONT_BODY)
    y += 22

    # 수량 표시 (2개 이상일 때)
    if qty > 1:
        draw.text((40, y), f"({item['price']} x {qty})", fill=ink_light, font=FONT_SMALL)
        y += 16

    # 효과
    draw.text((40, y), f"({item['effect']})", fill=ink_gold, font=FONT_SMALL)
    y += 22

    # 점선 구분
    for dx in range(10, w-10, 6):
        draw.rectangle([dx, y, dx+3, y+1], fill=dash_color)
    y += 12

    # 합계
    draw.text((15, y), "TOTAL", fill=ink, font=FONT_BODY)
    draw.text((w-75, y), f"{total_price} CR", fill=ink, font=FONT_HEADER)
    y += 26

    # 이중선 구분
    draw.line([(10, y), (w-10, y)], fill=ink_light, width=1)
    draw.line([(10, y+3), (w-10, y+3)], fill=ink_light, width=1)
    y += 14

    # 잔고
    draw.text((15, y), f"BALANCE", fill=ink_light, font=FONT_SMALL)
    draw.text((w-80, y), f"{new_bal} CR", fill=ink, font=FONT_BODY)
    y += 20

    # 남은 재고
    draw.text((15, y), f"STOCK LEFT", fill=ink_light, font=FONT_SMALL)
    stk_color = ink if remaining >= 2 else (180, 40, 40)
    draw.text((w-50, y), f"{remaining}", fill=stk_color, font=FONT_BODY)
    y += 26

    # 점선 구분
    for dx in range(10, w-10, 6):
        draw.rectangle([dx, y, dx+3, y+1], fill=dash_color)
    y += 14

    # 안내 문구
    draw.text((w//2 - 55, y), "THANK YOU", fill=ink_light, font=FONT_HEADER)
    y += 20
    draw.text((w//2 - 65, y), "NO REFUNDS ALLOWED", fill=(160, 80, 80), font=FONT_SMALL)
    y += 18

    # 바코드 느낌 (장식) — _r 은 모듈 상단 import (P3-4).
    bar_y = y + 5
    for bx in range(40, w-40, 3):
        bw = _r.choice([1, 2])
        bh = _r.randint(20, 30)
        draw.rectangle([bx, bar_y, bx+bw, bar_y+bh], fill=ink)

    # 테두리 약간의 질감 (상단/하단 찢어진 느낌)
    for tx in range(0, w, 8):
        offset = _r.randint(0, 3)
        draw.rectangle([tx, 0, tx+4, offset], fill=(230, 225, 215))
        draw.rectangle([tx, h-offset, tx+4, h], fill=(230, 225, 215))

    return img_to_buffer(img)

# ============================================================
# 디스코드 드롭다운 + 구매 버튼
# ============================================================
class ShopSelect(discord.ui.Select):
    def __init__(self):
        stocks = get_all_stock()
        options = []
        for item in SHOP_ITEMS:
            stk = stocks.get(item["id"], 0)
            if stk > 0:
                options.append(discord.SelectOption(
                    label=f"{item['name']} — {item['price']} CR (재고 {stk}개)",
                    value=item["id"], description=item["effect"]))
        if not options:
            options.append(discord.SelectOption(label="오늘은 전부 품절이에요...", value="none"))
        super().__init__(placeholder="상품을 골라주세요...", options=options)

    async def callback(self, interaction):
        item_id = self.values[0]
        if item_id == "none":
            await interaction.response.send_message("오늘은 살 수 있는 게 없어요...", ephemeral=True); return
        item = ITEM_MAP[item_id]
        stk = get_stock(item_id)
        if stk <= 0:
            await interaction.response.send_message(f"앗... {item['name']}은(는) 방금 품절됐어요...", ephemeral=True); return
        _, bal = _ensure_and_get_balance(interaction.user)
        embed = discord.Embed(title=f"{item['name']}", description=f"*{item['desc']}*", color=discord.Color.from_rgb(255,183,77))
        embed.add_field(name="효과", value=item["effect"], inline=True)
        embed.add_field(name="단가", value=f"{item['price']} CR", inline=True)
        embed.add_field(name="재고", value=f"{stk}개", inline=True)
        embed.add_field(name="잔고", value=f"{bal} CR", inline=True)
        if bal < item["price"]:
            embed.set_footer(text="❌ 크레딧이 부족해요...")
            await interaction.response.send_message(embed=embed, ephemeral=True)
        else:
            max_buy = min(stk, bal // item["price"], 9)  # 최대 9개
            embed.set_footer(text="수량을 선택해주세요... (환불 불가!)")
            await interaction.response.send_message(embed=embed,
                view=QuantitySelectView(item_id, interaction.user.id, interaction.user.display_name, max_buy),
                ephemeral=True)

class ShopView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(ShopSelect())

class QuantitySelect(discord.ui.Select):
    def __init__(self, item_id, user_id, user_name, max_qty):
        self.item_id = item_id
        self.user_id = user_id
        self.user_name = user_name
        item = ITEM_MAP[item_id]
        options = []
        for i in range(1, max_qty + 1):
            total = item["price"] * i
            options.append(discord.SelectOption(
                label=f"{i}개 — {total} CR",
                value=str(i),
                description=f"단가 {item['price']} x {i}"))
        super().__init__(placeholder="수량을 선택해주세요...", options=options)

    async def callback(self, interaction):
        qty = int(self.values[0])
        item = ITEM_MAP[self.item_id]
        total = item["price"] * qty
        stk = get_stock(self.item_id)
        _, bal = _ensure_and_get_balance(interaction.user)
        if stk < qty:
            await interaction.response.edit_message(content=f"앗... 재고가 {stk}개밖에 없어요...", embed=None, view=None); return
        if bal < total:
            await interaction.response.edit_message(content=f"크레딧이 부족해요... ({total} CR 필요, 잔고 {bal} CR)", embed=None, view=None); return
        embed = discord.Embed(title=f"{item['name']} x{qty}", color=discord.Color.from_rgb(255,183,77))
        embed.add_field(name="수량", value=f"{qty}개", inline=True)
        embed.add_field(name="합계", value=f"{total} CR", inline=True)
        embed.add_field(name="잔고", value=f"{bal} CR → {bal - total} CR", inline=True)
        embed.set_footer(text="구매하시겠어요...? (환불 불가!)")
        await interaction.response.edit_message(embed=embed,
            view=BuyConfirmView(self.item_id, self.user_id, self.user_name, qty))

class QuantitySelectView(discord.ui.View):
    def __init__(self, item_id, user_id, user_name, max_qty):
        super().__init__(timeout=30)
        self.add_item(QuantitySelect(item_id, user_id, user_name, max_qty))

class BuyConfirmView(discord.ui.View):
    def __init__(self, item_id, user_id, user_name, qty=1):
        super().__init__(timeout=30)
        self.item_id, self.user_id, self.user_name, self.qty = item_id, user_id, user_name, qty

    @discord.ui.button(label="구매", style=discord.ButtonStyle.success, emoji="✅")
    async def buy(self, interaction, button):
        item = ITEM_MAP[self.item_id]
        total = item["price"] * self.qty

        # 1) 재고 atomic 차감 먼저. 부족 시 잔액 손실 없이 즉시 거절.
        ok = mongo_shop.reduce_stock(self.item_id, self.qty)
        if not ok:
            stk = get_stock(self.item_id)
            await interaction.response.edit_message(
                content=f"앗... 재고가 {stk}개밖에 없어요...", embed=None, view=None,
            )
            return

        # 2) 잔액 차감. 부족 시 재고 보상 (atomic $inc).
        try:
            new_bal = _apply_credit(
                user=interaction.user,
                amount=-total,
                type_="PURCHASE",
                description=f"편의점 구매: {item['name']} x{self.qty}",
                metadata={"itemId": self.item_id, "qty": self.qty},
            )
        except ValueError:
            # 잔액 부족 (race) → 재고 되돌리기.
            try:
                get_db()["shop_daily_stock"].update_one(
                    {"itemId": self.item_id}, {"$inc": {"stock": self.qty}},
                )
            except Exception as e:
                print(f"[CRITICAL] 재고 보상 실패 item={self.item_id} qty={self.qty}: {e}")
                _try_alert_gm(
                    f"⚠️ 구매 잔액 차감 실패+재고 보상 실패 — "
                    f"item={self.item_id} qty={self.qty} — GM 수동 복구 필요"
                )
            await interaction.response.edit_message(
                content="크레딧이 부족해요...", embed=None, view=None,
            )
            return

        # 3) 인벤토리 적재.
        user_id_hex = _ensure_user_id(interaction.user)
        mongo_shop.add_inventory(user_id_hex, self.item_id, self.qty)

        remaining = get_stock(self.item_id)
        await interaction.response.edit_message(
            content=f"감사합니다... **{item['name']} x{self.qty}** 여기 있어요! 잔고 **{new_bal}** CR (재고 {remaining}개 남음)",
            embed=None, view=None)
        # 채널에 영수증 이미지 공개
        now = datetime.now(TIMEZONE)
        buf = draw_receipt_image(self.user_name, item, new_bal, remaining, now, self.qty)
        file = discord.File(buf, filename="receipt.png")
        await interaction.channel.send(file=file)

    @discord.ui.button(label="취소", style=discord.ButtonStyle.secondary, emoji="❌")
    async def cancel(self, interaction, button):
        await interaction.response.edit_message(content="아, 네... 다음에 또 오세요...!", embed=None, view=None)

# ============================================================
# 주식 거래 UI
# ============================================================
class StockTradeSelect(discord.ui.Select):
    def __init__(self, user_id, user_name):
        self.user_id = user_id; self.user_name = user_name
        # mongo.stock.get_stock_prices() 는 list[dict] 반환. 호환을 위해 dict 변환.
        price_docs = mongo_stock.get_stock_prices()
        prices = {p["ticker"]: p for p in price_docs}
        options = []
        for s in ss.STOCKS:
            p = prices.get(s["ticker"], {})
            price = ss.round_stock_value(p.get("price", s["base_price"]))
            prev = ss.round_stock_value(p.get("prevPrice", s["base_price"]))
            diff = price - prev
            arrow = (
                f"+{ss.format_stock_value(diff)}"
                if diff > 0
                else ss.format_stock_value(diff)
                if diff < 0
                else "0"
            )
            options.append(discord.SelectOption(
                label=f"{s['name']} ({s['ticker']}) — {ss.format_stock_value(price)} CR",
                value=s["ticker"], description=f"전일 대비 {arrow} CR"))
        super().__init__(placeholder="거래할 종목을 선택해주세요...", options=options)

    async def callback(self, interaction):
        ticker = self.values[0]; s = ss.STOCK_MAP[ticker]
        price_doc = mongo_stock.get_stock_price(ticker)
        price = ss.round_stock_value(price_doc["price"]) if price_doc else 0
        user_id_hex, bal = _ensure_and_get_balance(interaction.user)
        # mongo.stock.get_holdings 는 활성 보유만 (shares > 0). avgPrice 키 사용.
        holdings = mongo_stock.get_holdings(user_id_hex)
        held, avg = 0, 0
        for h in holdings:
            if h["ticker"] == ticker:
                held = int(h.get("shares", 0))
                avg = ss.round_stock_value(h.get("avgPrice", 0))
                break
        embed = discord.Embed(title=f"{s['name']} ({ticker})", description=s["desc"],
                              color=discord.Color.from_rgb(197,162,85))
        embed.add_field(name="현재가", value=f"**{ss.format_stock_value(price)}** CR", inline=True)
        embed.add_field(name="잔고", value=f"{ss.format_stock_value(bal)} CR", inline=True)
        embed.add_field(name="보유", value=f"{held}주 (평단 {ss.format_stock_value(avg)})" if held > 0 else "없음", inline=True)
        max_buy = min(bal // price, 50) if price > 0 else 0
        embed.add_field(name="최대 매수", value=f"{max_buy}주", inline=True)
        if held > 0:
            cur_value = ss.round_stock_value(price * held)
            cur_profit = ss.round_stock_value((price - avg) * held)
            pstr = f"+{ss.format_stock_value(cur_profit)}" if cur_profit >= 0 else ss.format_stock_value(cur_profit)
            embed.add_field(name="평가액", value=f"{ss.format_stock_value(cur_value)} CR ({pstr})", inline=True)
        await interaction.response.edit_message(content=None, embed=embed,
            view=StockActionView(ticker, interaction.user.id, interaction.user.display_name, price, held))

class StockTradeView(discord.ui.View):
    def __init__(self, user_id, user_name):
        super().__init__(timeout=60)
        self.add_item(StockTradeSelect(user_id, user_name))

class StockQuantitySelect(discord.ui.Select):
    def __init__(self, action, ticker, user_id, user_name, price, max_qty):
        self.action = action; self.ticker = ticker
        self.user_id = user_id; self.user_name = user_name; self.price = price
        options = []
        for i in range(1, min(max_qty, 9) + 1):
            total = ss.round_stock_value(price * i)
            lbl = f"{i}주 매수 — {ss.format_stock_value(total)} CR" if action == "buy" else f"{i}주 매도 — {ss.format_stock_value(total)} CR"
            options.append(discord.SelectOption(label=lbl, value=str(i)))
        if not options:
            options.append(discord.SelectOption(label="거래 불가", value="0"))
        super().__init__(placeholder="수량을 선택해주세요...", options=options)

    async def callback(self, interaction):
        qty = int(self.values[0])
        if qty <= 0:
            await interaction.response.edit_message(content="거래할 수 없어요...", embed=None, view=None); return
        s = ss.STOCK_MAP[self.ticker]
        embed = discord.Embed(title=f"{'매수' if self.action=='buy' else '매도'} 확인 — {s['name']}",
            color=discord.Color.from_rgb(60,180,80) if self.action=="buy" else discord.Color.from_rgb(200,60,60))
        embed.add_field(name="현재가", value=f"{ss.format_stock_value(self.price)} CR", inline=True)
        embed.add_field(name="수량", value=f"{qty}주", inline=True)
        embed.add_field(name="합계", value=f"{ss.format_stock_value(ss.round_stock_value(self.price * qty))} CR", inline=True)
        await interaction.response.edit_message(embed=embed,
            view=StockConfirmView(self.action, self.ticker, self.user_id, self.user_name, qty, self.price))

class StockQuantityView(discord.ui.View):
    def __init__(self, action, ticker, user_id, user_name, price, max_qty):
        super().__init__(timeout=30)
        self.add_item(StockQuantitySelect(action, ticker, user_id, user_name, price, max_qty))

class StockActionView(discord.ui.View):
    def __init__(self, ticker, user_id, user_name, price, held):
        super().__init__(timeout=30)
        self.ticker = ticker; self.user_id = user_id; self.user_name = user_name
        self.price = price; self.held = held

    @discord.ui.button(label="매수", style=discord.ButtonStyle.success, emoji="📈")
    async def buy_btn(self, interaction, button):
        _, bal = _ensure_and_get_balance(interaction.user)
        max_buy = min(bal // self.price, 50) if self.price > 0 else 0
        if max_buy <= 0:
            await interaction.response.edit_message(content="크레딧이 부족해요...", embed=None, view=None); return
        await interaction.response.edit_message(content=None, embed=None,
            view=StockQuantityView("buy", self.ticker, self.user_id, self.user_name, self.price, max_buy))

    @discord.ui.button(label="매도", style=discord.ButtonStyle.danger, emoji="📉")
    async def sell_btn(self, interaction, button):
        if self.held <= 0:
            await interaction.response.edit_message(content="보유 주식이 없어요...", embed=None, view=None); return
        await interaction.response.edit_message(content=None, embed=None,
            view=StockQuantityView("sell", self.ticker, self.user_id, self.user_name, self.price, self.held))

    @discord.ui.button(label="취소", style=discord.ButtonStyle.secondary, emoji="❌")
    async def cancel_btn(self, interaction, button):
        await interaction.response.edit_message(content="거래를 취소했어요...", embed=None, view=None)

class StockConfirmView(discord.ui.View):
    def __init__(self, action, ticker, user_id, user_name, qty, price):
        super().__init__(timeout=30)
        self.action = action; self.ticker = ticker; self.user_id = user_id
        self.user_name = user_name; self.qty = qty; self.price = price

    @discord.ui.button(label="실행", style=discord.ButtonStyle.success, emoji="✅")
    async def confirm(self, interaction, button):
        s = ss.STOCK_MAP[self.ticker]
        if self.action == "buy":
            result = _execute_stock_buy(interaction.user, self.ticker, self.qty)
            if not result.get("ok"):
                await interaction.response.edit_message(
                    content=f"저, 저기... {result.get('error', '거래에 실패했어요...')}",
                    embed=None, view=None,
                )
                return
            result_price = result["price"]
            new_bal = result["new_balance"]
            total = ss.round_stock_value(result_price * self.qty)
            await interaction.response.edit_message(
                content=f"**{s['name']}** {self.qty}주 매수 완료했어요...\n단가 {ss.format_stock_value(result_price)} CR x {self.qty}주 = {ss.format_stock_value(total)} CR\n잔고: {ss.format_stock_value(new_bal)} CR",
                embed=None, view=None)
        else:
            result = _execute_stock_sell(interaction.user, self.ticker, self.qty)
            if not result.get("ok"):
                await interaction.response.edit_message(
                    content=f"저, 저기... {result.get('error', '매도에 실패했어요...')}",
                    embed=None, view=None,
                )
                return
            result_price = result["price"]
            new_bal = result["new_balance"]
            profit = result["profit"]
            total = ss.round_stock_value(result_price * self.qty)
            pstr = f"+{ss.format_stock_value(profit)}" if profit >= 0 else ss.format_stock_value(profit)
            await interaction.response.edit_message(
                content=f"**{s['name']}** {self.qty}주 매도 완료했어요...\n단가 {ss.format_stock_value(result_price)} CR x {self.qty}주 = {ss.format_stock_value(total)} CR\n손익: {pstr} CR | 잔고: {ss.format_stock_value(new_bal)} CR",
                embed=None, view=None)

    @discord.ui.button(label="취소", style=discord.ButtonStyle.secondary, emoji="❌")
    async def cancel(self, interaction, button):
        await interaction.response.edit_message(content="거래를 취소했어요...", embed=None, view=None)

# ============================================================
# 주식 폭락 위로 메시지
# ============================================================
def get_crash_comfort(agent, stock_name):
    lines = [
        f"*조용히 따뜻한 커피를 카운터에 올려놓으며*\n...{agent} 씨, 괜찮으세요...?\n주식은 떨어지기도 하는 거래요...\n한강은... 춥다고 하더라고요...",
        f"*걱정스럽게 바라보며*\n{agent} 씨... {stock_name} 많이 떨어졌죠...\n저, 저기... 컵라면 하나 데워드릴까요...?\n...한강 가시면 안 돼요...",
        f"*카운터 뒤에서 살짝 고개를 내밀며*\n{agent} 씨... 오늘 힘드셨죠...\n*따뜻한 소다를 슬쩍 카운터 위에 올려놓는다.*\n...그래도 내일은 오를지도 모르잖아요...",
        f"*손에 묻은 물감을 닦으며 슬쩍 다가온다.*\n...{agent} 씨. {stock_name}이 많이 떨어졌다고 들었어요...\n저, 저기... 한강 수온은 지금 12도래요. 춥대요...\n*따뜻한 커피를 밀어놓는다.*",
    ]
    return random.choice(lines)

# ============================================================
# Cog
# ============================================================
class ShopCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.daily_tasks.start()
        self.viral_task.start()
        self.stock_daily_task.start()

    def cog_unload(self):
        self.daily_tasks.cancel()
        self.viral_task.cancel()
        self.stock_daily_task.cancel()

    @commands.Cog.listener()
    async def on_ready(self):
        """봇 시작 시 오늘 주식/재고 업데이트 안 했으면 실행"""
        now = datetime.now(TIMEZONE)
        if now.weekday() == 6: return
        today = get_today_str()
        if needs_refresh():
            refresh_stock()
            print(f"[편의점] 시작 시 재고 리셋 ({today})")
        # 주식 이벤트 시간(13/17/20시) 지났는데 오늘 업데이트 안 했으면 실행
        if now.weekday() != 6 and any(now.hour >= h for h in ss.STOCK_HOURS) and ss.needs_stock_update():
            try:
                # circular import: bot ↔ shop — 함수 내부에서만 lazy import.
                from bot import COPILOT_API_KEY, MODEL
                results = await ss.update_stock_prices(COPILOT_API_KEY, MODEL)
                print(f"[주식] 시작 시 시세 업데이트 완료 ({today})")
                ch = self.bot.get_channel(STOCK_CHANNEL_ID)
                if ch and results:
                    buf = ss.draw_stock_board()
                    file = discord.File(buf, filename="stock_daily.png")
                    biggest = max(results, key=lambda x: abs(x["change"]))
                    if biggest["change"] < -10:
                        comment = f"*걱정스러운 표정으로*\n{biggest['name']} 주가가 많이 떨어졌대요... {biggest['event']}"
                    else:
                        comment = f"*신문을 펼치며*\n오늘 증시 소식이에요..."
                    await ch.send(content=comment, file=file)
                    comfort_list = ss.get_crashed_holders(results)
                    for c_info in comfort_list:
                        await ch.send(get_crash_comfort(c_info['agent'], c_info['stock_name']))
            except Exception as e:
                print(f"[주식] 시작 시 업데이트 실패: {e}")

    def _is_shop_closed(self):
        """토요일 18시 이후 ~ 일요일 전체 = 마감"""
        now = datetime.now(TIMEZONE)
        if now.weekday() == 6:
            return True, "일요일은 쉬는 날이에요... 내일 다시 와주세요...!"
        if now.weekday() == 5 and now.hour >= 18:
            return True, "토요일 18시에 마감했어요... 월요일에 다시 열어요...!"
        return False, ""

    def _is_market_closed(self):
        """토요일 18시 이후 ~ 일요일 전체 = 시장 마감"""
        now = datetime.now(TIMEZONE)
        if now.weekday() == 6:
            return True, "일요일은 시장이 쉬는 날이에요... 내일 다시 와주세요...!"
        if now.weekday() == 5 and now.hour >= 18:
            return True, "토요일 18시에 시장이 마감했어요... 월요일에 다시 열어요...!"
        return False, ""

    async def cog_check(self, ctx):
        if SHOP_CHANNEL_ID == 0: return True
        gm_commands = ["지급","차감","전체지급","작전지급","작전차감","구매내역","구매정리","소모품정리","전체잔고","잔고정리","주식이벤트","주식현황"]
        if ctx.command and ctx.command.name in gm_commands:
            return True
        if ctx.channel.id != SHOP_CHANNEL_ID:
            await ctx.reply("저, 저기... 편의점은 지정된 채널에서만 이용할 수 있어요...!"); return False
        return True

    @tasks.loop(hours=1)
    async def daily_tasks(self):
        now = datetime.now(TIMEZONE)
        # 월요일 06시: 재고 리셋 (새 주 시작).
        # 원본은 trade_log 'buy' DELETE 도 수행했으나, mongo 환경에서는 credit_transactions
        # 가 영구 보관(audit). 주간 집계는 draw_summary_image 가 _week_start_kst 기준 시점
        # 컷으로 처리하므로 별도 삭제 불필요.
        if now.hour == 6 and now.weekday() == 0:
            refresh_stock()
            print(f"[편의점] 월요일 — 재고 리셋 ({now.strftime('%Y-%m-%d')})")
        # 화~토 06시: 재고 리셋만 (일요일 제외)
        elif now.hour == 6 and now.weekday() not in [0, 6]:
            refresh_stock()
            print(f"[편의점] 재고 리셋 ({now.strftime('%Y-%m-%d')})")
        # 토요일 18시: 편의점 마감 + 그 주 구매 내역 정산
        if now.weekday() == 5 and now.hour == 18:
            ch = self.bot.get_channel(SHOP_CHANNEL_ID)
            if ch:
                await ch.send("*저, 저기... 오늘은 여기까지예요. 편의점 마감합니다...*")
                # 구매 내역 정리
                buf = draw_summary_image()
                if buf:
                    file = discord.File(buf, filename="weekly_summary.png")
                    await ch.send(
                        content="*이번 주 구매 내역을 정리해봤어요...*",
                        file=file)
                else:
                    await ch.send("*이번 주는 구매 내역이 없었어요...*")
                # 전체 잔고
                buf2 = draw_all_balances_image()
                file2 = discord.File(buf2, filename="balances.png")
                await ch.send(content="*현재 요원별 잔고예요...*", file=file2)
                print(f"[편의점] 토요일 마감 정리 완료 ({now.strftime('%Y-%m-%d')})")

    @daily_tasks.before_loop
    async def before_daily(self): await self.bot.wait_until_ready()

    @tasks.loop(hours=4)
    async def viral_task(self):
        """가끔씩 잡담방에 바이럴 한마디 — random 은 모듈 상단 import."""
        now = datetime.now(TIMEZONE)
        # 영업시간 아닐 때는 안 함 (새벽, 일요일, 토18시 이후)
        if now.weekday() == 6: return
        if now.weekday() == 5 and now.hour >= 18: return
        if now.hour < 9 or now.hour > 22: return
        # 40% 확률로 실행 (매번 하면 스팸)
        if random.random() > 0.40: return

        # 잡담방 채널로 보냄 (circular import: bot ↔ shop — lazy import).
        from bot import IDLE_CHAT_CHANNEL_ID
        if not IDLE_CHAT_CHANNEL_ID: return
        ch = self.bot.get_channel(IDLE_CHAT_CHANNEL_ID)
        if not ch: return

        ensure_stock()
        stocks = get_all_stock()
        # 재고 있는 아이템 중 랜덤 선택
        available = [(item, stocks.get(item["id"], 0)) for item in SHOP_ITEMS if stocks.get(item["id"], 0) > 0]
        if not available: return
        item, stk = random.choice(available)

        # 바이럴 멘트 목록
        viral_lines = [
            f"*진열대를 정리하다가 혼잣말을 한다.*\n오늘 {item['name']} 들어왔는데... 아무도 안 사가네...",
            f"*{item['name']}을(를) 바라보며*\n이거 {item['effect']}인데... 꽤 괜찮은 것 같은데...",
            f"*조용히 상품을 닦으며*\n{item['name']}... 재고가 {stk}개밖에 없는데... 아무도 모르나 봐...",
            f"*카운터에 턱을 괴며*\n...{item['name']} {item['price']} CR인데... 세션 전에 하나쯤 사두면 좋을 것 같은데...",
            f"*뭔가 곰곰이 생각하다가*\n혹시 {item['name']} 필요한 분 없으려나... {stk}개 남았는데...",
        ]
        # 희귀 아이템이면 특별 멘트
        if item["id"] == "force_core":
            viral_lines = [
                "*눈이 동그래지며*\n저, 저기... 오늘 포스코어가 들어왔어요...! 이거 진짜 잘 안 들어오는 건데...",
                "*떨리는 목소리로*\n포, 포스코어... 오늘 입고됐는데... 빨리 안 오시면 내일이면 없을 것 같아요...",
            ]
        elif item["id"] == "icecream":
            viral_lines = [
                "*냉동고를 열며*\n서울-만세 아이스크림이 딱 하나 있는데... *나도 먹고 싶다...*",
                "*아이스크림을 바라보며*\n이거... 진짜 맛있는 건데... 누가 사가기 전에...",
            ]
        elif item["id"] == "vf_blood":
            return  # VF혈액팩은 항상 매진이라 바이럴 안 함

        msg = random.choice(viral_lines)
        await ch.send(msg)

    @viral_task.before_loop
    async def before_viral(self): await self.bot.wait_until_ready()

    # ------ 편의점 (슬래시 커맨드, 본인만 보임) ------
    @app_commands.command(name="편의점", description="편의점 메뉴를 봅니다")
    async def slash_shop(self, interaction: discord.Interaction):
        if SHOP_CHANNEL_ID and interaction.channel_id != SHOP_CHANNEL_ID:
            await interaction.response.send_message("저, 저기... 편의점은 지정된 채널에서만 이용할 수 있어요...!", ephemeral=True); return
        closed, msg = self._is_shop_closed()
        if closed:
            await interaction.response.send_message(f"저, 저기... {msg}", ephemeral=True); return
        await interaction.response.defer(ephemeral=True)
        ensure_stock()
        # 띠아 이미지 먼저
        tia_img_path = os.path.join(IMG_DIR, "tia_shop.jpg")
        if os.path.exists(tia_img_path):
            await interaction.followup.send(content="*저, 저기... 어서오세요...*",
                file=discord.File(tia_img_path, filename="tia_shop.jpg"), ephemeral=True)
        # 페이지별 이미지
        bufs = draw_shop_images()
        for i, buf in enumerate(bufs):
            file = discord.File(buf, filename=f"shop_{i+1}.png")
            if i == len(bufs) - 1:
                # 마지막 페이지에 드롭다운 붙이기
                await interaction.followup.send(file=file, view=ShopView(), ephemeral=True)
            else:
                await interaction.followup.send(file=file, ephemeral=True)

    # ------ 편의점 (!상점 키워드) ------
    @commands.command(name="상점", aliases=["편의점","가게"])
    async def cmd_shop(self, ctx):
        if SHOP_CHANNEL_ID and ctx.channel.id != SHOP_CHANNEL_ID:
            await ctx.reply("저, 저기... 편의점은 지정된 채널에서만 이용할 수 있어요...!"); return
        closed, msg = self._is_shop_closed()
        if closed:
            await ctx.reply(f"저, 저기... {msg}"); return
        ensure_stock()
        # 띠아 이미지 먼저
        tia_img_path = os.path.join(IMG_DIR, "tia_shop.jpg")
        if os.path.exists(tia_img_path):
            await ctx.reply(content="*저, 저기... 어서오세요...*",
                file=discord.File(tia_img_path, filename="tia_shop.jpg"))
        # 페이지별 이미지
        bufs = draw_shop_images()
        for i, buf in enumerate(bufs):
            file = discord.File(buf, filename=f"shop_{i+1}.png")
            if i == len(bufs) - 1:
                await ctx.send(file=file, view=ShopView())
            else:
                await ctx.send(file=file)

    # ------ 잔고 (슬래시 커맨드, 본인만 보임) ------
    @app_commands.command(name="잔고", description="내 크레딧 잔고를 확인합니다")
    async def slash_balance(self, interaction: discord.Interaction):
        if SHOP_CHANNEL_ID and interaction.channel_id != SHOP_CHANNEL_ID:
            await interaction.response.send_message("편의점 채널에서만 확인할 수 있어요...!", ephemeral=True); return
        _, bal = _ensure_and_get_balance(interaction.user)
        await interaction.response.send_message(f"현재 잔고는 **{bal}** CR이에요...!", ephemeral=True)

    # ------ 작전 크레딧 (슬래시) ------
    @app_commands.command(name="작전크레딧", description="공용 크레딧 풀을 확인합니다")
    async def slash_op_credits(self, interaction: discord.Interaction):
        await interaction.response.send_message(f"작전 크레딧 풀: **{get_op_balance()}** CR", ephemeral=True)

    # ------ 재고 확인 (슬래시) ------
    @app_commands.command(name="재고", description="오늘 입고된 상품을 확인합니다")
    async def slash_stock(self, interaction: discord.Interaction):
        if SHOP_CHANNEL_ID and interaction.channel_id != SHOP_CHANNEL_ID:
            await interaction.response.send_message("편의점 채널에서만 확인할 수 있어요...!", ephemeral=True); return
        closed, msg = self._is_shop_closed()
        if closed:
            await interaction.response.send_message(f"저, 저기... {msg}", ephemeral=True); return
        await interaction.response.defer(ephemeral=True)
        ensure_stock()
        bufs = draw_shop_images()
        for buf in bufs:
            file = discord.File(buf, filename="stock.png")
            await interaction.followup.send(file=file, ephemeral=True)

    # ------ 환불 불가 (슬래시) ------
    @app_commands.command(name="환불", description="환불을 요청합니다")
    async def slash_refund(self, interaction: discord.Interaction):
        await interaction.response.send_message("죄송하지만 환불은 안 돼요... 구매 전에 신중하게 골라주세요...!", ephemeral=True)

    # ------ 주식: 시세 확인 + 거래 ------
    @app_commands.command(name="시세", description="주식 시세를 확인하고 거래합니다")
    async def slash_stock_price(self, interaction: discord.Interaction):
        if interaction.channel_id != STOCK_CHANNEL_ID:
            await interaction.response.send_message("저, 저기... 주식은 주식 채널에서만 할 수 있어요...!", ephemeral=True); return
        closed, msg = self._is_market_closed()
        if closed:
            await interaction.response.send_message(f"저, 저기... {msg}", ephemeral=True); return
        await interaction.response.defer(ephemeral=True)
        buf = ss.draw_stock_board()
        _, bal = _ensure_and_get_balance(interaction.user)
        tia_img = os.path.join(IMG_DIR, "tia_stock.png")
        if os.path.exists(tia_img):
            await interaction.followup.send(file=discord.File(tia_img, filename="tia_stock.png"), ephemeral=True)
        file = discord.File(buf, filename="stock_board.png")
        await interaction.followup.send(content=f"잔고: **{bal}** CR",
            file=file, view=StockTradeView(interaction.user.id, interaction.user.display_name), ephemeral=True)

    # ------ 주식: 매수 ------
    @app_commands.command(name="매수", description="주식을 매수합니다")
    @app_commands.describe(종목="종목 선택", 수량="매수할 주식 수 (1~50)")
    @app_commands.choices(종목=[
        app_commands.Choice(name=f"{s['name']} ({s['ticker']})", value=s["ticker"]) for s in ss.STOCKS
    ])
    async def slash_stock_buy(self, interaction: discord.Interaction, 종목: str, 수량: int):
        if interaction.channel_id != STOCK_CHANNEL_ID:
            await interaction.response.send_message("저, 저기... 주식은 주식 채널에서만 할 수 있어요...!", ephemeral=True); return
        closed, msg = self._is_market_closed()
        if closed:
            await interaction.response.send_message(f"저, 저기... {msg}", ephemeral=True); return
        if 수량 <= 0 or 수량 > 50:
            await interaction.response.send_message("1~50주 범위에서 매수할 수 있어요...!", ephemeral=True); return
        ticker = 종목.upper(); s = ss.STOCK_MAP.get(ticker)
        if not s: await interaction.response.send_message("없는 종목이에요...!", ephemeral=True); return
        price_doc = mongo_stock.get_stock_price(ticker)
        price = ss.round_stock_value(price_doc["price"]) if price_doc else 0
        total = ss.round_stock_value(price * 수량)
        _, bal = _ensure_and_get_balance(interaction.user)
        embed = discord.Embed(title=f"매수 확인 — {s['name']}", color=discord.Color.from_rgb(60,180,80))
        embed.add_field(name="현재가", value=f"{ss.format_stock_value(price)} CR", inline=True)
        embed.add_field(name="수량", value=f"{수량}주", inline=True)
        embed.add_field(name="합계", value=f"{ss.format_stock_value(total)} CR", inline=True)
        embed.add_field(name="잔고", value=f"{ss.format_stock_value(bal)} CR → {ss.format_stock_value(bal - total)} CR", inline=True)
        if bal < total:
            embed.set_footer(text="크레딧이 부족해요...")
            await interaction.response.send_message(embed=embed, ephemeral=True); return
        await interaction.response.send_message(embed=embed,
            view=StockConfirmView("buy", ticker, interaction.user.id, interaction.user.display_name, 수량, price), ephemeral=True)

    # ------ 주식: 매도 ------
    @app_commands.command(name="매도", description="주식을 매도합니다")
    @app_commands.describe(종목="종목 선택", 수량="매도할 주식 수")
    @app_commands.choices(종목=[
        app_commands.Choice(name=f"{s['name']} ({s['ticker']})", value=s["ticker"]) for s in ss.STOCKS
    ])
    async def slash_stock_sell(self, interaction: discord.Interaction, 종목: str, 수량: int):
        if interaction.channel_id != STOCK_CHANNEL_ID:
            await interaction.response.send_message("저, 저기... 주식은 주식 채널에서만 할 수 있어요...!", ephemeral=True); return
        closed, msg = self._is_market_closed()
        if closed:
            await interaction.response.send_message(f"저, 저기... {msg}", ephemeral=True); return
        if 수량 <= 0: await interaction.response.send_message("1주 이상 매도해야 해요...!", ephemeral=True); return
        ticker = 종목.upper(); s = ss.STOCK_MAP.get(ticker)
        if not s: await interaction.response.send_message("없는 종목이에요...!", ephemeral=True); return
        price_doc = mongo_stock.get_stock_price(ticker)
        price = ss.round_stock_value(price_doc["price"]) if price_doc else 0
        user_id_hex = _ensure_user_id(interaction.user)
        holdings = mongo_stock.get_holdings(user_id_hex)
        held, avg = 0, 0
        for h in holdings:
            if h["ticker"] == ticker:
                held = int(h.get("shares", 0))
                avg = ss.round_stock_value(h.get("avgPrice", 0))
                break
        embed = discord.Embed(title=f"매도 확인 — {s['name']}", color=discord.Color.from_rgb(200,60,60))
        embed.add_field(name="현재가", value=f"{ss.format_stock_value(price)} CR", inline=True)
        embed.add_field(name="보유", value=f"{held}주 (평단 {ss.format_stock_value(avg)})", inline=True)
        embed.add_field(name="매도 수량", value=f"{수량}주", inline=True)
        if held < 수량:
            embed.set_footer(text="보유 주식이 부족해요...")
            await interaction.response.send_message(embed=embed, ephemeral=True); return
        await interaction.response.send_message(embed=embed,
            view=StockConfirmView("sell", ticker, interaction.user.id, interaction.user.display_name, 수량, price), ephemeral=True)

    # ------ 주식: 포트폴리오 ------
    @app_commands.command(name="포트폴리오", description="내 주식 보유 현황을 확인합니다")
    async def slash_portfolio(self, interaction: discord.Interaction):
        if interaction.channel_id != STOCK_CHANNEL_ID:
            await interaction.response.send_message("저, 저기... 주식은 주식 채널에서만 할 수 있어요...!", ephemeral=True); return
        await interaction.response.defer(ephemeral=True)
        buf = ss.draw_portfolio_image(interaction.user.id, interaction.user.display_name)
        file = discord.File(buf, filename="portfolio.png")
        await interaction.followup.send(file=file, ephemeral=True)

    # ------ GM: 크레딧 지급 ------
    @commands.command(name="지급")
    async def give_credits(self, ctx, member: discord.Member = None, amount: int = 0):
        if not _is_gm(ctx.author):
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if not member or amount <= 0: await ctx.reply("`!지급 @유저 금액`"); return
        new_bal = _apply_credit(
            user=member,
            amount=amount,
            type_="ADMIN_GRANT",
            description=f"GM 지급 (by {ctx.author.display_name})",
            actor=ctx.author,
        )
        await ctx.reply(f"{member.display_name} 님에게 **{amount}** CR 지급. 잔고: **{new_bal}** CR")

    # ------ GM: 크레딧 차감 ------
    @commands.command(name="차감")
    async def take_credits(self, ctx, member: discord.Member = None, amount: int = 0):
        if not _is_gm(ctx.author):
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if not member or amount <= 0: await ctx.reply("`!차감 @유저 금액`"); return
        _, bal = _ensure_and_get_balance(member)
        if bal < amount: await ctx.reply(f"{member.display_name} 님 잔고가 {bal} CR밖에 없어요..."); return
        # ADMIN_DEDUCT 는 음수 잔액 가드 우회 가능 type_. 위에서 사전 확인 했으므로 정상 흐름.
        new_bal = _apply_credit(
            user=member,
            amount=-amount,
            type_="ADMIN_DEDUCT",
            description=f"GM 차감 (by {ctx.author.display_name})",
            actor=ctx.author,
        )
        await ctx.reply(f"{member.display_name} 님에게서 **{amount}** CR 차감. 잔고: **{new_bal}** CR")

    # ------ GM: 전체 지급 (일괄) ------
    @commands.command(name="전체지급")
    async def give_all_credits(self, ctx, amount: int = 0):
        if not _is_gm(ctx.author):
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if amount <= 0: await ctx.reply("`!전체지급 금액`"); return
        # 서버 멤버 중 INITIAL_CREDITS 에 있는 사람 자동 등록 (시드 트랜잭션 발생)
        if ctx.guild:
            for member in ctx.guild.members:
                if member.display_name in INITIAL_CREDITS:
                    _ensure_and_get_balance(member)
        # 등록된 전원에게 지급. mongo.credits.list_balances_with_names 가 source.
        balance_rows = mongo_credits.list_balances_with_names()
        if not balance_rows:
            await ctx.reply("등록된 요원이 없어요..."); return
        # ctx.guild.get_member 로 discord.Member 다시 매핑 (avatar/global_name 갱신 + actor 추적).
        guild_members_by_id: dict[str, discord.Member] = {}
        if ctx.guild:
            for m in ctx.guild.members:
                guild_members_by_id[str(m.id)] = m
        results: list[str] = []
        for row in balance_rows:
            user_id_hex = row.get("userId")
            user_name = row.get("userName") or ""
            # discord.Member 가 있으면 그대로 사용 (캐시/avatar 갱신).
            # 없으면 fallback: mongo_users.get_user_by_id_hex 로 discord_id 복원 후 user.name 으로 add_credit.
            user_doc = mongo_users.get_user_by_id_hex(user_id_hex) if user_id_hex else None
            discord_id = user_doc.get("discordId") if user_doc else None
            member_obj = guild_members_by_id.get(discord_id) if discord_id else None
            if member_obj is not None:
                new_bal = _apply_credit(
                    user=member_obj,
                    amount=amount,
                    type_="ADMIN_GRANT",
                    description=f"전체 지급 {amount}CR (by {ctx.author.display_name})",
                    actor=ctx.author,
                )
            else:
                # discord.Member 캐시에 없는 경우 — user_id_hex 직접 사용.
                actor_id_hex = _ensure_user_id(ctx.author)
                tx = mongo_credits.add_credit(
                    user_id_hex=user_id_hex,
                    user_name=user_name,
                    amount=amount,
                    type_="ADMIN_GRANT",
                    description=f"전체 지급 {amount}CR (by {ctx.author.display_name})",
                    created_by_id=actor_id_hex,
                    created_by_name=ctx.author.display_name,
                )
                new_bal = int(tx["balance"])
            agent = ss.AGENT_NAMES.get(user_name, user_name)
            results.append(f"{agent}: {new_bal} CR")
        await ctx.reply(f"등록된 **{len(results)}명** 전원에게 **{amount}** CR 지급 완료!\n" + "\n".join(results))

    # ------ GM: 작전 지급 ------
    @commands.command(name="작전지급")
    async def give_op(self, ctx, amount: int = 0):
        if not _is_gm(ctx.author):
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if amount <= 0: await ctx.reply("`!작전지급 금액`"); return
        mongo_credits.ensure_op_pool()
        # OP_GRANT/OP_DEDUCT 는 user 잔액 변경이 아니라 풀 자체 변동 → user ledger 기록 안 함.
        # credit_pools 가 audit source. (Phase 1B 결정 — 본 PLAN 의 OP_GRANT 처리 방침과 일치.)
        pool = mongo_credits.add_op_credit(OPERATION_POOL_ID, amount, allow_negative=False)
        new_bal = int(pool["balance"])
        await ctx.reply(f"작전 풀에 **{amount}** CR 추가. 현재: **{new_bal}** CR")

    # ------ GM: 작전 차감 ------
    @commands.command(name="작전차감")
    async def take_op(self, ctx, amount: int = 0):
        if not _is_gm(ctx.author):
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if amount <= 0: await ctx.reply("`!작전차감 금액`"); return
        mongo_credits.ensure_op_pool()
        bal = mongo_credits.get_op_balance(OPERATION_POOL_ID)
        if bal < amount: await ctx.reply(f"작전 풀에 {bal} CR밖에 없어요..."); return
        try:
            pool = mongo_credits.add_op_credit(OPERATION_POOL_ID, -amount, allow_negative=False)
        except ValueError:
            await ctx.reply(f"작전 풀 차감 실패. 잔액 race 발생 가능."); return
        new_bal = int(pool["balance"])
        await ctx.reply(f"작전 풀에서 **{amount}** CR 차감. 현재: **{new_bal}** CR")

    # ------ GM: 구매내역 (이미지) ------
    @commands.command(name="구매내역", aliases=["구매정리","소모품정리"])
    async def purchase_summary(self, ctx):
        if not _is_gm(ctx.author):
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        buf = draw_summary_image()
        if not buf: await ctx.reply("아직 구매 내역이 없어요..."); return
        file = discord.File(buf, filename="summary.png")
        await ctx.reply(file=file)

    # ------ GM: 전체 잔고 (이미지) ------
    @commands.command(name="전체잔고", aliases=["잔고정리"])
    async def all_balances(self, ctx):
        if not _is_gm(ctx.author):
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        buf = draw_all_balances_image()
        file = discord.File(buf, filename="balances.png")
        await ctx.reply(file=file)

    # ------ GM: 주식 이벤트 수동 조절 ------
    @commands.command(name="주식이벤트")
    async def gm_stock_event(self, ctx, ticker: str = "", change: int = 0, *, event_text: str = ""):
        if not _is_gm(ctx.author):
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if not ticker or not event_text:
            await ctx.reply("`!주식이벤트 [종목코드] [등락률] [이벤트 내용]`\n"
                           "예: `!주식이벤트 BPE -20 블랙피라미드 긴급 정전`\n"
                           "종목: " + " / ".join(s["ticker"] for s in ss.STOCKS)); return
        try:
            await ctx.message.delete()
        except (discord.Forbidden, discord.NotFound):
            # 권한 없음 또는 이미 삭제됨 — 무시.
            pass
        result = ss.apply_gm_event(ticker.upper(), change, event_text)
        if not result: return
        ch = self.bot.get_channel(STOCK_CHANNEL_ID)
        if ch:
            try:
                # circular import: bot ↔ shop — lazy import.
                from bot import tia_speak
                tia_comment = await tia_speak(
                    f"긴급 뉴스를 봤다. {result['name']}에 대한 소식: '{event_text}'. "
                    f"주가가 {result['old']}에서 {result['new']}으로 {'올랐다' if change>0 else '떨어졌다'}. "
                    f"편의점 카운터에서 뉴스를 보고 놀라며 요원들에게 알려주는 상황. 띠아답게 서술+대사.")
                if not tia_comment: raise Exception("빈 응답")
            except Exception as e:
                print(f"[주식] GM 이벤트 각색 실패: {e}")
                diff_text = "올랐" if change > 0 else "떨어졌"
                tia_comment = (f"*카운터에서 긴급 뉴스를 본다.*\n"
                              f"저, 저기... {result['name']}이 {abs(change)}%나 {diff_text}대요...")
            buf = ss.draw_stock_board()
            file = discord.File(buf, filename="stock_event.png")
            await ch.send(content=tia_comment, file=file)
            if change <= -15:
                comfort_list = ss.get_crashed_holders([result])
                for c_info in comfort_list:
                    await ch.send(get_crash_comfort(c_info['agent'], c_info['stock_name']))

    # ------ GM: 주식 현황 확인 ------
    @commands.command(name="주식현황")
    async def gm_stock_overview(self, ctx):
        if not _is_gm(ctx.author):
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        buf = ss.draw_stock_board()
        file = discord.File(buf, filename="stock_overview.png")
        await ctx.reply(file=file)
        text = ss.get_all_holdings_text()
        await ctx.send(text)

    # ------ 주식 일일 태스크 (13시, 17시, 20시) ------
    @tasks.loop(hours=1)
    async def stock_daily_task(self):
        now = datetime.now(TIMEZONE)
        if now.hour not in ss.STOCK_HOURS or now.weekday() == 6: return
        if not ss.needs_stock_update(): return  # 이미 이 시간대에 업데이트 했으면 스킵
        try:
            # circular import: bot ↔ shop — lazy import.
            from bot import COPILOT_API_KEY, MODEL
            results = await ss.update_stock_prices(COPILOT_API_KEY, MODEL)
            ch = self.bot.get_channel(STOCK_CHANNEL_ID)
            if ch and results:
                buf = ss.draw_stock_board()
                file = discord.File(buf, filename="stock_daily.png")
                biggest = max(results, key=lambda x: abs(x["change"]))
                if biggest["change"] > 10:
                    comment = f"*눈이 동그래지며*\n저, 저기... {biggest['name']} 주가가 많이 올랐대요... {biggest['event']}"
                elif biggest["change"] < -10:
                    comment = f"*걱정스러운 표정으로*\n{biggest['name']} 주가가 많이 떨어졌대요... {biggest['event']}"
                else:
                    comment = f"*신문을 펼치며*\n오늘 증시 소식이에요..."
                await ch.send(content=comment, file=file)
                comfort_list = ss.get_crashed_holders(results)
                for c_info in comfort_list:
                    await ch.send(get_crash_comfort(c_info['agent'], c_info['stock_name']))
            print(f"[주식] 시세 업데이트 완료 ({now.strftime('%Y-%m-%d')})")
        except Exception as e:
            print(f"[주식] 시세 업데이트 실패: {e}")

    @stock_daily_task.before_loop
    async def before_stock(self): await self.bot.wait_until_ready()

async def setup(bot):
    await bot.add_cog(ShopCog(bot))
