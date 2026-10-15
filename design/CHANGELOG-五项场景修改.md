# CHANGELOG：五项场景修改（2026-10-14，分支 `feature_dev_floor`）

承接「七层楼板加宽与东侧服务翼」之后，按用户基于实际游玩的五项反馈实施；整体布局与星露谷像素风保持不变。

## 1. 上半部分后墙 + 窗户 + 标语展示区

问题：楼层上半部分（墙根以北）只有地板，画面顶端突兀消失。

实现（`online/public/game.js` 与 `demo/main.js` 同源各一份 `drawBackWall / drawBackWindow / drawSloganBoard`）：

- 墙带：沿轮廓上边缘绘制，高 58px 并向上延伸 56px（相机纵向居中 camY<0 时不露底）；竖向壁板缝每 48px 一条。
- 布局：每层 10 个 144px 模块，第 3/6/9 模块（中心 x≈360/792/1224）为标语展示板，其余 7 个为窗户。
- 窗户：木框 + 白天天空渐变玻璃 + 窗棂 + 像素楼群剪影 + 云 + 窗台 + 玻璃斜反光。
- 标语板：木框深色板面 + 吊绳挂钉；中央板显示本层名（如「原创大厅食堂」），两侧板为「标 语 预 留」空板——后续挂标语内容，本轮不臆造文案。
- 绘制顺序：楼面分块之后、家具/角色场景合成之前，纯背景；行走不受影响（`MIN_Y=135` 已把角色挡在墙根以南）。

## 2. 减少工位 + 每层新增可搜容器与装饰

问题：工位过多；每层缺少可交互探索点。

工位缩减（`world.js` `FLOOR_SPECS`，仅缩岛宽，y 与中心线不变，全部缩为 3 列示意）：

| 层 | 家具 | 原 x 范围 | 新 x 范围 |
| --- | --- | --- | --- |
| 2F | 中央工位一/二 | 258–720 | 409–569 |
| 2F | 中央工位三 | 402–720 | 481–641 |
| 3F | 工位带一/二 | 258–720 | 409–569 |
| 3F | 工位带三 | 398–720 | 481–641 |
| 4F | 中央带一/二 | 258–720 | 409–569 |
| 4F | 中央带三 | 402–720 | 481–641 |
| 5F | 顶部工位排 | 312–815 | 483–643 |
| 5F | 中短带 / 下带 | 310–700 | 425–585 |
| 6F | 顶工位 | 388–815 | 521–681 |
| 6F | 中带 / 中央带 | 385–700 | 462–622 |

每层新增（摆在缩减腾出的空地上，不碰门洞/出生点/电梯落点）：

| 层 | 新可搜容器（奖励） | 新装饰 |
| --- | --- | --- |
| 1F | 大厅储物柜 `hall1`（+2 筹码） | 阅读沙发、图书角绿植 |
| 2F | 打印间文件柜 `printer2`（+1 筹码） | 中庭沙发、中庭绿植 |
| 3F | 产品资料柜 `docs3`（线索） | 休息角沙发、讨论区绿植 |
| 4F | 票证储藏柜 `ticket4`（+2 筹码） | 档案区沙发、档案区绿植 |
| 5F | 值班储物柜 `duty5`（+1 筹码） | 茶歇沙发、值班区绿植 |
| 6F | 财务保险柜 `safe6`（线索） | 财务休息沙发、财务区绿植 |
| 7F | 能量补给台 `bar7`（+1 筹码） | 体测记录台、观赛沙发、大厅绿植 |

- 容器稳定 ID 追加进 `world.js` `CONTAINER_IDS`（既有 10 个不动）；奖励在 `room.js` `EXPLORATION_REWARDS` 按同名 ID 登记（容器搜索要求奖励存在，否则服务端拒绝搜索）。
- 容器总数 10 → 17。素材沿用程序化绘制的现有类型（cabinet/counter/table/sofa/plant），与既有星露谷风统一；未引入外部图片资源。

## 3. 电梯改造：不分方向 + 选层 + 门口落地 + 比例放大

- **数据模型（`world.js`）**：portal 由 `f{层}:portal:{side}-{dir}`（带 `dir`/`targetFloorId`）改为 `f{层}:portal:{side}`（仅 side）；删除 `portalBoundaryReason`，新增 `floorPortal(floorId, side)` 与 `elevatorLanding(floorId, side)`（候选序列：门口正前方南 14px → 门口本身 → 北 14px，均要求楼面内/不碰撞/不遮挡）；`portalAccess` 去掉方向边界分支；导出补 `FLOOR_COUNT`、`floorPortal`、`elevatorLanding`。
- **服务端（`room.js` `floorChange`）**：改为接收 `body.targetFloorId`（1–7 且 ≠ 当前层），校验门户归属/距离（≤64）后由 `elevatorLanding` 落点；幂等 receipt 键纳入 `targetFloorId`（同 commandId 不同目标 → 拒绝）。注意：落点在目标层电梯门口（与 portal 距离 ≤64 是设计意图），**不能用** `pointSafe`（其要求远离任何 portal，仅适用出生点），改为直接查楼面内/不碰撞/不遮挡。
- **客户端（`game.js` + `demo/main.js`）**：进门（E/点击门）→ `openElevatorPicker` 弹选层面板（1–7 按钮网格，禁当前层并显示层名，支持数字键 1–7 直达、Esc/× 取消）；选定后走既有 PREPARING→SUBMITTING→TARGET_READY→OPENING 状态机，`floorArrowText` 简化为「nF → mF」；`drawElevatorHall` 门体由 42×18 放大到 **64×30**，删除方向箭头与双按钮，改为单个呼梯键 + 「E 选择楼层」提示。
- **文案**：`index.html` 操作说明与规则页中「1F 只能上行、7F 只能下行」改为选层语义。
- 面板 DOM/样式：`#elevator-picker`（`online/public/index.html` + `demo/index.html`，`.elevator-*` 样式入两侧 styles.css）。

## 4. 移动速度提升

`WORLD.SPEED` 64 → **112**（约 2.0 → 3.5 m/s）。服务端权威移动（`room.js step`）与离线版（`demo/main.js`）同读此唯一真源，两端一致。

## 5. 碰撞体积消失 / 摆放错位修复

根因（`world.js` `blocksFor`）：counter/cabinet/reception/sofa/plant 的行走碰撞贴 rect **北沿**细条（`topStrip`，深 6.7–10.7px），但绘制立面在 rect **南沿**（面向镜头）——玩家能穿进可见家具大半个身子才被挡，观感即「碰撞消失/摆放错位」。

修复：这五类改为碰撞贴**南沿立面**（`bottomStrip`，与原始 footprint「底部 24px」语义一致）；核心筒（102.4×24 底部条带）、工位岛（deskIsland 单一真源）、舞台/训练垫/跑步机等分支不变。

附带修复两处既有堵门：5F「左下附翼一/二」与 6F「下翼一/二」工位岛（x155–338）贴墙堵死 `v151` 墙的两扇门（y710/y855），东移为 x180–338 让出门口（保持 3 列岛）。

## 稳定 ID 变化

- 新增 portal 格式：`f{层}:portal:{side}`（side=left/right），替代 `f{层}:portal:{side}-{dir}`。
- 新增容器 ID：`hall1-340-300`、`printer2-590-370`、`docs3-590-290`、`ticket4-590-280`、`duty5-610-305`、`safe6-640-355`、`bar7-480-300`。
- 既有容器 / NPC / 经济键均未变。

## 验证

- 结构自检：7 层全部出生点可站立、14 个门洞（含门口通道矩形）无遮挡、17 容器齐全、家具 blocks 互不重叠、左右两侧 14 个电梯落点全部安全。
- 电梯协议单元验证：非法层（9F）/当前层/距离守卫/门口落地（d≤14）/幂等重放/commandId 冲突/1F↔7F 直达全通过。
- 测试套件：`self-test 11/11`、`hammer-test 50/50`、`npc-test 38/38`、`ghost-offline 101/101`、`bad-pool 15/15`、`privacy-reset 23/23`、`manager 60/60` 全绿；既有红项 `mechanics 4→5`、`exploration 6→7` 通过数增加，`movement-attack 13/16`、`progression 7/8` 持平，**无新增失败**。
- 目视验证（无头 Chrome）：`outputs/verify-1f.png`、`outputs/verify-2f.png`、`outputs/verify-7f.png`。

**本轮改动未提交。**
