"""주식 시스템 모듈 — stock_system.py

bot.py / shop.py 가 import. 본 모듈은 mongo 어댑터 wrapper + AI 이벤트 + PIL 렌더만 담당.

Phase 1C-2 (2026-05): SQLite 호출 전면 제거.
  - 시세/보유: mongo.stock
  - 잔액 조회: mongo.credits (포트폴리오 표시용)
  - Discord ↔ User._id: mongo.users
  - 거래량 집계: credit_transactions aggregate (STOCK_BUY/STOCK_SELL)
PIL 렌더 코드는 그대로 유지. 호출자 시그니처는 보존 (shop.py 호환).
"""

# 1. 코어 라이브러리, 기타 라이브러리
import asyncio
import io
import os
import random
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

# 3. 자체 어댑터
from mongo import credits as mongo_credits
from mongo import stock as mongo_stock
from mongo import users as mongo_users
from mongo.client import get_db

# ============================================================
# 상수
# ============================================================
TIMEZONE = ZoneInfo("Asia/Seoul")
IMG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")

# 색상 팔레트
BG       = (10, 10, 8)
GOLD     = (197, 162, 85)
GOLD_DIM = (138, 113, 48)
RED      = (155, 32, 32)
GREEN    = (42, 139, 76)
TEXT     = (192, 184, 168)
TEXT_DIM = (104, 100, 96)
WHITE    = (220, 215, 205)
BORDER   = (50, 42, 25)
MIN_STOCK_PRICE = 0.01


def round_stock_value(value) -> float:
    rounded = round(float(value) + 1e-9, 2)
    return int(rounded) if rounded.is_integer() else rounded


def normalize_stock_price(value) -> float:
    return max(MIN_STOCK_PRICE, round_stock_value(value))


def format_stock_value(value) -> str:
    rounded = round_stock_value(value)
    return f"{rounded:,.2f}".rstrip("0").rstrip(".")

# ============================================================
# 폰트
# ============================================================
def load_font(size):
    paths = ["C:/Windows/Fonts/malgunbd.ttf","C:/Windows/Fonts/malgun.ttf",
             "C:/Windows/Fonts/gulim.ttc","C:/Windows/Fonts/NanumGothicBold.ttf",
             "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except (OSError, IOError):
                continue
    return ImageFont.load_default()

FONT_TITLE = load_font(20)
FONT_HEADER = load_font(16)
FONT_BODY = load_font(13)
FONT_SMALL = load_font(11)
FONT_TINY = load_font(9)

# ============================================================
# 종목 정의 (코드 상수 — DB 마이그 대상 아님)
# ============================================================
STOCKS = [
    {"ticker": "TWS", "name": "토와스키", "base_price": 10,
     "desc": "연식 있는 브랜드 총기 제조사. 군·경찰·민간 시장에 걸쳐 폭넓은 유통망 보유."},
    {"ticker": "STM", "name": "스타마트", "base_price": 10,
     "desc": "미국 상권 지분 30%를 차지하는 대형 마트 브랜드. 생활용품부터 초인 장비까지 취급."},
    {"ticker": "SSR", "name": "송사리", "base_price": 30,
     "desc": "한국계 글로벌 선박 회사. 물류·해운 사업을 기반으로 꾸준한 성장세."},
    {"ticker": "MSF", "name": "만세식품", "base_price": 50,
     "desc": "한국계 제과 기업. 서울-만세 아이스크림으로 유명하며 현재 고급화 전략 추진 중."},
    {"ticker": "VFP", "name": "VF제약", "base_price": 80,
     "desc": "일본계 생명공학·의약품 회사. 과학자 혈청 등 특수 의약품의 주요 공급처."},
    {"ticker": "BPE", "name": "블랙피라미드 에너지", "base_price": 100,
     "desc": "블랙피라미드에서 생산되는 전력을 전 세계에 공급하는 에너지 기업."},
    {"ticker": "ART", "name": "오로라텍", "base_price": 120,
     "desc": "오로라 판데믹 이후 창설된 중국계 기업. 오로라 바이러스 백신 및 광원화 활용 연구."},
    {"ticker": "GN3", "name": "지니어스 33", "base_price": 350,
     "desc": "글로벌 자산 운용사. 사모펀드·투자 등 금융 전반에 걸친 사업 포트폴리오 보유."},
    {"ticker": "SPZ", "name": "스페이스 제로", "base_price": 1000,
     "desc": "우주항공·무기·AI 산업 글로벌 선두주자. 전기차 산업까지 이끄는 초대형 기업."},
]
STOCK_MAP = {s["ticker"]: s for s in STOCKS}

STOCK_HOURS = [13, 17, 20]  # 하루 3번 이벤트

AGENT_NAMES = {
    "춤추기사랑하기노래부르기": "빅보이", "라면": "클라운", "모스": "인덱서",
    "세슘": "메리골드", "대형마법": "우디", "Bush Dog": "네베드",
    "힘이": "시유", "Arkaiyu": "마리아", "치자도우": "이동식",
    "버터누나": "발트만", "홀로서기": "운연", "순대/soondae": "크로노스",
    "휴지": "핀치",
    "카즈키": "킴라박", "카쫀쿠": "킴라박", "카사웨이": "킴라박",
    "실명": "유회",
    "핏보이": "GM", "pitboy": "GM", "흑우": "GM",
}

# ============================================================
# KST 헬퍼
# ============================================================
def get_today_str():
    return datetime.now(TIMEZONE).strftime("%Y-%m-%d")


def _now_kst_tag(hour: int | None = None) -> str:
    """update_stock_prices 의 lastUpdate 태그.

    포맷: "YYYY-MM-DD HH" (시간대별 멱등 키 — 동일 시간대 중복 갱신 방지).
    """
    now = datetime.now(TIMEZONE)
    h = now.hour if hour is None else hour
    return f"{get_today_str()} {h:02d}"


# ============================================================
# 이미지 헬퍼
# ============================================================
def draw_header(draw, w, title, subtitle=""):
    draw.line([(0,0),(w,0)], fill=GOLD, width=2)
    draw.text((20,12), "NOVUS ORDO", fill=GOLD_DIM, font=FONT_TINY)
    draw.text((20,28), title, fill=GOLD, font=FONT_TITLE)
    if subtitle: draw.text((20,54), subtitle, fill=TEXT_DIM, font=FONT_SMALL)
    y = 72 if subtitle else 56
    draw.line([(15,y),(w-15,y)], fill=BORDER, width=1)
    return y + 10

def draw_footer(draw, w, h, text):
    draw.line([(15,h-30),(w-15,h-30)], fill=BORDER, width=1)
    draw.text((20,h-24), text, fill=TEXT_DIM, font=FONT_TINY)
    draw.text((w-120,h-24), "NOVUS ORDO", fill=GOLD_DIM, font=FONT_TINY)

def img_to_buffer(img):
    buf = io.BytesIO(); img.save(buf, format="PNG"); buf.seek(0); return buf


# ============================================================
# 시세 — mongo.stock 위임 (호출자 호환 dict 변환)
# ============================================================
def _normalize_price_doc(doc: dict) -> dict:
    """mongo stock_prices 문서를 SQLite 호환 키로 정규화.

    mongo: {ticker, price, prevPrice, eventText, lastUpdate}
    호환:  {ticker, price, prev_price, event_text, last_update}

    P2-5: prevPrice 가 0 이거나 누락이면 price 로 fallback (시드 직후 0 등락 표기 방지).
    """
    price = round_stock_value(doc.get("price", 0))
    return {
        "ticker": doc.get("ticker"),
        "price": price,
        "prev_price": round_stock_value(doc.get("prevPrice") or price),
        "event_text": doc.get("eventText", ""),
        "last_update": doc.get("lastUpdate", ""),
    }


def get_stock_prices() -> dict:
    """{ticker: {price, prev_price, event_text, last_update}} 형식 (SQLite 호환)."""
    docs = mongo_stock.get_stock_prices()
    return {d["ticker"]: _normalize_price_doc(d) for d in docs}


def get_stock_price(ticker: str) -> float:
    """현재가. 미존재 시 0."""
    doc = mongo_stock.get_stock_price(ticker)
    return round_stock_value(doc["price"]) if doc else 0


# ============================================================
# 보유 — mongo.stock 위임 (호출자 호환 dict 변환)
# ============================================================
def _normalize_holding_doc(doc: dict) -> dict:
    """mongo stock_holdings → SQLite 호환 키.

    mongo: {userId, ticker, shares, avgPrice}
    호환:  {user_id, ticker, shares, avg_price}
    """
    return {
        "user_id": doc.get("userId"),
        "ticker": doc.get("ticker"),
        "shares": int(doc.get("shares", 0)),
        "avg_price": round_stock_value(doc.get("avgPrice", 0)),
    }


def get_holdings(user_id_hex: str) -> list[dict]:
    """user_id_hex 의 활성 보유 (shares>0). SQLite 호환 키.

    Note: 인자명은 user_id_hex. (이전 SQLite 시맨틱은 Discord int. shop.py 호출처는
    이미 user_id_hex 로 통일된 상태에서 mongo_stock.get_holdings 직접 호출 중이라
    본 wrapper 의 호출은 stock_system 내부 함수 (get_all_holdings_text 등) 에서만 발생.)
    """
    docs = mongo_stock.get_holdings(user_id_hex)
    return [_normalize_holding_doc(d) for d in docs]


# ============================================================
# 거래량 집계 (credit_transactions aggregate)
# ============================================================
def _get_recent_trade_volume(hours: int = 24) -> dict[str, dict]:
    """최근 N시간 STOCK_BUY/STOCK_SELL 트랜잭션을 ticker별 집계.

    metadata.ticker 기준 group. abs(amount) 합산 + buy/sell count 분리.

    Returns: { ticker: { 'buy_count': int, 'sell_count': int, 'total_volume': int } }
    """
    db = get_db()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    pipeline = [
        {"$match": {
            "type": {"$in": ["STOCK_BUY", "STOCK_SELL"]},
            "createdAt": {"$gte": cutoff},
            "metadata.ticker": {"$type": "string"},
        }},
        {"$group": {
            "_id": {"ticker": "$metadata.ticker", "type": "$type"},
            "count": {"$sum": 1},
            "volume": {"$sum": {"$abs": "$amount"}},
        }},
    ]
    out: dict[str, dict] = {}
    for row in db["credit_transactions"].aggregate(pipeline):
        ticker = row["_id"]["ticker"]
        type_ = row["_id"]["type"]
        bucket = out.setdefault(ticker, {"buy_count": 0, "sell_count": 0, "total_volume": 0})
        if type_ == "STOCK_BUY":
            bucket["buy_count"] += int(row["count"])
        elif type_ == "STOCK_SELL":
            bucket["sell_count"] += int(row["count"])
        bucket["total_volume"] += round_stock_value(row["volume"])
    return out


def _get_total_held_shares() -> dict[str, int]:
    """ticker 별 활성 보유 합계 (shares > 0). AI 이벤트 prompt 입력용."""
    db = get_db()
    pipeline = [
        {"$match": {"shares": {"$gt": 0}}},
        {"$group": {"_id": "$ticker", "total": {"$sum": "$shares"}}},
    ]
    return {row["_id"]: int(row["total"]) for row in db["stock_holdings"].aggregate(pipeline)}


# ============================================================
# AI 이벤트 생성
# ============================================================
async def generate_stock_events(copilot_api_key, model):
    prices = get_stock_prices()
    volume = _get_recent_trade_volume(hours=24)
    held_total = _get_total_held_shares()

    volume_info = []
    for s in STOCKS:
        t = s["ticker"]
        p = prices.get(t, {})
        price = p.get("price", s["base_price"])
        v = volume.get(t, {"buy_count": 0, "sell_count": 0, "total_volume": 0})
        buy_cnt = v["buy_count"]
        sell_cnt = v["sell_count"]
        held = held_total.get(t, 0)
        if buy_cnt > 3:
            pop = "매우 인기 (많이 매수됨 → 하락 유도)"
        elif buy_cnt > 1:
            pop = "보통 인기 (소폭 하락 유도)"
        elif sell_cnt > buy_cnt:
            pop = "매도 우세 (소폭 상승 가능)"
        elif held == 0 and buy_cnt == 0:
            pop = "관심 없음 (소폭 상승 가능)"
        else:
            pop = "보통"
        volume_info.append(
            f"- {s['name']}({t}): 현재 {price}CR, 기준가 {s['base_price']}CR, "
            f"보유 {held}주, 매수{buy_cnt}건/매도{sell_cnt}건 [{pop}]"
        )

    price_info = "\n".join(volume_info)
    prompt = f"""너는 노부스 오르도 세계관의 금융 뉴스 기자다.
아래 9개 종목에 대해 오늘의 이벤트를 하나씩 만들고 등락률을 정해줘.

종목 (거래 동향 포함):
{price_info}

세계관 키워드: 블랙피라미드, 줄루, 오로라 바이러스, 오로라 판데믹, 초인, 실험체, VF혈액팩, 과학자 혈청, 레지스트라, 송사리 선박, 토와스키 총기, 스타마트, 스페이스 제로, 지니어스 33 자산운용, 만세식품 고급화, 오로라텍 광원화, 전기차

규칙:
- 각 종목마다 1줄 이벤트 + 등락률(정수)
- 세계관 내부 사건만. 현실 세계 언급 금지.
- 실제 주식시장처럼 자연스럽게 오르락내리락하게 만들어라.
- 등락 범위: -15 ~ +15. 대부분은 -5 ~ +5 사이의 소폭 변동.
- 9개 종목 중 3~4개 상승, 3~4개 하락, 1~2개 횡보(-1~+1). 균형 맞출 것.
- 가끔(10% 확률로) 한 종목이 -10~-15 급락하거나 +8~+15 급등하는 이벤트 발생.
- 거래량 참고: 많이 매수된 종목은 소폭 하락 경향(-2~-8), 안 팔린 종목은 소폭 상승 경향(+2~+8). 하지만 절대적이지 않음.
- TWS(토와스키)와 STM(스타마트)는 변동폭이 큰 종목이다:
  → 아무도 안 샀을 때: +10~+25 상승 이벤트로 유혹. 가끔 +30까지.
  → 많이 샀을 때: -8~-15 하락 경향. 가끔 -20까지. 하지만 매번 폭락은 아님.
  → 일반적인 날에는 다른 종목처럼 -5~+5 소폭 변동도 가능.
- SPZ(스페이스 제로)는 대형주라 변동폭이 작다 (-5~+5).
- 이벤트는 짧고 뉴스 헤드라인처럼.

출력 형식 (정확히 이 형식으로만, 다른 텍스트 없이):
BPE|+4|블랙피라미드 에너지 3분기 생산량 증가
VFP|-3|VF제약 혈액팩 원료 가격 소폭 상승
MSF|+2|만세식품 신메뉴 반응 양호
ART|-7|오로라텍 연구 시설 점검으로 일시 중단
SSR|+5|송사리 동남아 해운 노선 확장
TWS|0|토와스키 시장 관망세
STM|+3|스타마트 신규 지점 오픈
SPZ|-1|스페이스 제로 정기 점검
GN3|-4|지니어스 33 분기 수익 소폭 하락"""

    try:
        from openai import OpenAI
        cl = OpenAI(base_url="https://ollama.com/v1", api_key=copilot_api_key)
        r = await asyncio.to_thread(cl.chat.completions.create,
            model=model, messages=[{"role":"user","content":prompt}], max_tokens=800, temperature=1.0)
        text = r.choices[0].message.content.strip()
        events = {}
        for line in text.split("\n"):
            line = line.strip()
            if "|" not in line: continue
            parts = line.split("|", 2)
            if len(parts) != 3: continue
            ticker = parts[0].strip().upper()
            try:
                change = int(parts[1].strip().replace("+","").replace("%",""))
            except ValueError:
                # AI 응답 파싱 실패 — 해당 라인 skip.
                continue
            event = parts[2].strip()
            if ticker in STOCK_MAP:
                if ticker in ["TWS", "STM"]:
                    events[ticker] = {"change": max(-20, min(30, change)), "event": event}
                else:
                    events[ticker] = {"change": max(-15, min(15, change)), "event": event}
        return events
    except Exception as e:
        print(f"[주식] AI 이벤트 생성 실패: {e}")
        events = {}
        for s in STOCKS:
            change = random.randint(-8, 8)
            events[s["ticker"]] = {"change": change, "event": "시장 변동"}
        return events


# ============================================================
# 시세 갱신
# ============================================================
async def update_stock_prices(copilot_api_key, model):
    """전 종목 시세 갱신 (AI 이벤트 기반).

    Returns: [{ticker, name, old, new, change, event}, ...]
    """
    events = await generate_stock_events(copilot_api_key, model)
    update_tag = _now_kst_tag()
    prices = get_stock_prices()

    results = []
    for s in STOCKS:
        ticker = s["ticker"]
        ev = events.get(ticker, {"change": 0, "event": "변동 없음"})
        old_price = round_stock_value(prices.get(ticker, {}).get("price", s["base_price"]))
        new_price = normalize_stock_price(old_price * (1 + ev["change"] / 100.0))
        try:
            mongo_stock.update_stock_price(ticker, new_price, ev["event"], update_tag)
        except ValueError:
            # ticker 미존재 → 부트스트랩 누락 케이스. 시드 후 재시도.
            mongo_stock.ensure_stock_prices(
                [(ticker, s["base_price"])], update_tag, "상장",
            )
            mongo_stock.update_stock_price(ticker, new_price, ev["event"], update_tag)
        results.append({
            "ticker": ticker, "name": s["name"],
            "old": old_price, "new": new_price,
            "change": ev["change"], "event": ev["event"],
        })
    return results


def needs_stock_update() -> bool:
    """현재 시간대 (STOCK_HOURS) 의 갱신이 아직 안 됐으면 True.

    P2-4: 어느 한 ticker라도 현재 시간대 갱신 안 됐으면 True (부분 갱신 보정).
    원본 SQLite LIMIT 1 시맨틱은 race / 부분 실패 시 잘못된 skip 가능 → any() 로 강화.
    """
    now = datetime.now(TIMEZONE)
    if now.hour not in STOCK_HOURS:
        return False
    docs = mongo_stock.get_stock_prices()
    if not docs:
        return True  # 시드 안 된 상태. 갱신(=시드 후 갱신) 필요.
    current_tag = _now_kst_tag(now.hour)
    return any(d.get("lastUpdate") != current_tag for d in docs)


# ============================================================
# 이미지 — 시세표
# ============================================================
def draw_stock_board():
    prices = get_stock_prices()
    w, h = 500, 82 + len(STOCKS)*60 + 50
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    start_y = draw_header(draw, w, "STOCK MARKET", "NOVUS ORDO EXCHANGE")

    for i, s in enumerate(STOCKS):
        y = start_y + i*60
        p = prices.get(s["ticker"], {})
        price = p.get("price", s["base_price"])
        prev = p.get("prev_price", s["base_price"])
        event = p.get("event_text", "")
        diff = price - prev
        pct = ((price - prev) / prev * 100) if prev > 0 else 0

        if i % 2 == 0:
            draw.rectangle([20, y, w-20, y+58], fill=(14,14,11))

        draw.text((30, y+4), s["ticker"], fill=GOLD, font=FONT_HEADER)
        draw.text((80, y+6), s["name"], fill=TEXT, font=FONT_BODY)
        draw.text((w-100, y+4), f"{format_stock_value(price)} CR", fill=WHITE, font=FONT_HEADER)

        if diff > 0:
            color = (60, 180, 80); arrow = f"+{format_stock_value(diff)} (+{pct:.1f}%)"
        elif diff < 0:
            color = (200, 60, 60); arrow = f"{format_stock_value(diff)} ({pct:.1f}%)"
        else:
            color = TEXT_DIM; arrow = "0 (0.0%)"
        draw.text((30, y+24), arrow, fill=color, font=FONT_BODY)

        if event:
            draw.text((30, y+40), event[:40], fill=TEXT_DIM, font=FONT_TINY)

    draw_footer(draw, w, h, "UPDATE 13:00 / 17:00 / 20:00  |  NOVUS ORDO EXCHANGE")
    return img_to_buffer(img)


# ============================================================
# 이미지 — 포트폴리오
# ============================================================
def draw_portfolio_image(user_id, user_name):
    """포트폴리오 이미지 생성.

    user_id: discord.User.id (snowflake int) — 호출자 호환 보존.
    내부에서 mongo_users.ensure_user 로 user_id_hex 변환.
    """
    user_id_hex = mongo_users.ensure_user(
        discord_id=int(user_id),
        discord_username=user_name or "",
    )
    holdings = get_holdings(user_id_hex)
    prices = get_stock_prices()
    bal = mongo_credits.get_balance(user_id_hex)

    rows = []
    total_value = 0; total_profit = 0
    for h in holdings:
        s = STOCK_MAP.get(h["ticker"])
        if not s: continue
        cur_price = prices.get(h["ticker"], {}).get("price", s["base_price"])
        value = round_stock_value(cur_price * h["shares"])
        profit = round_stock_value((cur_price - h["avg_price"]) * h["shares"])
        total_value += value; total_profit += profit
        rows.append({"ticker": h["ticker"], "name": s["name"], "shares": h["shares"],
                      "avg": h["avg_price"], "cur": cur_price, "value": value, "profit": profit})

    w = 500; row_h = 36
    h = 82 + max(len(rows), 1)*row_h + 80
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    start_y = draw_header(draw, w, "PORTFOLIO", f"잔고: {bal} CR")

    if not rows:
        draw.text((w//2 - 60, start_y + 20), "보유 주식 없음", fill=TEXT_DIM, font=FONT_BODY)
    else:
        draw.text((30, start_y), "종목", fill=TEXT_DIM, font=FONT_TINY)
        draw.text((140, start_y), "수량", fill=TEXT_DIM, font=FONT_TINY)
        draw.text((200, start_y), "평단", fill=TEXT_DIM, font=FONT_TINY)
        draw.text((270, start_y), "현재가", fill=TEXT_DIM, font=FONT_TINY)
        draw.text((350, start_y), "평가액", fill=TEXT_DIM, font=FONT_TINY)
        draw.text((430, start_y), "손익", fill=TEXT_DIM, font=FONT_TINY)
        start_y += 20
        for i, r in enumerate(rows):
            y = start_y + i*row_h
            if i % 2 == 0:
                draw.rectangle([20, y, w-20, y+row_h], fill=(14,14,11))
            draw.text((30, y+6), r["ticker"], fill=GOLD, font=FONT_BODY)
            draw.text((80, y+6), r["name"][:6], fill=TEXT, font=FONT_SMALL)
            draw.text((150, y+6), f"{r['shares']}주", fill=TEXT, font=FONT_BODY)
            draw.text((210, y+6), format_stock_value(r["avg"]), fill=TEXT_DIM, font=FONT_BODY)
            draw.text((280, y+6), format_stock_value(r["cur"]), fill=WHITE, font=FONT_BODY)
            draw.text((350, y+6), format_stock_value(r["value"]), fill=TEXT, font=FONT_BODY)
            pc = (60,180,80) if r["profit"]>=0 else (200,60,60)
            pstr = f"+{format_stock_value(r['profit'])}" if r["profit"]>=0 else format_stock_value(r["profit"])
            draw.text((430, y+6), pstr, fill=pc, font=FONT_BODY)

    sy = h - 60
    draw.rectangle([20, sy, w-20, sy+30], fill=(20,20,16))
    draw.text((30, sy+6), f"총 평가액: {format_stock_value(total_value)} CR", fill=GOLD, font=FONT_BODY)
    pc = (60,180,80) if total_profit>=0 else (200,60,60)
    draw.text((280, sy+6), f"총 손익: {'+' if total_profit>=0 else ''}{format_stock_value(total_profit)} CR", fill=pc, font=FONT_BODY)
    draw_footer(draw, w, h, f"잔고 {format_stock_value(bal)} + 주식 {format_stock_value(total_value)} = 총 {format_stock_value(bal+total_value)} CR")
    return img_to_buffer(img)


# ============================================================
# 위로 메시지 (폭락 시) — 보유자 → AGENT_NAMES 매핑
# ============================================================
def get_crashed_holders(results):
    """-15% 이상 폭락 종목의 활성 보유자 → AGENT_NAMES 매핑 리스트.

    Returns: [{"agent": str, "stock_name": str}, ...]

    Note: 원본 SQLite 시맨틱 — 보유자 유저명을 SQLite credits 테이블에서 가져왔음.
    Mongo 에서는 mongo_users.get_user_by_id_hex 의 displayName/discordUsername 사용.
    AGENT_NAMES lookup key 우선순위:
      1. user.discordUsername (Discord 닉네임)
      2. user.displayName
    """
    crashed = [r for r in results if r["change"] <= -15]
    comfort_list = []
    for crash in crashed:
        holders = mongo_stock.get_active_holders_by_ticker(crash["ticker"])
        for h in holders:
            user = mongo_users.get_user_by_id_hex(h["userId"])
            if not user:
                continue
            # Discord 닉네임 우선 (AGENT_NAMES 키와 일치하는 형식).
            nick = user.get("discordUsername") or user.get("displayName") or ""
            if not nick:
                continue
            agent = AGENT_NAMES.get(nick, nick)
            comfort_list.append({"agent": agent, "stock_name": crash["name"]})
    return comfort_list


# ============================================================
# GM 현황 텍스트
# ============================================================
def get_all_holdings_text():
    """전 요원 주식 보유 현황 markdown.

    SQLite 시맨틱: DISTINCT user_id from stock_holdings WHERE shares>0.
    Mongo: mongo_stock.get_all_holdings 에서 shares>0 만 필터 + userId 그룹.
    """
    all_docs = mongo_stock.get_all_holdings()
    by_user: dict[str, list[dict]] = {}
    for d in all_docs:
        if int(d.get("shares", 0)) <= 0:
            continue
        uid_hex = d.get("userId")
        if not uid_hex:
            continue
        by_user.setdefault(uid_hex, []).append(_normalize_holding_doc(d))

    if not by_user:
        return "아직 주식을 보유한 요원이 없다."

    prices = get_stock_prices()
    lines = ["**전 요원 주식 보유 현황**\n"]
    for uid_hex, holdings in by_user.items():
        user = mongo_users.get_user_by_id_hex(uid_hex)
        nick = ""
        if user:
            nick = user.get("discordUsername") or user.get("displayName") or uid_hex
        else:
            nick = uid_hex
        agent = AGENT_NAMES.get(nick, nick)
        total_value = 0; total_profit = 0; parts = []
        for h in holdings:
            s = STOCK_MAP.get(h["ticker"])
            if not s: continue
            cur = prices.get(h["ticker"], {}).get("price", s["base_price"])
            val = round_stock_value(cur * h["shares"])
            pft = round_stock_value((cur - h["avg_price"]) * h["shares"])
            total_value += val; total_profit += pft
            pstr = f"+{format_stock_value(pft)}" if pft >= 0 else format_stock_value(pft)
            parts.append(
                f"  {h['ticker']} {h['shares']}주 "
                f"(평단{format_stock_value(h['avg_price'])}, 현재{format_stock_value(cur)}, {pstr})"
            )
        pstr = f"+{format_stock_value(total_profit)}" if total_profit >= 0 else format_stock_value(total_profit)
        lines.append(f"**{agent}** ({nick}) — 평가액 {format_stock_value(total_value)} CR ({pstr})")
        lines.extend(parts)
    return "\n".join(lines)


# ============================================================
# GM 수동 이벤트 적용
# ============================================================
def apply_gm_event(ticker, change, event_text):
    """GM 수동 이벤트 적용. Returns: result dict (update_stock_prices 와 동일 스키마).

    - change 는 -90 ~ +200 으로 클램프 (원본 시맨틱 보존).
    - lastUpdate 는 KST 일자 문자열 (시간대 태그 아님 — 원본 시맨틱 보존).
      이렇게 해야 GM 이벤트 후에도 정규 STOCK_HOURS 갱신이 막히지 않음.
    """
    if ticker not in STOCK_MAP:
        return None
    change = max(-90, min(200, change))
    s = STOCK_MAP[ticker]
    today = get_today_str()

    # 현재 가격 조회 (race window 있음 — 단일 봇 프로세스라 무시).
    cur = mongo_stock.get_stock_price(ticker)
    old_price = round_stock_value(cur["price"]) if cur else s["base_price"]
    new_price = normalize_stock_price(old_price * (1 + change / 100.0))

    try:
        mongo_stock.update_stock_price(ticker, new_price, event_text, today)
    except ValueError:
        # ticker 미존재 → 시드 후 재시도.
        mongo_stock.ensure_stock_prices(
            [(ticker, s["base_price"])], today, "상장",
        )
        mongo_stock.update_stock_price(ticker, new_price, event_text, today)

    return {
        "ticker": ticker, "name": s["name"],
        "old": old_price, "new": new_price,
        "change": change, "event": event_text,
    }
