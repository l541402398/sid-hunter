# S-ID：年终生存战

像素办公室社交推理游戏，含两个可运行版本：

- `demo/` —— 离线试玩版（单人对 19 名本地模拟玩家，无网络、不存档）
- `online/` —— 局域网联机版（服务端权威：位置、技能、探索、转盘、猜拳、互动、计分与结束判定全部在服务端计算）

两版共用同一份地图与规则文件 `online/shared/world.js`（服务端与浏览器都能加载）。

## 运行

离线试玩：直接打开 `demo/index.html` 即可（需要 `online/shared/world.js` 在场，目录结构不要拆散）。

联机版：

```bash
PORT=8787 node online/server.js
# 浏览器访问 http://127.0.0.1:8787/
```

要求 Node.js 22+。第一位加入者是坏人，其后全部是好人；主持人/开发重置仅在本机开发开关下可用。

## 目录

| 路径 | 说明 |
| --- | --- |
| `online/shared/world.js` | 共享地图、家具足迹与深度、遮挡、NPC、容器，以及全部可调参数（`PLAY_CONFIG` / `WHEEL` / `SCORE` / `RULES`） |
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

最近一次结果：服务端 **29/25/15/11/14/30/35/23/23** 与浏览器 **19/17/17** 全部通过，页面全程无 JavaScript 异常；新增的管理控制台自测 **60/60**、本地真实浏览器验收 **13/13**、公网只读浏览器验收 **7/7**、线上冒烟 **32/32**，VPS 隔离端口端到端（结束局→读排名→开新局）**12/12**。浏览器脚本零依赖，结束时关闭自身启动的 Chrome 与 HTTP 子进程，日志与截图写入 `outputs/`。

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

线上实例与仓库同一份代码，服务器侧结构如下：

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

## 已知限制

- 「定期公布坏人线索」与「积分兑换/名次奖励」等细化规则仍未实现，界面中明确标注为待补充。
- “存活淘汰至剩余 100 人”按 600 人活动尺度设计；局域网试玩房间人数少，因此主要靠“坏人全灭 / 时间到”结束。
- 房间仍是内存存储，服务端重启会清空当前游戏；**上局结算快照 `room.lastResult` 也在内存里**，重启后管理页只会显示“本局尚未结束，暂无排名”，未新增数据库持久化。
- 源码修改不会自动替换正在运行的旧服务进程，需要重启服务才生效；未做高并发压测。
- 浏览器验收只在 Windows Chrome 与 Linux Chrome（`SID_CHROME` 覆盖路径）实测，其他浏览器未覆盖。
- 管理控制台只用一个授权码做鉴权（无账号体系、无操作审计日志），且限流按来源 IP 计数，因此**只适合小范围试玩**；正式活动前请改掉默认授权码。
- 公网实例（`game.afann.xyz`）的 `/api/dev/`、`/api/host/`、`/api/test/` 在反向代理层就被 404 掉；日常“结束游戏 / 开下一局”请走 `/manager`，不再需要本机隧道与 `SID_DEV=1`。
- 线上 vhost 是手工写入 1Panel 的配置目录（`www/conf.d` + `www/sites`），未走 1Panel 站点管理界面，所以面板网站列表里不会出现该域名；证书复用泛域名证书，随 1Panel 续签更新时需要重新复制到站点 `ssl/` 目录。管理控制台的 `/manager` 与 `/api/manager/*` 由现有 `location ^~ /` 兜住，**不需要改反代配置**。

