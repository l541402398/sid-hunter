# S-ID：年终生存战

像素办公室社交推理游戏，含两个可运行版本：

- `demo/` —— 离线试玩版（单人对 19 名本地模拟玩家，无网络、不存档）
- `online/` —— 局域网联机版（服务端权威：位置、技能、探索、转盘、猜拳、互动、计分与结束判定全部在服务端计算）

两版共用同一份地图与规则文件 `online/shared/world.js`（服务端与浏览器都能加载），并共用浏览器场景绘制文件 `online/shared/scene.js`。

> **本轮状态（2026-10-14）**：真实素材（Kenney 系列 / lumimae / cwendeku 为 CC0；Antea、OGA 为 CC-BY 须署名）、双侧独立电梯厅，以及“七层世界主题”均已集成；独立验收 **17 项 17/17 全部通过**（其中 1 项以实时画面像素判定替代 blit 计数，详见 `design/CHANGELOG-真实素材与独立电梯厅.md` §8.8）。整体仍处**验收中，未发布**，本文件下方旧测试与部署记录属历史记录。未 commit、push、deploy，未重启既有 8787 实例。第三方署名见本文末“第三方素材署名”。

## 运行

离线试玩：直接打开 `demo/index.html` 即可（需要 `online/shared/world.js`、`online/shared/scene.js` 与 `online/public/assets/vendor/` 在场，目录结构不要拆散；图片从本地相对路径加载）。

联机版：

```bash
# 本轮验收必须另选空闲回环端口，勿占用或重启现有 8787
HOST=127.0.0.1 PORT=8788 SID_SSO=0 node online/server.js
# 浏览器访问 http://127.0.0.1:8788/
# SID_SSO=0 仅用于本地昵称试玩，正式环境不要沿用
```

要求 Node.js 22+。第一位加入者是坏人，其后全部是好人；主持人/开发重置仅在本机开发开关下可用。

## 目录

| 路径 | 说明 |
| --- | --- |
| `online/shared/world.js` | 共享地图、家具足迹与深度、遮挡、NPC、容器、电梯厅/玻璃门/楼层选项，以及全部可调参数（`PLAY_CONFIG` / `WHEEL` / `SCORE` / `RULES`） |
| `online/shared/scene.js` | 两版共用的图片加载、地板瓦片/家具绘制、电梯厅与玻璃门动画；不替代服务端碰撞与规则 |
| `online/public/assets/vendor/` | 已下载的真实素材：Kenney 两包（CC0）、Antea 一包（CC-BY，需署名），各自带来源/许可文件（Kenney `source.json`+`License.txt`；Antea `LICENSE.txt`），运行版本须一起保留 |
| `online/room.js` | 权威房间：移动、技能、探索、转盘、猜拳、J 互动、计分、结束判定与投影，并存上一局结算快照 `lastResult` |
| `online/manager.js` | 公网管理控制台：授权码登录、会话/CSRF、登录限流、上局排名读取、一键开新局 |
| `online/server.js` | HTTP/SSE 服务、鉴权、开发管理接口、管理控制台路由、20Hz 快照调度 |
| `online/public/` | 联机客户端（渲染、名单/日志、私密面板、转盘弹窗、排行榜与结算） |
| `online/public/manager.*` | 管理控制台页面 `/manager`（授权码登录、上局排名、开始下一局） |
| `demo/` | 离线试玩客户端（同一套玩法在本地模拟） |
| `outputs/` | 本地验收产物（截图、验收记录、试玩副本与源码包），已由 `.gitignore` 排除，不入库 |

## 玩法与操作

`WASD` / 方向键移动，`E` 就近打开玩家交互菜单、容器或 NPC 互动，`J` 攻击（无伤害）。点击角色或名单查看公开档案，靠近玩家后可在菜单选择「邀请猜拳」；「线索背包」查看自己的筹码与线索，「排行榜」查看分数与结束条件，「我的信息」点击后显示。

## 游戏设计：单局连续对局

**已取消“局数”概念**：整个活动是一局，直到满足结束条件为止。转盘等行为不再有“每局一次”的限制。

### 结束方式（仅三种）
1. **存活人数淘汰至剩余 100 人**（`RULES.endRemainingPlayers`；仅当房间总人数大于该值时判定，小房间不会因此提前结束）。
2. **坏人全灭**（曾有坏人且当前存活坏人为 0）。
3. **时间到**（`RULES.timeLimitMs` 默认 2 小时）。

其中②③会按分数产出结算排名；①不排名（只展示存活到最后的人）。

### 计分（`WORLD.SCORE`）
| 行为 | 分值 |
| --- | --- |
| 搜索容器 | 2 |
| 兑换线索 | 1 |
| 获得线索（搜索或线索券） | 2 |
| 猜拳 胜 / 平 / 负 | 2 / 1 / 0 |
| J 互动命中 | 1 |
| 探查 | 3 |
| 刺探 | 2 |
| 指认命中 | 8 |
| 击杀 | 10 |

分数公开（用于排名），只增不减。

### NPC 大转盘（可重复）
- 点击 NPC 互动面板的「打开大转盘」弹出**真实转盘界面**，每次放置 **10 个物品**，等概率落格。
- **首次免费**，之后每次消耗筹码且**次数越多越贵**：`WORLD.WHEEL.spinCosts = [0,1,2,4,6,9,12,16,20,25,30,36,42,49,56,64]`，超出后按末级增量线性外推。计数按“每个玩家 × 每个 NPC”独立。
- 物品构成（`WORLD.WHEEL` / `WORLD.WHEEL_ITEMS`）：
  - **不同数量的筹码**：`chipAmounts = [0,1,2,3,5,8]`。
  - **线索券**（蓝，仅好人转盘）：获取一名坏人的一条线索。
  - **洗心革面券**（绿，仅坏人转盘）：将自己由坏人转换为好人。
  - **轮回券**（红，仅坏人转盘）：重新随机自己的身份特征（颜色/隐藏属性/S-ID，并重置公开状态）。

### 联机猜拳：邀请确认与十秒选择

- 靠近玩家（64 像素内、家具不挡视线）后按 `E` 或点击角色，在交互菜单选择「邀请猜拳」。已移除工具栏「互动小游戏」入口，不保留旧邀请路径；NPC 转盘仍从原 NPC 互动面板打开。
- 被邀请者自动收到确认界面，可同意或拒绝；邀请 30 秒未回应自动取消。双方需在线、存活且各有至少 1 筹码。
- 同意后由服务端设置共同的 **10 秒**选择截止时间；上方左侧显示自己的像素手势，右侧隐藏对手选择，下方选择石头、剪刀、布。截止前可反复修改，本方立即反馈。
- 即使双方提前选完也不会提前揭示；截止后服务端锁定最后有效选择、同步揭示并判胜负。胜者筹码 +1、败者 −1、平局不变，沿用原积分与 5 秒冷却。
- 任一方未出拳、拒绝、取消、离线、淘汰或整局结束，本次取消、不扣筹码、不计胜负。重复邀请、越权操作和过期选择会被拒绝；乱序选择用递增版本号保护。
- 选择阶段对手手势不下发给客户端；结算后只向两位参与者下发各自的回合结果，第三方公开快照始终不含猜拳私密状态。

### 其它既有机制
- **躲藏**：家具视觉与底部碰撞足迹分离，角色身体可被家具遮挡；遮挡时人物与下方名牌同帧隐藏（含自己与 NPC），解除同帧恢复。
- **交互描边**：仅 9 个容器与 2 名 NPC 有描边，亮色=可操作 / 灰色=范围内不可用 / 暗色=太远。
- **筹码来源**：搜索容器、NPC 转盘、玩家猜拳（胜 +1 / 负 −1 / 平不变，余额不为负）。
- **J 互动（无伤害）**：所有阵营可用，命中只造成对手 0.8 秒眩晕 + 1 秒僵直，不扣血、不淘汰。

## 可调参数

`online/shared/world.js` 中集中配置，两端读取同一份：

| 位置 | 键 | 值 |
| --- | --- | --- |
| `RULES` | `endRemainingPlayers` / `timeLimitMs` | `100` / `7200000`（2 小时） |
| `WHEEL` | `slotCount` / `spinCosts` / `chipAmounts` / `specialCount` / `specials` | `10` / 见上 / 见上 / `{good:2,bad:2}` / `{good:['clue'],bad:['reform','rebirth']}` |
| `PLAY_CONFIG` | `rpsStake` `rpsTimeoutMs` `rpsRoundMs` `rpsCooldownMs` `attackRange` `attackCooldownMs` `attackConeCos` `stunMs` `freezeMs` | `1` `30000` `10000` `5000` `48` `1200` `0.5` `800` `1000` |
| — | `INTERACT_RANGE` | `64`（容器/NPC 互动与猜拳的距离门槛） |

## 权威性与隐私边界

- 位置、移动、技能、探索奖励、转盘落格与费用、猜拳结算、J 互动、计分与结束判定全部由服务端计算，客户端只提交意图并渲染快照。
- 公开投影只含位置、公开颜色、已公开属性、已公开 S-ID 段、`score` 以及动画用 `facing`/`lastAttackAt`/`stunUntil`/`freezeUntil`；筹码、线索、技能次数、身份、生命仅本人可见。
- 私密线索不进入公开档案、名单搜索与公共日志；猜拳选择阶段仅下发本人出拳，对手出拳只在服务端截止结算后向两位参与者揭示。
- 服务端 20Hz 快照采用截止时间补偿调度（单次长卡顿只补一次，不突发追赶）。

## 测试与验收

```bash
# 服务端（零依赖，直接 node 运行）
node online/rps-flow-test.mjs              # 新猜拳状态机、隐私与截止边界
node online/mechanics-test.mjs             # 机制：29 项
node online/exploration-test.mjs           # 探索/兑换/重置：25 项
node online/progression-test.mjs           # 转盘/特殊券/计分/三种结束：15 项
node online/self-test.mjs                  # 11 项
node online/rules-skill-test.mjs           # 14 项
node online/rules-qa.mjs                   # 30 项
node online/qa-verify.mjs                  # 35 项
node online/privacy-reset-test.mjs         # 23 项
node online/privacy-reset-qa.mjs           # 23 项
node online/manager-test.mjs               # 管理控制台：授权码/上局排名/开新局/限流：60 项

# 真实 Chrome（原生 CDP，需系统 Chrome）
SID_CHROME=/usr/bin/google-chrome node online/rps-browser-test.mjs # 双玩家猜拳与窄屏验收
node online/progression-browser-test.mjs   # 转盘/特殊券/计分/结算：19 项
node online/mechanics-browser-test.mjs     # 17 项
node online/exploration-browser-test.mjs   # 17 项
node online/manager-browser-test.mjs       # 管理控制台真实浏览器：13 项
SID_CHROME=/usr/bin/google-chrome node online/manager-live-browser-test.mjs https://game.afann.xyz 091256  # 公网只读验收：7 项

# 公网部署冒烟（打完线上地址，32 项）
node online/deploy-smoke.mjs https://game.afann.xyz
```

> Chrome 路径默认取 Windows 的 `C:/Program Files/Google/Chrome/Application/chrome.exe`；在 Linux 上跑浏览器脚本时用 `SID_CHROME=/usr/bin/google-chrome` 覆盖（管理页两个浏览器脚本已支持该环境变量）。

历史记录（不代表本轮当前树）：服务端 **29/25/15/11/14/30/35/23/23** 与浏览器 **19/17/17** 全部通过，页面全程无 JavaScript 异常；新增的管理控制台自测 **60/60**、本地真实浏览器验收 **13/13**、公网只读浏览器验收 **7/7**、线上冒烟 **32/32**，VPS 隔离端口端到端（结束局→读排名→开新局）**12/12**。浏览器脚本零依赖，结束时关闭自身启动的 Chrome 与 HTTP 子进程，日志与截图写入 `outputs/`。

## 管理控制台（/manager）

公网地址 `https://game.afann.xyz/manager`，用一个**授权码**（不是玩家昵称）进入，用来处理“一局打完之后怎么开下一局”。

| 能力 | 说明 |
| --- | --- |
| 查看上局结算 | 结束方式、结束时间、结算人数，以及按分数降序的完整排名（名次 / 玩家 / 分数 / 存活 / 阵营，阵营在结束后才公开） |
| 查看当前对局 | 进行中或已结束、存活人数、当前名册（每 5 秒自动刷新） |
| 开始下一局 | 二次确认后清空本局全部玩家与身份凭证、重置 2 小时倒计时；**上局排名继续保留展示**，用于复盘 |

为什么必须有这个入口：结束条件（坏人全灭 / 时间到）会把房间置为 `finished`，而 `finished` 的房间按设计永久拒绝新玩家加入，客户端只会停在“游戏已结束，无法加入”。以前只能靠本机隧道 + `SID_DEV=1` 或重启进程清房间，公网无法自救；管理控制台把这件事变成一个按钮。

鉴权与安全边界：

- 授权码来自环境变量 `SID_MANAGER_CODE`（缺省 `091256`），服务端用定长比较校验，页面源码与响应体里都不含授权码。
- 登录成功下发 `sid_manager` HttpOnly + SameSite=Lax Cookie（12 小时），不提供 header/query 回退；开新局额外要求绑定会话的 CSRF token 与 `confirm: true`。
- 连续输错授权码会按来源 IP 递增退避并返回 429（登录成功即清零）。
- 该接口**不依赖** `SID_DEV` 与回环地址，因此反向代理不需要为它开口子；`/api/dev/`、`/api/host/` 仍保持公网 404。
- 授权码是唯一屏障，`091256` 只是试玩默认值，正式使用前应在 systemd 里改成强随机值并重启：`Environment=SID_MANAGER_CODE=<强随机值>`（改完 `daemon-reload` + `restart`）。房间状态在内存里，服务端重启会清空当前对局。

## 公网部署（game.afann.xyz）

以下为既有部署记录；本轮未部署，不能据此认定线上实例已与当前工作树一致。服务器侧既有结构如下：

| 项 | 值 |
| --- | --- |
| 代码目录 | `/opt/sid-hunter`（`git clone https://github.com/l541402398/sid-hunter.git`） |
| 监听 | `127.0.0.1:8898`（**不直接对公网开放**，只由反向代理回源） |
| 进程 | systemd 单元 `sid-hunter.service`（`User=lijuefan`、`Restart=always`、日志 `Append` 到 `/var/log/sid-hunter.log`） |
| 反向代理 | 1Panel 内置 OpenResty 容器：`/opt/1panel/www/conf.d/game.afann.xyz.conf` + `/opt/1panel/www/sites/game.afann.xyz/proxy/root.conf` |
| 证书 | 复用 1Panel 的 `*.afann.xyz` 泛域名证书（复制到 `/opt/1panel/www/sites/game.afann.xyz/ssl/`） |
| 入口 | `https://game.afann.xyz`（80 端口 301 跳 443） |

systemd 单元：

```ini
[Unit]
Description=SID-Hunter 联机试玩服务（办公室社交推理）
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=lijuefan
Group=lijuefan
WorkingDirectory=/opt/sid-hunter/online
Environment=NODE_ENV=production
Environment=PORT=8898
Environment=HOST=127.0.0.1
Environment=SID_DEV=0
Environment=SID_TEST=0
Environment=SID_MANAGER_CODE=091256
ExecStart=/usr/local/bin/node /opt/sid-hunter/online/server.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/sid-hunter.log
StandardError=append:/var/log/sid-hunter.log

[Install]
WantedBy=multi-user.target
```

单点登录（CAS）配置：

- 合并后正式模式**默认要求 CAS 登录**（`SID_SSO=0` 或 `SID_TEST=1` 可关闭，回到昵称加入）；systemd 至少要有 `SSO_LOGIN_URL` 与 `SSO_VALIDATE_URL`，否则用 `online/sso.js` 的默认值。
- `SSO_VALIDATE_URL` 的默认值 `http://cas.x/p3/serviceValidate` **只是占位符**，部署时必须覆盖；实际端点是 `http://172.26.1.10/p3/serviceValidate?service={service}&ticket={ticket}`。
- 校验端点必须用 **http**：公司 CAS 的证书链在多数机器上不受信，Node 的 `fetch` 走 https 会报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`，现象是浏览器里 CAS 明明登录成功、回到页面却提示「单点登录失败，请重试」；而 `curl -k` 能通过，很容易误判。浏览器登录入口 `SSO_LOGIN_URL` 仍用 https。
- 想走 https 校验就得给内网 CA：`NODE_EXTRA_CA_CERTS=/path/to/ca.pem`，或在 systemd 里放宽证书链。
- 配置可写在仓库根目录 `.env`（已被 `.gitignore` 忽略，见 `.env.example`）或 systemd 的 `Environment=`；两者同时存在时进程环境优先（`sso.js` 只补空缺）。

反向代理要点（完整文件见服务器上的 `proxy/root.conf`）：

- `/api/stream` 单独成一个 `location`，`proxy_buffering off` + `proxy_read_timeout 7200s` + `gzip off`，否则 20Hz SSE 会被缓冲或掐断。
- `/api/dev/`、`/api/host/`、`/api/test/` 返回 404：开发重置、结束游戏与测试注入接口只在回环地址可用，公网不开源。
- 其余路径统一 `proxy_pass http://127.0.0.1:8898` 并透传 `Host` / `X-Real-IP` / `X-Forwarded-For` / `X-Forwarded-Proto`。

更新线上版本：

```bash
cd /opt/sid-hunter && git pull --ff-only
sudo systemctl restart sid-hunter
systemctl is-active sid-hunter && curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8898/
```

对线上实例做端到端自检（静态资源、身份下发、SSE 快照、管理接口封锁、管理控制台登录与排名共 32 项）：

```bash
node online/deploy-smoke.mjs https://game.afann.xyz
```

> 冒烟里的“重开”只验证接口已开通且要求二次确认（期望 400），**不会真的清空线上房间**。房间状态在内存里，`restart` 会清空当前对局。

## 目录结构与分包

为降低多人并行开发时的合并冲突，原先 6 个「什么都往里塞」的巨型文件按职责拆成模块；**旧路径全部保留**（入口/shim），部署与自测命令不用改：

| 旧文件（行数 / 近 30 提交改动次数） | 现在的结构 | 新增代码时改哪里 |
| --- | --- | --- |
| `online/shared/world.js`(967 / 12) | 聚合器 + `shared/world/{config,geometry,furniture,floors,sprite}.js` | 调参→`config.js`；几何→`geometry.js`；家具/楼层→对应文件。**新增子模块要同步三处**：`index.html`、`demo/index.html` 的脚本顺序，以及 `online/test-helpers/world-source.mjs` 的清单 |
| `online/room.js`(1408 / 14) | shim + `room/{config,charges,badpool,digest,events,index}.js` | 自带状态的子系统按工厂拆（`createXxx({...注入})`）；纯计算用显式传参（如 `charges.sync(player,t,finished)`） |
| `online/server.js`(503 / 11) | 薄入口 + `server/{config,http-util,auth,sse,app}.js` + `server/routes/{manager,session,gameplay,dev}.js` | 加接口只动 `server/routes/` 里对应文件；`handle(ctx)` 返回 `false` 表示未处理，其它返回值都表示已应答（与原先 `return send(...)` 等价） |
| `online/public/game.js`(3030 / 14) | 客户端核心 + `public/js/core/*`、`public/js/render/*` | 自包含工具已抽出并以别名引回；面板逻辑仍在内核，后续按「状态门面」继续拆 |
| `online/public/index.html`(113 / 15) | 骨架 + `public/js/markup/*.js` | 标记模块用 `document.currentScript.insertAdjacentHTML('beforebegin', …)` 原位注入并自我移除宿主 `<script>`。**必须同步加载（不能 defer）**，否则 head 里同为 defer 的 `game.js` 会先执行、绑定时元素还不存在 |
| `online/public/styles.css`(336 / 15) | `@import` 入口 + `public/styles/*.css` | 按分区改样式；新增分区在入口清单末尾追加一行 |

客户端零构建、经典脚本：拆出来的模块挂在 `window.SID` 命名空间下，`window.WORLD` / `window.SID_SCENE` 契约不变。加载顺序固定为
`/shared/world/* → /shared/world.js → /shared/scene.js → js/core|js/render → js/markup（同步）→ game.js(defer)`。

测试侧配套：
- `online/test-helpers/guard-files.mjs`：文件哈希守卫的**唯一清单**（含分包后的新模块目录）。新增模块目录/文件后在这里补一行，`mechanics/exploration/movement-attack/progression-browser-test`、`theme-assets-browser-test`、`rules-qa`、`privacy-reset-qa` 的守卫才会覆盖它。
- `online/test-helpers/world-source.mjs`：按浏览器加载顺序拼接 world 子模块 + 聚合器，供「源码进 vm 沙箱」的加载契约检查使用。

## 已知限制

- 「定期公布坏人线索」与「积分兑换/名次奖励」等细化规则仍未实现，界面中明确标注为待补充。
- “存活淘汰至剩余 100 人”按 600 人活动尺度设计；局域网试玩房间人数少，因此主要靠“坏人全灭 / 时间到”结束。
- 房间仍是内存存储，服务端重启会清空当前游戏；**上局结算快照 `room.lastResult` 也在内存里**，重启后管理页只会显示“本局尚未结束，暂无排名”，未新增数据库持久化。
- 源码修改不会自动替换正在运行的旧服务进程，需要重启服务才生效；未做高并发压测。
- 浏览器验收只在 Windows Chrome 与 Linux Chrome（`SID_CHROME` 覆盖路径）实测，其他浏览器未覆盖。
- 管理控制台只用一个授权码做鉴权（无账号体系、无操作审计日志），且限流按来源 IP 计数，因此**只适合小范围试玩**；正式活动前请改掉默认授权码。
- 公网实例（`game.afann.xyz`）的 `/api/dev/`、`/api/host/`、`/api/test/` 在反向代理层就被 404 掉；日常“结束游戏 / 开下一局”请走 `/manager`，不再需要本机隧道与 `SID_DEV=1`。
- 线上 vhost 是手工写入 1Panel 的配置目录（`www/conf.d` + `www/sites`），未走 1Panel 站点管理界面，所以面板网站列表里不会出现该域名；证书复用泛域名证书，随 1Panel 续签更新时需要重新复制到站点 `ssl/` 目录。管理控制台的 `/manager` 与 `/api/manager/*` 由现有 `location ^~ /` 兜住，**不需要改反代配置**。


## 分支合并说明：main → feature_dev_afan → dev

本轮把本地 `main`（`92200df`，七层自适应场景与新玩法）与 `dev`（`7e7fa5d`，CAS 单点登录、肢体互动、匿名坏人线索池、资源冻结）合并为一套实现。`feature_dev_afan` 先并入 main，再合入 dev；两处合并都以「保留双方功能」为前提逐块人工整合，冲突集中在 `online/{server,room}.js` 与 `public/{game.js,index.html,styles.css}` 六个文件。

### dev 分支保留并接入的能力

- **CAS 单点登录**：`online/sso.js`、`/api/auth/{config,login,logout,me}`、`User-Token` 头与 `user_token` 查询参数、按工号回座不新开角色。正式模式默认要求登录；`SID_TEST=1`（既有自测）或 `SID_SSO=0`（局域网试玩/回归）沿用昵称加入。
- **肢体互动**：活人 `J` 使用 main 的无伤害木锤攻击（48px / 1.2s 冷却 / 0.8s 眩晕 + 1s 僵直），`K` 跳跃（520ms，腾空窗口可躲锤），淘汰后成为幽灵（穿家具/墙体、不能被锤、`J` 吓最近的存活者 0.75s），命中留下最多 3 个肿包（各 15s）。全部不扣血、不公开 S-ID、不消耗技能次数、不计分、不写公共日志。
- **离线受击摘要**：被敲 / 被鬼吓的次数按 epoch + 水位确认，只在本人重连后的私密摘要显示，旧 ACK 不会吞掉新计数。
- **匿名坏人线索池**：`badSlots` 匿名投影（随机标签、与 id/顺序/视角无关、深冻结），只展示已公开的隐藏属性。
- **资源冻结**：淘汰或本局结束时结算已赚到的恢复并固定 `skillsFrozenAt`，之后重复读取不再恢复。
- **开发用好人 NPC**：`/api/dev/npc`（门禁与 `/api/host/*` 一致）+ 页面「添加好人NPC」按钮。

### 以 main 为准的既有实现（dev 旧行为被取代）

- 结束方式仍是 main 的三种：存活淘汰至剩余 100 人 / 坏人全灭 / 时间到（2 小时）；dev 的「存活 ≤ 2 结束」不再存在。
- `J` 的近战手感按 main 的参数与朝向判定；dev 的锤子调参（58px / 1s / 750ms）不再用于活人攻击。
- 探查默认仍按 main 的确定性顺序公开第一个未公开属性；仅当房间注入 `random` 时按注入源随机选择（dev 的可测语义）。
- 公共投影里的 `stunUntil` / `freezeUntil` / `lastAttack*` 仍按 main 的公开战斗状态下发，不做镜头裁剪；dev 的肢体互动表现字段（`z` / `bumps` / `swingAt` / `hitAt` / `fright*`）按可见性裁剪，而合并后的地图每层正好一屏，「可见」等价于「同层」。
- 已淘汰者以幽灵形态可见，但沿用 main 的隐私取向：不生成地图名牌与选中框，档案/名单仍可查看。

### 需要留意的接入点

- `SID_SSO=0`：仅用于关闭 CAS 门禁（局域网试玩、回归测试）；正式部署不要设置它。
- `/api/test/place` 新增可选 `floorId`（仅 `SID_TEST=1` 暴露），供自测把角色放到指定楼层。
- 合并后按「保留双方功能」调整了 dev 自测的判定：结束条件改用 main 的三种方式、跨层代替跨屏裁剪、硬控期间按 main 的协议需重新输入方向、规则页技能卡以 main 的 4 卡布局为准。相关改动均带 `合并适配` 注释。

### 验证结果

- dev 分支自测全绿：`sso-test`、`bad-pool-test` 15/15、`hammer-test` 49/49、`npc-test` 38/38、`ghost-offline-test` 101/101。
- main 分支自测与合并前基线逐项对齐（`mechanics-test` / `movement-attack-test` / `exploration-test` / `progression-test` / `qa-verify` / `manager-test` / `privacy-reset-test` / 浏览器验收），未引入新的失败项；`main` 自带的若干陈旧用例（`rps-flow-test`、`privacy-reset-qa` 的冻结哈希、`qa-verify` 部分 HTTP 断言）在合并前即为红色，本次未改动其判定口径。

## 本轮变更：七层楼板加宽与东侧服务翼（2026-10-14，分支 `feature_dev_floor`）

按用户拍板（采纳七层布局设计、每层不能太小、共 7 层、1F/7F 自由发挥）落地：

- **楼板加宽**：每层由 `960×400` 加宽到 **`1440×400`（45m×30m，1.5×）**。做法是把 x 轴归一化空间由 `0–1000` 扩到 `0–1500`（新增 `X_SPAN/Y_SPAN`），`nX = v/1500*1440 = 0.96v` 与原值完全一致 ⇒ **既有家具/角色/门洞的像素尺寸一字未变**，右侧多出的 `1000–1500` 即新增的东侧走廊与服务翼。想继续加宽只需改 `FLOOR_W` 与 `X_SPAN`（保持比值 0.96）。
- **东侧服务翼（7 层全部新增）**：东侧电梯厅 + 楼梯间 + 卫生间台面 + 等候沙发 + 绿植 + 分隔墙（参考图里 2–6F 有、原代码全缺的部分）。
- **竖向交通对齐**：西侧 `stairLeft` 统一到 `x=70`（落进西侧核心筒，修掉原先落在卫生间横带的 x=185）；东侧 `stairRight` 移到 `x=1220`（新电梯厅旁）；取消 3F/4F 的临时门位补丁。portal 稳定 ID 未变。
- **1F/7F**：补上原缺失的西侧核心筒；7F「更衣柜」升为可搜容器（7F 原为 0 容器）。
- **命名/常量**：`亲水间`→`茶水间`；2F `储物柜`→`核心筒`；`ZONES` 重构为 7 层区域名。
- **可见性裁剪**：`room.js` 的相机裁剪改用该层实际宽度（楼板已宽于一屏，"同层即可见"不再成立）。

验证：`self-test 11/11`、`hammer-test 50/50`、`npc-test 38/38`、`ghost-offline 101/101`、`bad-pool 15/15`、`privacy-reset 23/23`、`manager 60/60` 全绿；`mechanics/movement-attack/exploration/progression/exploration-browser` 与改动前基线**逐项一致**（该分支既有红项，未新增失败）。目视验证见 `outputs/demo-1f.png`、`outputs/demo-1f-east.png`、`outputs/floor-preview.png`。

详见 `design/CHANGELOG-楼层加宽与东侧服务翼.md`；设计依据见 `design/floors/floor-layout-design.md`、`design/art/pixel-art-and-asset-guide.md`。**本轮改动未提交。**

## 本轮变更：五项场景修改（2026-10-14，分支 `feature_dev_floor`）

按用户基于实际游玩的五项反馈落地（保持星露谷像素风与整体布局一致）：

1. **上半部分后墙 + 窗户 + 标语展示区**：每层沿轮廓上边缘绘制后墙墙带（`drawBackWall`，先于家具/角色，纯背景）：10 个 144px 模块中 7 个为木框窗户（天空渐变 + 窗棂 + 像素楼群剪影 + 云 + 斜反光），第 3/6/9 模块为木框标语展示板——中央板显示本层名，两侧为「标语预留」空板（后续挂内容，不臆造文案）。墙带向上延伸 56px，相机纵向居中时也不露底。`online` 与 `demo` 两端同源实现。
2. **减少工位 + 每层新增可搜容器与装饰**：2–6F 中央工位岛全部缩为 3 列示意（如 2F 中央工位一 `258–720` → `409–569`）；每层新增 **1 个可搜容器**（1F 大厅储物柜 / 2F 打印间文件柜 / 3F 产品资料柜 / 4F 票证储藏柜 / 5F 值班储物柜 / 6F 财务保险柜 / 7F 能量补给台，奖励在 `room.js` 的 `EXPLORATION_REWARDS` 同步登记，共 17 个容器）+ 2–3 件星露谷风装饰（沙发/绿植/记录台），摆放在工位缩减腾出的空地上，不碰门洞/出生点/电梯落点。
3. **电梯改造（不分方向 + 选层 + 门口落地 + 比例放大）**：portal 数据模型改为 `f{层}:portal:{side}`（删 `dir`/`targetFloorId`）；玩家进门（E/点击）弹**选层面板**（1–7 按钮网格，禁当前层，支持数字键 1–7 直达与 Esc 取消），服务端 `/api/floor-change` 改为接收 `targetFloorId` 并校验（1–7 且 ≠ 当前层、幂等键含目标层），落点由 `WORLD.elevatorLanding` 给在**目标层同侧电梯门口正前方**；电梯视觉放大 64×30（原 42×18），去掉方向箭头与双按钮，改为单个呼梯键 + 「E 选择楼层」提示。
4. **移动速度提升**：`WORLD.SPEED` 64 → **112**（约 2.0 → 3.5 m/s），服务端权威与离线版同源，两端一致。
5. **碰撞体积消失 / 摆放错位修复**：`blocksFor` 中 counter/cabinet/reception/sofa/plant 原碰撞贴 rect **北沿**细条（6.7–10.7px），但绘制的立面在 rect **南沿**——玩家能穿进可见家具大半才被挡。改为贴**南沿立面**（bottomStrip，与原始 footprint 语义一致）；另修复两处既有堵门：5F/6F 附翼工位岛东移让出 `v151` 墙的两扇门（y710/y855）。

验证：结构自检（7 层出生点 / 14 个门洞 / 17 容器 / blocks 互不重叠 / 两侧电梯落点全通）；电梯协议单元验证（非法层/当前层/距离守卫/门口落地 d≤14/幂等重放/commandId 冲突/1F↔7F 直达）；测试套件绿项全过（self 11/11、hammer 50/50、npc 38/38、ghost-offline 101/101、bad-pool 15/15、privacy-reset 23/23、manager 60/60），既有红项 **mechanics 4→5、exploration 6→7 通过数增加**，movement-attack 13/16、progression 7/8 持平——无新增失败。目视验证见 `outputs/verify-1f.png`、`outputs/verify-2f.png`、`outputs/verify-7f.png`。

详见 `design/CHANGELOG-五项场景修改.md`。**本轮改动未提交。**

## 本轮变更：真实素材与独立电梯厅（2026-10-14，验收中）

- **真实素材接入**：`online/` 与 `demo/` 共用 `online/shared/scene.js`，实际加载三个已真实取得的素材包：Kenney Roguelike Indoors / Roguelike Modern City（CC0 图集，按原图 16×16、1px 间隔逐块 `drawImage`）与 Antea 办公家具包（CC-BY，43 个独立 PNG，16/32px）。图片就绪后重建家具缓存，地板块缓存区分楼层。来源与许可位于 `online/public/assets/vendor/{kenney-indoors,kenney-modern-city,antea-office}/`；原始 ZIP、SHA-256 与选片证据见 `outputs/asset-acquisition/`。
- **家具已是真实精灵**：`desk`→Antea `Desk`/`Desk-2`（含显示器）、`seat`→`Chair`、`sofa`→`Big-Sofa`/`Small-Sofa`、`plant`→`Big/Small-Plant`、`cabinet`→`Filing-Cabinet` 系列、`table`→1F 用 Kenney 木桌、其余层用 Antea 圆桌、`counter`/`reception`→Antea `Small-Table`（1F 取餐台用 Kenney 厨房台）。仍无素材的类型（跑步机/哑铃架等）保持程序化 fallback，未写为已替换。
- **逐层地材（已修复误用草地）**：1F indoors 木纹 `24,0–24,3`、2F city 浅灰 `18–20,1`、3F city 灰石 `10–12,1`、4F city 红褐砖 `1–3,1`、5F city 米色 `25–28,1`、6F city 蓝灰格 `0–2,19`、7F indoors 绿色 `24,4–24,7`，电梯厅地坪统一 city `0/1,19`。此前“1F/2F/4F/5F 误用 city 第 26 行草地”已修复；6F 亦由 `(2,3,4,19)` 更正为 `(0,1,2,19)`（实测 `(3,19)(4,19)` 为米色，会与 5F 撞色）。
- **覆盖边界**：沙发/显示器/打印机/白板/售货机/饮水机等已由 Antea 补齐但**仍待美术按层复核**；跑步机/哑铃架与俯视角色动画仍缺，角色与部分后墙/玻璃门/电梯继续程序绘制。Pixel Office 下载请求 502，未取得 ZIP，不列为已使用素材。
- **双侧独立电梯厅**：7 层 × 左右 2 厅 = 14 厅，各 `144×96`；主楼保持 `1440×400`、归一化比例 `0.96/0.4`，横向世界边界增为 `[-144,1584]`，不是缩放原楼。两版及服务端相机边界同步读取共享数据。
- **自动玻璃滑门**：48px 厅口开口，活着且在线的同层玩家靠近触发，离开后 650ms 延迟关闭；联机门状态服务端权威，快照仅下发门 ID/open，离线版使用同一状态函数。
- **真实 ID 选层**：两版据 `WORLD.floorOptions()` 生成 1–7F 按钮，附 `data-floor-id` / `aria-label`；须进入同侧厅、64px 内并面向电梯才能乘梯，落在目标层同侧厅内。无合法落点则拒绝，不强行穿墙或换侧。窄屏面板已加 border-box、零最小宽度、文本换行与内部滚动，独立命中测试仍待 QA。

### 本轮运行与证据

- 离线：直接打开 `demo/index.html`，保留与 `online/shared/`、`online/public/assets/vendor/` 的相对目录结构。
- 新树联机本地试玩：从仓库根目录在**另一个空闲回环端口**启动，例如 PowerShell `$env:HOST='127.0.0.1'; $env:PORT='8788'; $env:SID_SSO='0'; node online/server.js`，再访问 `http://127.0.0.1:8788/`。该关闭 SSO 设置仅供本地昵称试玩，不用于正式环境。本轮不重启既有 8787/PID 9332；其服务端逻辑未重新加载，不能作为新树验收实例。
- 工程自检入口：`node online/elevator-world-test.mjs`、`node online/elevator-room-test.mjs`、`node online/elevator-browser-test.mjs`（由工程/QA 执行，需已有系统 Chrome）。
- 工程自检证据：`outputs/engine-elevator-results.json`、`outputs/engine-picker-{1440,768,390}.png`、`outputs/engine-online-4f-west.png`、`outputs/engine-demo-{1..7}f.png`。工程在每处修改后均重跑 `online/elevator-browser-test.mjs` 并 PASS，截图为修正后版本；但这仍属工程自测，不等于独立终验，绘制次数不代替美术审核，独立复核由 quality-lead 进行。
- 独立 QA 入口：`outputs/qa-floor-final/`；当前仍在验收和旧回归归因中。281/363 逻辑套件、5/17 旧探索浏览器是已观测结果，不是本轮完整 PASS，也不能仅凭目录名宣称改动前基线或无新增失败。

### 第三方素材署名（必须保留）

运行素材来自以下第三方包，按其授权要求署名；不要移除署名。

- **Antea 办公家具包 —— CC-BY，允许商用但必须署名**：作者 `Antea ✮⋆˙ (stcrbcn)`，来源 https://stcrbcn.itch.io/furniture-office-set （包名 Free Furniture Office Equipment Set）。用于 2F–6F 办公桌/椅/沙发/文件柜/打印机/白板/售货机/饮水机等。**CC-BY 署名是硬性义务**，随包发布、改版、转商用均须保留。
- **Kenney Roguelike Indoors / Roguelike Modern City / Tiny Town / Sports Pack / Topdown Shooter —— CC0，无需署名**：作者 Kenney / Kenney Vleugels，来源 https://kenney.nl 。CC0 无署名义务，仍保留来源与许可以便审计。
- **lumimae yaycandies、cwendeku Cute Food Sprites —— CC0，无需署名**：来源 https://opengameart.org/content/candy-pack-1 、https://www.opengameart.org/content/cute-food-sprites 。（Cute Food Sprite 本轮经清理后未随运行时加载，凭据见 vendor 各目录 `SOURCE-README.txt`。）
- **OGA 室内 RPG 图集（CC-BY 3.0，须署名；本轮未加载、仅 vendor 留档）**：baseline 作者 Redshrike（https://opengameart.org/content/16x16-indoor-rpg-tileset-the-baseline ）；Expansion 1 作者 Stephen Challener (Redshrike) and Jetrel（https://opengameart.org/content/rpg-indoor-tileset-expansion-1 ）。本轮无 spec 引用、未随运行时加载，但文件仍在 `vendor/oga-indoor/`，凭据见该目录 `SOURCE-README.txt`；如后续启用须保留署名。

> 建议署名位置：本 README 小节 + 游戏内“关于/致谢”页。授权凭据：`online/public/assets/vendor/antea-office/LICENSE.txt`（作者/来源/CC-BY 强制署名文本/原包 SHA256/43 精灵清单/缺项）与 `outputs/asset-acquisition/antea-office.json`；原 Antea 包未附独立许可文件，该 `LICENSE.txt` 为依据包页 CC-BY 声明的自撰凭据。建议署名文本：`Office furniture sprites by Antea (stcrbcn) — https://stcrbcn.itch.io/furniture-office-set — Licensed under CC-BY`。

**当前发布门控：待用户审批上线；本轮无 commit/push/deploy。** 独立 QA 已在最终哈希上 17/17 通过；美术裁片复核与上线审批仍待，故本轮不发布、也不宣称已上线。详见 `design/CHANGELOG-真实素材与独立电梯厅.md`。

## 本轮变更：七层世界主题与主题家具（2026-10-14，验收中）

在上一轮基础上，每层换一套**世界主题**（墙带材质/配色/墙饰 + 地板材质/环境色/纹样 + 主题家具），并新增若干真实素材包。**未提交，验收中。**

- **改动文件（4 个，非仅 scene.js）**：`online/shared/scene.js`（主改动）、`online/shared/world.js`（+3 行，导出 `WORLD.WALL_BASE = 58`）、`online/public/game.js` 与 `demo/main.js`（各 8 行，后墙改由 `SCENE.wall()` 绘制并按 `WALL_BASE` 裁剪家具）。
- **新增机制**：`SHEET_GRID`（非 16px 图集步长：farm 17/16、shooter 64/64、sports 64/64）、`drawSpecAt` 支持 `single`（居中、整数倍放大封顶 2×）/`native`/`prop+scale`、`drawSpec` 逐 block、`floorStyles[].cell`、`THEME_WALL`。
- **两处修复**：① `blit` 不再按 `dy<58` 裁北侧墙带（离屏家具/地板是局部坐标，原逻辑误裁世界 y256..314 的合法内容并漏出旧手绘地板），墙体裁剪改由两版最终合成负责；② 工位岛主题家具原只取 `blocks[0]`，现逐 `block` 绘制，第二排不再漏画。
- **七层落位**：F2/F5 书架带 + 木桌 + 木椅；F3 暖木桌/书架/盆栽；F4 地面换 Kenney Tiny Town 真实草地 `(0,0)–(2,0)`；F6 棒棒糖作观叶位装饰（约 2×）；F7 stage/mat 用 Sports Pack 球场图集；F1 墙带用 Topdown Shooter 带窗设施墙带。（此前这两项的图集 key 未注册、会静默回退，**已修**，见下。）
- **新增素材（全部 CC0，不新增 CC-BY 义务）**：Kenney Tiny Town、Kenney Sports Pack、lumimae yaycandies、cwendeku Cute Food Sprites、Kenney Topdown Shooter。Antea 与 OGA 仍按本文末署名小节执行。
- **如实排除**：Topdown Shooter 的 `(0,15)` 实测为亮绿草地 `rgb(35,199,52)`（非浅灰地板），沙发 `(12,16)/(12,17)` 整格不透明带自底，故 F1 家具不使用该包；F7 无健身器材、F6 无甜点家具（站点与关键词见 `outputs/asset-acquisition/theme-furniture-downloads.json`）。1F/7F 原始参考图仍缺，未臆造布局。
- **图集注册（已修）**：`shooter`/`sports` 曾漏注册导致 F1 墙带与 F7 stage/mat 静默回退；现已在 `atlases` 注册 `shooter='scifi-kenney-topdown-shooter/Tilesheet/tilesheet_complete.png'`（1728×1280，27×20，64px）、`sports='sports-kenney-sportsPack/Tilesheet/groundBeige_white.png'`（832×1024，64px）。修后重跑：`ready:true`、`error:null`、`themed 72→75`、运行期报错 0，F1 截图呈绿底白窗设施墙带。
- **来源留档与清理**：新建 `online/public/assets/vendor/oga-indoor/SOURCE-README.txt`（baseline = Redshrike，CC-BY 3.0/OGA-BY 3.0；expansion1 = Stephen Challener (Redshrike) and Jetrel，CC-BY 3.0），并附强制署名文本。OGA 三图本轮**无任何 spec 引用**，已从 `atlases` 移除（不再加载，文件仍在 vendor 留档）；同时删掉 10 个未使用的 `propFiles` 条目（candyBean/candySwirl/candyStar/candyCane/miniCake + 7 个 sports 单件）。`THEMES[5].name` 已由「温泉旅馆」统一为「暮色书房」。
- **已知遗留小项**：① `CHROMA_TILE_SPACING` 仍列有 `ogaBase/ogaExp/ogaExtra` 三个 key，但对应图集已不加载（死配置、无功能影响）。**本轮保留原样不清**（避免改动使 QA 验收版本与交付版本错开），待下一轮清理。② **判断“主题是否生效”要看最终画面像素，不要只看实时 blit 计数**（本轮踩过的坑；工具见 `outputs/theme-work/pixel-count.mjs`）。
- **独立验收：17 项全部通过（17/17，fail=0）**（`outputs/theme-qa/theme-assets-results.json`，钉在哈希 `2da5528b…`；快照 `outputs/theme-qa/scene-snapshot.sha256.txt`；前后六份源码 `unchanged=true`，runtime/console 错误 0；三套回归 exit 0）。套件由 15 项扩到 17 项，原 15 项在两版结论一致。
  - 其中 1 项以**实时画面像素判定**替代原先的“实时 blit 计数”，现名 `ONLINE：实时画面像素判定 F7 场地为 sports 图集材质（blit 计数对烘焙缓存不适用）`。原因：在线端家具走 `furnitureSprites` 烘焙缓存，稳态窗口内数不到图集 blit 属机制使然，**不是回退**。
  - 该替代由 QA **自己的 harness 独立产出**（CDP 截图 clip 到 `#office`、内联零依赖 PNG 解码，统计目标色 ±6）：F7 实时画布 **113** 个近似像素 vs F1 对照 **9** 个（12.6×，断言 ≥50 且 >F1×5）→ 通过；同窗口另记录 `groundBeige` blit = 9，与“启动 `bakeSprites()` 先跑一次、`SCENE.ready` 后重烘焙并重绘”的解释吻合。
  - QA 另用 `outputs/theme-work/pixel-count.mjs` 复算四张图，与工程统计一致（F7 修正前 ≈`1` → 修正后 `1512`；F1 对照 `11`/`2`，精确命中 0、容差 ±6）。**该替换不是弱化**：它检验玩家可见结果，且与工程统计互为独立证据；被替代的 blit 计数因烘焙缓存架构本就不适用于该断言。
  - 该项**由 FAIL 改判为 PASS**；QA 确认除该项外无任何遗留。新增证据 `outputs/theme-qa/live-floor1.png`、`live-floor7.png`。
- **oga 清理零行为影响佐证**：当前 `scene.js` 只有 5 个图集键 `indoors/city/farm/shooter/sports`；残留 oga 仅 1 处注释 + `CHROMA_TILE_SPACING` 的 3 个 key（`CHROMA_SET` 为空集、该表实际不被使用）；`floorStyles`/`THEME_FURN`/`THEME_WALL` 均不引用 oga。
- **工程统计与证据**：工程实机统计（真 Chrome，七层×两机位，同一次 capture，跑在最终 `2da5528b…` 上）：`themed 75`、`furniture 163`、`drawImage 7729`、`floors 12`、`ready:true`、`error:null`、运行期报错 0。其中 `themed` 由改动前基线 `29` → 主题接入 `72`（注册修正前）→ `75`（修正后）；`drawImage` 由修正前的 `7968` 降至 `7729`，原因即本轮清理（OGA 三图不再加载 + 10 条未使用 `propFiles` 移除）。截图 `outputs/theme-work/cur-f{1..7}-{north,mid}.png`、基线 `outputs/theme-work/baseline/`、脚本 `outputs/theme-work/capture.mjs`、像素计数 `outputs/theme-work/pixel-count.mjs`。当前 `scene.js` `2da5528b…`（自验收开始未再改动）。
- **边界**：本轮未 commit/push/deploy；用户已取消 8788 常驻服务，本机联机需自行起服。**门控：独立 QA 17/17 通过，待美术复核与用户审批上线。**

详见 `design/CHANGELOG-真实素材与独立电梯厅.md` §8。
