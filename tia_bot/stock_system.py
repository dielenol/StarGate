"""
주식 시스템 모듈 — stock_system.py
비앙카 봇에서 임포트해서 사용
shop.db의 credits 테이블 공유, stock_prices/stock_holdings 테이블 추가
"""

import os, io, sqlite3, random, asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from PIL import Image, ImageDraw, ImageFont

TIMEZONE = ZoneInfo("Asia/Seoul")

# ============================================================
# 폰트
# ============================================================
def load_font(size):
    paths = ["C:/Windows/Fonts/malgunbd.ttf","C:/Windows/Fonts/malgun.ttf",
             "C:/Windows/Fonts/gulim.ttc","C:/Windows/Fonts/NanumGothicBold.ttf",
             "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"]
    for p in paths:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: continue
    return ImageFont.load_default()

FONT_TITLE = load_font(20)
FONT_HEADER = load_font(16)
FONT_BODY = load_font(13)
FONT_SMALL = load_font(11)
FONT_TINY = load_font(9)

# ============================================================
# 색상
# ============================================================
BG       = (10, 10, 8)
GOLD     = (197, 162, 85)
GOLD_DIM = (138, 113, 48)
RED      = (155, 32, 32)
GREEN    = (42, 139, 76)
TEXT     = (192, 184, 168)
TEXT_DIM = (104, 100, 96)
WHITE    = (220, 215, 205)
BORDER   = (50, 42, 25)

IMG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")

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
# 종목 정의
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
# DB — shop.db 접속 (크레딧 공유)
# ============================================================
def init_stock_db():
    conn = sqlite3.connect("shop.db")
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS stock_prices (
        ticker TEXT PRIMARY KEY, price INTEGER NOT NULL,
        prev_price INTEGER NOT NULL, event_text TEXT,
        last_update TEXT NOT NULL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS stock_holdings (
        user_id INTEGER NOT NULL, ticker TEXT NOT NULL,
        shares INTEGER DEFAULT 0, avg_price INTEGER DEFAULT 0,
        UNIQUE(user_id, ticker))""")
    conn.commit()
    return conn

sdb = init_stock_db()

def get_today_str():
    return datetime.now(TIMEZONE).strftime("%Y-%m-%d")

def _init_prices():
    c = sdb.cursor(); today = get_today_str()
    for s in STOCKS:
        c.execute("SELECT * FROM stock_prices WHERE ticker=?",(s["ticker"],))
        if not c.fetchone():
            c.execute("INSERT INTO stock_prices (ticker,price,prev_price,event_text,last_update) VALUES (?,?,?,?,?)",
                      (s["ticker"], s["base_price"], s["base_price"], "상장", today))
    sdb.commit()

_init_prices()

# ============================================================
# 크레딧 접근 (shop.db 공유 — 읽기/차감/지급만, 초기화는 shop.py가 담당)
# ============================================================
def get_balance(user_id, user_name=""):
    c = sdb.cursor()
    c.execute("SELECT balance FROM credits WHERE user_id=?",(user_id,))
    row = c.fetchone()
    if row:
        return row["balance"]
    # DB에 없으면 0 반환 (초기화는 편의점에서 /잔고 또는 /편의점 사용 시 됨)
    return 0

def add_credits(user_id, user_name, amount):
    c = sdb.cursor()
    c.execute("SELECT balance FROM credits WHERE user_id=?",(user_id,))
    row = c.fetchone()
    if row:
        new_bal = row["balance"] + amount
        c.execute("UPDATE credits SET balance=?,user_name=? WHERE user_id=?",(new_bal,user_name,user_id))
        sdb.commit()
        return new_bal
    else:
        # DB에 없으면 거래 불가
        return 0

def log_trade(user_id, user_name, action, item_id, amount, detail=""):
    now = datetime.now(TIMEZONE).isoformat()
    sdb.cursor().execute(
        "INSERT INTO trade_log (user_id,user_name,action,item_id,amount,detail,created_at) VALUES (?,?,?,?,?,?,?)",
        (user_id,user_name,action,item_id,amount,detail,now))
    sdb.commit()

# ============================================================
# 주식 함수
# ============================================================
def get_stock_prices():
    c = sdb.cursor(); c.execute("SELECT * FROM stock_prices")
    return {r["ticker"]: dict(r) for r in c.fetchall()}

def get_stock_price(ticker):
    c = sdb.cursor(); c.execute("SELECT price FROM stock_prices WHERE ticker=?",(ticker,))
    row = c.fetchone(); return row["price"] if row else 0

def get_holdings(user_id):
    c = sdb.cursor()
    c.execute("SELECT * FROM stock_holdings WHERE user_id=? AND shares>0",(user_id,))
    return [dict(r) for r in c.fetchall()]

def buy_stock(user_id, user_name, ticker, shares):
    price = get_stock_price(ticker); total = price * shares
    bal = get_balance(user_id, user_name)
    if bal <= 0: return None, "크레딧이 등록되지 않았도다... 먼저 편의점에서 /잔고를 확인하거라."
    if bal < total: return None, "크레딧이 부족하도다..."
    add_credits(user_id, user_name, -total)
    c = sdb.cursor()
    c.execute("SELECT shares, avg_price FROM stock_holdings WHERE user_id=? AND ticker=?",(user_id,ticker))
    row = c.fetchone()
    if row and row["shares"] > 0:
        old_s, old_a = row["shares"], row["avg_price"]
        new_s = old_s + shares
        new_a = ((old_a * old_s) + (price * shares)) // new_s
        c.execute("UPDATE stock_holdings SET shares=?,avg_price=? WHERE user_id=? AND ticker=?",(new_s,new_a,user_id,ticker))
    else:
        c.execute("INSERT OR REPLACE INTO stock_holdings (user_id,ticker,shares,avg_price) VALUES (?,?,?,?)",(user_id,ticker,shares,price))
    sdb.commit()
    log_trade(user_id, user_name, "stock_buy", ticker, total, f"{STOCK_MAP[ticker]['name']} {shares}주 매수 @{price}")
    return price, None

def sell_stock(user_id, user_name, ticker, shares):
    price = get_stock_price(ticker)
    c = sdb.cursor()
    c.execute("SELECT shares, avg_price FROM stock_holdings WHERE user_id=? AND ticker=?",(user_id,ticker))
    row = c.fetchone()
    if not row or row["shares"] < shares: return None, "보유 주식이 부족하도다..."
    total = price * shares
    add_credits(user_id, user_name, total)
    new_s = row["shares"] - shares
    if new_s == 0:
        c.execute("DELETE FROM stock_holdings WHERE user_id=? AND ticker=?",(user_id,ticker))
    else:
        c.execute("UPDATE stock_holdings SET shares=? WHERE user_id=? AND ticker=?",(new_s,user_id,ticker))
    sdb.commit()
    profit = (price - row["avg_price"]) * shares
    pstr = f"+{profit}" if profit >= 0 else str(profit)
    log_trade(user_id, user_name, "stock_sell", ticker, total,
              f"{STOCK_MAP[ticker]['name']} {shares}주 매도 @{price} ({pstr})")
    return price, profit

# ============================================================
# AI 이벤트 생성
# ============================================================
async def generate_stock_events(copilot_api_key, model):
    prices = get_stock_prices()
    c = sdb.cursor()
    volume_info = []
    for s in STOCKS:
        t = s["ticker"]; p = prices.get(t, {}); price = p.get("price", s["base_price"])
        c.execute("SELECT COUNT(*) as cnt FROM trade_log WHERE action='stock_buy' AND item_id=?", (t,))
        buy_cnt = c.fetchone()["cnt"]
        c.execute("SELECT COUNT(*) as cnt FROM trade_log WHERE action='stock_sell' AND item_id=?", (t,))
        sell_cnt = c.fetchone()["cnt"]
        c.execute("SELECT SUM(shares) as total FROM stock_holdings WHERE ticker=? AND shares>0", (t,))
        row = c.fetchone(); held = row["total"] if row["total"] else 0
        if buy_cnt > 3: pop = "매우 인기 (많이 매수됨 → 하락 유도)"
        elif buy_cnt > 1: pop = "보통 인기 (소폭 하락 유도)"
        elif sell_cnt > buy_cnt: pop = "매도 우세 (소폭 상승 가능)"
        elif held == 0 and buy_cnt == 0: pop = "관심 없음 (소폭 상승 가능)"
        else: pop = "보통"
        volume_info.append(f"- {s['name']}({t}): 현재 {price}CR, 기준가 {s['base_price']}CR, 보유 {held}주, 매수{buy_cnt}건/매도{sell_cnt}건 [{pop}]")

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
            try: change = int(parts[1].strip().replace("+","").replace("%",""))
            except: continue
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

async def update_stock_prices(copilot_api_key, model):
    events = await generate_stock_events(copilot_api_key, model)
    c = sdb.cursor()
    now = datetime.now(TIMEZONE)
    update_tag = f"{get_today_str()} {now.hour:02d}"
    results = []
    for s in STOCKS:
        ticker = s["ticker"]
        ev = events.get(ticker, {"change": 0, "event": "변동 없음"})
        c.execute("SELECT price FROM stock_prices WHERE ticker=?",(ticker,))
        row = c.fetchone()
        old_price = row["price"] if row else s["base_price"]
        new_price = max(1, int(old_price * (1 + ev["change"]/100.0)))
        c.execute("UPDATE stock_prices SET prev_price=?,price=?,event_text=?,last_update=? WHERE ticker=?",
                  (old_price, new_price, ev["event"], update_tag, ticker))
        results.append({"ticker": ticker, "name": s["name"], "old": old_price, "new": new_price,
                        "change": ev["change"], "event": ev["event"]})
    sdb.commit()
    return results

STOCK_HOURS = [13, 17, 20]  # 하루 3번 이벤트

def needs_stock_update():
    """현재 시간대의 업데이트가 필요한지 확인"""
    now = datetime.now(TIMEZONE)
    if now.hour not in STOCK_HOURS: return False
    c = sdb.cursor()
    c.execute("SELECT last_update FROM stock_prices LIMIT 1")
    row = c.fetchone()
    current_tag = f"{get_today_str()} {now.hour:02d}"
    return not row or row["last_update"] != current_tag

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
        draw.text((w-100, y+4), f"{price} CR", fill=WHITE, font=FONT_HEADER)

        if diff > 0:
            color = (60, 180, 80); arrow = f"+{diff} (+{pct:.1f}%)"
        elif diff < 0:
            color = (200, 60, 60); arrow = f"{diff} ({pct:.1f}%)"
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
    holdings = get_holdings(user_id)
    prices = get_stock_prices()
    bal = get_balance(user_id, user_name)

    rows = []
    total_value = 0; total_profit = 0
    for h in holdings:
        s = STOCK_MAP.get(h["ticker"])
        if not s: continue
        cur_price = prices.get(h["ticker"], {}).get("price", s["base_price"])
        value = cur_price * h["shares"]
        profit = (cur_price - h["avg_price"]) * h["shares"]
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
            draw.text((210, y+6), str(r["avg"]), fill=TEXT_DIM, font=FONT_BODY)
            draw.text((280, y+6), str(r["cur"]), fill=WHITE, font=FONT_BODY)
            draw.text((350, y+6), str(r["value"]), fill=TEXT, font=FONT_BODY)
            pc = (60,180,80) if r["profit"]>=0 else (200,60,60)
            pstr = f"+{r['profit']}" if r["profit"]>=0 else str(r["profit"])
            draw.text((430, y+6), pstr, fill=pc, font=FONT_BODY)

    sy = h - 60
    draw.rectangle([20, sy, w-20, sy+30], fill=(20,20,16))
    draw.text((30, sy+6), f"총 평가액: {total_value} CR", fill=GOLD, font=FONT_BODY)
    pc = (60,180,80) if total_profit>=0 else (200,60,60)
    draw.text((280, sy+6), f"총 손익: {'+' if total_profit>=0 else ''}{total_profit} CR", fill=pc, font=FONT_BODY)
    draw_footer(draw, w, h, f"잔고 {bal} + 주식 {total_value} = 총 {bal+total_value} CR")
    return img_to_buffer(img)

# ============================================================
# 위로 메시지 (폭락 시)
# ============================================================
def get_crashed_holders(results):
    """-15% 이상 폭락 종목 보유자 목록 반환"""
    crashed = [r for r in results if r["change"] <= -15]
    comfort_list = []
    for crash in crashed:
        c = sdb.cursor()
        c.execute("SELECT user_id FROM stock_holdings WHERE ticker=? AND shares>0", (crash["ticker"],))
        holders = c.fetchall()
        for h in holders:
            c.execute("SELECT user_name FROM credits WHERE user_id=?", (h["user_id"],))
            name_row = c.fetchone()
            if not name_row: continue
            nick = name_row["user_name"]
            agent = AGENT_NAMES.get(nick, nick)
            comfort_list.append({"agent": agent, "stock_name": crash["name"]})
    return comfort_list

# ============================================================
# GM 현황 텍스트
# ============================================================
def get_all_holdings_text():
    c = sdb.cursor()
    c.execute("SELECT DISTINCT user_id FROM stock_holdings WHERE shares>0")
    users = c.fetchall()
    if not users: return "아직 주식을 보유한 요원이 없다."
    prices = get_stock_prices()
    lines = ["**전 요원 주식 보유 현황**\n"]
    for u in users:
        uid = u["user_id"]
        c.execute("SELECT user_name FROM credits WHERE user_id=?",(uid,))
        name_row = c.fetchone()
        nick = name_row["user_name"] if name_row else str(uid)
        agent = AGENT_NAMES.get(nick, nick)
        holdings = get_holdings(uid)
        total_value = 0; total_profit = 0; parts = []
        for h in holdings:
            s = STOCK_MAP.get(h["ticker"])
            if not s: continue
            cur = prices.get(h["ticker"], {}).get("price", s["base_price"])
            val = cur * h["shares"]; pft = (cur - h["avg_price"]) * h["shares"]
            total_value += val; total_profit += pft
            pstr = f"+{pft}" if pft >= 0 else str(pft)
            parts.append(f"  {h['ticker']} {h['shares']}주 (평단{h['avg_price']}, 현재{cur}, {pstr})")
        pstr = f"+{total_profit}" if total_profit >= 0 else str(total_profit)
        lines.append(f"**{agent}** ({nick}) — 평가액 {total_value} CR ({pstr})")
        lines.extend(parts)
    return "\n".join(lines)

def apply_gm_event(ticker, change, event_text):
    """GM 수동 이벤트 적용, 결과 반환"""
    if ticker not in STOCK_MAP: return None
    change = max(-90, min(200, change))
    s = STOCK_MAP[ticker]
    c = sdb.cursor()
    c.execute("SELECT price FROM stock_prices WHERE ticker=?",(ticker,))
    row = c.fetchone()
    old_price = row["price"] if row else s["base_price"]
    new_price = max(1, int(old_price * (1 + change/100.0)))
    today = get_today_str()
    c.execute("UPDATE stock_prices SET prev_price=?,price=?,event_text=?,last_update=? WHERE ticker=?",
              (old_price, new_price, event_text, today, ticker))
    sdb.commit()
    return {"ticker": ticker, "name": s["name"], "old": old_price, "new": new_price,
            "change": change, "event": event_text}
