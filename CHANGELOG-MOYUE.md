# CHANGELOG-MOYUE · 374 处改动可索引清单（已 commit 6 个）

> 索引所有 fork 改动，按**目的**分组。每组都标了：改了哪些路径、为什么改、review 时要看什么。
> **commit 状态**：base `main@4cbb2a2`；本地 6 个 commit 已落地（`14b2502` → `b28abed`），未 push；35 个 `src-tauri/icons/*` 改动未 commit。完整 diff 看 `git log 4cbb2a2..HEAD` / `git diff` / `git status`。

**统计**：原始 374 个路径 = 350 modified + 12 new + 12 deleted。`src/` 275、`src-tauri/` 54、`public/` 35、`docker/` 4、`apps/` 3、`.github` 1、根目录 `.env/.env.tauri` 2。commit 落地后 `git diff --stat 4cbb2a2..HEAD` = 380 files changed, 4526 insertions(+), 3806 deletions(-)。

---

## A. 品牌改名（墨阅 / Moyue，~130 处，0 致损测试）

> 核心：把 Readest 这个品牌词在用户可见的字符串中换成 墨阅（中文 UI）/ Moyue（拉丁/英文 UI），技术标识符换成 `moyue`/`com.moyue.app`/`moyue://`。

### A1. 技术身份
- **`tauri.conf.json`** — `productName`/`mainBinaryName` → `moyue`、`identifier` → `com.moyue.app`、deep-link `readest`→`moyue`、`readest-onedrive`→`moyue-onedrive`、CLI 描述 → `Moyue CLI`
- **`.env.tauri`** — `DBUS_ID=com.moyue.app`
- **`src-tauri/Info-ios.plist` + `Info.plist`** — URL scheme / `CFBundleURLName` / `iCloud.com.moyue.app` / NSUsageDescription 文案
- **`public/manifest.json`** — `name`/`short_name` → 墨阅、description 中文化
- **`apps/readest-app/.env` + `.env.tauri`** — 部署相关 key

### A2. 用户可见中文/英文文案
- **`src/utils/window.ts`** — `APP_NAME = '墨阅'`（窗口标题）
- **`src/app/layout.tsx`** — 标题/描述/template/appleWebApp 全中文化
- **`src/components/AboutWindow.tsx`** — h2 → 墨阅，版权 → `© 墨阅`
- **`src/components/localsend/LocalSendManager.tsx`** — LocalSend 设备名 → 墨阅
- **`src/app/reader/components/annotator/ExportMarkdownDialog.tsx`** — deeplink 显示文案
- **`public/locales/*/translation.json`** × 34 — `\bReadest\b` → `Moyue`；zh-CN/zh-TW 再转 `墨阅`（sl/uz/hu 含屈折形式同步改）

### A3. 深链 scheme 统一（**关键，运行时一致性**）
- **`src/utils/deeplink.ts`** — `url.protocol === 'readest:'` → `'moyue:'`（两处）；生成 `moyue://book/...` 与 `moyue://s/...` 注释+代码
- **`src/utils/share.ts`** — `parseShareDeepLink` 同改；`protocol === 'moyue:'`
- **`src/app/s/ShareLanding.tsx`** + **`src/app/s/page.tsx`** + **`src/utils/share.ts`** 注释 — `moyue://share/...`
- **`src/hooks/useClipUrlIngress.ts` / `useOpenAnnotationLink.ts` / `useOpenBookLink.ts` / `useOpenShareLink.ts` / `useOpenWithBooks.ts`** — `moyue://` 协议分发
- **`src/services/sync/providers/onedrive/microsoftOAuthConfig.ts`** — `ONEDRIVE_REDIRECT_SCHEME = 'moyue-onedrive'`（与 tauri.conf 同步）
- **`src/services/send/conversion/convertToEpub.ts`** — `stableIdentifier` 返回 `moyue:<djb2 hash>`（EPUB dc:identifier，**新品牌无历史数据，安全**）
- **`src/services/ai/providers/OpenRouterProvider.ts`** — `'X-Title': 'Moyue'`
- **测试同步**：`src/__tests__/services/sync/providers/oauth/parseRedirect.test.ts`、`onedrive/microsoftOAuthConfig.test.ts`、`src/__tests__/utils/deeplink*.test.ts`、`share.test.ts`、`note.test.ts`、`hooks/useOpenAnnotationLink.test.ts` 等同步替换
- **保留（不替换）**：`web.readest.com`/`cdn.readest.com`/`node.readest.com`/`api.readest.com`/`readest.chen-cn.top`（后端端点）；云同步 provider 内部 id `'readest'`（`cloudSyncProvider`/`IntegrationsPanel` 改了会断已存设置）；`DistChannel='readest'`（构建通道）；localStorage `readest:*` 键；数据目录 `Readest`（非用户可见 + 改涉及 capabilities/Rust 路径）

### A4. Tauri / Android 重生成
- **`src-tauri/gen/android/app/build.gradle.kts`** — namespace/applicationId → `com.moyue.app`
- **`src-tauri/gen/android/app/src/main/AndroidManifest.xml`** — deep-link scheme `moyue`/`moyue-onedrive`
- **`src-tauri/gen/android/app/src/main/res/values/strings.xml`** — `app_name`/`main_activity_title` → 墨阅
- **包目录** `com/readestcn/app` → `com/moyue/app`（含 buildSrc 的 `com/readestcn/app/kotlin`，源码全文 `com.readestcn.app`/`readestcn` → moyue）
- **图标资源保留**（未做） — icons/android 下 monochrome 等文件是 readestcn 状态保留
- **iOS 端未做** — gen/apple 待 iOS 签名方案确定后 `tauri ios init` 重生成

### A5. 测试同步（防止字面量对比断裂）
- 8 个数据目录测试 `layout`/`engine-sync-paths`/`engine-deletion-sync`/`node-app-service`/`web-app-service`/`webdav-delete`/`tts-pack-sync`/`cover-sync` 路径期望回退 `Moyue`→`Readest`（实现层数据目录保留 `Readest`）
- `window.test.ts` 期望 `'墨阅'`

---

## B. 邀约制登录（阶段 2，~30 处新增/删除/改）

> 核心：取消 GitHub/Apple/Google/Discord 登录；改为邮箱+密码+邀请码；邀约由 `ADMIN_EMAILS` 邮箱通过 API 生成。

### B1. 数据库（**全新迁移 023**）
- **`docker/volumes/db/migrations/023_invites.sql`** — `invites` 表（code/note/max_uses/used_count/status/expires_at/created_by）+ `invite_redemptions` 表（invite_id/user_id/email/redeemed_at），RLS + 两个 SECURITY DEFINER RPC：
  - `validate_invite(p_code text)` — 存在+有效+未超额
  - `claim_invite(p_code text, p_user_id uuid, p_email text)` — 条件 UPDATE 原子扣减（防并发+防重复领取），无匹配 → `{ok:false, reason:'invalid_or_exhausted'}`
  - `REVOKE` 匿名/authenticated；`GRANT EXECUTE TO service_role`

### B2. 工具与路由（**全新**）
- **`src/utils/invite.ts`** — Crockford base32 4-4-4 码（去 I/L/O/U 字符）+ I/L→1、O→0 解码的 `normalizeInviteCode`、`generateOrderNo` 同源（MOY+36 进制时间戳+8位随机 hex）、`parseAdminEmails`（支持全角 `；、 `）、`isAdminEmail`（ADMIN_EMAILS 门禁）
- **`src/app/api/auth/invite/signup/route.ts`** — 邀约注册：validate → `auth.admin.createUser({email_confirm:true})` → claim；失败回滚 `deleteUser`；错误码契约 `invalid_request` / `invalid_or_exhausted` / `email_exists` / `signup_failed`
- **`src/app/api/auth/invite/validate/route.ts`** — 轻量预检（表单即时反馈）
- **`src/app/api/auth/invite/admin/route.ts`** — `requireAdmin` Bearer+ADMIN_EMAILS 门禁，GET 列表（含 redemptions 聚合）+ POST 生成（5 次重试防 collision）
- **`src/__tests__/utils/invite.test.ts`** — 11 用例：生成格式/唯一性/规范化（含 Crockford）/管理员判定

### B3. 前端删 OAuth
- **删除** `src/app/auth/components/ProviderLogin.tsx` 整个文件
- **`src/app/auth/components/AuthPanel.tsx`** — 移除 4 个 ProviderLogin 按钮与 `onProviderSignIn` prop
- **`src/app/auth/page.tsx`** — 重写：移除 tauri-plugin-oauth/deep-link/appleIdAuth/nativeAuth/handleOAuthUrl 等所有 OAuth 流程；`getTauriRedirectTo` 简化为邮件回调
- **`src/app/auth/components/EmailPasswordAuth.tsx`** — 注册视图加 `inviteCode` 输入框（required、`autoCapitalize=characters`）；`signUpWithInvite` 走 `${getAPIBaseUrl()}/auth/invite/signup` → `signInWithPassword`；新增 `signupErrorToMessage` 错误码映射

### B4. 配置与 i18n
- **`docker/.env.example`** + **`docker/compose.yaml`** — 加 `ADMIN_EMAILS`
- **`public/locales/{zh-CN,zh-TW}/translation.json`** — 各 +7 键（邀请码字段、错误与欢迎文案）

### B5. 测试同步
- **删除** `src/__tests__/app/auth-page.test.tsx`（专为 ProviderLogin 写）
- **`src/__tests__/app/auth/auth-page-safe-area.test.tsx`** — 补 `getAPIBaseUrl` mock
- **`src/__tests__/app/auth/email-password-auth-autofill.test.tsx`** — 改写 sign_up 用例：mock `fetch('/api/auth/invite/signup')` + 邀请码字段

---

## C. 会员底座（阶段 3，~25 处改+2 个新文件）

> 核心：服务端直查档位（无 JWT plan claim）；配额按 plans/storage_usage 执行；客户端 `/api/user/plan` 拉数据。

### C1. 数据库（**全新迁移 024**）
- **`docker/volumes/db/migrations/024_billing.sql`** — `plans` 表（user_id PK FK auth.users, plan text CHECK IN ('free','plus','pro'), current_period_end, updated_at）+ `orders` 表（order_no UNIQUE, plan/months/amount_cents/currency/channel/provider/status/trade_no/notify_raw）+ 索引 + 3 个 SECURITY DEFINER RPC：
  - `mark_order_paid(p_order_no, p_trade_no, p_notify)` — 条件 UPDATE pending→paid（**幂等**），成功后 INSERT/UPDATE plans 续期
  - `get_user_plan(p_user_id)` — 到期 → `'free'`
  - `get_storage_usage(p_user_id)` — SUM(files.file_size)
  - 全部 `REVOKE` 公共 + `GRANT EXECUTE TO service_role`

### C2. 档位常量
- **`src/services/constants.ts`** — `DEFAULT_STORAGE_QUOTA` → 免费 100M / Plus 2G / Pro 5G；**新增** `MEMBERSHIP_PLANS` 数组（`MEMBERSHIP_INTERVAL='month'`、plus `productId=moyue.plus.monthly` price=1500 分、pro `moyue.pro.monthly` 3000 分、CNY）+ 类型导入

### C3. 服务端配额（**关键安全点，无 JWT plan claim 即可信任**）
- **`src/utils/plan.ts`** (新) — `getUserPlanData(userId)` 走 3 个并行查询（get_user_plan + get_storage_usage + plans 行 current_period_end）
- **服务端路由切换 JWT 解码 → 服务端直查**：
  - `src/pages/api/storage/upload.ts` — `getStoragePlanData(token)` → `await getUserPlanData(user.id)`
  - `src/pages/api/storage/stats.ts` — 同上，usage 改为 `totalSize`（DB 真相，JWT usage 弃用）
  - `src/app/api/share/[token]/import/route.ts` — 同上
  - `src/pages/api/deepl/translate.ts` — `getSubscriptionPlan(token)` → `await getUserPlanData(user.id).plan`；`checkDailyUsage`/`updateDailyUsage` 签名从 `token` 改 `plan`；`getDailyTranslationPlanData` 改 `getTranslationQuota(plan)`
  - `src/pages/api/send/address.ts` — `getUserProfilePlan(token)` → `await getUserPlanData(user.id).plan`
  - `src/pages/api/send/senders.ts` — 同上

### C4. 客户端接口
- **`src/app/api/user/plan/route.ts`** (新) — GET → auth → `getUserPlanData` → `{plan, usage, quota, currentPeriodEnd}`
- **`src/hooks/useQuotaStats.ts`** — 大改：从 JWT 解码改异步拉 `/api/user/plan`（带 `cancelled` 防竞态 + 错误日志）；`setCachedUserPlan` 用服务端值

### C5. 测试
- **`src/__tests__/utils/plan.test.ts`** (新) — 4 用例：plus 档 bigint→number、无 plans 行回退 free、RPC 报错不抛出、pro 档配额
- `src/__tests__/api/storage-upload-*.test.ts` (3 个) — 补 `vi.mock('@/utils/plan')`
- `src/__tests__/services/send-address-plan-gate.test.ts` — 从 `getUserProfilePlan` mock 改 `getUserPlanData` mock，12 测试全过

---

## D. 易支付接入（阶段 4，~15 处新增/改）

> 核心：易支付协议纯函数库 + 4 路由 + UI 渠道选择 + 运行时配置。

### D1. 库（**全新**）
- **`src/libs/payment/epay.ts`** — 纯函数：MD5 签名（过滤 sign/sign_type/空值→ASCII 排序→拼 `&key`→小写 hex）、`buildEpayPayUrl`（对**原始值**签名、URLSearchParams 编码查询）、`verifyEpayNotify`（只强制 `sign`+`out_trade_no`——submit.php 本就不带 trade_status）、`isEpayTradeSuccess`、`formatEpayMoney`、`generateOrderNo`（MOY+36 进制时间戳+8位随机）、`getEpayConfig`（env 缺失则 `null`，调用方 503）
- **`src/__tests__/libs/payment/epay.test.ts`** — 11 用例：金额格式化、签名确定性/排除/密钥敏感性、URL 构建与回环验签、notify 验签（合法/篡改/异密钥/缺字段）、TRADE_SUCCESS 判定、订单号唯一性

### D2. 路由（**全新，资金路径**）
- **`src/pages/api/pay/create.ts`** — POST {plan, channel} → 鉴权 → epay 配置缺失 503 → 校验 → 建 pending `orders` 行（months=1、amount_cents 取 `MEMBERSHIP_PLANS`）→ `buildEpayPayUrl` → `{orderNo, payUrl, amountCents}`；渠道映射 `wechat→wxpay`；`PAY_SITE_URL`/`API_BASE_URL`/`NEXT_PUBLIC_SITE_URL` 三级回退
- **`src/pages/api/pay/notify.ts`** — **资金路径**：验签失败 400 'fail'；非 TRADE_SUCCESS 仅 ack 'success' 不记账；订单存在性 + 纵深防御（status 必须 pending 且签名金额与订单 amount_cents **分毫不差**）→ `mark_order_paid` RPC 幂等落账 → 字面量 'success'/'fail'
- **`src/pages/api/pay/return.ts`** — 同步跳转验签 → 302 `/user?payment=success&orderNo=…` 或 `?payment=failed`（仅 UX，notify 才是真相）
- **`src/pages/api/pay/query.ts`** — GET ?orderNo= → 限本人订单查询（防跨用户探测）

### D3. 运行时配置（**关键架构决策**）
- **`src/services/runtimeConfig.ts`** — `ReadestRuntimeConfig` 加 `paymentProvider?: string`；`getServerRuntimeConfig()` 读 `PAYMENT_PROVIDER ?? NEXT_PUBLIC_PAYMENT_PROVIDER`
- **`src/app/runtime-config.js/route.ts`**（未改） — 把 config 注入 `window.__READEST_RUNTIME_CONFIG`
- **`src/hooks/useAvailablePlans.ts`** — 加 epay 分支：调用时 `getRuntimeConfig()?.paymentProvider === 'epay'` 则用 `MEMBERSHIP_PLANS` 常量，跳过 fetchStripePlans
- **`src/app/user/page.tsx`** — `isEpayProvider` 在组件内调用时计算（**避免 SSR 时 window 为 undefined**）；`handleEpaySubscribe` 打开渠道选择；`handleEpayPay` POST create → 桌面 `openUrl`（动态 import `@tauri-apps/plugin-opener`） / 其余 `location.href` 跳网关；支付回跳轮询 effect（10 次×2s）→ paid → success toast + reload；`handleManageSubscription` epay 分支提示「请联系管理员」；onSubscribe 三分发（IAP / epay / stripe）；渠道选择 daisyUI 弹窗

### D4. 配置与 i18n
- **`docker/.env.example`** + **`docker/compose.yaml`** — `PAY_GATEWAY_URL/ID/KEY`、`PAY_SITE_URL`、`PAYMENT_PROVIDER`（gateway 空 = 支付关闭）
- **`public/locales/{zh-CN,zh-TW}/translation.json`** — 各 +8 键（选择支付方式/每月/微信支付/支付宝/支付成功/确认中/未完成/联系管理员）

---

## E. 阶段 5 · 书源（**无新代码**，既有架构复用）

> 桌面/移动的书源 = 内置 OPDS 目录浏览器（`/opds` 页），已含浏览/搜索/下载/自动导入、用户名密码与自定义 Header 鉴权、4 个合法预设（Project Gutenberg/Standard Ebooks/ManyBooks/Unglue.it）+ 无限自定义书源。KOReader 用核心自带 OPDS 即可（`apps/readest.koplugin` 不重复造轮子）。**不搭 ZLibrary 镜像**（红线，写入《墨阅项目规则.md》）。

---

## F. 文档与工作日志（本目录）
- `README.md` — 接手人速览（本文件）
- `墨阅项目规则.md` — 品牌/产品/技术约定 + 红线
- `墨阅改名记录-20260902.md` — 阶段记录 + 部署实录
- `DEPLOY.md` — 运维速查
- `CHANGELOG-MOYUE.md` — 本索引
- `实例搭建记录-20260831.md` / `服务部署日志-20260901.md` / `封包记录-20260901.md` — 历史背景（未改）

---

## G. 删除/有意保留的清单（review 时重点看）

### G1. 删了的 12 个文件
- `src/app/auth/components/ProviderLogin.tsx` — OAuth 登录按钮组件
- `src/__tests__/app/auth-page.test.tsx` — ProviderLogin 专属测试
- `src-tauri/gen/android/.../com/bilingify/readest/MainActivity.kt` — 重命名了包目录
- 9 个 Android monochrome 启动图标 + automotive_app_desc.xml + KeyLearnCaptureTest.kt — **readestcn 状态的遗留**（gen/android 待 `tauri android init` 整体重生成时删/重做）

### G2. 有意保留
- **数据目录 `Readest`**：非用户可见，改名需同步 capabilities/default.json + tauri.conf.json assetProtocol + Rust `dir_scanner.rs`/`transfer_file.rs` 的 `contains("Readest")` 路径检查，风险高
- **云同步 provider 内部 id `'readest'`**：`services/sync/cloudSyncProvider.ts` 等；改会断已存设置
- **`DistChannel='readest'`**：构建通道名
- **localStorage `readest:*` 键**（`lastImportFolder` 等）：刷新键改动无业务收益
- **com.readest.fb2/com.readest.cbz UTI**：文件类型标识符
- **`STORAGE_FIXED_QUOTA=209715200` 服务端 env**：新 `/api/user/plan` 不再依赖，留着无害（legacy JWT 路径也无调用方）
- **stripe/IAP 旧代码**（`libs/payment/stripe|iap|storage.ts`）：托管版 schema（`plans.id`/`storage_purchased_bytes`）与我们 020（`plans.user_id`）**不兼容**，待处置（移除/隔离）

### G3. 客户端显示层遗留（**已修，commit `b28abed`**）

> 2026-09-04 ~ 09-07 间已修；本节保留作为"修法参考"备查。
- ~~`src/components/settings/integrations/SendToReadestForm.tsx:74` — `getUserProfilePlan(token)` 改异步 `fetch /api/user/plan`~~ ✅
- ~~`src/services/translators/providers/deepl.ts:41` — 同上~~ ✅

### G4. 6 个 commit 落地索引（2026-09-04 ~ 09-07）

| Commit | 标题 | 阶段 | 文件数 / 行数 |
|---|---|---|---|
| `14b2502` | chore: rename brand from Readest to Moyue (墨阅) | 阶段 1 | A 节 ~130 处 |
| `c07044f` | feat(auth): invite-only email signup with Crockford invite codes | 阶段 2 | B 节 ~30 处 |
| `8b36c9c` | feat(billing): server-side membership plans with /api/user/plan | 阶段 3 | C 节 ~25 处 |
| `d935ef2` | feat(payment): epay (易支付) integration with runtime config | 阶段 4 | D 节 ~15 处 |
| `0c725b7` | chore(deploy): env, compose, koplugin, and windows workflow | 部署 | env/compose/windows workflow |
| `b28abed` | fix(client): resolve plan from /api/user/plan in 2 display-layer sites | 显示层修复 | 2 文件 |

**总计**：`git diff --stat 4cbb2a2..HEAD` = 380 files changed, 4526 insertions(+), 3806 deletions(-)。

**未 commit 残留**：35 个 `src-tauri/icons/*` 改动（中途替换未收回，等 N02 一次性吸收）。

---

## H. 给 review 者的指引

1. **服务端安全**：看 `src/utils/plan.ts` 与 4 个 pay 路由的 `verifyEpayNotify`+`mark_order_paid`+金额比对 → 是资金路径核心
2. **品牌一致性**：搜 `readest://`（应无）/ `moyue://`（应）/ `url.protocol === 'readest:'`（应无）
3. **环境变量**：搜 `NEXT_PUBLIC_PAYMENT_PROVIDER` 应无（`PAYMENT_PROVIDER` 经 runtimeConfig 注入）；`SUPABASE_ADMIN_KEY` 仅在 server route
4. **测试基线**：`pnpm test` 跑全量应稳定 **44 失败 = 预存**，**改名致损失败 = 0**
5. **服务端迁移 023+024**：SQL 中 `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` 必须存在；`isUserPlan(...)` / 配额默认值写在 `constants.ts`

---

## I. 新文件清单（12 个）

```
.github/workflows/build-windows.yml                                # 跨平台打包
apps/readest-app/src/__tests__/libs/payment/epay.test.ts            # 易支付 11 测试
apps/readest-app/src/__tests__/utils/invite.test.ts                 # 邀请码 11 测试
apps/readest-app/src/__tests__/utils/plan.test.ts                   # 服务端档位 4 测试
apps/readest-app/src/app/api/auth/invite/{admin,signup,validate}/route.ts  # 3 邀约路由
apps/readest-app/src/app/api/user/plan/route.ts                     # 客户端档位接口
apps/readest-app/src/libs/payment/epay.ts                           # 易支付纯函数
apps/readest-app/src/pages/api/pay/{create,notify,query,return}.ts  # 4 支付路由
apps/readest-app/src/utils/invite.ts                                # 邀请码工具
apps/readest-app/src/utils/plan.ts                                  # 服务端档位查询
docker/volumes/db/migrations/023_invites.sql                        # 邀约注册
docker/volumes/db/migrations/024_billing.sql                        # 会员计费
```

---

## J. 兑换码支付（2026-09-07~08，N08）

> **N08 方案变更**：从原计划"接易支付/YunGouOS 第三方支付"改为"完全绕开第三方支付，走兑换码"（详见 `项目主控.md` ADR-2026-09-07-02 + `需求-N08-兑换码支付.md`）。
>
> **核心思路**：资金流走闲鱼/微信/支付宝（买家↔卖家直接转账），墨阅不参与；价值路径走兑换码 → 服务端校验 → 写 `plans` 表。0% 费率 / 0 开户费 / 0 合规风险（不碰资金流）。

### J1. 数据库（**新迁移 025**）
- **`docker/volumes/db/migrations/025_redemption_codes.sql`** — `redemption_codes` 表（10 列：code PK / plan CHECK ∈ {plus, pro} / months CHECK > 0 / status CHECK ∈ {active, redeemed, expired, revoked} / redeemed_by FK→users / redeemed_at / expires_at / note / created_by / created_at + PK + 2 索引 + 1 FK + RLS enabled）+ `redeem_code(p_code text, p_user_id uuid) RETURNS json` RPC（plpgsql + SECURITY DEFINER + FOR UPDATE 行锁 + 续期/起算 plans + 懒标 expired + REVOKE 公共 + GRANT service_role）

### J2. 工具与路由（**新**）
- **`src/utils/redemption.ts`** — Crockford 兑换码生成/规范化 + 错误码枚举 + plan 类型
- **`src/app/api/redeem/route.ts`** — POST 调 RPC；Crockford 规范化 + `INVITE_CODE_PATTERN` 校验；错误码透传 400/500
- **`src/app/api/admin/redemption-codes/route.ts`** — GET 列表 + redeemed_by_email 关联 profiles 表；POST 生成器 1-100 个码 + 碰撞重试 + `ADMIN_EMAILS` 门禁（仿 `/api/auth/invite/admin`）

### J3. 客户端 UI
- **`src/app/user/page.tsx`** — PlansComparison 下方新增 `RedemptionCard.tsx`：调用 `/api/redeem` + 4 错误 toast + 成功 toast 显示 plan 名+月数 + 自动 refresh plan stats（`useQuotaStats` 暴露 `refresh` 避免整页 reload）
- **`public/locales/{zh-CN,zh-TW}/translation.json`** — 各 +11 键

### J4. 测试
- **`src/__tests__/utils/redemption.test.ts`** — 4 个 Crockford 兑换码生成/规范化
- **`src/__tests__/api/redeem.test.ts`** — 8 个 /api/redeem 路由
- **`src/__tests__/api/admin-redemption-codes.test.ts`** — 8 个 /api/admin/redemption-codes 路由
- **总计 20 个新单测**，全部通过

### J5. 部署
- 镜像 `readest-moyue:latest`（565MB）已重打，`up -d client` 25s 健康
- 服务器迁移 025 已应用（applied_at 2026-09-07 08:36:04 UTC）

### J6. 端到端验证（5 场景全过）
1. 正常兑换 `E2E0-P9AS-1M0N` → `{ok:true, plan:plus, monthsAdded:1, currentPeriodEnd:2026-10-07}` + `/api/user/plan` 立即返回 `plan:plus, quota:2GB`
2. 重复兑换 → `400 already_used_or_invalid`
3. 未知 Crockford 合法码 → `400 invalid_code`
4. 短码 `shrt` → `400 invalid_code`
5. 无 auth → `403`

### J7. 4 个新文件清单（接续 I 节）
```
docker/volumes/db/migrations/025_redemption_codes.sql                # 兑换码表 + redeem_code RPC
apps/readest-app/src/utils/redemption.ts                             # Crockford 兑换码工具
apps/readest-app/src/app/api/redeem/route.ts                         # 用户兑换路由
apps/readest-app/src/app/api/admin/redemption-codes/route.ts         # 管理员生成/列表路由
apps/readest-app/src/components/user/RedemptionCard.tsx              # /user 页兑换码卡（+ 新增于 289d026）
apps/readest-app/src/__tests__/utils/redemption.test.ts              # 4 测试
apps/readest-app/src/__tests__/api/redeem.test.ts                    # 8 测试
apps/readest-app/src/__tests__/api/admin-redemption-codes.test.ts    # 8 测试
```

### J8. epay 代码处理
- **保留** `src/libs/payment/epay.ts` + 4 路由（已 commit `d935ef2`）—— 未来切 YunGouOS 可复用框架，本节点不动
- **不调用**：当前 `PAY_GATEWAY_*` 留空，epay 路由对登录用户回 503（运行时无副作用）
- 业务侧完全走 N08 兑换码路径

### J9. N08h 兑换深链入口补全（2026-09-08，commit `2f9727d`）
- **背景**：N08a-g 完成后审计发现只有 `/user` 页 RedemptionCard 一个入口；卖家发 `https://readest.chen-cn.top/redeem?code=…` 链接或桌面 `moyue://redeem/…` 深链会 404 / 无响应
- **`apps/readest-app/src/app/redeem/page.tsx`**（**新**，~50 行 client 组件）：未登录 `router.replace('/auth?redirect=/redeem?code=…')`；已登录 `router.replace('/user?redeem=…')`；2s 后显示 fallback 重试链接（防 auth state 水合慢 stuck）
- **`parseRedeemDeepLink`**（`src/utils/deeplink.ts` 加）：解析 `moyue://redeem/{code}` → `{ code }`
- **`apps/readest-app/src/hooks/useOpenRedeemLink.ts`**（**新**，~80 行 Tauri-only hook）：订阅 `app-incoming-url` + cold-start 调 `getCurrent()` + sessionStorage 防冷启动重投；mount 在 `/library` 页面
- **`RedemptionCard.tsx`** 加 `initialCode?` prop + inputRef + `useEffect` auto-focus
- **`src/app/user/page.tsx`** 读 `?redeem=` + scrollIntoView + 把 `initialCode` 传下去
- **`useClipUrlIngress.ts`** 加 `moyue://redeem/` 早返（防误拦截 article-clip 路径）
- **`public/locales/{zh-CN,zh-TW}/translation.json`** 各 +2 键（`Redirecting…` + `Click here if you are not redirected automatically.`）
- **测试 +10**（6 deeplink + 4 redeem-page）

### J10. N08h 端到端验证
1. `GET /redeem?code=ABCD-EFGH-JKMN` HTTP 200 / 34KB HTML（i18n 在 client hydration 后出 "Redirecting…"；curl 抓不到 client 跳转，需浏览器实测）
2. `GET /user?redeem=ABCD-EFGH-JKMN` HTTP 200 / 35KB HTML（同上）
3. invite 码注册新用户 → SQL 插 `N08H-P9AS-1M0N` → `POST /api/redeem` → `{ok:true, plan:plus, monthsAdded:1}` → `GET /api/user/plan` 立即返回 `plan:plus, quota:2GB` ✅

---

## K. Android 打包出包（2026-09-08，N05）

> **节点说明**：N05 出包阶段无代码 commit（fork 状态 11 个 commit 已落地，N02 之后无新代码改动），但有 2 项**生产配置**变更 + 1 项**过程事故**值得在 CHANGELOG 留痕。改动文件 `keystore.properties` 在 `apps/readest-app/.gitignore:62 src-tauri/gen` 范围内，**不进 git**。

### K1. 签名配置切到 moyue.keystore

- **`apps/readest-app/src-tauri/gen/android/keystore.properties`**（**gitignored**，不进 git）从 `readestcn.keystore` 配置切到 moyue 配置：
  - `storeFile=/Users/chenzhiqing/Documents/MyVault/Keys/moyue.keystore`
  - `keyAlias=moyue`
  - `password=<强密码 32 字符，存 1Password moyue/keystore>`
- **`~/Documents/MyVault/Keys/.env.moyue`**（**仓库外**，chmod 600）— 备份密码 `MOYUE_KEYSTORE_PASSWORD=<同上>`；build 命令前可 `set -a; source ~/Documents/MyVault/Keys/.env.moyue; set +a` 注入
- **`apps/readest-app/src-tauri/gen/android/app/build.gradle.kts`** **未改**（已用 properties 驱动设计，commit 14b2502 已 force-add；改 build.gradle.kts = 改架构，本次不动）

### K2. 过程事故：keystore 密码错填 GitHub PAT

- **事故**：用户初次跑 `/tmp/moyue-fill-pwd.zsh`（read -s 隐藏输入脚本）填密码时，从 1Password 错把 `github_pat_11CNZ2FNA0TKGfs...`（fork 推送用的 PAT）填到了 keystore 密码位
- **检测**：`keytool -list -keystore moyue.keystore -storepass ...` 报 `keystore password was incorrect`
- **决策**：用户选 C 方案（**重生成 keystore**，因未发布过零影响；A=重跑脚本 / B=手动改文件 / C=重生成）
- **执行**：
  - 备份旧 `moyue.keystore` → `moyue.keystore.wrong-20260908.bak`（保留作"曾错填"的痕迹）
  - `python3 -c "import secrets; print(secrets.token_urlsafe(24))"` 生成 32 字符强密码
  - `keytool -genkeypair -keystore moyue.keystore -alias moyue -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Moyue,OU=App,O=Moyue,L=Beijing,ST=Beijing,C=CN"`
  - 同步重写 `keystore.properties` + `.env.moyue` + 备份新 keystore → `moyue.keystore.bak`
- **风险**：
  - 错填的 PAT 在 bash 输出 + keystore.properties + .env.moyue 三处出现；**用户应去 https://github.com/settings/tokens 评估该 PAT 是否需要 revoke**（特别是若它是 active 的）
  - 重生成 keystore 零影响（fork 未发布过任何 APK，旧 keystore 也没人引用）

### K3. 产物

- **APK 路径**：`apps/readest-app/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
- **大小**：**79MB**（82393045 bytes；aarch64 + armv7 + x86 + x86_64 全 ABI universal APK；非 split-by-abi）
- **包含**：classes.dex（3.3MB）+ lib/arm64-v8a/libreadestlib.so（75MB native Tauri + foliate-js + 14 tauri-plugin + 5 本地 plugin + Readest 业务代码）
- **构建时长**：cargo 2m 26s + tauri 1m 53s + gradle ~3 min（含下载依赖首次跑 + aapt2 + R8 优化）

### K4. 签名验证（apksigner v2 scheme）

- **命令**：`apksigner verify --verbose --print-certs app-universal-release.apk`
- **结果**：
  - v1 (JAR signing) = false
  - **v2 (APK Signature Scheme v2) = true ✅**
  - v3 = false（gradle 8 默认不开 key rotation）
  - Number of signers = 1
  - **Signer #1 certificate DN = `CN=Moyue, OU=App, O=Moyue, L=Beijing, ST=Beijing, C=CN`**
  - Signer #1 certificate SHA-256 = `a48f59e36f005864fbf3b19394000dc9512b2323af7e7956955132cb0cdeecc9`（与 `keytool -list` 输出完全一致）
  - Signer #1 key = RSA 2048-bit
- **结论**：签名配置正确切到 moyue.keystore，APK 可分发

### K5. 未验证项（残留）

- **adb install + 启动 + 登录走通 + 兑换码 e2e**：本机无 Android 设备/模拟器（`adb devices` 空），未跑真机/模拟器回归测试
- **依赖路径**：
  - 用户需在 Android 设备/模拟器上跑 `$ANDROID_HOME/platform-tools/adb install -r app-universal-release.apk`
  - 启动后走通登录（输入 `CHEN-CZQ7-KMNP` 邀请码 + 邮箱注册）
  - 兑换码系统走 N08 端到端 5 场景（同 web 端）
- **完成 N05 节点基线**（项目主控 N05 验证基线 = "真机/模拟器安装、启动、登录走通"中的"安装+启动"=出包即满足；"登录走通"=真机实测责任移交用户）

### K6. 产物清理

- 旧 `moyue.keystore.wrong-20260908.bak` + `moyue.keystore.wrong-20260908.bak.bak` **保留**（不删），作为"曾错填 GitHub PAT"的可审计痕迹
- 新 `moyue.keystore.bak` 是与现役 `moyue.keystore` SHA-256 一致的二次备份（防 keystore 丢失 = 永远无法升级现有用户）
