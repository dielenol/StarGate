"""
편의점 + 크레딧 + 주식 시스템 — shop.py
bot.py에서 Cog으로 로드됨
Pillow로 카드 그리드 UI 이미지 생성
"""

import sqlite3, random, io, os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
import discord
from discord import app_commands
from discord.ext import commands, tasks
from PIL import Image, ImageDraw, ImageFont
import stock_system as ss

TIMEZONE = ZoneInfo("Asia/Seoul")
INITIAL_OP_CREDITS = 400
SHOP_CHANNEL_ID = 1486557009590485174
STOCK_CHANNEL_ID = 1487426439182680094

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
            try: return ImageFont.truetype(p, size)
            except: continue
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
            try: return ImageFont.truetype(p, size)
            except: continue
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
except:
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
                except: pass
                break
load_item_images()

INITIAL_CREDITS = {
    "라면":290,"Arkaiyu":340,"버터누나":340,"힘이":210,
    "춤추기사랑하기노래부르기":180,"모스":300,"Bush Dog":130,"홀로서기":340,
    "세슘":320,"대형마법":340,"치자도우":140,"순대/soondae":30,"휴지":100,
    "카즈키":200,"실명":200,
}

# ============================================================
# DB — shop.db
# ============================================================
def init_shop_db():
    conn = sqlite3.connect("shop.db")
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS credits (
        user_id INTEGER PRIMARY KEY, user_name TEXT NOT NULL,
        balance INTEGER DEFAULT 0, initialized INTEGER DEFAULT 0)""")
    c.execute("""CREATE TABLE IF NOT EXISTS operation_pool (
        id INTEGER PRIMARY KEY CHECK (id=1), balance INTEGER DEFAULT 0)""")
    c.execute("""CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        item_id TEXT NOT NULL, quantity INTEGER DEFAULT 1,
        UNIQUE(user_id, item_id))""")
    c.execute("""CREATE TABLE IF NOT EXISTS trade_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT,
        action TEXT, item_id TEXT, amount INTEGER, detail TEXT,
        created_at TEXT NOT NULL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS daily_stock (
        item_id TEXT PRIMARY KEY, stock INTEGER DEFAULT 0,
        last_refresh TEXT NOT NULL)""")
    c.execute("INSERT OR IGNORE INTO operation_pool (id,balance) VALUES (1,?)",(INITIAL_OP_CREDITS,))
    conn.commit()
    return conn

db = init_shop_db()

# ============================================================
# 재고
# ============================================================
def get_today_str():
    return datetime.now(TIMEZONE).strftime("%Y-%m-%d")

def needs_refresh():
    c = db.cursor(); c.execute("SELECT last_refresh FROM daily_stock LIMIT 1")
    row = c.fetchone()
    return not row or row["last_refresh"] != get_today_str()

def refresh_stock():
    today = get_today_str(); c = db.cursor(); c.execute("DELETE FROM daily_stock")
    for item in SHOP_ITEMS:
        stk = random.randint(item["stock_min"], item["stock_max"]) if random.random() <= item["appear"] else 0
        c.execute("INSERT INTO daily_stock (item_id,stock,last_refresh) VALUES (?,?,?)",(item["id"],stk,today))
    db.commit()

def ensure_stock():
    if needs_refresh(): refresh_stock()

def get_stock(item_id):
    ensure_stock(); c = db.cursor(); c.execute("SELECT stock FROM daily_stock WHERE item_id=?",(item_id,))
    row = c.fetchone(); return row["stock"] if row else 0

def reduce_stock(item_id):
    db.cursor().execute("UPDATE daily_stock SET stock=stock-1 WHERE item_id=? AND stock>0",(item_id,)); db.commit()

def get_all_stock():
    ensure_stock(); c = db.cursor(); c.execute("SELECT item_id,stock FROM daily_stock")
    return {r["item_id"]:r["stock"] for r in c.fetchall()}

# ============================================================
# 크레딧
# ============================================================
def get_balance(user_id, user_name=""):
    c = db.cursor(); c.execute("SELECT initialized FROM credits WHERE user_id=?",(user_id,))
    row = c.fetchone()
    if row is None:
        initial = INITIAL_CREDITS.get(user_name, 0)
        c.execute("INSERT INTO credits (user_id,user_name,balance,initialized) VALUES (?,?,?,1)",(user_id,user_name,initial)); db.commit()
    elif row["initialized"]==0:
        initial = INITIAL_CREDITS.get(user_name, 0)
        c.execute("UPDATE credits SET balance=?,initialized=1 WHERE user_id=?",(initial,user_id)); db.commit()
    c.execute("SELECT balance FROM credits WHERE user_id=?",(user_id,))
    return c.fetchone()["balance"]

def add_credits(user_id, user_name, amount):
    get_balance(user_id, user_name)
    db.cursor().execute("UPDATE credits SET balance=balance+?,user_name=? WHERE user_id=?",(amount,user_name,user_id)); db.commit()
    return get_balance(user_id, user_name)

def get_op_balance():
    c = db.cursor(); c.execute("SELECT balance FROM operation_pool WHERE id=1"); return c.fetchone()["balance"]

def add_op_credits(amount):
    db.cursor().execute("UPDATE operation_pool SET balance=balance+? WHERE id=1",(amount,)); db.commit()
    return get_op_balance()

def get_inventory(user_id):
    c = db.cursor(); c.execute("SELECT item_id,quantity FROM inventory WHERE user_id=? AND quantity>0",(user_id,))
    return [dict(r) for r in c.fetchall()]

def add_inventory(user_id, item_id, qty=1):
    db.cursor().execute("INSERT INTO inventory (user_id,item_id,quantity) VALUES (?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=quantity+?",
              (user_id,item_id,qty,qty)); db.commit()

def log_trade(user_id, user_name, action, item_id, amount, detail=""):
    now = datetime.now(TIMEZONE).isoformat()
    db.cursor().execute("INSERT INTO trade_log (user_id,user_name,action,item_id,amount,detail,created_at) VALUES (?,?,?,?,?,?,?)",
                        (user_id,user_name,action,item_id,amount,detail,now)); db.commit()

def cleanup_old_trades():
    cutoff = (datetime.now(TIMEZONE) - timedelta(days=30)).isoformat()
    db.cursor().execute("DELETE FROM trade_log WHERE created_at < ?",(cutoff,)); db.commit()

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
                from PIL import ImageEnhance
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
def draw_inventory_image(user_id, user_name):
    inv = get_inventory(user_id)
    bal = get_balance(user_id, user_name)
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
    c = db.cursor()
    c.execute("SELECT user_name, balance FROM credits ORDER BY balance DESC")
    db_rows = {r["user_name"]: r["balance"] for r in c.fetchall()}
    op_bal = get_op_balance()

    # 전체 요원 목록 (DB에 있으면 실제 잔고, 없으면 초기 크레딧)
    AGENT_NAMES = {
        "춤추기사랑하기노래부르기": "빅보이",
        "라면": "클라운",
        "모스": "인덱서",
        "세슘": "메리골드",
        "대형마법": "우디",
        "Bush Dog": "네베드",
        "힘이": "시유",
        "Arkaiyu": "마리아",
        "치자도우": "이동식",
        "버터누나": "발트만",
        "홀로서기": "운연",
        "순대/soondae": "크로노스",
        "휴지": "핀치",
        "카즈키": "킴라박", "카쫀쿠": "킴라박", "카사웨이": "킴라박",
        "실명": "유회",
    }
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
def draw_summary_image():
    c = db.cursor()
    c.execute("""SELECT user_name, item_id, COUNT(*) as cnt, SUM(amount) as total
                 FROM trade_log WHERE action='buy' GROUP BY user_name, item_id ORDER BY user_name""")
    rows = c.fetchall()
    if not rows: return None

    summary = {}
    for r in rows:
        name = r["user_name"]
        if name not in summary: summary[name] = {"items":[], "total":0}
        item = ITEM_MAP.get(r["item_id"])
        if item: summary[name]["items"].append((item, r["cnt"]))
        summary[name]["total"] += r["total"]

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
        c.execute("SELECT balance FROM credits WHERE user_name=?",(name,))
        row = c.fetchone()
        bal = row["balance"] if row else 0
        draw.text((w-margin-80, y+6), f"잔고 {bal} CR", fill=TEXT_DIM, font=FONT_SMALL)
        # 아이템 목록
        item_strs = [f"{it['icon']}{it['name']} x{cnt}" for it, cnt in data["items"]]
        draw.text((margin+10, y+28), "  ".join(item_strs), fill=TEXT, font=FONT_SMALL)
        # 총 사용액
        draw.text((margin+10, y+agent_h-24), f"총 사용: {data['total']} CR", fill=RED, font=FONT_SMALL)

    op_bal = get_op_balance()
    draw_footer(draw, w, h, f"작전 풀: {op_bal} CR  |  30일 후 자동 삭제")
    return img_to_buffer(img)

# ============================================================
# 이미지 — 영수증 (편의점 영수증 스타일)
# ============================================================
def draw_receipt_image(user_name, item, new_bal, remaining, now, qty=1):
    # 디스코드 닉 → 요원명 변환
    AGENT_NAMES = {
        "춤추기사랑하기노래부르기": "빅보이",
        "라면": "클라운",
        "모스": "인덱서",
        "세슘": "메리골드",
        "대형마법": "우디",
        "Bush Dog": "네베드",
        "힘이": "시유",
        "Arkaiyu": "마리아",
        "치자도우": "이동식",
        "버터누나": "발트만",
        "홀로서기": "운연",
        "순대/soondae": "크로노스",
        "휴지": "핀치",
        "카즈키": "킴라박", "카쫀쿠": "킴라박", "카사웨이": "킴라박",
        "실명": "유회",
        "핏보이": "GM",
        "pitboy": "GM",
        "흑우": "GM",
    }
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

    # 바코드 느낌 (장식)
    import random as _r
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
        bal = get_balance(interaction.user.id, interaction.user.display_name)
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
        bal = get_balance(self.user_id, self.user_name)
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
        stk = get_stock(self.item_id)
        total = item["price"] * self.qty
        if stk < self.qty:
            await interaction.response.edit_message(content=f"앗... 재고가 {stk}개밖에 없어요...", embed=None, view=None); return
        bal = get_balance(self.user_id, self.user_name)
        if bal < total:
            await interaction.response.edit_message(content="크레딧이 부족해요...", embed=None, view=None); return
        new_bal = add_credits(self.user_id, self.user_name, -total)
        for _ in range(self.qty):
            reduce_stock(self.item_id)
        log_trade(self.user_id, self.user_name, "buy", self.item_id, total, f"{item['name']} x{self.qty} 구매")
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
        prices = ss.get_stock_prices()
        options = []
        for s in ss.STOCKS:
            p = prices.get(s["ticker"], {})
            price = p.get("price", s["base_price"])
            prev = p.get("prev_price", s["base_price"])
            diff = price - prev
            arrow = f"+{diff}" if diff > 0 else str(diff) if diff < 0 else "0"
            options.append(discord.SelectOption(
                label=f"{s['name']} ({s['ticker']}) — {price} CR",
                value=s["ticker"], description=f"전일 대비 {arrow} CR"))
        super().__init__(placeholder="거래할 종목을 선택해주세요...", options=options)

    async def callback(self, interaction):
        ticker = self.values[0]; s = ss.STOCK_MAP[ticker]
        price = ss.get_stock_price(ticker)
        bal = get_balance(interaction.user.id, interaction.user.display_name)
        holdings = ss.get_holdings(interaction.user.id)
        held, avg = 0, 0
        for h in holdings:
            if h["ticker"] == ticker: held = h["shares"]; avg = h["avg_price"]; break
        embed = discord.Embed(title=f"{s['name']} ({ticker})", description=s["desc"],
                              color=discord.Color.from_rgb(197,162,85))
        embed.add_field(name="현재가", value=f"**{price}** CR", inline=True)
        embed.add_field(name="잔고", value=f"{bal} CR", inline=True)
        embed.add_field(name="보유", value=f"{held}주 (평단 {avg})" if held > 0 else "없음", inline=True)
        max_buy = min(bal // price, 50) if price > 0 else 0
        embed.add_field(name="최대 매수", value=f"{max_buy}주", inline=True)
        if held > 0:
            cur_value = price * held; cur_profit = (price - avg) * held
            pstr = f"+{cur_profit}" if cur_profit >= 0 else str(cur_profit)
            embed.add_field(name="평가액", value=f"{cur_value} CR ({pstr})", inline=True)
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
            total = price * i
            lbl = f"{i}주 매수 — {total} CR" if action == "buy" else f"{i}주 매도 — {total} CR"
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
        embed.add_field(name="현재가", value=f"{self.price} CR", inline=True)
        embed.add_field(name="수량", value=f"{qty}주", inline=True)
        embed.add_field(name="합계", value=f"{self.price * qty} CR", inline=True)
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
        bal = get_balance(self.user_id, self.user_name)
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
            result_price, err = ss.buy_stock(self.user_id, self.user_name, self.ticker, self.qty)
            if err:
                await interaction.response.edit_message(content=f"저, 저기... {err}", embed=None, view=None); return
            total = result_price * self.qty
            new_bal = ss.get_balance(self.user_id, self.user_name)
            await interaction.response.edit_message(
                content=f"**{s['name']}** {self.qty}주 매수 완료했어요...\n단가 {result_price} CR x {self.qty}주 = {total} CR\n잔고: {new_bal} CR",
                embed=None, view=None)
        else:
            result_price, profit = ss.sell_stock(self.user_id, self.user_name, self.ticker, self.qty)
            if result_price is None:
                await interaction.response.edit_message(content="보유 주식이 부족해요...", embed=None, view=None); return
            total = result_price * self.qty
            new_bal = ss.get_balance(self.user_id, self.user_name)
            pstr = f"+{profit}" if profit >= 0 else str(profit)
            await interaction.response.edit_message(
                content=f"**{s['name']}** {self.qty}주 매도 완료했어요...\n단가 {result_price} CR x {self.qty}주 = {total} CR\n손익: {pstr} CR | 잔고: {new_bal} CR",
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
        # 월요일 06시: 구매내역 초기화 + 재고 리셋 (새 주 시작)
        if now.hour == 6 and now.weekday() == 0:
            c = db.cursor()
            c.execute("DELETE FROM trade_log WHERE action='buy'")
            db.commit()
            refresh_stock()
            print(f"[편의점] 월요일 — 주간 구매내역 초기화 + 재고 리셋 ({now.strftime('%Y-%m-%d')})")
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
        """가끔씩 잡담방에 바이럴 한마디"""
        import random
        now = datetime.now(TIMEZONE)
        # 영업시간 아닐 때는 안 함 (새벽, 일요일, 토18시 이후)
        if now.weekday() == 6: return
        if now.weekday() == 5 and now.hour >= 18: return
        if now.hour < 9 or now.hour > 22: return
        # 40% 확률로 실행 (매번 하면 스팸)
        if random.random() > 0.40: return

        # 잡담방 채널로 보냄
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
        bal = get_balance(interaction.user.id, interaction.user.display_name)
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
        bal = get_balance(interaction.user.id, interaction.user.display_name)
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
        price = ss.get_stock_price(ticker); total = price * 수량
        bal = get_balance(interaction.user.id, interaction.user.display_name)
        embed = discord.Embed(title=f"매수 확인 — {s['name']}", color=discord.Color.from_rgb(60,180,80))
        embed.add_field(name="현재가", value=f"{price} CR", inline=True)
        embed.add_field(name="수량", value=f"{수량}주", inline=True)
        embed.add_field(name="합계", value=f"{total} CR", inline=True)
        embed.add_field(name="잔고", value=f"{bal} CR → {bal - total} CR", inline=True)
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
        price = ss.get_stock_price(ticker)
        holdings = ss.get_holdings(interaction.user.id)
        held, avg = 0, 0
        for h in holdings:
            if h["ticker"] == ticker: held = h["shares"]; avg = h["avg_price"]; break
        embed = discord.Embed(title=f"매도 확인 — {s['name']}", color=discord.Color.from_rgb(200,60,60))
        embed.add_field(name="현재가", value=f"{price} CR", inline=True)
        embed.add_field(name="보유", value=f"{held}주 (평단 {avg})", inline=True)
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
        if ctx.author.display_name not in ["핏보이","pitboy","흑우"]:
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if not member or amount <= 0: await ctx.reply("`!지급 @유저 금액`"); return
        new_bal = add_credits(member.id, member.display_name, amount)
        log_trade(member.id, member.display_name, "gm_give", None, amount, "GM 지급")
        await ctx.reply(f"{member.display_name} 님에게 **{amount}** CR 지급. 잔고: **{new_bal}** CR")

    # ------ GM: 크레딧 차감 ------
    @commands.command(name="차감")
    async def take_credits(self, ctx, member: discord.Member = None, amount: int = 0):
        if ctx.author.display_name not in ["핏보이","pitboy","흑우"]:
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if not member or amount <= 0: await ctx.reply("`!차감 @유저 금액`"); return
        bal = get_balance(member.id, member.display_name)
        if bal < amount: await ctx.reply(f"{member.display_name} 님 잔고가 {bal} CR밖에 없어요..."); return
        new_bal = add_credits(member.id, member.display_name, -amount)
        log_trade(member.id, member.display_name, "gm_take", None, amount, "GM 차감")
        await ctx.reply(f"{member.display_name} 님에게서 **{amount}** CR 차감. 잔고: **{new_bal}** CR")

    # ------ GM: 전체 지급 (일괄) ------
    @commands.command(name="전체지급")
    async def give_all_credits(self, ctx, amount: int = 0):
        if ctx.author.display_name not in ["핏보이","pitboy","흑우"]:
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if amount <= 0: await ctx.reply("`!전체지급 금액`"); return
        # 서버 멤버 중 INITIAL_CREDITS에 있는 사람 자동 등록
        if ctx.guild:
            for member in ctx.guild.members:
                if member.display_name in INITIAL_CREDITS:
                    get_balance(member.id, member.display_name)  # 등록 안 됐으면 초기화됨
        # DB에 등록된 전원에게 지급
        c = db.cursor()
        c.execute("SELECT user_id, user_name FROM credits")
        users = c.fetchall()
        if not users:
            await ctx.reply("등록된 요원이 없어요..."); return
        results = []
        for u in users:
            new_bal = add_credits(u["user_id"], u["user_name"], amount)
            log_trade(u["user_id"], u["user_name"], "gm_give_all", None, amount, f"전체 지급 {amount}CR")
            agent = ss.AGENT_NAMES.get(u["user_name"], u["user_name"])
            results.append(f"{agent}: {new_bal} CR")
        await ctx.reply(f"등록된 **{len(results)}명** 전원에게 **{amount}** CR 지급 완료!\n" + "\n".join(results))

    # ------ GM: 작전 지급 ------
    @commands.command(name="작전지급")
    async def give_op(self, ctx, amount: int = 0):
        if ctx.author.display_name not in ["핏보이","pitboy","흑우"]:
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if amount <= 0: await ctx.reply("`!작전지급 금액`"); return
        new_bal = add_op_credits(amount)
        log_trade(None, "GM", "op_give", None, amount, "작전 풀 지급")
        await ctx.reply(f"작전 풀에 **{amount}** CR 추가. 현재: **{new_bal}** CR")

    # ------ GM: 작전 차감 ------
    @commands.command(name="작전차감")
    async def take_op(self, ctx, amount: int = 0):
        if ctx.author.display_name not in ["핏보이","pitboy","흑우"]:
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if amount <= 0: await ctx.reply("`!작전차감 금액`"); return
        bal = get_op_balance()
        if bal < amount: await ctx.reply(f"작전 풀에 {bal} CR밖에 없어요..."); return
        new_bal = add_op_credits(-amount)
        log_trade(None, "GM", "op_take", None, amount, "작전 풀 차감")
        await ctx.reply(f"작전 풀에서 **{amount}** CR 차감. 현재: **{new_bal}** CR")

    # ------ GM: 구매내역 (이미지) ------
    @commands.command(name="구매내역", aliases=["구매정리","소모품정리"])
    async def purchase_summary(self, ctx):
        if ctx.author.display_name not in ["핏보이","pitboy","흑우"]:
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        buf = draw_summary_image()
        if not buf: await ctx.reply("아직 구매 내역이 없어요..."); return
        file = discord.File(buf, filename="summary.png")
        await ctx.reply(file=file)

    # ------ GM: 전체 잔고 (이미지) ------
    @commands.command(name="전체잔고", aliases=["잔고정리"])
    async def all_balances(self, ctx):
        if ctx.author.display_name not in ["핏보이","pitboy","흑우"]:
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        buf = draw_all_balances_image()
        file = discord.File(buf, filename="balances.png")
        await ctx.reply(file=file)

    # ------ GM: 주식 이벤트 수동 조절 ------
    @commands.command(name="주식이벤트")
    async def gm_stock_event(self, ctx, ticker: str = "", change: int = 0, *, event_text: str = ""):
        if ctx.author.display_name not in ["핏보이","pitboy","흑우"]:
            await ctx.reply("이건 GM님만 할 수 있어요..."); return
        if not ticker or not event_text:
            await ctx.reply("`!주식이벤트 [종목코드] [등락률] [이벤트 내용]`\n"
                           "예: `!주식이벤트 BPE -20 블랙피라미드 긴급 정전`\n"
                           "종목: " + " / ".join(s["ticker"] for s in ss.STOCKS)); return
        try: await ctx.message.delete()
        except: pass
        result = ss.apply_gm_event(ticker.upper(), change, event_text)
        if not result: return
        ch = self.bot.get_channel(STOCK_CHANNEL_ID)
        if ch:
            try:
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
        if ctx.author.display_name not in ["핏보이","pitboy","흑우"]:
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
