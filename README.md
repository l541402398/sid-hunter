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
| `online/room.js` | 权威房间：移动、技能、探索、转盘、猜拳、J 互动、计分、结束判定与投影 |
| `online/server.js` | HTTP/SSE 服务、鉴权、开发管理接口、20Hz 快照调度 |
| `online/public/` | 联机客户端（渲染、名单/日志、私密面板、转盘弹窗、排行榜与结算） |
| `demo/` | 离线试玩客户端（同一套玩法在本地模拟） |
| `outputs/` | 验收截图、验收记录、试玩副本与源码包 |

## 玩法与操作

`WASD` / 方向键移动，`E` 就近打开/关闭容器或 NPC 互动，`J` 互动（无伤害），点击角色或名单查看公开档案，「线索背包」查看自己的筹码与线索，「排行榜」查看分数与结束条件，「我的信息」需按住/点击后才显示。

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
| `PLAY_CONFIG` | `rpsStake` `rpsTimeoutMs` `rpsCooldownMs` `attackRange` `attackCooldownMs` `attackConeCos` `stunMs` `freezeMs` | `1` `30000` `5000` `48` `12000` `0.5` `800` `1000` |
| — | `INTERACT_RANGE` | `64`（容器/NPC 互动与猜拳的距离门槛） |

## 权威性与隐私边界

- 位置、移动、技能、探索奖励、转盘落格与费用、猜拳结算、J 互动、计分与结束判定全部由服务端计算，客户端只提交意图并渲染快照。
- 公开投影只含位置、公开颜色、已公开属性、已公开 S-ID 段、`score` 以及动画用 `facing`/`lastAttackAt`/`stunUntil`/`freezeUntil`；筹码、线索、技能次数、身份、生命仅本人可见。
- 私密线索不进入公开档案、名单搜索与公共日志；对方猜拳出拳不会下发给对手。
- 服务端 20Hz 快照采用截止时间补偿调度（单次长卡顿只补一次，不突发追赶）。

## 测试与验收

```bash
# 服务端（零依赖，直接 node 运行）
node online/mechanics-test.mjs             # 机制：29 项
node online/exploration-test.mjs           # 探索/兑换/重置：25 项
node online/progression-test.mjs           # 转盘/特殊券/计分/三种结束：15 项
node online/self-test.mjs                  # 11 项
node online/rules-skill-test.mjs           # 14 项
node online/rules-qa.mjs                   # 30 项
node online/qa-verify.mjs                  # 35 项
node online/privacy-reset-test.mjs         # 23 项
node online/privacy-reset-qa.mjs           # 23 项

# 真实 Chrome（原生 CDP，需系统 Chrome）
node online/progression-browser-test.mjs   # 转盘/特殊券/计分/结算：19 项
node online/mechanics-browser-test.mjs     # 17 项
node online/exploration-browser-test.mjs   # 17 项
```

最近一次结果：服务端 **29/25/15/11/14/30/35/23/23** 与浏览器 **19/17/17** 全部通过，页面全程无 JavaScript 异常。浏览器脚本零依赖，结束时关闭自身启动的 Chrome 与 HTTP 子进程，日志与截图写入 `outputs/`。

## 已知限制

- 「定期公布坏人线索」与「积分兑换/名次奖励」等细化规则仍未实现，界面中明确标注为待补充。
- “存活淘汰至剩余 100 人”按 600 人活动尺度设计；局域网试玩房间人数少，因此主要靠“坏人全灭 / 时间到”结束。
- 房间仍是内存存储，服务端重启会清空当前游戏；未新增数据库持久化。
- 源码修改不会自动替换正在运行的旧服务进程，需要重启服务才生效；本次未重启任何既有服务，也未做高并发压测。
- 浏览器验收只覆盖 Windows 系统 Chrome。
