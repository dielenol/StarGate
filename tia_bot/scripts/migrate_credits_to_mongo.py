"""
1회성 — 띠아봇 SQLite (shop.db) 의 운영 잔액 / 작전풀 → mongo 로 시드.

Character 단위 ledger:
- 각 SQLite credits.user_id (Discord snowflake) → users.discordId 매핑
- ownerId 기반 main AGENT character 조회
- credit_transactions 에 type='MIGRATION' ledger 1건 insert (balance 스냅샷)
- operation_pool → credit_pools.OPERATION

Usage:
  cd /Users/flitto/Code/StarGate/tia_bot
  MONGODB_URI="..." python3 scripts/migrate_credits_to_mongo.py --dry-run
  MONGODB_URI="..." python3 scripts/migrate_credits_to_mongo.py --execute --yes

Options:
  --sqlite=<path>    shop.db 경로 (기본: tia_bot/shop.db)
  --dry-run          기본. 변경 없이 매핑/시드 예상만 출력
  --execute --yes    실제 mongo write
  --tag=<str>        migration tag (기본: MIGRATION_<YYYYMMDD>)
  --mongodb-uri=<>   MONGODB_URI 환경변수 override
  --db-name=<>       기본 'stargate'
"""

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timezone

try:
    from bson import ObjectId
    from pymongo import MongoClient
except ImportError:
    print("pymongo 필요: pip install pymongo")
    sys.exit(1)


SENTINEL_SYSTEM_USER_ID = "000000000000000000000001"
DEFAULT_OPERATION_POOL_ID = "OPERATION"
DEFAULT_OPERATION_POOL_NAME = "작전 크레딧 풀"


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--sqlite", default=os.path.join(os.path.dirname(__file__), "..", "shop.db"))
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--execute", action="store_true")
    p.add_argument("--yes", action="store_true")
    p.add_argument("--tag", default=f"MIGRATION_{datetime.now().strftime('%Y%m%d')}")
    p.add_argument("--mongodb-uri")
    p.add_argument("--db-name")
    args = p.parse_args()

    if args.execute and not args.yes:
        print("--execute 는 --yes 와 함께 사용 필요")
        sys.exit(1)

    if not args.execute:
        args.dry_run = True

    if not args.mongodb_uri:
        args.mongodb_uri = os.environ.get("MONGODB_URI")
    if not args.mongodb_uri:
        print("MONGODB_URI 필요 (환경변수 또는 --mongodb-uri)")
        sys.exit(1)

    return args


def extract_db_name(uri):
    import re
    m = re.search(r"//[^/]+/([^?]+)", uri)
    return m.group(1) if m else None


def mask_uri(uri):
    import re
    return re.sub(r"(://[^:]+:)[^@]+(@)", r"\1***\2", uri)


def find_main_character(db, owner_id_hex):
    """ownerId 의 AGENT/MAIN 캐릭터. tier 미설정도 MAIN 으로 fallback."""
    chars = list(db.characters.find({
        "type": "AGENT",
        "ownerId": owner_id_hex,
        "$or": [{"tier": "MAIN"}, {"tier": {"$exists": False}}],
    }))
    if len(chars) == 0:
        return None
    if len(chars) > 1:
        codenames = ", ".join(c["codename"] for c in chars)
        raise RuntimeError(f"1인 N MAIN 위반 — owner={owner_id_hex} chars=[{codenames}]")
    return chars[0]


def main():
    args = parse_args()
    db_name = args.db_name or extract_db_name(args.mongodb_uri) or "stargate"

    print("=== 띠아봇 크레딧 마이그레이션 ===")
    print(f"SQLite: {args.sqlite}")
    print(f"Mongo:  {mask_uri(args.mongodb_uri)}")
    print(f"DB:     {db_name}")
    print(f"Tag:    {args.tag}")
    print(f"Mode:   {'DRY-RUN' if args.dry_run else 'EXECUTE'}")
    print()

    if not os.path.exists(args.sqlite):
        print(f"SQLite 파일 없음: {args.sqlite}")
        sys.exit(1)

    sql = sqlite3.connect(args.sqlite)
    sql.row_factory = sqlite3.Row

    client = MongoClient(args.mongodb_uri)
    try:
        db = client[db_name]

        # 1. SQLite credits 읽기
        rows = list(sql.execute("SELECT user_id, user_name, balance FROM credits"))
        print(f"[1/4] SQLite credits: {len(rows)}건")
        for r in rows:
            print(f"  - user_id={r['user_id']} name={r['user_name']} balance={r['balance']}")
        print()

        # 2. user 매핑 + main 캐릭 조회
        plan = []
        skipped = []
        for r in rows:
            discord_id = str(r["user_id"])
            user = db.users.find_one({"discordId": discord_id})
            if not user:
                skipped.append((r["user_name"], discord_id, "users 컬렉션 미등록"))
                continue
            owner_id_hex = str(user["_id"])
            try:
                main_char = find_main_character(db, owner_id_hex)
            except RuntimeError as e:
                skipped.append((r["user_name"], discord_id, str(e)))
                continue
            if not main_char:
                skipped.append((r["user_name"], discord_id, "메인 캐릭터 미등록"))
                continue
            plan.append({
                "user_name": r["user_name"],
                "discord_id": discord_id,
                "owner_id_hex": owner_id_hex,
                "owner_name": user.get("discordUsername") or user.get("username") or r["user_name"],
                "character_id": str(main_char["_id"]),
                "character_codename": main_char["codename"],
                "balance": r["balance"],
            })

        print(f"[2/4] user → character 매핑: {len(plan)}건 시드 / {len(skipped)}건 skip")
        print()
        for p in plan:
            print(f"  ✓ {p['user_name']:>15} → {p['character_codename']:<20} ({p['balance']} CR)")
        for s in skipped:
            print(f"  ✗ {s[0]:>15} (discordId={s[1]}) — {s[2]}")
        print()

        # 3. operation_pool 읽기
        op_row = sql.execute("SELECT balance FROM operation_pool WHERE id=1").fetchone()
        op_balance = op_row["balance"] if op_row else 0
        print(f"[3/4] operation_pool: {op_balance} CR")
        print()

        # 4. 검증 — 이미 마이그된 ledger 있는지
        existing_migration = db.credit_transactions.count_documents({
            "type": "MIGRATION",
            "description": {"$regex": f"^{args.tag}"},
        })
        existing_pool = db.credit_pools.find_one({"poolId": DEFAULT_OPERATION_POOL_ID})

        if existing_migration > 0:
            print(f"⚠ 이미 tag={args.tag} 로 마이그된 ledger {existing_migration}건 존재. 다른 --tag 사용 권장.")
        if existing_pool:
            print(f"⚠ credit_pools.{DEFAULT_OPERATION_POOL_ID} 이미 존재 (balance={existing_pool['balance']})")
        print()

        if args.dry_run:
            print(f"[4/4] DRY-RUN — 변경 없음")
            print(f"  ledger insert 예정: {len(plan)} 건")
            print(f"  credit_pools 갱신: {DEFAULT_OPERATION_POOL_ID} balance={op_balance}")
            print(f"  --execute --yes 로 실제 적용")
            return

        # 5. EXECUTE — credit_transactions ledger insert
        now = datetime.now(timezone.utc)
        inserted = 0
        for p in plan:
            doc = {
                "characterId": p["character_id"],
                "characterCodename": p["character_codename"],
                "ownerId": p["owner_id_hex"],
                "ownerName": p["owner_name"],
                "type": "MIGRATION",
                "amount": p["balance"],
                "balance": p["balance"],
                "description": f"{args.tag}: 띠아봇 SQLite 잔액 시드",
                "metadata": {
                    "kind": "migration",
                    "legacySource": "shop.db",
                    "legacyUserId": p["discord_id"],
                    "legacyUserName": p["user_name"],
                },
                "createdById": SENTINEL_SYSTEM_USER_ID,
                "createdByName": "TIA_BOT_MIGRATION",
                "createdAt": now,
            }
            db.credit_transactions.insert_one(doc)
            inserted += 1
        print(f"[4/4] credit_transactions {inserted}건 insert 완료")

        # 6. credit_pools.OPERATION 갱신
        if existing_pool:
            delta = op_balance - existing_pool["balance"]
            if delta != 0:
                db.credit_pools.update_one(
                    {"poolId": DEFAULT_OPERATION_POOL_ID},
                    {"$inc": {"balance": delta}, "$set": {"updatedAt": now}},
                )
                print(f"  credit_pools.{DEFAULT_OPERATION_POOL_ID} delta={delta} 적용 (now {op_balance})")
            else:
                print(f"  credit_pools.{DEFAULT_OPERATION_POOL_ID} balance 일치 — skip")
        else:
            db.credit_pools.insert_one({
                "poolId": DEFAULT_OPERATION_POOL_ID,
                "name": DEFAULT_OPERATION_POOL_NAME,
                "balance": op_balance,
                "createdAt": now,
                "updatedAt": now,
            })
            print(f"  credit_pools.{DEFAULT_OPERATION_POOL_ID} 신규 insert (balance={op_balance})")

        print()
        print("=== 마이그 완료 ===")

    finally:
        sql.close()
        client.close()


if __name__ == "__main__":
    main()
