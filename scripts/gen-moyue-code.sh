#!/usr/bin/env bash
# gen-moyue-code.sh — 生成符合 Crockford 4-4-4 的墨阅兑换码（自带正则验证）
#
# 用法：
#   bash scripts/gen-moyue-code.sh           # 生成 1 个纯码
#   bash scripts/gen-moyue-code.sh 5         # 生成 5 个纯码
#   bash scripts/gen-moyue-code.sh 5 plus    # 生成 5 个 plus SQL
#   bash scripts/gen-moyue-code.sh 3 pro     # 生成 3 个 pro SQL
#
# 服务端校验：/api/redeem 用 INVITE_CODE_PATTERN
#   ^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$
# 字符表：0-9 A B C D E F G H J K M N P Q R S T V W X Y Z（去 I L O U）
# 格式：4-4-4（3 段，每段 4 字符，2 个连字符）
#
# 源：apps/readest-app/src/utils/invite.ts（INVITE_CODE_PATTERN）

set -euo pipefail
export LC_ALL=C

ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
COUNT=${1:-1}
PLAN=${2:-plus}

# 端到端验证码合规（用服务端同款正则）
verify() {
  node -e "
    const re = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}\$/;
    const ok = re.test(process.argv[1]);
    process.exit(ok ? 0 : 1);
  " "$1" 2>/dev/null
}

# 拒收历史错码（防止同样的字符串再生成出来）
BANNED=("TEST-MOYUE-PLUS" "M0Y1-PLUS-TEST" "2026-M0YU-NE9P" "MAC-TEST-PRV" "MAC-2026-TEST")

gen_one() {
  local code tries=0
  while :; do
    local part1 part2 part3
    part1=$(tr -dc "$ALPHABET" </dev/urandom | head -c 4)
    part2=$(tr -dc "$ALPHABET" </dev/urandom | head -c 4)
    part3=$(tr -dc "$ALPHABET" </dev/urandom | head -c 4)
    code="${part1}-${part2}-${part3}"
    tries=$((tries + 1))
    if (( tries > 50 )); then
      echo "ERROR: 50 次生成都没拿到合规码（极不可能）" >&2
      return 1
    fi
    # 必须通过正则 AND 不在 banned 列表
    if verify "$code"; then
      local banned_hit=0
      for b in "${BANNED[@]}"; do
        [[ "$code" == "$b" ]] && banned_hit=1 && break
      done
      (( banned_hit == 0 )) && { echo "$code"; return 0; }
    fi
  done
}

if [[ "$PLAN" =~ ^(plus|pro)$ ]]; then
  for _ in $(seq 1 "$COUNT"); do
    code=$(gen_one)
    echo "INSERT INTO public.redemption_codes (code, plan, months, expires_at, note, created_by) VALUES ('$code', '$PLAN', 1, now() + interval '30 days', 'moyue-test', 'manager');"
  done
else
  for _ in $(seq 1 "$COUNT"); do gen_one; done
fi
