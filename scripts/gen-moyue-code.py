#!/usr/bin/env python3
"""gen-moyue-code.py — 生成符合 Crockford 4-4-4 的墨阅兑换码

用法：
  python3 scripts/gen-moyue-code.py            # 1 个纯码
  python3 scripts/gen-moyue-code.py 5          # 5 个纯码
  python3 scripts/gen-moyue-code.py 5 plus     # 5 个 plus 档 SQL
  python3 scripts/gen-moyue-code.py 3 pro      # 3 个 pro 档 SQL

服务端校验：/api/redeem 用 INVITE_CODE_PATTERN
  ^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$
字符表：0-9 A-H J K M N P-T V-Z（去 I L O U）
格式：4-4-4
源：apps/readest-app/src/utils/invite.ts
"""
import re
import secrets
import sys

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
PATTERN = re.compile(r"^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$")

# 历史错码黑名单（避免随机生成出同样的废码）
BANNED = {
    "TEST-MOYUE-PLUS",
    "M0Y1-PLUS-TEST",
    "2026-M0YU-NE9P",
    "MAC-TEST-PRV",
    "MAC-2026-TEST",
}


def gen_one() -> str:
    for _ in range(50):
        parts = ["".join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(3)]
        code = "-".join(parts)
        if PATTERN.match(code) and code not in BANNED:
            return code
    raise RuntimeError("50 次都没拿到合规码（极不可能）")


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    plan = sys.argv[2] if len(sys.argv) > 2 else "raw"

    if plan in ("plus", "pro"):
        for _ in range(n):
            code = gen_one()
            print(
                f"INSERT INTO public.redemption_codes (code, plan, months, expires_at, note, created_by) "
                f"VALUES ('{code}', '{plan}', 1, now() + interval '30 days', 'moyue-test', 'manager');"
            )
    else:
        for _ in range(n):
            print(gen_one())


if __name__ == "__main__":
    main()
