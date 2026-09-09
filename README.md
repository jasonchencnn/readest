# 墨阅（Moyue）· 接手人速览

> 5 分钟看懂全貌，10 分钟定位到你要改的代码。

## 一、是什么

**墨阅 = Readest 的中国定制版 fork**。Readest 是开源电子书阅读器（EPUB/PDF/多端同步），原仓在 `readest/readest`。我们的 fork 把品牌、登录、计费、书源全链路做成本地化版本，部署在 Oracle Cloud ARM 实例 + 官方 Supabase 自托管。

**已上线**：`https://readest.chen-cn.top`（邀约制注册 + 100MB 免费档已工作；支付通道未开通，等易支付商户号）。

**当前代码状态**：5 大阶段全部完成，部署完成并通过端到端验证，**本地已 6 个 commit 落地**（改名 / 邀约 / 计费 / 支付 / 部署 / 显示层修复），尚未 push 到 origin；**35 个图标资源改动未 commit**（等 N02 一次性吸收）。详见 `项目主控.md` 节点 N00–N09。

## 二、关键位置

| 关注点 | 位置 |
|---|---|
| **本工作目录** | `~/Documents/MyVault/Projects/实例/`（本目录） |
| **fork 源码** | `~/Documents/MyVault/Projects/readest/readest`（未提交） |
| **服务器** | `ssh oracle`（Cloudflare Tunnel，`sudo` 才能 docker） |
| 服务器源码 | `~/readest`（官方 clone d49fd8b）+ `~/readest-fork`（rsync 副本，用于构建镜像） |
| 部署目录 | `~/readest/docker/` |
| 容器 | `readest-client` / `supabase-auth` / `supabase-rest` / `supabase-kong` / `supabase-db` / `readest-minio` |

**本目录文档**（按重要性排）：

1. **本文件（README.md）** — 5 分钟速览
2. `墨阅项目规则.md` — 品牌身份、改名清单、产品规格、技术约定、**所有红线**（必读）
3. `墨阅改名记录-20260902.md` — 阶段记录 + 部署实录 + 待办（**MiniMaxcode 上手第一份要读的**）
4. `DEPLOY.md` — 服务器运维速查（迁移、env、镜像、回滚、邀请码）
5. `CHANGELOG-MOYUE.md` — 374 处改动的可索引清单（按模块/路径/用途）
6. `实例搭建记录-20260831.md` / `服务部署日志-20260901.md` / `封包记录-20260901.md` — 历史背景

## 三、代码仓库速览

fork 在 `~/Documents/MyVault/Projects/readest/readest/`，**5 大新模块 + 1 个新部署包**：

```
apps/readest-app/
├── src/
│   ├── app/api/auth/                     # 【新】邀约登录：3 个路由
│   │   ├── invite/signup/route.ts          # validate → admin.createUser → claim
│   │   ├── invite/validate/route.ts        # 轻量预检
│   │   └── invite/admin/route.ts           # Bearer + ADMIN_EMAILS 门禁
│   ├── app/api/user/plan/route.ts        # 【新】客户端唯一的档位真相
│   ├── app/auth/                          # 【大改】删 OAuth 全链路 + 加邀请码表单
│   ├── app/user/                          # 【改】订阅 UI 接 epay 流程
│   ├── libs/payment/epay.ts              # 【新】易支付纯函数库
│   ├── pages/api/pay/                     # 【新】4 路由：create/notify/return/query
│   ├── services/runtimeConfig.ts          # 【改】+ paymentProvider 运行时注入
│   ├── services/environment.ts
│   ├── utils/plan.ts                      # 【新】服务端档位查询（无 JWT）
│   ├── utils/access.ts                    # 【改】getUserPlanData 替代 JWT 解码
│   ├── utils/invite.ts                    # 【新】Crockford 邀请码工具
│   ├── utils/deeplink.ts, share.ts        # 【改】moyue:// 协议统一
│   ├── services/send/conversion/convertToEpub.ts  # 【改】moyue: identifier
│   ├── components/AboutWindow.tsx         # 【改】墨阅版权
│   ├── components/localsend/LocalSendManager.tsx # 【改】墨阅设备名
│   └── hooks/useQuotaStats.ts             # 【大改】拉 /api/user/plan 替代 JWT
├── src-tauri/
│   ├── tauri.conf.json, .env.tauri        # productName=moyue, identifier=com.moyue.app
│   ├── Info-ios.plist, Info.plist         # moyue:// scheme + iCloud 容器
│   └── gen/android/                       # 重生成待做（图标换好后）
├── public/locales/                        # 34 个语言包：Readest→Moyue，zh-*→墨阅
└── __tests__/
    ├── utils/invite.test.ts, plan.test.ts # 【新】
    ├── libs/payment/epay.test.ts          # 【新】
    ├── api/                               # 6 个老测试：补 @/utils/plan mock
    ├── services/send-address-plan-gate.test.ts # 【改】从 access→plan mock
    └── app/auth/email-password-auth-autofill.test.tsx # 【改】接新流程
docker/
├── volumes/db/migrations/
│   ├── 023_invites.sql                    # 【新】+ 023_invites.sql — invites/RPC
│   └── 024_billing.sql                    # 【新】— plans/orders + 3 RPC
├── .env.example                            # 【改】+ ADMIN_EMAILS, PAY_*
└── compose.yaml                            # 【改】client 服务透传新 env
.github/workflows/build-windows.yml        # 【新】
```

## 四、立即可做

按紧迫度排：

1. **`墨阅改名记录-20260902.md` 第四节**（服务器部署实录）—— 验证清单与剩余事项
2. **DEPLOY.md** —— 任何服务端操作前必看
3. **CHANGELOG-MOYUE.md** —— review 改动或定位 bug 时用

## 五、当前未做的（接手人候选任务）

> 详细任务表见 `项目主控.md`（节点 N01–N09，含依赖、验证基线、会话 SOP）。这里是摘要：

- **N01–N02 图标 + 重生成**：墨阅图标（1024px）→ `pnpm tauri icon` + `tauri android init` 重生成（吸收 35 个未 commit 资源）
- **N03–N06 三端打包**：Mac / Windows / Android / iOS 打包（iOS 需苹果开发者账号）
- **N07 仓库收尾**：6 个 commit push 到 origin + 替换 `readestcn.keystore` 为 `moyue.keystore`
- **N08 支付通道开通**：易支付商户号办下后填 `PAY_GATEWAY_URL/ID/KEY` → 1 分钱真单端到端
- **N09 合规补办**：个体户执照 + APP 备案 + 官方直连支付（商业化前置）
- **遗留清理**（低优先）：stripe/IAP 旧代码处置、邀请码管理 UI

## 六、沟通要点（让 MiniMaxcode 立刻上手的几条不变量）

1. **数据目录**保持 `Readest`、`com.bilingify.readest` 风格的包名、`READEST_UPDATER_FILE` 等内部标识符**有意保留**——改它们要同步改 capabilities + Rust 路径检查，风险大，先记再动
2. **深链 scheme 是 `moyue://`**（不是 `readest://`）——任何生成/解析 URL 的代码必须用 `moyue:`，新代码别用 `readest:`/`readest://`（有 lint 习惯但无强制）
3. **服务端配额强制**：唯一执行点是服务端 `getUserPlanData`（utils/plan.ts），客户端**不能**信任 JWT 里的 plan——自托管 GoTrue 没 plan claim
4. **易支付是个人收款码合规灰区**，正式收费前建议补个体户执照走官方直连
5. **OPDS 书源**：桌面/移动用 Readest 自带 `/opds` 页（已有 4 个合法预设 + 自定义添加）；KOReader 用核心自带 OPDS；**不搭 ZLibrary 镜像**（红线）
6. **测试基线**：`pnpm test` 全量 44 失败 = 预存 fork 状态问题（updater 的 `UPDATES_DISABLED`、themed-icon/android-auto 的 readestcn 遗留 gen、yomitan/novel/dictionaries/libs-document/series/document-loader 的基线失败），**改名致损失败为 0**。任何 commit 都应保持 44 不变。
